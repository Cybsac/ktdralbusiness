import { prisma } from '@/lib/prisma';
import { currentBusinessDay } from '@/lib/attendanceDay';
import type { SummaryWindow } from './window';
import { deliveryOperators, interactiveMetrics } from './interactiveMetrics';

export async function staticBatches(day: string, { startUtc, endUtc, fStart }: SummaryWindow) {
// Static batch tokens — 3 metrics for this business day
// 1. Delivered today (deliveredAt in day window)
const staticDeliveredToday = await prisma.token.findMany({
  where: {
    deliveredAt: { gte: startUtc, lt: endUtc },
    batch: { staticTargetUrl: { not: null } },
  },
  include: {
    prize: { select: { id: true, label: true, color: true } },
  },
});

// Group delivered by prize label
const staticDeliveryMap = new Map<string, { label: string; color: string | null; count: number }>();
for (const t of staticDeliveredToday) {
  const label = t.prize?.label ?? 'Sin premio';
  const existing = staticDeliveryMap.get(label);
  if (existing) {
    existing.count++;
  } else {
    staticDeliveryMap.set(label, { label, color: t.prize?.color ?? null, count: 1 });
  }
}
const staticDeliveredPrizes = Array.from(staticDeliveryMap.values()).sort((a, b) => b.count - a.count);

// 2. QRs revealed (scanned) today (revealedAt in day window) — with prize detail
const staticRevealedTodayTokens = await prisma.token.findMany({
  where: {
    revealedAt: { gte: startUtc, lt: endUtc },
    batch: { staticTargetUrl: { not: null } },
  },
  include: {
    prize: { select: { id: true, label: true, color: true } },
  },
});
const staticRevealedMap = new Map<string, { label: string; color: string | null; count: number }>();
for (const t of staticRevealedTodayTokens) {
  const label = t.prize?.label ?? 'Sin premio';
  const existing = staticRevealedMap.get(label);
  if (existing) { existing.count++; } else { staticRevealedMap.set(label, { label, color: t.prize?.color ?? null, count: 1 }); }
}
const staticRevealedPrizes = Array.from(staticRevealedMap.values()).sort((a, b) => b.count - a.count);

// 3. Snapshot: currently in circulation (revealed but not delivered, not expired, not disabled) — with prize detail
const now2 = new Date();
const staticInCirculationTokens = await prisma.token.findMany({
  where: {
    revealedAt: { not: null },
    deliveredAt: null,
    disabled: false,
    expiresAt: { gte: now2 },
    batch: { staticTargetUrl: { not: null } },
  },
  include: {
    prize: { select: { id: true, label: true, color: true } },
  },
});
const staticCirculationMap = new Map<string, { label: string; color: string | null; count: number }>();
for (const t of staticInCirculationTokens) {
  const label = t.prize?.label ?? 'Sin premio';
  const existing = staticCirculationMap.get(label);
  if (existing) { existing.count++; } else { staticCirculationMap.set(label, { label, color: t.prize?.color ?? null, count: 1 }); }
}
const staticCirculationPrizes = Array.from(staticCirculationMap.values()).sort((a, b) => b.count - a.count);

// 4. Historical remaining tokens for the latest static batch available
// on or before the selected date.
// A token remains available for a past day when it was not delivered yet
// at the end of that business day. This makes the KPI show the original
// total before any later delivery and decrease as deliveries accumulate.
const staticBatchAnchor = await prisma.batch.findFirst({
  where: {
    staticTargetUrl: { not: null },
    functionalDate: { lte: fStart },
  },
  orderBy: [{ functionalDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  select: { id: true, description: true, functionalDate: true },
});
const staticKpiCutoff = day === currentBusinessDay() ? new Date() : endUtc;
const staticAvailableTokens = staticBatchAnchor?.functionalDate
  ? await prisma.token.findMany({
      where: {
        disabled: false,
        expiresAt: { gte: staticKpiCutoff },
        OR: [{ deliveredAt: null }, { deliveredAt: { gte: staticKpiCutoff } }],
        batch: { staticTargetUrl: { not: null }, functionalDate: staticBatchAnchor.functionalDate },
      },
      select: { prize: { select: { id: true, label: true, color: true } } },
    })
  : [];
const staticAvailableMap = new Map<string, { label: string; color: string | null; count: number }>();
for (const t of staticAvailableTokens) {
  const label = t.prize?.label ?? 'Sin premio';
  const existing = staticAvailableMap.get(label);
  if (existing) { existing.count++; } else { staticAvailableMap.set(label, { label, color: t.prize?.color ?? null, count: 1 }); }
}
const staticAvailablePrizes = Array.from(staticAvailableMap.values()).sort((a, b) => a.label.localeCompare(b.label));

// The same batch and time boundary are used for all three dashboard indicators.
const interactiveTokens = staticBatchAnchor
  ? await prisma.token.findMany({
      where: { batchId: staticBatchAnchor.id },
      select: { deliveredAt: true, deliveredByUserId: true, revealedAt: true, expiresAt: true, validFrom: true, disabled: true, prize: { select: { label: true, color: true } } },
    })
  : [];
const metrics = staticBatchAnchor ? interactiveMetrics(interactiveTokens, startUtc, staticKpiCutoff) : null;
const deliveryUserIds = [...new Set(interactiveTokens
  .filter(token => token.deliveredAt && token.deliveredAt >= startUtc && token.deliveredAt < staticKpiCutoff && token.deliveredByUserId)
  .map(token => token.deliveredByUserId!))];
const deliveryUsers = deliveryUserIds.length
  ? await prisma.user.findMany({ where: { id: { in: deliveryUserIds } }, select: { id: true, username: true, person: { select: { name: true } } } })
  : [];
const deliveryNames = new Map(deliveryUsers.map(user => [user.id, user.person?.name?.trim() || user.username]));
const operatorsByPrize = deliveryOperators(interactiveTokens, startUtc, staticKpiCutoff, deliveryNames);
const interactive = staticBatchAnchor && metrics ? {
  batchId: staticBatchAnchor.id,
  batchName: staticBatchAnchor.description,
  ...metrics,
  deliveredPrizes: metrics.deliveredPrizes.map(prize => ({ ...prize, operators: operatorsByPrize.get(prize.label) ?? [] })),
} : null;

const staticBatchSummary = {
  interactive,
  deliveredToday: staticDeliveredToday.length,
  deliveredPrizes: staticDeliveredPrizes,
  revealedToday: staticRevealedTodayTokens.length,
  revealedPrizes: staticRevealedPrizes,
  inCirculation: staticInCirculationTokens.length,
  circulationPrizes: staticCirculationPrizes,
  availableTotal: staticAvailableTokens.length,
  availablePrizes: staticAvailablePrizes,
};
  return staticBatchSummary;
}
