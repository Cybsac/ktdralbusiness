import { prisma } from "@/lib/prisma";
import { staticPrizeWhere } from "./static-prizes";
export async function readStaticPrizeCatalog() {
  const prizes = await prisma.prize.findMany({
    where: staticPrizeWhere,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      key: true,
      label: true,
      color: true,
      stock: true,
      active: true,
      emittedTotal: true,
    },
  });
  if (!prizes.length) return [];
  const where = {
    prizeId: { in: prizes.map((prize) => prize.id) },
    batch: { staticTargetUrl: { not: null } },
  };
  const [revealed, delivered, expired] = await Promise.all([
    prisma.token.groupBy({
      by: ["prizeId"],
      where: { ...where, revealedAt: { not: null }, deliveredAt: null },
      _count: { _all: true },
    }),
    prisma.token.groupBy({
      by: ["prizeId"],
      where: { ...where, deliveredAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.token.groupBy({
      by: ["prizeId"],
      where: { ...where, expiresAt: { lte: new Date() } },
      _count: { _all: true },
    }),
  ]);
  const expirations = new Map(expired.map((row) => [row.prizeId, row._count._all]));
  const reveals = new Map(revealed.map((row) => [row.prizeId, row._count._all]));
  const deliveries = new Map(delivered.map((row) => [row.prizeId, row._count._all]));
  return prizes.map((prize) => ({
    ...prize,
    revealedCount: reveals.get(prize.id) ?? 0,
    deliveredCount: deliveries.get(prize.id) ?? 0,
    expiredCount: expirations.get(prize.id) ?? 0,
  }));
}
