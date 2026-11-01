import { prisma } from '@/lib/prisma';
import type { SummaryWindow } from './window';
import { deliveryOperators } from './interactiveMetrics';

export async function roulette({ startUtc, endUtc, fStart, fEnd }: SummaryWindow) {
// Delivered roulette prizes for this business day
// Business day maps to a date range: day 10:00 AM to day+1 10:00 AM (Lima UTC-5)

const deliveredTokens = await prisma.token.findMany({
  where: {
    deliveredAt: { gte: startUtc, lt: endUtc },
    batch: { isReusable: false, staticTargetUrl: null },
  },
  include: {
    prize: { select: { id: true, label: true, color: true } },
  },
});

const userIds = [...new Set(deliveredTokens.flatMap(token => token.deliveredByUserId ? [token.deliveredByUserId] : []))];
const users = userIds.length ? await prisma.user.findMany({
  where: { id: { in: userIds } },
  select: { id: true, username: true, person: { select: { name: true } } },
}) : [];
const names = new Map(users.map(user => [user.id, user.person?.name?.trim() || user.username]));
const operators = deliveryOperators(deliveredTokens, startUtc, endUtc, names);

// Group by prize label
const prizeDeliveryMap = new Map<string, { label: string; count: number }>();
for (const t of deliveredTokens) {
  const label = t.prize?.label ?? 'Sin premio';
  const existing = prizeDeliveryMap.get(label);
  if (existing) {
    existing.count++;
  } else {
    prizeDeliveryMap.set(label, { label, count: 1 });
  }
}
const deliveredPrizes = Array.from(prizeDeliveryMap.values()).sort((a, b) => b.count - a.count).map(prize => ({ ...prize, operators: operators.get(prize.label) ?? [] }));

// Distinct prizes from today's batches (using functionalDate)
// functionalDate is stored as 05:00 UTC (Lima midnight)

const batchTokens = await prisma.token.findMany({
  where: {
    batch: {
      isReusable: false,
      staticTargetUrl: null,
      functionalDate: { gte: fStart, lte: fEnd },
    },
  },
  select: {
    prize: { select: { id: true, label: true } },
    batch: { select: { id: true, description: true } },
  },
});

// Deduplicate by prize id
const prizeMap = new Map<string, { id: string; label: string }>();
for (const t of batchTokens) {
  if (t.prize && !prizeMap.has(t.prize.id)) {
    prizeMap.set(t.prize.id, { id: t.prize.id, label: t.prize.label });
  }
}
const dayPrizes = Array.from(prizeMap.values()).sort((a, b) => a.label.localeCompare(b.label));
const programmedPrizes = new Map<string, { id: string; label: string; count: number }>();
const programmedBatches = new Map<string, { id: string; description: string | null; count: number }>();
for (const token of batchTokens) {
  const prize = programmedPrizes.get(token.prize.id) ?? { ...token.prize, count: 0 };
  prize.count++;
  programmedPrizes.set(token.prize.id, prize);
  const batch = programmedBatches.get(token.batch.id) ?? { ...token.batch, count: 0 };
  batch.count++;
  programmedBatches.set(token.batch.id, batch);
}
const revealedTokens = await prisma.token.findMany({
  where: { revealedAt: { gte: startUtc, lt: endUtc }, batch: { isReusable: false, staticTargetUrl: null } },
  select: { deliveredAt: true, prize: { select: { id: true, label: true } } },
});
const cutoff = new Date(Math.min(Date.now(), endUtc.getTime()));
const playedPrizes = new Map<string, { id: string; label: string; count: number; pending: number }>();
for (const token of revealedTokens) {
  const group = playedPrizes.get(token.prize.id) ?? { ...token.prize, count: 0, pending: 0 };
  group.count++;
  if (!token.deliveredAt || token.deliveredAt >= cutoff) group.pending++;
  playedPrizes.set(token.prize.id, group);
}
return {
  deliveredPrizes, totalDelivered: deliveredTokens.length, dayPrizes, totalTokensInBatches: batchTokens.length,
  programmedPrizes: [...programmedPrizes.values()].sort((a, b) => a.label.localeCompare(b.label)),
  programmedBatches: [...programmedBatches.values()],
  totalPlayed: revealedTokens.length,
  playedPrizes: [...playedPrizes.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
};
}
