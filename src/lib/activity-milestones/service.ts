import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Rule = { id: string; threshold: number; points: number; enabled: boolean };
type CreditCount = { userId: string; total: number };
type Award = { userId: string; milestoneId: string; threshold: number; points: number; earnedAt: Date; revokedAt: Date | null };

export async function readActivityMilestones(userIds: string[]) {
  const ids = [...new Set(userIds)];
  return prisma.$transaction(async tx => {
  const rules = await tx.$queryRaw<Rule[]>`SELECT "id", "threshold", "points", "enabled" FROM "ActivityMilestone" ORDER BY "threshold"`;
  if (!ids.length) return { rules, users: [] };
  const [counts, awards] = await Promise.all([
    tx.$queryRaw<CreditCount[]>(Prisma.sql`SELECT "userId", "total" FROM "ActivityBalance" WHERE "userId" IN (${Prisma.join(ids)})`),
    tx.$queryRaw<Award[]>(Prisma.sql`SELECT "userId", "milestoneId", "threshold", "points", "earnedAt", "revokedAt" FROM "ActivityMilestoneAward" WHERE "userId" IN (${Prisma.join(ids)}) ORDER BY "threshold"`),
  ]);
  const countByUser = new Map(counts.map(item => [item.userId, Number(item.total)]));
  const awardsByUser = new Map<string, Award[]>();
  for (const award of awards) {
    const items = awardsByUser.get(award.userId) ?? [];
    items.push(award);
    awardsByUser.set(award.userId, items);
  }
  return { rules, users: ids.map(userId => {
    const total = countByUser.get(userId) ?? 0;
    const earned = (awardsByUser.get(userId) ?? []).filter(award => !award.revokedAt);
    const next = rules.find(rule => rule.enabled && rule.threshold > total) ?? null;
    return { userId, total, points: earned.reduce((sum, award) => sum + award.points, 0), next, awards: earned };
  }) };
  }, { isolationLevel: 'RepeatableRead' });
}
