import { NextResponse } from 'next/server';

import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { currentBusinessDay } from '@/lib/attendanceDay';
import { canManageDailyEvaluation, EVALUABLE_USER_ROLES, isBusinessDay } from '@/lib/daily-evaluation';
import { summarizeRatings } from '@/lib/performance';
import { readActivityMilestones } from '@/lib/activity-milestones/service';

export const dynamic = 'force-dynamic';

type Rating = { rating: string; businessDay: string };

export async function GET(req: Request) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
    if (!session || !canManageDailyEvaluation(session.role)) {
      return NextResponse.json({ ok: false, code: 'FORBIDDEN' }, { status: 403 });
    }

    const params = new URL(req.url).searchParams;
    const today = currentBusinessDay();
    const start = params.get('start') ?? today;
    const end = params.get('end') ?? start;
    if (!isBusinessDay(start) || !isBusinessDay(end) || start > end) {
      return NextResponse.json({ ok: false, code: 'INVALID_PERIOD', error: 'Selecciona fechas válidas y un inicio anterior o igual al fin.' }, { status: 400 });
    }

    const workers = await prisma.person.findMany({
      where: { active: true, user: { role: { in: [...EVALUABLE_USER_ROLES] } } },
      select: { id: true, name: true, code: true, area: true, user: { select: { id: true, role: true } } },
      orderBy: { name: 'asc' },
    });
    const workerIds = workers.map((worker) => worker.id);
    const [allRatings, closedEvaluations, milestones] = await Promise.all([
      prisma.personDailyRating.findMany({
        where: {
          personId: { in: workerIds },
          businessDay: { gte: start, lte: end },
        },
        select: { personId: true, businessDay: true, rating: true },
      }),
      prisma.dailyEvaluation.findMany({
        where: { businessDay: { gte: start, lte: end }, closedAt: { not: null } },
        select: { businessDay: true },
      }),
      readActivityMilestones(workers.flatMap(worker => worker.user ? [worker.user.id] : [])).catch(error => {
        console.error('Error fetching team activity milestones:', error);
        return null;
      }),
    ]);
    const activityByUser = new Map((milestones?.users ?? []).map(({ userId, total, points, ratingPoints, totalPoints, next }) => [userId, { total, points, ratingPoints, totalPoints, next }]));
    const closedDays = new Set(closedEvaluations.map((evaluation) => evaluation.businessDay));
    const ratings = allRatings.filter(rating => closedDays.has(rating.businessDay));

    const ratingsByPerson = new Map<string, Rating[]>();
    for (const rating of ratings) {
      const list = ratingsByPerson.get(rating.personId) || [];
      list.push({ rating: rating.rating, businessDay: rating.businessDay });
      ratingsByPerson.set(rating.personId, list);
    }

    const people = workers.map((person) => {
      const personRatings = ratingsByPerson.get(person.id) || [];
      return {
        person: { id: person.id, name: person.name, code: person.code, area: person.area, role: person.user?.role || null },
        period: { ...summarizeRatings(personRatings), closedDays: closedDays.size },
        activity: person.user ? activityByUser.get(person.user.id) ?? null : null,
      };
    });

    return NextResponse.json({
      ok: true,
      team: {
        period: { ...summarizeRatings(ratings), closedDays: closedDays.size, start, end },
        people,
      },
    });
  } catch (error) {
    console.error('Error fetching team performance:', error);
    return NextResponse.json({ ok: false, code: 'INTERNAL' }, { status: 500 });
  }
}
