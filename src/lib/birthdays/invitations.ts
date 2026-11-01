import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { birthdayExpiration } from "./calendar";
import { lockBirthdayReservation } from "./locking";
import { signBirthdayClaim } from "./token";
import { BIRTHDAY_POLICY as P } from "./policy";
import type { InviteToken } from "@prisma/client";
export async function generateInviteTokens(
  reservationId: string,
  opts?: { force?: boolean; expectedUpdatedAt?: Date | string },
  actor?: string
): Promise<InviteToken[]> {
  const tokens = await prisma.$transaction(async (tx) => {
    await lockBirthdayReservation(tx, reservationId);
    const reservation = await tx.birthdayReservation.findUnique({
      where: { id: reservationId },
      include: { pack: true },
    });
    if (!reservation) throw new Error("RESERVATION_NOT_FOUND");
    if (!(P.entryStatuses as readonly string[]).includes(reservation.status))
      throw new Error("RESERVATION_UNAVAILABLE");
    if (
      opts?.expectedUpdatedAt &&
      reservation.updatedAt.getTime() !== new Date(opts.expectedUpdatedAt).getTime()
    )
      throw new Error("EDIT_CONFLICT");
    const existing = await tx.inviteToken.findMany({
      where: { reservationId },
      orderBy: { createdAt: "asc" },
    });
    // An image regeneration must never replace codes or reset arrival counters.
    if (existing.length) return existing;
    const expiresAt = birthdayExpiration(reservation.date);
    if (expiresAt <= new Date()) throw new Error("RESERVATION_DATE_PAST");
    const code = randomBytes(P.invitationCodeBytes)
      .toString("base64url")
      .slice(0, P.invitationCodeLength);
    const claim = signBirthdayClaim({
      t: "birthday",
      rid: reservationId,
      kind: P.universalTokenKind,
      code,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    });
    const token = await tx.inviteToken.create({
      data: {
        reservationId,
        code,
        kind: P.universalTokenKind,
        status: "unclaimed",
        expiresAt,
        claim: JSON.stringify(claim),
        maxUses: Math.max(1, reservation.pack.qrCount),
        usedCount: 0,
      },
    });
    await tx.birthdayReservation.update({
      where: { id: reservationId },
      data: { tokensGeneratedAt: new Date() },
    });
    return [token];
  });
  await audit("birthday.generateInviteTokens", actor, { reservationId });
  return tokens;
}
export const listTokens = (reservationId: string) =>
  prisma.inviteToken.findMany({ where: { reservationId }, orderBy: { createdAt: "asc" } });

/** Explicit maintenance only; expiration and its signed claim always change together. */
export async function synchronizeBirthdayInvitation(reservationId: string) {
  return prisma.$transaction(async (tx) => {
    await lockBirthdayReservation(tx, reservationId);
    const reservation = await tx.birthdayReservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    const expiresAt = birthdayExpiration(reservation.date);
    const tokens = await tx.inviteToken.findMany({ where: { reservationId } });
    for (const token of tokens) {
      const claim = signBirthdayClaim({
        t: "birthday",
        rid: reservationId,
        kind: token.kind === "host" ? "host" : "guest",
        code: token.code,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(expiresAt.getTime() / 1000),
      });
      await tx.inviteToken.update({
        where: { id: token.id },
        data: { expiresAt, claim: JSON.stringify(claim) },
      });
    }
    return { guestExpiration: expiresAt, tokensUpdated: tokens.length };
  });
}
