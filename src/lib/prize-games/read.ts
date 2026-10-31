import { getSystemConfig } from "@/lib/config";
import { DEFAULT_TOKEN_EXPERIENCE, isTokenExperienceType } from "@/lib/experiences/types";
import { prisma } from "@/lib/prisma";

import { gameAvailability, gameAvailableFrom } from "./availability";
import { getGameCalendar } from "./calendar";
import { GAME_POLICY, gameAction, PrizeGameError } from "./contracts";
import { gameTokenInclude, readContinuation, reservationOwners } from "./reservations";

export async function readPrizeGame(tokenId: string) {
  const config = await getSystemConfig(true);
  if (!config.tokensEnabled)
    throw new PrizeGameError(
      "SYSTEM_OFF",
      "El sistema de tokens está desactivado temporalmente.",
      403
    );
  const token = await prisma.token.findUnique({
    where: { id: tokenId },
    include: gameTokenInclude,
  });
  if (!token) throw new PrizeGameError("NOT_FOUND", "Token no encontrado", 404);
  const now = new Date();
  const owners = await reservationOwners(prisma, token.id);
  const reserved =
    owners.length > 1 ||
    owners.some((owner) => !owner.revealedAt || owner.batchId !== token.batchId);
  const unavailable = gameAvailability(token, now);
  const continuation = await readContinuation(prisma, token, now);
  const resultPrize = token.revealedAt ? token.assignedPrize || token.prize : token.prize;
  const serialized = {
    id: token.id,
    timeZone: getGameCalendar().timeZone,
    batchId: token.batchId,
    expiresAt: token.expiresAt.toISOString(),
    revealedAt: token.revealedAt?.toISOString() || null,
    redeemedAt: token.redeemedAt?.toISOString() || null,
    deliveredAt: token.deliveredAt?.toISOString() || null,
    disabled: !!unavailable || reserved,
    availableFrom:
      unavailable?.code === "NOT_YET_VALID"
        ? gameAvailableFrom(token)?.toISOString() || null
        : null,
    availability: reserved ? "RESERVED_BY_RETRY" : unavailable?.code || "AVAILABLE",
    experienceType: isTokenExperienceType(token.batch.experienceType)
      ? token.batch.experienceType
      : DEFAULT_TOKEN_EXPERIENCE,
    reservedByRetry: reserved,
    action: gameAction(token.prize.key),
    continuation,
    prize: {
      id: resultPrize.id,
      key: resultPrize.key,
      label: resultPrize.label,
      color: resultPrize.color,
      active: resultPrize.active,
    },
  };
  // History and blocked tokens do not need the live inventory to show their state.
  let elements: Array<{
    prizeId: string;
    key: string;
    label: string;
    color: string | null;
    count: number;
    presentationOnly?: boolean;
  }> = [];
  if (!unavailable && !reserved && !token.redeemedAt && !token.deliveredAt) {
    const groups = await prisma.token.groupBy({
      by: ["prizeId"],
      where: {
        batchId: token.batchId,
        disabled: false,
        redeemedAt: null,
        deliveredAt: null,
        expiresAt: { gt: now },
        prize: { active: true },
      },
      _count: { _all: true },
    });
    const prizes = await prisma.prize.findMany({
      where: { id: { in: groups.map((group) => group.prizeId) } },
      select: { id: true, key: true, label: true, color: true },
    });
    elements = prizes.map((prize) => ({
      prizeId: prize.id,
      key: prize.key,
      label: prize.label,
      color: prize.color,
      count: groups.find((group) => group.prizeId === prize.id)!._count._all,
    }));
  }
  if (!elements.some((element) => element.prizeId === resultPrize.id))
    elements.push({
      prizeId: resultPrize.id,
      key: resultPrize.key,
      label: resultPrize.label,
      color: resultPrize.color,
      count: 1,
    });
  if (serialized.experienceType === "roulette" && elements.length === 1) {
    while (elements.length < GAME_POLICY.minimumRouletteSegments)
      elements.push({ ...elements[0], count: 0, presentationOnly: true });
  }
  return {
    token: serialized,
    elements,
    ...(unavailable || reserved
      ? { message: reserved ? "Token reservado para un reintento" : unavailable?.message }
      : {}),
  };
}
