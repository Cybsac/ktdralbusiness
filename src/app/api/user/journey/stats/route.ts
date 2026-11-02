import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readReusableSnapshot } from '@/lib/reusable-tokens/history-snapshot';
import { businessDayWindowUtc } from '@/lib/attendanceDay';
import { isValidArea } from '@/lib/areas';
import { ALL_USER_ROLES, getUserSessionCookieFromRequest, verifyUserSessionCookie, type UserRole } from '@/lib/auth';
import { canViewJourneyOperator, journeyDay } from '@/lib/journey-activity';
import { canManageDailyEvaluation } from '@/lib/daily-evaluation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
    if (!session) return NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
    const day = journeyDay(req.nextUrl.searchParams.get('day'));
    if (!day) return NextResponse.json({ ok: false, code: 'INVALID_DAY' }, { status: 400 });
    const viewer = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true, username: true, person: { select: { name: true, area: true } } } });
    if (!viewer) return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    const canSeeTeam = canManageDailyEvaluation(viewer.role);
    const role = viewer.role === 'ADMIN' && ALL_USER_ROLES.includes(req.nextUrl.searchParams.get('role') as UserRole) ? req.nextUrl.searchParams.get('role') : null;
    const areaParam = req.nextUrl.searchParams.get('area');
    const area = viewer.role === 'ADMIN' && areaParam && isValidArea(areaParam) ? areaParam : null;
    const candidates = canSeeTeam ? await prisma.user.findMany({ select: { id: true, username: true, role: true, person: { select: { name: true, area: true } } } }) : [viewer];
    const selected = candidates.filter(user => canViewJourneyOperator(viewer.role, viewer.id, user.role, user.id) && (!role || user.role === role) && (!area || user.person?.area === area));
    // Include the viewer once even when filters exclude them, to keep the personal summary available.
    const ids = [...new Set([...selected.map(user => user.id), viewer.id])];
    const idSet = new Set(ids);
    const users = candidates.filter(user => idSet.has(user.id));
    const { startUtc, endUtc } = businessDayWindowUtc(day);
    const [reusables, tokens, birthdays] = await Promise.all([
      prisma.reusableTokenRedemption.findMany({
        where: { userId: { in: ids }, type: { in: ['deliver', 'redeem'] }, createdAt: { gte: startUtc, lt: endUtc } },
        select: { userId: true, type: true, note: true, token: { select: { group: { select: { id: true, name: true, color: true } } } } },
      }),
      prisma.token.findMany({
        where: { deliveredByUserId: { in: ids }, deliveredAt: { gte: startUtc, lt: endUtc }, OR: [{ batch: { isReusable: false, staticTargetUrl: null } }, { batch: { staticTargetUrl: { not: null } } }] },
        select: { deliveredByUserId: true, batch: { select: { staticTargetUrl: true } } },
      }),
      prisma.tokenRedemption.groupBy({
        by: ['by'], where: { by: { in: ids }, reservationId: { not: null }, redeemedAt: { gte: startUtc, lt: endUtc } }, _count: { _all: true },
      }),
    ]);
    const reusablesByUser = new Map<string, typeof reusables>();
    for (const event of reusables) {
      if (!event.userId) continue;
      const list = reusablesByUser.get(event.userId) ?? [];
      list.push(event);
      reusablesByUser.set(event.userId, list);
    }
    const tokensByUser = new Map<string, typeof tokens>();
    for (const token of tokens) {
      if (!token.deliveredByUserId) continue;
      const list = tokensByUser.get(token.deliveredByUserId) ?? [];
      list.push(token);
      tokensByUser.set(token.deliveredByUserId, list);
    }
    const birthdaysByUser = new Map<string, number>();
    for (const item of birthdays) if (item.by) birthdaysByUser.set(item.by, item._count._all);
    const rows = users.map(user => {
      const groups = new Map<string | null, { id: string | null; name: string; color: string | null; deliveries: number; redemptions: number; total: number }>();
      for (const event of reusablesByUser.get(user.id) ?? []) {
        const snapshot = readReusableSnapshot(event.note);
        const source = snapshot ? snapshot.group : event.token.group;
        const id = source?.id ?? null;
        const group = groups.get(id) ?? { id, name: source?.name || 'Sin grupo', color: source?.color ?? null, deliveries: 0, redemptions: 0, total: 0 };
        if (event.type === 'deliver') group.deliveries++;
        if (event.type === 'redeem') group.redemptions++;
        group.total++;
        groups.set(id, group);
      }
      const reusableGroups = [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      const reusableDeliveries = reusableGroups.reduce((sum, group) => sum + group.deliveries, 0);
      const reusableRedemptions = reusableGroups.reduce((sum, group) => sum + group.redemptions, 0);
      const delivered = tokensByUser.get(user.id) ?? [];
      const rouletteDeliveries = delivered.filter(token => token.batch.staticTargetUrl === null).length;
      const interactiveDeliveries = delivered.length - rouletteDeliveries;
      const birthdayRedemptions = birthdaysByUser.get(user.id) ?? 0;
      return { userId: user.id, displayName: user.person?.name || user.username, username: user.username, role: user.role, area: user.person?.area || null, reusableGroups, reusableDeliveries, reusableRedemptions, rouletteDeliveries, interactiveDeliveries, birthdayRedemptions, totalActions: reusableDeliveries + reusableRedemptions + rouletteDeliveries + interactiveDeliveries + birthdayRedemptions };
    });
    const me = rows.find(row => row.userId === viewer.id);
    const selectedIds = new Set(selected.map(user => user.id));
    const salesActivity = (row: typeof rows[number]) => row.totalActions - row.birthdayRedemptions;
    const operators = rows.filter(row => selectedIds.has(row.userId) && row.totalActions > 0).sort((a, b) => salesActivity(b) - salesActivity(a) || b.birthdayRedemptions - a.birthdayRedemptions || a.displayName.localeCompare(b.displayName));
    return NextResponse.json({ ok: true, day, scope: canSeeTeam ? viewer.role === 'ADMIN' ? 'all' : 'team' : 'self', viewer: { userId: viewer.id, displayName: viewer.person?.name || viewer.username, username: viewer.username, role: viewer.role, area: viewer.person?.area || null }, filters: { role, area }, me, operators: canSeeTeam ? operators : undefined }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error fetching journey stats:', error);
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR', message: 'No se pudo cargar la actividad.' }, { status: 500 });
  }
}
