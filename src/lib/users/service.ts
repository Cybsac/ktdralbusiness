import { prisma } from "@/lib/prisma";
import { parseBirthdayInput } from "@/lib/birthday";
import { mapAreaToStaffRole } from "@/lib/staff-roles";
import { audit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { USER_POLICY as P } from "./policy";
import { createUserSchema, updateUserSchema } from "./input";
import { assertTarget, lockUserManagement, protectLastAdmin, type UserActor } from "./access";
import { userDto, userSelection } from "./query";
import { UserManagementError as Failure } from "./http";
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
      const person = await tx.person.create({
        data: {
          code: data.person.dni,
          name: data.person.name,
          dni: data.person.dni,
          area: data.person.area,
          whatsapp: data.person.whatsapp,
          birthday: data.person.birthday ? parseBirthdayInput(data.person.birthday) : null,
          active: true,
        },
      });
      personId = person.id;
    } else {
      const person = await tx.person.findUnique({
        where: { code: data.code! },
        include: { user: { select: { id: true } } },
      });
      if (!person || !person.active || person.user) throw new Failure("CODE_NOT_FOUND", 404);
      personId = person.id;
    }
    return tx.user.create({
      data: {
        username: data.username,
        passwordHash,
        role: data.role,
        personId,
        forcePasswordChange: true,
      },
      select: userSelection,
    });
  });
  await audit("ADMIN_USER_CREATE", actor.userId, { id: result.id });
  return userDto(result);
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
    const { password, personName, dni, area, whatsapp, birthday, ...account } = data;
    const personData = {
      ...(personName !== undefined ? { name: personName } : {}),
      ...(dni !== undefined
        ? { dni, ...(user.person.code === user.person.dni ? { code: dni } : {}) }
        : {}),
      ...(area !== undefined ? { area } : {}),
      ...(whatsapp !== undefined ? { whatsapp } : {}),
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
