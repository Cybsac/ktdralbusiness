import { NextRequest, NextResponse } from 'next/server';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { isBusinessDay, canViewDailyEvaluation } from '@/lib/daily-evaluation';
import { summaryWindow } from '@/lib/daily-evaluation-summary/window';
import { reusable } from '@/lib/daily-evaluation-summary/reusable';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(request));
    if (!session || !canViewDailyEvaluation(session.role)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const day = request.nextUrl.searchParams.get('day');
    if (!isBusinessDay(day)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
    return NextResponse.json({ reusableGroups: await reusable(summaryWindow(day)) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error fetching reusable summary:', error);
    return NextResponse.json({ error: 'No se pudieron actualizar los grupos.' }, { status: 500 });
  }
}
