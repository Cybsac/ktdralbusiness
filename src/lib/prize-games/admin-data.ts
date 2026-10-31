import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { AdminPrize, PrizeAdminData } from "./admin-types";
import { getGameCalendar } from "./calendar";
import { pendingGameStockWhere } from "./catalog";
import { GAME_RESULT_KEYS } from "./contracts";
import { ISSUANCE_POLICY } from "./issuance-policy";

const prizeSelection = {
  id: true,
  key: true,
  label: true,
  color: true,
  active: true,
  gameEnabled: true,
  isReusable: true,
  tokens: { take: 1, select: { id: true } },
  assignedTokens: { take: 1, select: { id: true } },
} as const;
type ManagedPrize = Prisma.PrizeGetPayload<{ select: typeof prizeSelection }>;
function catalogPrize(prize: ManagedPrize, stock: number | null): AdminPrize {
  return {
    id: prize.id,
    key: prize.key,
    label: prize.label,
    color: prize.color,
    stock,
    active: prize.active,
    gameEnabled: prize.gameEnabled,
    isReusable: prize.isReusable,
    hasTokens: prize.tokens.length > 0 || prize.assignedTokens.length > 0,
  };
}
interface BatchInventory {
  batchId: string;
  tokenCount: number;
  validFrom: Date | null;
  expiresAt: Date | null;
}
/** Only quantity and validity of the requested recent batches; no redemption statistics. */
export function batchInventoryQuery(batchIds: string[]) {
  return Prisma.sql`SELECT t."batchId", count(*)::int AS "tokenCount",
 MIN(GREATEST(t."createdAt",t."validFrom",t."startTime",b."functionalDate")) AS "validFrom",
 MAX(LEAST(t."expiresAt",t."endTime")) AS "expiresAt"
 FROM "Token" t JOIN "Batch" b ON b.id=t."batchId"
 WHERE ${batchIds.length ? Prisma.sql`t."batchId" IN (${Prisma.join(batchIds)})` : Prisma.sql`false`}
 GROUP BY t."batchId"`;
}
export async function getPrizeAdminData(): Promise<PrizeAdminData> {
  const [items, systemPrizes, batches] = await Promise.all([
    prisma.gamePrizeCatalogItem.findMany({
      where: pendingGameStockWhere,
      include: { prize: { select: prizeSelection } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.prize.findMany({
      where: { key: { in: Object.values(GAME_RESULT_KEYS) } },
      select: prizeSelection,
    }),
    prisma.batch.findMany({
      where: { isReusable: false, actionType: null, staticTargetUrl: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ISSUANCE_POLICY.recentBatches,
      select: { id: true, description: true, createdAt: true },
    }),
  ]);
  const prizes = items.map((item) => catalogPrize(item.prize, item.stock));
  for (const prize of systemPrizes)
    if (!prizes.some((item) => item.id === prize.id)) prizes.push(catalogPrize(prize, 0));
  const inventory = batches.length
    ? await prisma.$queryRaw<BatchInventory[]>(
        batchInventoryQuery(batches.map((batch) => batch.id))
      )
    : [];
  const byBatch = new Map(inventory.map((row) => [row.batchId, row]));
  return {
    calendar: getGameCalendar(),
    prizes,
    batches: batches.map((batch) => {
      const stock = byBatch.get(batch.id);
      return {
        id: batch.id,
        name: batch.description || batch.id,
        createdAt: batch.createdAt.toISOString(),
        validFrom: stock?.validFrom?.toISOString() ?? null,
        expiresAt: stock?.expiresAt?.toISOString() ?? null,
        tokenCount: stock?.tokenCount ?? 0,
      };
    }),
  };
}
