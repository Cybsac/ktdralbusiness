import { NextRequest, NextResponse } from 'next/server';

import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { getDailyJourneyDashboard, getWeeklyJourneyDashboard } from '@/lib/weekly-journey-stats';
import { evolutionMaxRangeDays, evolutionRange } from '@/lib/evolution-range';
import { currentBusinessDay } from '@/lib/attendanceDay';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const raw = getUserSessionCookieFromRequest(req);
    const session = await verifyUserSessionCookie(raw);
    if (!session || !['ADMIN', 'COORDINATOR'].includes(session.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const start = req.nextUrl.searchParams.get('start');
    const end = req.nextUrl.searchParams.get('end');
    if (start !== null || end !== null) {
      const maxDays = evolutionMaxRangeDays();
      const range = evolutionRange(start || '', end || '', maxDays);
      if (!range) return NextResponse.json({ error: `Selecciona fechas válidas en orden, con un máximo de ${maxDays} días.` }, { status: 400 });
      return NextResponse.json(await getDailyJourneyDashboard(range.end, range.days));
    }
    const day = req.nextUrl.searchParams.get('day') || currentBusinessDay();
    const granularity = req.nextUrl.searchParams.get('granularity');

    if (granularity === 'day') {
      const dayCountParam = Number(req.nextUrl.searchParams.get('days') || '7');
      const dayCount = Number.isFinite(dayCountParam) ? Math.min(Math.max(Math.trunc(dayCountParam), 1), 30) : 7;
      const dashboard = await getDailyJourneyDashboard(day, dayCount);
      return NextResponse.json(dashboard);
    }

    const weekCountParam = Number(req.nextUrl.searchParams.get('weeks') || '8');
    const weekCount = Number.isFinite(weekCountParam)
      ? Math.min(Math.max(Math.trunc(weekCountParam), 4), 60)
      : 8;

    const dashboard = await getWeeklyJourneyDashboard(day, weekCount);
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error('Error fetching weekly journey dashboard:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
