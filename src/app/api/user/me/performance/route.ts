import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { RATING_LEVELS } from '@/lib/daily-evaluation';
import { performancePeriods, summarizeRatings } from '@/lib/performance';
import { currentBusinessDay } from '@/lib/attendanceDay';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
    if (!session) return NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { personId: true } });
    if (!user?.personId) return NextResponse.json({ ok: true, performance: null });

    const currentDay = currentBusinessDay();
    const { weekStart, thirtyDayStart, previousStart, previousEnd } = performancePeriods(currentDay);

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
    const week = summarizeRatings(weekRatings);
    const last30Days = summarizeRatings(recentRatings);
    const previous30Days = summarizeRatings(previousRatings);

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
