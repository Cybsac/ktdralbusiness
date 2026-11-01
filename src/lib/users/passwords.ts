import { randomBytes, randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { USER_POLICY as P } from "./policy";
import { assertTarget, lockUserManagement, type UserActor } from "./access";
import { UserManagementError as Failure } from "./http";
import { normalizeDocument, passwordSchema } from "./input";
export const temporaryPassword = () => randomBytes(P.temporaryPasswordBytes).toString("base64url");
export async function issueRecoveryCode(id: string, actor: UserActor) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from(
    { length: P.recoveryCodeLength },
    () => alphabet[randomInt(alphabet.length)]
  ).join("");
  const expiresAt = new Date(Date.now() + P.recoveryLifetimeMs);
  await prisma.$transaction(async (tx) => {
    await lockUserManagement(tx);
    const user = await tx.user.findUnique({
      where: { id },
      include: { person: { select: { active: true } } },
    });
    if (!user || !user.person.active) throw new Failure("NOT_FOUND", 404);
    assertTarget(actor, user);
    await tx.passwordResetOtp.deleteMany({ where: { userId: id } });
    await tx.passwordResetOtp.create({ data: { userId: id, code, expiresAt } });
  });
  await audit("ADMIN_OTP_CREATED", actor.userId, { id });
  return { ok: true, code, expiresAt };
}
export async function resetActivePasswords(actor: UserActor, confirmed: boolean) {
  if (actor.role !== "ADMIN") throw new Failure("FORBIDDEN", 403);
  if (!confirmed) throw new Failure("CONFIRM_REQUIRED", 400);
  const targets = await prisma.user.findMany({
    where: { id: { not: actor.userId }, person: { active: true } },
    select: { id: true, username: true },
  });
  const prepared: Array<{ id: string; username: string; password: string; passwordHash: string }> =
    [];
  for (const user of targets) {
    const password = temporaryPassword();
    prepared.push({ ...user, password, passwordHash: await bcrypt.hash(password, P.bcryptRounds) });
  }
  await prisma.$transaction(
    async (tx) => {
      await lockUserManagement(tx);
      for (const user of prepared) {
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: user.passwordHash, forcePasswordChange: true },
        });
        await tx.passwordResetOtp.deleteMany({ where: { userId: user.id } });
      }
    },
    { timeout: P.transactionTimeoutMs }
  );
  await audit("ADMIN_USER_PASSWORDS_RESET", actor.userId, { count: prepared.length });
  return {
    ok: true,
    updatedCount: prepared.length,
    message: "Claves temporales individuales generadas",
    credentials: prepared.map(({ username, password }) => ({ username, password })),
  };
}
export async function redeemRecoveryCode(document: string, code: string, password: string) {
  const dni = normalizeDocument(document);
  const newPassword = passwordSchema.parse(password);
  const passwordHash = await bcrypt.hash(newPassword, P.bcryptRounds);
  await prisma.$transaction(async (tx) => {
    await lockUserManagement(tx);
    const user = await tx.user.findFirst({
      where: { person: { dni, active: true } },
      select: { id: true },
    });
    if (!user) throw new Failure("INVALID_DNI_OR_CODE", 400);
    const now = new Date();
    const otp = await tx.passwordResetOtp.findFirst({
      where: { userId: user.id, code, expiresAt: { gt: now }, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) throw new Failure("INVALID_DNI_OR_CODE", 400);
    const used = await tx.passwordResetOtp.updateMany({
      where: { id: otp.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (used.count !== 1) throw new Failure("INVALID_DNI_OR_CODE", 400);
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, forcePasswordChange: false },
    });
    await tx.passwordResetOtp.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
  });
  return { ok: true };
}
