import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isRating, ratingPoints, type Rating } from '@/lib/daily-evaluation';

type Rule = { id: string; threshold: number; points: number; enabled: boolean };
type CreditCount = { userId: string; total: number };
type Award = { userId: string; milestoneId: string; threshold: number; points: number; earnedAt: Date; revokedAt: Date | null };
type RatingCount = { userId: string; rating: string; count: number };

export async function readActivityMilestones(userIds: string[]) {
  const ids = [...new Set(userIds)];
  return prisma.$transaction(async tx => {
  const rules = await tx.$queryRaw<Rule[]>`SELECT "id", "threshold", "points", "enabled" FROM "ActivityMilestone" ORDER BY "threshold"`;
  if (!ids.length) return { rules, users: [] };
  const [counts, awards, ratings] = await Promise.all([
    tx.$queryRaw<CreditCount[]>(Prisma.sql`SELECT "userId", "total" FROM "ActivityBalance" WHERE "userId" IN (${Prisma.join(ids)})`),
    tx.$queryRaw<Award[]>(Prisma.sql`SELECT "userId", "milestoneId", "threshold", "points", "earnedAt", "revokedAt" FROM "ActivityMilestoneAward" WHERE "userId" IN (${Prisma.join(ids)}) ORDER BY "threshold"`),
    tx.$queryRaw<RatingCount[]>(Prisma.sql`SELECT u."id" AS "userId", r."rating", COUNT(*)::int AS "count"
      FROM "User" u JOIN "PersonDailyRating" r ON r."personId" = u."personId"
      JOIN "DailyEvaluation" d ON d."businessDay" = r."businessDay" AND d."closedAt" IS NOT NULL
      WHERE u."id" IN (${Prisma.join(ids)}) GROUP BY u."id", r."rating"`),
  ]);
  const countByUser = new Map(counts.map(item => [item.userId, Number(item.total)]));
  const awardsByUser = new Map<string, Award[]>();
  for (const award of awards) {
    const items = awardsByUser.get(award.userId) ?? [];
    items.push(award);
    awardsByUser.set(award.userId, items);
  }
  const ratingsByUser = new Map<string, { rating: Rating; count: number; points: number }[]>();
  for (const item of ratings) {
    if (!isRating(item.rating)) continue;
    const entries = ratingsByUser.get(item.userId) ?? [];
    entries.push({ rating: item.rating, count: Number(item.count), points: Number(item.count) * ratingPoints(item.rating) });
    ratingsByUser.set(item.userId, entries);
  }
  return { rules, users: ids.map(userId => {
    const total = countByUser.get(userId) ?? 0;
    const earned = (awardsByUser.get(userId) ?? []).filter(award => !award.revokedAt);
    const next = rules.find(rule => rule.enabled && rule.threshold > total) ?? null;
    const points = earned.reduce((sum, award) => sum + award.points, 0);
    const ratingBreakdown = ratingsByUser.get(userId) ?? [];
    const ratingPointsTotal = ratingBreakdown.reduce((sum, entry) => sum + entry.points, 0);
    return { userId, total, points, ratingPoints: ratingPointsTotal, totalPoints: points + ratingPointsTotal, ratingBreakdown, next, awards: earned };
  }) };
  }, { isolationLevel: 'RepeatableRead' });
}
