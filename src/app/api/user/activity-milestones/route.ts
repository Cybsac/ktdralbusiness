import { NextRequest, NextResponse } from 'next/server';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { canManageDailyEvaluation } from '@/lib/daily-evaluation';
import { canViewJourneyOperator } from '@/lib/journey-activity';
import { readActivityMilestones } from '@/lib/activity-milestones/service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(request));
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    let ids = [session.userId];
    let names = new Map<string, { displayName: string; area: string | null }>();
    if (request.nextUrl.searchParams.get('scope') === 'team') {
      if (!canManageDailyEvaluation(session.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
      const users = await prisma.user.findMany({ select: { id: true, role: true, username: true, person: { select: { name: true, area: true } } } });
      const visible = users.filter(user => canViewJourneyOperator(session.role, session.userId, user.role, user.id));
      ids = visible.map(user => user.id);
      names = new Map(visible.map(user => [user.id, { displayName: user.person?.name || user.username, area: user.person?.area ?? null }]));
    }
    const result = await readActivityMilestones(ids);
    return NextResponse.json({ ...result, users: result.users.map(user => ({ ...user, ...names.get(user.userId) })) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error fetching activity milestones:', error);
    return NextResponse.json({ error: 'No se pudieron cargar los hitos.' }, { status: 500 });
  }
}
