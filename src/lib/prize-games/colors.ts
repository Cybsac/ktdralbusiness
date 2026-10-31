import type { Prisma } from "@prisma/client";
import { choosePrizeColor, PRIZE_COLOR_POLICY } from "@/lib/prize-colors";

export async function nextGamePrizeColor(
  tx: Pick<Prisma.TransactionClient, "gamePrizeCatalogItem">
) {
  const recent = await tx.gamePrizeCatalogItem.findMany({
    orderBy: { createdAt: "desc" },
    take: PRIZE_COLOR_POLICY.recentColors,
    select: { prize: { select: { color: true } } },
  });
  return choosePrizeColor(recent.map((item) => item.prize.color));
}
