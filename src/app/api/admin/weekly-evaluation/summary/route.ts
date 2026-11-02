import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isBusinessDay } from '@/lib/daily-evaluation';
import { summaryWindow } from '@/lib/daily-evaluation-summary/window';
import { attendance } from '@/lib/daily-evaluation-summary/attendance';
import { roulette } from '@/lib/daily-evaluation-summary/roulette';
import { guests } from '@/lib/daily-evaluation-summary/guests';
import { reusable } from '@/lib/daily-evaluation-summary/reusable';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/weekly-evaluation/summary?week=YYYY-MM-DD
 * week param = the Monday of the desired week.
 * Returns an array of 7 daily summaries (Mon→Sun) using the same logic
 * as /api/admin/daily-evaluation/summary.
 */
export async function GET(req: NextRequest) {
  try {
    const raw = getUserSessionCookieFromRequest(req);
    const session = await verifyUserSessionCookie(raw);
    if (!session || !['ADMIN', 'COORDINATOR'].includes(session.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const weekParam = req.nextUrl.searchParams.get('week');
    if (!isBusinessDay(weekParam)) return NextResponse.json({ error: 'Fecha de semana inválida' }, { status: 400 });

    // Build 7 day strings Mon→Sun
    const monday = new Date(weekParam + 'T12:00:00Z');
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }

    const results = await Promise.all(days.map(day => getDaySummary(day)));

    const ratings = await prisma.personDailyRating.findMany({
      where: { businessDay: { gte: days[0], lte: days[days.length - 1] } },
      select: {
        personId: true,
        businessDay: true,
        rating: true,
        note: true,
        person: { select: { id: true, name: true, code: true, area: true, active: true } },
      },
      orderBy: [{ person: { name: 'asc' } }, { businessDay: 'asc' }],
    });

    const scoreByRating: Record<string, number> = { MALO: 1, REGULAR: 2, BUENO: 3, MUY_BUENO: 4 };
    const performanceMap = new Map<string, {
      person: typeof ratings[number]['person'];
      totalScore: number;
      daysEvaluated: number;
      distribution: Record<string, number>;
      details: { day: string; rating: string; note: string | null }[];
    }>();
    for (const item of ratings) {
      const current = performanceMap.get(item.personId) || {
        person: item.person,
        totalScore: 0,
        daysEvaluated: 0,
        distribution: { MALO: 0, REGULAR: 0, BUENO: 0, MUY_BUENO: 0 },
        details: [],
      };
      current.totalScore += scoreByRating[item.rating] ?? 2;
      current.daysEvaluated++;
      current.distribution[item.rating] = (current.distribution[item.rating] || 0) + 1;
      current.details.push({ day: item.businessDay, rating: item.rating, note: item.note });
      performanceMap.set(item.personId, current);
    }
    const individualPerformance = Array.from(performanceMap.values()).map(item => ({
      person: item.person,
      averageScore: Number((item.totalScore / item.daysEvaluated).toFixed(2)),
      daysEvaluated: item.daysEvaluated,
      distribution: item.distribution,
      details: item.details,
    }));

    return NextResponse.json({ week: weekParam, days: results, individualPerformance });
  } catch (error) {
    console.error('Error fetching weekly summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function getDaySummary(day: string) {
  const window = summaryWindow(day);
  const [people, prizes, guestSummary, reusableGroups, evaluation] = await Promise.all([
    attendance(day), roulette(window), guests(window), reusable(window),
    prisma.dailyEvaluation.findUnique({ where: { businessDay: day } }),
  ]);
  return {
    day,
    attendance: people,
    deliveredPrizes: prizes.deliveredPrizes,
    totalDelivered: prizes.totalDelivered,
    totalTokensInBatches: prizes.totalTokensInBatches,
    totalReusableSales: reusableGroups.reduce((sum, group) => sum + group.daySales, 0),
    reusableGroups,
    birthdays: guestSummary.birthdays,
    specialGuests: guestSummary.specialGuests,
    evaluation: evaluation ? { rating: evaluation.rating, comment: evaluation.comment, closedAt: evaluation.closedAt?.toISOString() ?? null } : null,
  };
}
