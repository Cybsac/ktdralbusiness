import { readReusableSnapshot } from '@/lib/reusable-tokens/history-snapshot';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { businessDayWindowUtc } from '@/lib/attendanceDay';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { canViewJourneyOperator, isBirthdayHost, journeyDay, JOURNEY_CATEGORIES, type JourneyCategory } from '@/lib/journey-activity';
import { canManageDailyEvaluation } from '@/lib/daily-evaluation';

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
        role: true,
        username: true,
        person: { select: { name: true, area: true } },
      },
    });
    if (!viewer) {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }

    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const requestedCategory = url.searchParams.get('category');
    const category = requestedCategory ?? 'reusable';
    if (!(JOURNEY_CATEGORIES as readonly string[]).includes(category)) return NextResponse.json({ ok: false, code: 'INVALID_CATEGORY' }, { status: 400 });
    if (!userId) {
      return NextResponse.json({ ok: false, code: 'USER_ID_REQUIRED' }, { status: 400 });
    }

    const canSeeOthers = canManageDailyEvaluation(viewer.role);
    if (!canSeeOthers && userId !== viewer.id) {
      return NextResponse.json({ ok: false, code: 'FORBIDDEN' }, { status: 403 });
    }

    const day = journeyDay(url.searchParams.get('day'));
    if (!day) {
      return NextResponse.json({ ok: false, code: 'INVALID_DAY', message: 'day must be YYYY-MM-DD' }, { status: 400 });
    }
    const { startUtc, endUtc } = businessDayWindowUtc(day);

    const operator = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        person: { select: { name: true, area: true } },
      },
    });
    if (!operator) {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    if (!canViewJourneyOperator(viewer.role, viewer.id, operator.role, operator.id)) return NextResponse.json({ ok: false, code: 'FORBIDDEN' }, { status: 403 });

    const groupParam = url.searchParams.get('group');
    let requestedGroup: string | null | undefined;
    if (groupParam !== null) {
      try { requestedGroup = JSON.parse(groupParam); } catch { return NextResponse.json({ ok: false, code: 'INVALID_GROUP' }, { status: 400 }); }
      if (category !== 'reusable' || (requestedGroup !== null && typeof requestedGroup !== 'string')) return NextResponse.json({ ok: false, code: 'INVALID_GROUP' }, { status: 400 });
    }

    const events = category === 'birthday'
      ? await prisma.tokenRedemption.findMany({
          where: {
            by: userId,
            reservationId: { not: null },
            redeemedAt: { gte: startUtc, lt: endUtc },
          },
          select: {
            id: true,
            redeemedAt: true,
            location: true,
            token: { select: { kind: true } },
            reservation: { select: { celebrantName: true, timeSlot: true } },
          },
          orderBy: { redeemedAt: 'desc' },
        })
      : category === 'roulette' || category === 'interactive'
      ? await prisma.token.findMany({
          where: {
            deliveredByUserId: userId,
            deliveredAt: { gte: startUtc, lt: endUtc },
            batch: category === 'roulette' ? { isReusable: false, staticTargetUrl: null } : { staticTargetUrl: { not: null } },
          },
          select: {
            id: true,
            deliveredAt: true,
            prize: { select: { label: true } },
          },
          orderBy: { deliveredAt: 'desc' },
        })
      : await prisma.reusableTokenRedemption.findMany({
          where: {
            userId,
            type: { in: ['deliver', 'redeem'] },
            createdAt: { gte: startUtc, lt: endUtc },
          },
          select: {
            id: true,
            type: true,
            createdAt: true,
            note: true,
            token: {
              select: {
                prize: { select: { label: true } },
                group: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

    return NextResponse.json({
      ok: true,
      day,
      category: category as JourneyCategory,
      operator: {
        userId: operator.id,
        displayName: operator.person?.name || operator.username,
        username: operator.username,
        role: operator.role,
        area: operator.person?.area || null,
      },
      events: category === 'birthday'
        ? events.map((event: any) => ({
            id: event.id,
            type: isBirthdayHost(event.location) ? 'host' : 'guest',
            label: event.reservation?.celebrantName || 'Cumpleaños',
            groupName: isBirthdayHost(event.location) ? 'Cumpleañero' : `Invitado${event.reservation?.timeSlot ? ` · ${event.reservation.timeSlot}` : ''}`,
            createdAt: event.redeemedAt.toISOString(),
          }))
        : category === 'roulette' || category === 'interactive'
        ? events.map((event: any) => ({
            id: event.id,
            type: 'roulette',
            label: event.prize.label,
            groupName: category === 'roulette' ? 'Pulseras TokenShow' : 'Tokens interactivos',
            createdAt: event.deliveredAt.toISOString(),
          }))
        : events.filter((event: any) => {
            const snapshot = readReusableSnapshot(event.note);
            const groupId = snapshot ? snapshot.group?.id ?? null : event.token.group?.id ?? null;
            return requestedGroup === undefined || groupId === requestedGroup;
          }).map((event: any) => ({
            id: event.id,
            type: event.type,
            label: readReusableSnapshot(event.note)?.prize.label || event.token.prize.label,
            groupName: readReusableSnapshot(event.note) ? readReusableSnapshot(event.note)?.group?.name || null : event.token.group?.name || null,
            createdAt: event.createdAt.toISOString(),
          })),
    });
  } catch (error: any) {
    console.error('Error fetching journey history:', error);
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR', message: 'No se pudo cargar el historial.' }, { status: 500 });
  }
}
