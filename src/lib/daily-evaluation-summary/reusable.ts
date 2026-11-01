import { prisma } from '@/lib/prisma';
import type { SummaryWindow } from './window';

export async function reusable({ startUtc, endUtc }: SummaryWindow) {
// Reusable token groups — count actual usage for the configured business day.
const reusableGroups = await prisma.tokenGroup.findMany({
  where: { locked: false },
  select: {
    id: true, name: true, color: true,
    tokens: {
      select: {
        disabled: true,
        prize: { select: { id: true, label: true } },
        _count: { select: { redemptions: { where: {
          type: { in: ['deliver', 'redeem'] },
          createdAt: { gte: startUtc, lt: endUtc },
        } } } },
      },
    },
  },
  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
});

const reusableGroupsSummary = reusableGroups.map(g => {
  let daySales = 0;
  const prizeAcc: Record<string, { label: string; total: number; daySales: number }> = {};
  for (const t of g.tokens) {
    const key = t.prize.id;
    if (!prizeAcc[key]) prizeAcc[key] = { label: t.prize.label, total: 0, daySales: 0 };
    prizeAcc[key].total++;
    const tokenDaySales = t._count.redemptions;
    prizeAcc[key].daySales += tokenDaySales;
    daySales += tokenDaySales;
  }
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    totalTokens: g.tokens.length,
    activeTokens: g.tokens.filter(t => !t.disabled).length,
    daySales,
    prizes: Object.values(prizeAcc),
  };
});
  return reusableGroupsSummary;
}
