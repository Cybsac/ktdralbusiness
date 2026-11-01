import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { birthdayDay, birthdayToday, birthdayExpiration } from "./calendar";
import { lockBirthdayReservation } from "./locking";
import { verifyBirthdayClaim } from "./token";
import { BIRTHDAY_POLICY as P } from "./policy";
import type { RedeemContext } from "./types";
export async function registerBirthdayArrival(
  code: string,
  role: "host" | "guest",
  context: RedeemContext = {},
  actor?: string,
  operationKey?: string
) {
  const result = await prisma.$transaction(async (tx) => {
    const lookup = await tx.inviteToken.findUnique({
      where: { code },
      select: { reservationId: true },
    });
    if (!lookup) throw new Error("TOKEN_NOT_FOUND");
    await lockBirthdayReservation(tx, lookup.reservationId);
    await tx.$queryRaw`SELECT id FROM "InviteToken" WHERE code=${code} FOR UPDATE`;
    const token = await tx.inviteToken.findUniqueOrThrow({
      where: { code },
      include: { reservation: true },
    });
    let reservation = token.reservation;
    const operationId = operationKey
      ? `birthday_${createHash("sha256").update(`${actor}:${reservation.id}:${role}:${operationKey}`).digest("hex")}`
      : undefined;
    const previous = operationId
      ? await tx.tokenRedemption.findUnique({ where: { id: operationId } })
      : null;
    let redemption = previous;
    let updated = token;
    if (!previous) {
      if (!(P.entryStatuses as readonly string[]).includes(reservation.status))
        throw new Error("RESERVATION_UNAVAILABLE");
      const now = new Date();
      if (birthdayToday(now) < birthdayDay(reservation.date))
        throw new Error("RESERVATION_DATE_FUTURE");
      if (now >= token.expiresAt || now > birthdayExpiration(reservation.date))
        throw new Error("TOKEN_EXPIRED");
      let verification;
      try {
        verification = verifyBirthdayClaim(JSON.parse(token.claim), { now });
      } catch {
        throw new Error("INVALID_SIGNATURE");
      }
      if (!verification.ok) throw new Error(verification.code);
      if (verification.payload.rid !== reservation.id || verification.payload.code !== token.code)
        throw new Error("INVALID_SIGNATURE");
      if (role === "host") {
        if (!reservation.hostArrivedAt) {
          reservation = await tx.birthdayReservation.update({
            where: { id: reservation.id },
            data: { hostArrivedAt: now, status: "completed", updatedBy: actor },
          });
          redemption = await tx.tokenRedemption.create({
            data: {
              ...(operationId ? { id: operationId } : {}),
              tokenId: token.id,
              reservationId: reservation.id,
              redeemedAt: now,
              by: actor || context.by || null,
              device: context.device || null,
              location: context.location ? `host:${context.location}` : "host",
            },
          });
        }
      } else {
        const maximum = token.maxUses ?? 1;
        if (
          ["exhausted", "redeemed", "disabled", "revoked"].includes(token.status) ||
          token.usedCount >= maximum
        )
          throw new Error("TOKEN_EXHAUSTED");
        updated = await tx.inviteToken.update({
          where: { id: token.id },
          data: {
            usedCount: { increment: 1 },
            status: token.usedCount + 1 >= maximum ? "exhausted" : token.status,
          },
          include: { reservation: true },
        });
        redemption = await tx.tokenRedemption.create({
          data: {
            ...(operationId ? { id: operationId } : {}),
            tokenId: token.id,
            reservationId: reservation.id,
            redeemedAt: now,
            by: actor || context.by || null,
            device: context.device || null,
            location: context.location || null,
          },
        });
        const counts = await tx.inviteToken.aggregate({
          where: { reservationId: reservation.id, kind: P.universalTokenKind },
          _sum: { usedCount: true },
        });
        reservation = await tx.birthdayReservation.update({
          where: { id: reservation.id },
          data: { guestArrivals: counts._sum.usedCount || 0 },
        });
      }
    }
    const last = await tx.tokenRedemption.findFirst({
      where: {
        reservationId: reservation.id,
        token: { kind: P.universalTokenKind },
        OR: [{ location: null }, { NOT: { location: { startsWith: "host" } } }],
      },
      orderBy: { redeemedAt: "desc" },
      select: { redeemedAt: true },
    });
    return {
      token: updated,
      redemption,
      reservation,
      lastGuestArrivalAt: last?.redeemedAt || null,
    };
  });
  await audit("birthday.arrival", actor, {
    reservationId: result.reservation.id,
    role,
    tokenId: result.token.id,
  });
  return result;
}
export async function redeemToken(code: string, context: RedeemContext = {}, actor?: string) {
  const result = await registerBirthdayArrival(code, "guest", context, actor);
  if (!result.redemption) throw new Error("REDEMPTION_NOT_RECORDED");
  return { token: result.token, redemption: result.redemption };
}
