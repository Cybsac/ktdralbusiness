import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { prisma } from '@/lib/prisma';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { DAILY_EVALUATION_TIME_ZONE, isRating, RATING_LEVELS, type Rating } from '@/lib/daily-evaluation';
import { currentBusinessDay } from '@/lib/attendanceDay';

export const dynamic = 'force-dynamic';

function getLevel(score: number | null) {
  if (score === null) return null;
  return RATING_LEVELS[Math.min(RATING_LEVELS.length - 1, Math.max(0, Math.round(score) - 1))];
}

function summarize(ratings: { rating: string }[]) {
  const validRatings = ratings.filter((item): item is { rating: Rating } => isRating(item.rating));
  const distribution = Object.fromEntries(RATING_LEVELS.map(rating => [rating, 0])) as Record<Rating, number>;
  if (validRatings.length === 0) {
    return { averageScore: null, level: null, evaluatedDays: 0, distribution };
  }

  let total = 0;
  for (const item of validRatings) {
    total += RATING_LEVELS.indexOf(item.rating) + 1;
    distribution[item.rating]++;
  }
  const averageScore = Number((total / validRatings.length).toFixed(2));
  return { averageScore, level: getLevel(averageScore), evaluatedDays: validRatings.length, distribution };
}

export async function GET(req: Request) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
    if (!session) return NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { personId: true } });
    if (!user?.personId) return NextResponse.json({ ok: true, performance: null });

    const currentDay = currentBusinessDay();
    const today = DateTime.fromISO(currentDay, { zone: DAILY_EVALUATION_TIME_ZONE });
    const weekStart = today.startOf('week').toFormat('yyyy-MM-dd');
    const thirtyDayStart = today.minus({ days: 29 }).toFormat('yyyy-MM-dd');
    const previousStart = today.minus({ days: 59 }).toFormat('yyyy-MM-dd');
    const previousEnd = today.minus({ days: 30 }).toFormat('yyyy-MM-dd');

    const [allRatings, closedEvaluations] = await Promise.all([prisma.personDailyRating.findMany({
      where: {
        personId: user.personId,
        businessDay: { gte: previousStart, lte: currentDay },
      },
      select: { businessDay: true, rating: true },
      orderBy: { businessDay: 'asc' },
    }), prisma.dailyEvaluation.findMany({
      where: { businessDay: { gte: previousStart, lte: currentDay }, closedAt: { not: null } },
      select: { businessDay: true },
    })]);
    const closedDays = new Set(closedEvaluations.map(item => item.businessDay));
    const ratings = allRatings.filter(item => closedDays.has(item.businessDay));

    const weekRatings = ratings.filter(item => item.businessDay >= weekStart);
    const recentRatings = ratings.filter(item => item.businessDay >= thirtyDayStart);
    const previousRatings = ratings.filter(item => item.businessDay >= previousStart && item.businessDay <= previousEnd);
    const week = summarize(weekRatings);
    const last30Days = summarize(recentRatings);
    const previous30Days = summarize(previousRatings);

    let trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | null = null;
    if (last30Days.averageScore !== null && previous30Days.averageScore !== null) {
      const delta = last30Days.averageScore - previous30Days.averageScore;
      trend = delta >= 0.25 ? 'IMPROVING' : delta <= -0.25 ? 'DECLINING' : 'STABLE';
    }

    return NextResponse.json({
      ok: true,
      performance: {
        scale: { min: 1, max: RATING_LEVELS.length },
        week: { ...week, start: weekStart, end: currentDay },
        last30Days: { ...last30Days, start: thirtyDayStart, end: currentDay },
        trend,
      },
    });
  } catch (error) {
    console.error('Error fetching personal performance:', error);
    return NextResponse.json({ ok: false, code: 'INTERNAL' }, { status: 500 });
  }
}
