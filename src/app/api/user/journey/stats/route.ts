export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { businessDayWindowUtc, currentBusinessDay } from '@/lib/attendanceDay';
import { isValidArea } from '@/lib/areas';
import { ALL_USER_ROLES, getUserSessionCookieFromRequest, verifyUserSessionCookie, type UserRole } from '@/lib/auth';

type OperatorJourneyStats = {
  userId: string;
  displayName: string;
  username: string;
  role: UserRole;
  area: string | null;
  attendanceScans: number;
  reusableDeliveries: number;
  reusableRedemptions: number;
  birthdayRedemptions: number;
  reusableGroups: Array<{ id: string | null; name: string; color: string | null; deliveries: number; redemptions: number; total: number }>;
  rouletteDeliveries: number;
  customQrRedemptions: number;
  totalActions: number;
};

function parseDayParam(input: string | null): string {
  if (!input) return currentBusinessDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error('DAY_INVALID');
  }
  return input;
}

function sumByUserId<T extends { userId: string | null; count: number }>(rows: T[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.userId) continue;
    map.set(row.userId, (map.get(row.userId) || 0) + row.count);
  }
  return map;
}

function sumByString<T extends { key: string | null; count: number }>(rows: T[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.key) continue;
    map.set(row.key, (map.get(row.key) || 0) + row.count);
  }
  return map;
}

async function buildJourneyStats(userIds: string[], startUtc: Date, endUtc: Date) {
  if (userIds.length === 0) return [] as OperatorJourneyStats[];

  const [users, scanGroups, reusableByTypeGroups, reusableDeliveries, rouletteTokens, birthdayGroups, customQrGroups] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        role: true,
        person: { select: { name: true, area: true } },
      },
      orderBy: [{ person: { name: 'asc' } }, { username: 'asc' }],
    }),
    prisma.scan.groupBy({
      by: ['byUser'],
      where: {
        byUser: { in: userIds },
        scannedAt: { gte: startUtc, lt: endUtc },
      },
      _count: { _all: true },
    }),
    prisma.reusableTokenRedemption.groupBy({
      by: ['userId', 'type'],
      where: {
        userId: { in: userIds },
        createdAt: { gte: startUtc, lt: endUtc },
      },
      _count: { _all: true },
    }),
    prisma.reusableTokenRedemption.findMany({
      where: {
        userId: { in: userIds },
        type: { in: ['deliver', 'redeem'] },
        createdAt: { gte: startUtc, lt: endUtc },
      },
      select: {
        userId: true,
        type: true,
        token: {
          select: {
            group: { select: { id: true, name: true, color: true } },
          },
        },
      },
    }),
    prisma.token.findMany({
      where: {
        deliveredByUserId: { in: userIds },
        deliveredAt: { gte: startUtc, lt: endUtc },
        batch: { isReusable: false, staticTargetUrl: null },
      },
      select: { deliveredByUserId: true },
    }),
    prisma.tokenRedemption.groupBy({
      by: ['by'],
      where: {
        by: { in: userIds },
        reservationId: { not: null },
        redeemedAt: { gte: startUtc, lt: endUtc },
      },
      _count: { _all: true },
    }),
    prisma.customQr.groupBy({
      by: ['redeemedBy'],
      where: {
        redeemedBy: { in: userIds },
        redeemedAt: { gte: startUtc, lt: endUtc },
      },
      _count: { _all: true },
    }),
  ]);

  const scanCounts = sumByUserId(scanGroups.map((row) => ({ userId: row.byUser, count: row._count._all })));
  const birthdayCounts = sumByString(birthdayGroups.map((row) => ({ key: row.by, count: row._count._all })));
  const customCounts = sumByString(customQrGroups.map((row) => ({ key: row.redeemedBy, count: row._count._all })));
  const rouletteCounts = new Map<string, number>();
  for (const token of rouletteTokens) {
    if (token.deliveredByUserId) rouletteCounts.set(token.deliveredByUserId, (rouletteCounts.get(token.deliveredByUserId) || 0) + 1);
  }

  const reusableCounts = new Map<string, { deliver: number; redeem: number }>();
  const reusableGroupCounts = new Map<string, Map<string, { id: string | null; name: string; color: string | null; deliveries: number; redemptions: number }>>();
  for (const row of reusableByTypeGroups) {
    if (!row.userId) continue;
    const current = reusableCounts.get(row.userId) || { deliver: 0, redeem: 0 };
    if (row.type === 'deliver') current.deliver += row._count._all;
    if (row.type === 'redeem') current.redeem += row._count._all;
    reusableCounts.set(row.userId, current);
  }
  for (const redemption of reusableDeliveries) {
    if (!redemption.userId) continue;
    const groupId = redemption.token.group?.id || 'ungrouped';
    const userMap = reusableGroupCounts.get(redemption.userId) || new Map();
    const group = userMap.get(groupId) || {
      id: redemption.token.group?.id ?? null,
      name: redemption.token.group?.name || 'Sin grupo',
      color: redemption.token.group?.color ?? null,
      deliveries: 0,
      redemptions: 0,
    };
    if ((redemption as any).type === 'deliver') group.deliveries += 1;
    else if ((redemption as any).type === 'redeem') group.redemptions += 1;
    userMap.set(groupId, group);
    reusableGroupCounts.set(redemption.userId, userMap);
  }

  return users.map((user) => {
    const attendanceScans = scanCounts.get(user.id) || 0;
    const reusableDeliveries = reusableCounts.get(user.id)?.deliver || 0;
    const reusableRedemptions = reusableCounts.get(user.id)?.redeem || 0;
    const birthdayRedemptions = birthdayCounts.get(user.id) || 0;
    const reusableGroups = Array.from(reusableGroupCounts.get(user.id)?.values() || [])
      .map((group) => ({ ...group, total: group.deliveries + group.redemptions }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const rouletteDeliveries = rouletteCounts.get(user.id) || 0;
    const customQrRedemptions = customCounts.get(user.id) || 0;
    const totalActions = reusableDeliveries + reusableRedemptions + birthdayRedemptions + rouletteDeliveries;
    return {
      userId: user.id,
      displayName: user.person?.name || user.username,
      username: user.username,
      role: user.role as UserRole,
      area: user.person?.area || null,
      attendanceScans,
      reusableDeliveries,
      reusableRedemptions,
      birthdayRedemptions,
      reusableGroups,
      rouletteDeliveries,
      customQrRedemptions,
      totalActions,
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const raw = getUserSessionCookieFromRequest(req as unknown as Request);
    const session = await verifyUserSessionCookie(raw);
    if (!session) {
      return NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const viewer = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        role: true,
        person: { select: { name: true, area: true } },
      },
    });
    if (!viewer) {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }

    const url = new URL(req.url);
    let day: string;
    try {
      day = parseDayParam(url.searchParams.get('day'));
    } catch {
      return NextResponse.json({ ok: false, code: 'INVALID_DAY', message: 'day must be YYYY-MM-DD' }, { status: 400 });
    }
    const { startUtc, endUtc } = businessDayWindowUtc(day);

    const viewerStats = await buildJourneyStats([viewer.id], startUtc, endUtc);
    const viewerRow = viewerStats[0] || {
      userId: viewer.id,
      displayName: viewer.person?.name || viewer.username,
      username: viewer.username,
      role: viewer.role as UserRole,
      area: viewer.person?.area || null,
      attendanceScans: 0,
      reusableDeliveries: 0,
      reusableRedemptions: 0,
      birthdayRedemptions: 0,
      reusableGroups: [],
      rouletteDeliveries: 0,
      customQrRedemptions: 0,
      totalActions: 0,
    };

    const isAdmin = viewer.role === 'ADMIN';
    const isCoordinator = viewer.role === 'COORDINATOR';
    const canSeeRanking = isAdmin || isCoordinator;

    let targetUsers = [viewer.id];
    let appliedRoleFilter: UserRole | null = null;
    let appliedAreaFilter: string | null = null;

    if (canSeeRanking) {
      const candidateUsers = await prisma.user.findMany({
        ...(isAdmin ? {} : { where: { role: { in: ['COLLAB', 'STAFF', 'COORDINATOR'] } } }),
        select: {
          id: true,
          username: true,
          role: true,
          person: { select: { name: true, area: true } },
        },
      });

      if (isAdmin) {
        const roleParam = url.searchParams.get('role');
        if (roleParam && ALL_USER_ROLES.includes(roleParam as UserRole)) {
          appliedRoleFilter = roleParam as UserRole;
        }
        const areaParam = url.searchParams.get('area');
        if (areaParam && isValidArea(areaParam)) {
          appliedAreaFilter = areaParam;
        }
      }
      const rankingUsers = candidateUsers.filter((user) => {
        if (appliedRoleFilter && user.role !== appliedRoleFilter) return false;
        if (appliedAreaFilter && user.person?.area !== appliedAreaFilter) return false;
        return true;
      });

      targetUsers = rankingUsers.map((u) => u.id);
    }

    const operatorRows = canSeeRanking
      ? await buildJourneyStats(targetUsers, startUtc, endUtc)
      : viewerStats;

    const reusableOperatorRows = canSeeRanking
      ? operatorRows.filter((row) => row.reusableDeliveries + row.reusableRedemptions + row.birthdayRedemptions + row.rouletteDeliveries > 0)
      : operatorRows;

    const totals = reusableOperatorRows.reduce(
      (acc, row) => ({
        attendanceScans: acc.attendanceScans + row.attendanceScans,
        reusableDeliveries: acc.reusableDeliveries + row.reusableDeliveries,
        reusableRedemptions: acc.reusableRedemptions + row.reusableRedemptions,
        birthdayRedemptions: (acc as any).birthdayRedemptions + row.birthdayRedemptions,
        rouletteDeliveries: acc.rouletteDeliveries + row.rouletteDeliveries,
        customQrRedemptions: acc.customQrRedemptions + row.customQrRedemptions,
        totalActions: acc.totalActions + row.totalActions,
      }),
      { attendanceScans: 0, reusableDeliveries: 0, reusableRedemptions: 0, birthdayRedemptions: 0, rouletteDeliveries: 0, customQrRedemptions: 0, totalActions: 0 }
    );

    const operators = reusableOperatorRows.sort((a, b) => {
      if (b.totalActions !== a.totalActions) return b.totalActions - a.totalActions;
      return a.displayName.localeCompare(b.displayName);
    });

    return NextResponse.json({
      ok: true,
      day,
      scope: canSeeRanking ? (isAdmin ? 'all' : 'team') : 'self',
      viewer: {
        userId: viewer.id,
        displayName: viewer.person?.name || viewer.username,
        username: viewer.username,
        role: viewer.role,
        area: viewer.person?.area || null,
      },
      filters: {
        role: appliedRoleFilter,
        area: appliedAreaFilter,
      },
      totals,
      me: viewerRow,
      operators: canSeeRanking ? operators : undefined,
    });
  } catch (error: any) {
    console.error('Error fetching journey stats:', error);
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR', message: String(error?.message || error) }, { status: 500 });
  }
}
