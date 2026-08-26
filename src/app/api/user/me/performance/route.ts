import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { prisma } from '@/lib/prisma';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SCORE_BY_RATING: Record<string, number> = {
  MALO: 1,
  REGULAR: 2,
  BUENO: 3,
  MUY_BUENO: 4,
};

function getLevel(score: number | null) {
  if (score === null) return null;
  if (score >= 3.5) return 'MUY_BUENO';
  if (score >= 2.5) return 'BUENO';
  if (score >= 1.5) return 'REGULAR';
  return 'MALO';
}

function summarize(ratings: { rating: string }[]) {
  const validRatings = ratings.filter(item => SCORE_BY_RATING[item.rating]);
  if (validRatings.length === 0) {
    return { averageScore: null, level: null, evaluatedDays: 0, distribution: { MALO: 0, REGULAR: 0, BUENO: 0, MUY_BUENO: 0 } };
  }

  const distribution = { MALO: 0, REGULAR: 0, BUENO: 0, MUY_BUENO: 0 };
  let total = 0;
  for (const item of validRatings) {
    const score = SCORE_BY_RATING[item.rating];
    if (!score) continue;
    total += score;
    if (item.rating in distribution) distribution[item.rating as keyof typeof distribution]++;
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

    const today = DateTime.now().setZone('America/Lima').startOf('day') as any;
    const currentBusinessDay = today.toFormat('yyyy-MM-dd');
    const weekStart = today.startOf('week').toFormat('yyyy-MM-dd');
    const thirtyDayStart = today.minus({ days: 29 }).toFormat('yyyy-MM-dd');
    const previousStart = today.minus({ days: 59 }).toFormat('yyyy-MM-dd');
    const previousEnd = today.minus({ days: 30 }).toFormat('yyyy-MM-dd');

    const ratings = await prisma.personDailyRating.findMany({
      where: {
        personId: user.personId,
        businessDay: { gte: previousStart, lte: currentBusinessDay },
      },
      select: { businessDay: true, rating: true },
      orderBy: { businessDay: 'asc' },
    });

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
        scale: { min: 1, max: 4 },
        week: { ...week, start: weekStart, end: currentBusinessDay },
        last30Days: { ...last30Days, start: thirtyDayStart, end: currentBusinessDay },
        trend,
      },
    });
  } catch (error) {
    console.error('Error fetching personal performance:', error);
    return NextResponse.json({ ok: false, code: 'INTERNAL' }, { status: 500 });
  }
}
