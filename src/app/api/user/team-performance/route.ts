import { DateTime } from 'luxon';
import { NextResponse } from 'next/server';

import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const WORKER_ROLES = ['COLLAB', 'STAFF'] as const;
const SCORE_BY_RATING: Record<string, number> = {
  MALO: 1,
  REGULAR: 2,
  BUENO: 3,
  MUY_BUENO: 4,
};

type Rating = { rating: string; businessDay: string };

type Summary = {
  averageScore: number | null;
  level: string | null;
  evaluatedDays: number;
  closedDays: number;
  distribution: { MALO: number; REGULAR: number; BUENO: number; MUY_BUENO: number };
};

function getLevel(score: number | null) {
  if (score === null) return null;
  if (score >= 3.5) return 'MUY_BUENO';
  if (score >= 2.5) return 'BUENO';
  if (score >= 1.5) return 'REGULAR';
  return 'MALO';
}

function summarize(ratings: Rating[], closedDays = 0): Summary {
  const distribution = { MALO: 0, REGULAR: 0, BUENO: 0, MUY_BUENO: 0 };
  let total = 0;

  for (const item of ratings) {
    const score = SCORE_BY_RATING[item.rating];
    if (!score) continue;
    total += score;
    distribution[item.rating as keyof typeof distribution]++;
  }

  const evaluatedDays = new Set(
    ratings.filter((item) => SCORE_BY_RATING[item.rating]).map((item) => item.businessDay)
  ).size;
  const averageScore = evaluatedDays > 0 ? Number((total / evaluatedDays).toFixed(2)) : null;

  return {
    averageScore,
    level: getLevel(averageScore),
    evaluatedDays,
    closedDays,
    distribution,
  };
}

export async function GET(req: Request) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
    if (!session || !['ADMIN', 'COORDINATOR'].includes(session.role)) {
      return NextResponse.json({ ok: false, code: 'FORBIDDEN' }, { status: 403 });
    }

    const today = DateTime.now().setZone('America/Lima').startOf('day') as any;
    const currentBusinessDay = today.toFormat('yyyy-MM-dd');
    const weekStart = today.startOf('week').toFormat('yyyy-MM-dd');
    const thirtyDayStart = today.minus({ days: 29 }).toFormat('yyyy-MM-dd');

    const workers = await prisma.person.findMany({
      where: { active: true, user: { role: { in: [...WORKER_ROLES] } } },
      select: { id: true, name: true, code: true, area: true, user: { select: { role: true } } },
      orderBy: { name: 'asc' },
    });
    const workerIds = workers.map((worker) => worker.id);
    const [ratings, closedEvaluations] = await Promise.all([
      prisma.personDailyRating.findMany({
        where: {
          personId: { in: workerIds },
          businessDay: { gte: thirtyDayStart, lte: currentBusinessDay },
        },
        select: { personId: true, businessDay: true, rating: true },
      }),
      prisma.dailyEvaluation.findMany({
        where: { businessDay: { gte: thirtyDayStart, lte: currentBusinessDay }, closedAt: { not: null } },
        select: { businessDay: true },
      }),
    ]);
    const closedDays = new Set(closedEvaluations.map((evaluation) => evaluation.businessDay));

    const ratingsByPerson = new Map<string, Rating[]>();
    for (const rating of ratings) {
      const list = ratingsByPerson.get(rating.personId) || [];
      list.push({ rating: rating.rating, businessDay: rating.businessDay });
      ratingsByPerson.set(rating.personId, list);
    }

    const people = workers.map((person) => {
      const personRatings = ratingsByPerson.get(person.id) || [];
      const weekRatings = personRatings.filter((rating) => rating.businessDay >= weekStart);
      const recentRatings = personRatings.filter((rating) => rating.businessDay >= thirtyDayStart);
      return {
        person: { id: person.id, name: person.name, code: person.code, area: person.area, role: person.user?.role || null },
        week: summarize(weekRatings, closedEvaluations.filter((evaluation) => evaluation.businessDay >= weekStart).length),
        last30Days: summarize(recentRatings, closedDays.size),
      };
    });

    const allWeekRatings = ratings.filter((rating) => rating.businessDay >= weekStart);
    const allRecentRatings = ratings.filter((rating) => rating.businessDay >= thirtyDayStart);

    return NextResponse.json({
      ok: true,
      team: {
        week: { ...summarize(allWeekRatings, closedEvaluations.filter((evaluation) => evaluation.businessDay >= weekStart).length), start: weekStart, end: currentBusinessDay },
        last30Days: { ...summarize(allRecentRatings, closedDays.size), start: thirtyDayStart, end: currentBusinessDay },
        people,
      },
    });
  } catch (error) {
    console.error('Error fetching team performance:', error);
    return NextResponse.json({ ok: false, code: 'INTERNAL' }, { status: 500 });
  }
}
