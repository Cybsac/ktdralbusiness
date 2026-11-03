import { NextRequest, NextResponse } from 'next/server';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { canManageDailyEvaluation, isBusinessDay } from '@/lib/daily-evaluation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(request));
    if (!session || !canManageDailyEvaluation(session.role)) return NextResponse.json({ error: 'Sin permiso para consultar novedades.' }, { status: 403 });
    const params = request.nextUrl.searchParams;
    const start = params.get('start');
    const end = params.get('end');
    const before = params.get('before');
    if ((start && !isBusinessDay(start)) || (end && !isBusinessDay(end)) || (before && !isBusinessDay(before)) || (start && end && start > end)) {
      return NextResponse.json({ error: 'Selecciona un rango de fechas válido.' }, { status: 400 });
    }
    const rows = await prisma.dailyEvaluation.findMany({
      where: { closedAt: { not: null }, comment: { notIn: ['', ' '] }, businessDay: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}), ...(before ? { lt: before } : {}) } },
      orderBy: { businessDay: 'desc' }, take: PAGE_SIZE + 1,
      select: { businessDay: true, comment: true, closedAt: true, evaluatedByUserId: true, closedByUserId: true },
    });
    const page = rows.slice(0, PAGE_SIZE);
    const ids = [...new Set(page.flatMap(item => [item.evaluatedByUserId, item.closedByUserId].filter((id): id is string => !!id)))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, person: { select: { name: true } } } }) : [];
    const names = new Map(users.map(user => [user.id, user.person?.name || user.username]));
    return NextResponse.json({ items: page.map(item => ({ businessDay: item.businessDay, comment: item.comment, closedAt: item.closedAt, registeredBy: item.evaluatedByUserId ? names.get(item.evaluatedByUserId) ?? null : null, closedBy: item.closedByUserId ? names.get(item.closedByUserId) ?? null : null })), nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].businessDay : null }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error loading journey updates:', error);
    return NextResponse.json({ error: 'No se pudieron cargar las novedades.' }, { status: 500 });
  }
}
