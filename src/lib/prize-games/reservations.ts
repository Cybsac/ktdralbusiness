import { Prisma } from "@prisma/client";

import { gameAvailability } from "./availability";
import { GAME_RESULT_KEYS, gameAction, type GameContinuation, PrizeGameError } from "./contracts";

export const gameTokenInclude = {
  prize: true,
  assignedPrize: true,
  batch: { select: { functionalDate: true, experienceType: true } },
} as const;
export type GameToken = Prisma.TokenGetPayload<{ include: typeof gameTokenInclude }>;

export async function reservationOwners(
  tx: Pick<Prisma.TransactionClient, "token">,
  tokenId: string
) {
  return tx.token.findMany({
    where: { pairedNextTokenId: tokenId, prize: { key: GAME_RESULT_KEYS.retry } },
    select: { id: true, revealedAt: true, batchId: true },
  });
}
export async function assertGameReservation(tx: Prisma.TransactionClient, token: GameToken) {
  const owners = await reservationOwners(tx, token.id);
  if (owners.length > 1)
    throw new PrizeGameError("RESERVATION_CONFLICT", "La reserva requiere revisión del personal");
  if (owners.some((owner) => !owner.revealedAt || owner.batchId !== token.batchId))
    throw new PrizeGameError("RESERVED_BY_RETRY", "Este token está reservado para un reintento");
}

/** Must run in the same serializable transaction as the parent's reveal. */
export async function selectContinuation(
  tx: Prisma.TransactionClient,
  parent: GameToken,
  now: Date
) {
  if (parent.pairedNextTokenId) {
    const candidate = await tx.token.findUnique({
      where: { id: parent.pairedNextTokenId },
      include: gameTokenInclude,
    });
    if (
      candidate &&
      candidate.batchId === parent.batchId &&
      gameAction(candidate.prize.key) === "PRIZE" &&
      !candidate.revealedAt &&
      !candidate.deliveredAt &&
      !candidate.redeemedAt &&
      !gameAvailability(candidate, now)
    ) {
      const owners = await reservationOwners(tx, candidate.id);
      if (owners.every((owner) => owner.id === parent.id)) return candidate;
    }
    // A previously revealed retry keeps its original entitlement; never swap its prize.
    if (parent.revealedAt)
      throw new PrizeGameError(
        "RETRY_UNAVAILABLE",
        "La continuación no está disponible. Consulta al personal."
      );
  }
  const reservations = await tx.token.findMany({
    where: { batchId: parent.batchId, pairedNextTokenId: { not: null } },
    select: { pairedNextTokenId: true },
  });
  const excluded = reservations.flatMap((item) =>
    item.pairedNextTokenId ? [item.pairedNextTokenId] : []
  );
  const candidates = await tx.token.findMany({
    where: {
      batchId: parent.batchId,
      id: { notIn: [parent.id, ...excluded] },
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
      prize: { active: true, key: { notIn: [GAME_RESULT_KEYS.retry, GAME_RESULT_KEYS.lose] } },
    },
    include: gameTokenInclude,
    orderBy: { id: "asc" },
    take: 1,
  });
  const candidate = candidates[0];
  if (!candidate || gameAvailability(candidate, now))
    throw new PrizeGameError(
      "RETRY_UNAVAILABLE",
      "No hay una continuación disponible. Tu reintento no se ha consumido; consulta al personal."
    );
  if ((await reservationOwners(tx, candidate.id)).length)
    throw new PrizeGameError(
      "RESERVATION_CONFLICT",
      "La continuación requiere revisión del personal"
    );
  return candidate;
}

export async function readContinuation(
  tx: Pick<Prisma.TransactionClient, "token">,
  parent: GameToken,
  now: Date
): Promise<GameContinuation | null> {
  if (gameAction(parent.prize.key) !== "RETRY" || !parent.revealedAt) return null;
  if (!parent.pairedNextTokenId)
    return {
      tokenId: parent.id,
      state: "UNAVAILABLE",
      code: "RETRY_UNAVAILABLE",
      message: "Consulta al personal para recuperar la continuación.",
    };
  const next = await tx.token.findUnique({
    where: { id: parent.pairedNextTokenId },
    include: gameTokenInclude,
  });
  if (!next || next.batchId !== parent.batchId || gameAction(next.prize.key) !== "PRIZE")
    return {
      tokenId: parent.pairedNextTokenId,
      state: "UNAVAILABLE",
      code: "RETRY_UNAVAILABLE",
      message: "La continuación requiere revisión del personal.",
    };
  const owners = await reservationOwners(tx, next.id);
  if (owners.some((owner) => owner.id !== parent.id))
    return {
      tokenId: next.id,
      state: "UNAVAILABLE",
      code: "RESERVATION_CONFLICT",
      message: "La continuación requiere revisión del personal.",
    };
  const unavailable = gameAvailability(next, now);
  const state =
    next.deliveredAt || next.redeemedAt
      ? "DELIVERED"
      : unavailable
        ? "UNAVAILABLE"
        : next.revealedAt
          ? "REVEALED"
          : "READY";
  return {
    tokenId: next.id,
    state,
    ...(unavailable && state === "UNAVAILABLE"
      ? { code: unavailable.code, message: unavailable.message }
      : {}),
  };
}
