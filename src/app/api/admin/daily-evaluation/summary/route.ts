import { NextRequest, NextResponse } from 'next/server';
import { isBusinessDay } from '@/lib/daily-evaluation';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { summaryWindow } from '@/lib/daily-evaluation-summary/window';
import { attendance } from '@/lib/daily-evaluation-summary/attendance';
import { roulette } from '@/lib/daily-evaluation-summary/roulette';
import { guests } from '@/lib/daily-evaluation-summary/guests';
import { reusable } from '@/lib/daily-evaluation-summary/reusable';
import { staticBatches } from '@/lib/daily-evaluation-summary/staticBatches';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
    if (!session || !['ADMIN', 'COORDINATOR', 'STAFF', 'COLLAB'].includes(session.role)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const day = req.nextUrl.searchParams.get('day');
    if (!isBusinessDay(day)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
    const window = summaryWindow(day);
    const [people, prizes, guestSummary, reusableGroups, staticSummary] = await Promise.all([
      attendance(day), roulette(window), guests(window), reusable(window), staticBatches(day, window),
    ]);
    return NextResponse.json({ attendance: people, ...prizes, ...guestSummary, reusableGroups, staticBatches: staticSummary });
  } catch (error) {
    console.error('Error fetching daily summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
