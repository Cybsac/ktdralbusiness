import bcrypt from "bcryptjs";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { parseBirthdayInput } from "@/lib/birthday";
import { prisma } from "@/lib/prisma";
import { mapAreaToStaffRole } from "@/lib/staff-roles";

import { assertTarget, lockUserManagement, protectLastAdmin, type UserActor } from "./access";
import { isValidDocumentNumber } from "./document";
import { UserManagementError as Failure } from "./http";
import { createUserSchema, updateUserSchema } from "./input";
import { USER_POLICY as P } from "./policy";
import { userDto, userSelection } from "./query";
export async function getUser(id: string, actor: UserActor) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelection });
  if (!user || !user.person.active) throw new Failure("NOT_FOUND", 404);
  assertTarget(actor, user);
  return userDto(user);
}
export async function createUser(input: z.infer<typeof createUserSchema>, actor: UserActor) {
  const data = createUserSchema.parse(input);
  if (actor.role === "COORDINATOR" && !["STAFF", "COLLAB"].includes(data.role))
    throw new Failure("FORBIDDEN", 403);
  const passwordHash = await bcrypt.hash(data.password, P.bcryptRounds);
  const result = await prisma.$transaction(async (tx) => {
    await lockUserManagement(tx);
    let personId: string;
    if (data.person) {
      const existing = await tx.person.findUnique({
        where: { dni: data.person.dni },
        include: { user: { select: { id: true, role: true } } },
      });
      if (existing && !existing.active) {
        if (existing.documentType && existing.documentType !== data.person.documentType)
          throw new Failure("DOCUMENT_TYPE_MISMATCH");
        if (existing.user) assertTarget(actor, existing.user);
        const person = await tx.person.update({
          where: { id: existing.id },
          data: {
            name: data.person.name,
            documentType: data.person.documentType ?? existing.documentType,
            area: data.person.area,
            whatsapp: data.person.whatsapp,
            birthday: data.person.birthday ? parseBirthdayInput(data.person.birthday) : null,
            documentSexCode: data.person.documentSexCode ?? null,
            active: true,
          },
        });
        if (existing.user) {
          const staffRole = mapAreaToStaffRole(data.person.area);
          await tx.staff.updateMany({
            where: { userId: existing.user.id },
            data: {
              active: true,
              name: data.person.name,
              ...(staffRole ? { role: staffRole } : {}),
            },
          });
          const user = await tx.user.update({
            where: { id: existing.user.id },
            data: {
              username: data.username,
              passwordHash,
              role: data.role,
              forcePasswordChange: true,
            },
            select: userSelection,
          });
          return { user, reactivated: true };
        }
        personId = person.id;
      } else {
        const person = await tx.person.create({
          data: {
            code: data.person.dni,
            name: data.person.name,
            dni: data.person.dni,
            documentType: data.person.documentType ?? null,
            area: data.person.area,
            whatsapp: data.person.whatsapp,
            birthday: data.person.birthday ? parseBirthdayInput(data.person.birthday) : null,
            documentSexCode: data.person.documentSexCode ?? null,
            active: true,
          },
        });
        personId = person.id;
      }
    } else {
      const person = await tx.person.findUnique({
        where: { code: data.code! },
        include: { user: { select: { id: true } } },
      });
      if (!person || !person.active || person.user) throw new Failure("CODE_NOT_FOUND", 404);
      personId = person.id;
    }
    const user = await tx.user.create({
      data: {
        username: data.username,
        passwordHash,
        role: data.role,
        personId,
        forcePasswordChange: true,
      },
      select: userSelection,
    });
    return { user, reactivated: false };
  });
  await audit(result.reactivated ? "ADMIN_USER_REACTIVATE" : "ADMIN_USER_CREATE", actor.userId, {
    id: result.user.id,
  });
  return userDto(result.user);
}
export async function updateUser(
  id: string,
  input: z.infer<typeof updateUserSchema>,
  actor: UserActor
) {
  const data = updateUserSchema.parse(input);
  const passwordHash = data.password ? await bcrypt.hash(data.password, P.bcryptRounds) : undefined;
  const result = await prisma.$transaction(async (tx) => {
    await lockUserManagement(tx);
    const user = await tx.user.findUnique({ where: { id }, select: userSelection });
    if (!user || !user.person.active) throw new Failure("NOT_FOUND", 404);
    assertTarget(actor, user);
    if (
      data.role &&
      data.role !== user.role &&
      actor.role !== "ADMIN" &&
      !["STAFF", "COLLAB"].includes(data.role)
    )
      throw new Failure("FORBIDDEN", 403);
    const {
      password,
      personName,
      dni,
      documentType,
      area,
      whatsapp,
      birthday,
      documentSexCode,
      ...account
    } = data;
    const effectiveType = documentType === undefined ? user.person.documentType : documentType;
    const effectiveNumber = dni === undefined ? user.person.dni : dni;
    if (
      (dni !== undefined || documentType !== undefined) &&
      effectiveNumber &&
      !isValidDocumentNumber(effectiveNumber, effectiveType)
    )
      throw new Failure("INVALID_DOCUMENT", 400);
    const personData = {
      ...(personName !== undefined ? { name: personName } : {}),
      ...(dni !== undefined
        ? { dni, ...(user.person.code === user.person.dni ? { code: dni } : {}) }
        : {}),
      ...(documentType !== undefined ? { documentType } : {}),
      ...(area !== undefined ? { area } : {}),
      ...(whatsapp !== undefined ? { whatsapp } : {}),
      ...(documentSexCode !== undefined ? { documentSexCode } : {}),
      ...(birthday !== undefined
        ? { birthday: birthday ? parseBirthdayInput(birthday) : null }
        : {}),
    };
    if (Object.keys(personData).length)
      await tx.person.update({ where: { id: user.person.id }, data: personData });
    if (area) {
      const staffRole = mapAreaToStaffRole(area);
      if (staffRole)
        await tx.staff.updateMany({ where: { userId: id }, data: { role: staffRole } });
    }
    const updated = await tx.user.update({
      where: { id },
      data: { ...account, ...(passwordHash ? { passwordHash, forcePasswordChange: true } : {}) },
      select: userSelection,
    });
    if (passwordHash) await tx.passwordResetOtp.deleteMany({ where: { userId: id } });
    await protectLastAdmin(tx);
    return updated;
  });
  await audit("ADMIN_USER_UPDATE", actor.userId, {
    id,
    fields: Object.keys(data).filter((key) => key !== "password"),
    passwordChanged: !!passwordHash,
  });
  return userDto(result);
}
/** Archive access; retain identity and operational history. */
export async function archiveUser(id: string, actor: UserActor) {
  if (id === actor.userId) throw new Failure("SELF_DELETE");
  const result = await prisma.$transaction(async (tx) => {
    await lockUserManagement(tx);
    const user = await tx.user.findUnique({ where: { id }, select: userSelection });
    if (!user) throw new Failure("NOT_FOUND", 404);
    assertTarget(actor, user);
    await tx.person.update({ where: { id: user.person.id }, data: { active: false } });
    await tx.staff.updateMany({ where: { userId: id }, data: { active: false } });
    await tx.prizeAuthorizationCredential.updateMany({
      where: { userId: id },
      data: { enabled: false, revision: { increment: 1 }, updatedBy: actor.userId },
    });
    await tx.passwordResetOtp.deleteMany({ where: { userId: id } });
    await protectLastAdmin(tx);
    return { ok: true, data: { id }, archived: true };
  });
  await audit("ADMIN_USER_ARCHIVE", actor.userId, { id });
  return result;
}
