import { Prisma } from "@prisma/client";

import { getSystemConfig } from "@/lib/config";
import { logEvent } from "@/lib/log";

import { gameAvailability } from "./availability";
import { gameAction, PrizeGameError } from "./contracts";
import {
  assertGameReservation,
  gameTokenInclude,
  readContinuation,
  selectContinuation,
} from "./reservations";
import { gameTransaction } from "./transaction";

export async function revealPrizeGame(tokenId: string, requestedPrizeId?: string) {
  const config = await getSystemConfig(true);
  const result = await gameTransaction((tx) =>
    revealInGameTransaction(tx, tokenId, config.tokensEnabled, requestedPrizeId)
  );
  if (!result.alreadyRevealed)
    await logEvent("TOKEN_REVEALED", "Token revelado", {
      tokenId: result.tokenId,
      prizeId: result.prizeId,
      action: result.action,
      nextTokenId: result.nextTokenId,
    });
  return result;
}

export async function revealInGameTransaction(
  tx: Prisma.TransactionClient,
  tokenId: string,
  enabled: boolean,
  requestedPrizeId?: string
) {
  const token = await tx.token.findUnique({ where: { id: tokenId }, include: gameTokenInclude });
  if (!token) throw new PrizeGameError("TOKEN_NOT_FOUND", "Token no encontrado", 404);
  if (requestedPrizeId && requestedPrizeId !== token.prizeId)
    throw new PrizeGameError(
      "INVALID_PRIZE",
      "El resultado pertenece al token y no se puede reemplazar",
      400
    );
  if (token.deliveredAt || token.redeemedAt)
    throw new PrizeGameError("ALREADY_DELIVERED", "El token ya fue canjeado");
  const now = new Date();
  if (token.revealedAt)
    return {
      phase: "REVEALED",
      tokenId: token.id,
      prizeId: token.assignedPrizeId || token.prizeId,
      timestamps: { revealedAt: token.revealedAt },
      action: gameAction(token.prize.key),
      alreadyRevealed: true,
      nextTokenId: token.pairedNextTokenId,
      continuation: await readContinuation(tx, token, now),
    };
  if (!enabled)
    throw new PrizeGameError("SYSTEM_OFF", "El juego está desactivado temporalmente", 423);
  const unavailable = gameAvailability(token, now);
  if (unavailable) throw unavailable;
  await assertGameReservation(tx, token);
  const action = gameAction(token.prize.key);
  const next = action === "RETRY" ? await selectContinuation(tx, token, now) : null;
  const updated = await tx.token.updateMany({
    where: {
      id: token.id,
      revealedAt: null,
      redeemedAt: null,
      deliveredAt: null,
      disabled: false,
      expiresAt: { gt: now },
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ startTime: null }, { startTime: { lte: now } }] },
        { OR: [{ endTime: null }, { endTime: { gt: now } }] },
      ],
    },
    data: {
      revealedAt: now,
      assignedPrizeId: token.prizeId,
      ...(next ? { pairedNextTokenId: next.id } : {}),
    },
  });
  if (updated.count !== 1)
    throw new PrizeGameError(
      "STATE_CHANGED",
      "El token cambió. Actualiza la pantalla e intenta nuevamente."
    );
  return {
    phase: "REVEALED",
    tokenId: token.id,
    prizeId: token.prizeId,
    timestamps: { revealedAt: now },
    action,
    alreadyRevealed: false,
    nextTokenId: next?.id || null,
    continuation: next ? { tokenId: next.id, state: "READY" as const } : null,
  };
}
