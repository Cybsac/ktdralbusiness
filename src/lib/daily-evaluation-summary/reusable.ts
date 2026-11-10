import { prisma } from '@/lib/prisma';
import { reusableAvailability } from '@/lib/reusable-tokens/validity';
import { readReusableSnapshot } from '@/lib/reusable-tokens/history-snapshot';
import type { SummaryWindow } from './window';

type PrizeSummary = { id: string; label: string; total: number; daySales: number; availableTokens: number; remainingUses: number; estimatedEvents: number; historicalLabels: string[] };
type GroupSummary = { id: string | null; name: string; color: string | null; totalTokens: number; activeTokens: number; daySales: number; remainingUses: number; estimatedEvents: number; untrackedUses: number; locked: boolean; historicalOnly: boolean; historicalNames: string[]; prizes: PrizeSummary[] };

export async function reusable({ startUtc, endUtc }: SummaryWindow) {
  const now = new Date();
  const [groups, tokens, events] = await Promise.all([
    prisma.tokenGroup.findMany({ select: { id: true, name: true, color: true, locked: true, sortOrder: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }),
    prisma.reusableToken.findMany({ select: { id: true, groupId: true, disabled: true, expiresAt: true, validFrom: true, weekdays: true, usedCount: true, maxUses: true, startTime: true, endTime: true, prize: { select: { id: true, label: true, active: true } }, _count: { select: { redemptions: true } } } }),
    prisma.reusableTokenRedemption.findMany({ where: { type: { in: ['deliver', 'redeem'] }, createdAt: { gte: startUtc, lt: endUtc } }, select: { note: true, token: { select: { groupId: true, group: { select: { id: true, name: true, color: true } }, prize: { select: { id: true, label: true } } } } } }),
  ]);
  const groupMap = new Map<string | null, GroupSummary>();
  const prizeMaps = new Map<string | null, Map<string, PrizeSummary>>();
  for (const group of groups) groupMap.set(group.id, { ...group, totalTokens: 0, activeTokens: 0, daySales: 0, remainingUses: 0, estimatedEvents: 0, untrackedUses: 0, historicalOnly: group.locked, historicalNames: [], prizes: [] });
  function ensureGroup(group: { id: string; name: string; color: string | null } | null) {
    const id = group?.id ?? null;
    let result = groupMap.get(id);
    if (!result) {
      result = { id, name: group?.name ?? 'Sin grupo', color: group?.color ?? null, totalTokens: 0, activeTokens: 0, daySales: 0, remainingUses: 0, estimatedEvents: 0, untrackedUses: 0, locked: !!group, historicalOnly: !!group, historicalNames: [], prizes: [] };
      groupMap.set(id, result);
    }
    return result;
  }
  function ensurePrize(group: GroupSummary, prize: { id: string; label: string }) {
    let byPrize = prizeMaps.get(group.id);
    if (!byPrize) { byPrize = new Map(); prizeMaps.set(group.id, byPrize); }
    let result = byPrize.get(prize.id);
    if (!result) { result = { ...prize, total: 0, daySales: 0, availableTokens: 0, remainingUses: 0, estimatedEvents: 0, historicalLabels: [] }; byPrize.set(prize.id, result); group.prizes.push(result); }
    return result;
  }
  for (const token of tokens) {
    const current = token.groupId ? groupMap.get(token.groupId) : ensureGroup(null);
    if (!current) continue;
    const prize = ensurePrize(current, token.prize);
    current.totalTokens++; prize.total++;
    current.untrackedUses += Math.max(0, token.usedCount - token._count.redemptions);
    if (!current.locked && reusableAvailability(token, now) === 'AVAILABLE') {
      const remaining = Math.max(0, token.maxUses - token.usedCount);
      current.activeTokens++; current.remainingUses += remaining;
      prize.availableTokens++; prize.remainingUses += remaining;
    }
  }
  for (const event of events) {
    const snapshot = readReusableSnapshot(event.note);
    const currentGroup = event.token.group;
    const target = ensureGroup(snapshot ? snapshot.group : currentGroup);
    const prize = ensurePrize(target, snapshot?.prize ?? event.token.prize);
    target.daySales++; prize.daySales++;
    if (snapshot?.group?.name && snapshot.group.name !== target.name && !target.historicalNames.includes(snapshot.group.name)) target.historicalNames.push(snapshot.group.name);
    if (snapshot?.prize.label && snapshot.prize.label !== prize.label && !prize.historicalLabels.includes(snapshot.prize.label)) prize.historicalLabels.push(snapshot.prize.label);
    if (!snapshot) { target.estimatedEvents++; prize.estimatedEvents++; }
  }
  return [...groupMap.values()]
    .filter(group => (!group.locked && (group.id !== null || group.totalTokens > 0 || group.daySales > 0)) || group.daySales > 0)
    .map(group => ({ ...group, prizes: group.prizes.sort((a, b) => b.daySales - a.daySales || a.label.localeCompare(b.label)) }));
}
