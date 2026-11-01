import type { Prisma } from "@prisma/client";
import { choosePrizeColor, PRIZE_COLOR_POLICY } from "@/lib/prize-colors";
import { staticPrizeWhere } from "./static-prizes";
export async function nextStaticPrizeColor(tx: Pick<Prisma.TransactionClient, "prize">) {
  const recent = await tx.prize.findMany({
    where: staticPrizeWhere,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PRIZE_COLOR_POLICY.recentColors,
    select: { color: true },
  });
  return choosePrizeColor(recent.map((prize) => prize.color));
}
