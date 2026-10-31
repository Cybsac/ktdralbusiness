import { Prisma } from "@prisma/client";

import { gameAvailability } from "./availability";
import { gameAction, PrizeGameError } from "./contracts";
import { assertGameReservation, gameTokenInclude } from "./reservations";
import { revealInGameTransaction } from "./reveal";

export async function sessionClaimWhere(
  tx: Prisma.TransactionClient,
  batchId: string,
  prizeId: string
) {
  const reservations = await tx.token.findMany({
    where: { batchId, pairedNextTokenId: { not: null } },
    select: { pairedNextTokenId: true },
  });
  const now = new Date();
  return {
    batchId,
    prizeId,
    id: {
      notIn: reservations.flatMap((row) => (row.pairedNextTokenId ? [row.pairedNextTokenId] : [])),
    },
    disabled: false,
    redeemedAt: null,
    deliveredAt: null,
    revealedAt: null,
    expiresAt: { gt: now },
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ startTime: null }, { startTime: { lte: now } }] },
      { OR: [{ endTime: null }, { endTime: { gt: now } }] },
    ],
    prize: { active: true },
  } satisfies Prisma.TokenWhereInput;
}
/** The session keeps its own draw algorithm; token state uses the same rules. */
export async function claimSessionToken(
  tx: Prisma.TransactionClient,
  tokenId: string,
  twoPhase: boolean,
  userId?: string
) {
  const token = await tx.token.findUnique({ where: { id: tokenId }, include: gameTokenInclude });
  if (!token) throw new PrizeGameError("TOKEN_NOT_FOUND", "Token no encontrado", 404);
  if (token.revealedAt || token.redeemedAt || token.deliveredAt)
    throw new PrizeGameError("STATE_CHANGED", "El token ya fue utilizado");
  const now = new Date();
  const unavailable = gameAvailability(token, now);
  if (unavailable) throw unavailable;
  await assertGameReservation(tx, token);
  if (twoPhase) {
    const result = await revealInGameTransaction(tx, token.id, true);
    return { revealedAt: result.timestamps.revealedAt, action: result.action };
  }
  const updated = await tx.token.updateMany({
    where: {
      id: token.id,
      redeemedAt: null,
      deliveredAt: null,
      revealedAt: null,
      disabled: false,
      expiresAt: { gt: now },
    },
    data: { redeemedAt: now, deliveredByUserId: userId },
  });
  if (updated.count !== 1)
    throw new PrizeGameError("STATE_CHANGED", "El estado del token cambió. Intenta nuevamente.");
  return { revealedAt: null, action: gameAction(token.prize.key) };
}
