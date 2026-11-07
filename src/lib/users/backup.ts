import { StaffRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { z } from "zod";

import { ALLOWED_AREAS } from "@/lib/areas";
import { audit } from "@/lib/audit";
import { parseBirthdayInput } from "@/lib/birthday";
import { prisma } from "@/lib/prisma";

import { lockUserManagement, protectLastAdmin, type UserActor } from "./access";
import { DOCUMENT_TYPES } from "./document";
import { UserManagementError as Failure } from "./http";
import { normalizeDocument } from "./input";
import { temporaryPassword } from "./passwords";
import { USER_POLICY as P, USER_ROLES } from "./policy";
const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)))
  .nullable()
  .optional();
const backupPerson = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  dni: z.string().max(40).transform(normalizeDocument).nullable().optional(),
  active: z.boolean().default(true),
  area: z.enum(ALLOWED_AREAS).nullable(),
  jobTitle: z.string().max(200).nullable().optional(),
  whatsapp: z.string().max(40).nullable().optional(),
  birthday: timestamp,
  documentType: z.enum(DOCUMENT_TYPES).nullable().optional(),
  documentSexCode: z.enum(["1", "2"]).nullable().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
const staff = z.object({
  id: z.string().optional(),
  role: z.nativeEnum(StaffRole),
  active: z.boolean().default(true),
  zones: z.array(z.string().max(100)).max(100).default([]),
  createdAt: timestamp,
  updatedAt: timestamp,
});
const row = z.object({
  id: z.string().optional(),
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]{3,50}$/),
  role: z.enum(USER_ROLES),
  createdAt: timestamp,
  updatedAt: timestamp,
  commitmentVersionAccepted: z.number().int().nonnegative().default(0),
  commitmentAcceptedAt: timestamp,
  person: backupPerson,
  restaurantStaff: staff.nullable().optional(),
});
export const backupSchema = z
  .object({
    metadata: z
      .object({ generatedAt: timestamp, totalUsers: z.number().int().nonnegative().optional() })
      .passthrough(),
    users: z.array(row).max(P.maxBackupRows),
  })
  .superRefine((value, ctx) => {
    for (const field of ["username", "code", "dni"]) {
      const entries = value.users
        .map((user) =>
          field === "username"
            ? user.username
            : field === "code"
              ? user.person.code
              : user.person.dni
        )
        .filter(Boolean)
        .map((value) => String(value).toUpperCase());
      if (new Set(entries).size !== entries.length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicados: ${field}` });
    }
  });
export async function exportUsers(actor: UserActor) {
  if (actor.role !== "ADMIN") throw new Failure("FORBIDDEN", 403);
  const users = await prisma.user.findMany({
    include: { person: true },
    orderBy: { createdAt: "asc" },
  });
  const staffMembers = await prisma.staff.findMany();
  const map = new Map(staffMembers.map((s) => [s.userId, s]));
  return {
    metadata: {
      version: 2,
      generatedAt: new Date().toISOString(),
      generatedBy: actor.userId,
      totalUsers: users.length,
      description: "Perfiles y personal; no contiene contraseñas ni historial operativo",
    },
    users: users.map((user) => {
      const member = map.get(user.id);
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        commitmentVersionAccepted: user.commitmentVersionAccepted,
        commitmentAcceptedAt: user.commitmentAcceptedAt,
        person: user.person,
        restaurantStaff: member
          ? {
              id: member.id,
              role: member.role,
              active: member.active,
              zones: member.zones,
              createdAt: member.createdAt,
              updatedAt: member.updatedAt,
            }
          : null,
      };
    }),
  };
}
export async function restoreUsers(input: unknown, actor: UserActor) {
  if (actor.role !== "ADMIN") throw new Failure("FORBIDDEN", 403);
  const backup = backupSchema.parse(input);
  const prepared: Array<{ user: z.infer<typeof row>; password: string; passwordHash: string }> = [];
  for (const user of backup.users) {
    const password = temporaryPassword();
    prepared.push({ user, password, passwordHash: await bcrypt.hash(password, P.bcryptRounds) });
  }
  const result = await prisma.$transaction(
    async (tx) => {
      await lockUserManagement(tx);
      let created = 0,
        updated = 0;
      const credentials: Array<{ username: string; password: string }> = [];
      for (const { user, password, passwordHash } of prepared) {
        const existing = await tx.user.findUnique({ where: { username: user.username } });
        if (existing?.id === actor.userId && (!user.person.active || user.role !== "ADMIN"))
          throw new Failure("SELF_DELETE");
        const personData = {
          code: user.person.code,
          name: user.person.name,
          dni: user.person.dni || null,
          active: user.person.active,
          area: user.person.area,
          jobTitle: user.person.jobTitle || null,
          whatsapp: user.person.whatsapp || null,
          birthday: user.person.birthday ? parseBirthdayInput(user.person.birthday) : null,
          ...(user.person.documentType !== undefined
            ? { documentType: user.person.documentType }
            : {}),
          ...(user.person.documentSexCode !== undefined
            ? { documentSexCode: user.person.documentSexCode }
            : {}),
        };
        let personId: string;
        if (existing) {
          await tx.person.update({ where: { id: existing.personId }, data: personData });
          personId = existing.personId;
        } else {
          const person = await tx.person.findUnique({
            where: { code: user.person.code },
            include: { user: { select: { id: true } } },
          });
          if (person?.user) throw new Failure("CODE_TAKEN");
          personId = person
            ? (await tx.person.update({ where: { id: person.id }, data: personData })).id
            : (
                await tx.person.create({
                  data: { ...personData, id: user.person.id || randomUUID() },
                })
              ).id;
        }
        const data = {
          role: user.role,
          commitmentVersionAccepted: user.commitmentVersionAccepted,
          commitmentAcceptedAt: user.commitmentAcceptedAt
            ? new Date(user.commitmentAcceptedAt)
            : null,
        };
        const restored = existing
          ? await tx.user.update({ where: { id: existing.id }, data })
          : await tx.user.create({
              data: {
                ...data,
                id: user.id || randomUUID(),
                username: user.username,
                passwordHash,
                forcePasswordChange: true,
                personId,
              },
            });
        if (existing) updated++;
        else {
          created++;
          credentials.push({ username: user.username, password });
        }
        if (user.restaurantStaff)
          await tx.staff.upsert({
            where: { userId: restored.id },
            create: {
              userId: restored.id,
              name: personData.name,
              role: user.restaurantStaff.role,
              active: user.restaurantStaff.active && personData.active,
              zones: user.restaurantStaff.zones,
            },
            update: {
              name: personData.name,
              role: user.restaurantStaff.role,
              active: user.restaurantStaff.active && personData.active,
              zones: user.restaurantStaff.zones,
            },
          });
        else await tx.staff.updateMany({ where: { userId: restored.id }, data: { active: false } });
      }
      await protectLastAdmin(tx);
      return {
        success: true,
        processed: backup.users.length,
        created,
        updated,
        errors: 0,
        credentials,
        message: "Respaldo restaurado completamente",
      };
    },
    { timeout: P.transactionTimeoutMs }
  );
  await audit("ADMIN_USERS_RESTORE", actor.userId, {
    created: result.created,
    updated: result.updated,
  });
  return result;
}
