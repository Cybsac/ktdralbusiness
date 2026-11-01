import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isBusinessDay, isRating, MISSING_EXIT_NOTE, MISSING_EXIT_REASON } from '@/lib/daily-evaluation';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/admin/daily-evaluation/ratings?day=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const raw = getUserSessionCookieFromRequest(req);
    const session = await verifyUserSessionCookie(raw);
    if (!session || !['ADMIN', 'COORDINATOR', 'STAFF', 'COLLAB'].includes(session.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const day = req.nextUrl.searchParams.get('day');
    if (!isBusinessDay(day)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });

    const ratings = await prisma.personDailyRating.findMany({
      where: { businessDay: day },
      include: { person: { select: { id: true, name: true, code: true, area: true } } },
    });

    return NextResponse.json({ ratings });
  } catch (error) {
    console.error('Error fetching person ratings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/daily-evaluation/ratings
// body: { businessDay, ratings: [{ personId, rating, note? }] }
export async function POST(req: NextRequest) {
  try {
    const raw = getUserSessionCookieFromRequest(req);
    const session = await verifyUserSessionCookie(raw);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
    if (!['ADMIN', 'COORDINATOR'].includes(user?.role ?? session.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { businessDay, ratings } = await req.json();
    if (!isBusinessDay(businessDay) || !Array.isArray(ratings)) {
      return NextResponse.json({ error: 'businessDay and ratings[] required' }, { status: 400 });
    }

    const evaluation = await prisma.dailyEvaluation.findUnique({ where: { businessDay }, select: { closedAt: true } });
    if (evaluation?.closedAt) {
      return NextResponse.json({ error: 'La jornada ya está cerrada. Reábrala para modificar las calificaciones.' }, { status: 400 });
    }

    const presentScans = await prisma.scan.findMany({
      where: { businessDay, type: 'IN' },
      select: { personId: true },
      distinct: ['personId'],
    });
    const presentWorkers = await prisma.person.findMany({
      where: {
        id: { in: presentScans.map((scan) => scan.personId) },
        active: true,
        user: { role: { in: ['COLLAB', 'STAFF'] } },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const submittedIds = new Set(ratings.map((rating: { personId?: string } | null) => rating?.personId));
    const missingWorkers = presentWorkers.filter((person) => !submittedIds.has(person.id));
    if (missingWorkers.length > 0) {
      return NextResponse.json({
        error: 'Debes calificar a cada colaborador presente antes de guardar.',
        missingWorkers,
      }, { status: 400 });
    }
    const invalidRating = ratings.find((r: { personId?: unknown; rating?: unknown; note?: unknown }) => typeof r?.personId !== 'string' || !r.personId || !isRating(r.rating) || (r.note != null && typeof r.note !== 'string'));
    if (new Set(ratings.map((r: { personId?: string }) => r?.personId)).size !== ratings.length) return NextResponse.json({ error: 'Calificaciones duplicadas' }, { status: 400 });
    if (invalidRating) {
      return NextResponse.json({ error: 'Calificación inválida' }, { status: 400 });
    }

    const results = await prisma.$transaction(async (tx) => {
      const locked = await tx.dailyEvaluation.findUnique({ where: { businessDay }, select: { closedAt: true } });
      if (locked?.closedAt) return null;
      const previous = await tx.personDailyRating.findMany({ where: { businessDay }, select: { personId: true, adjustmentReason: true } });
      const adjustedIds = new Set(previous.filter(item => item.adjustmentReason === MISSING_EXIT_REASON).map(item => item.personId));
      const saved = [];
      for (const r of ratings as Array<{ personId: string; rating: string; note?: string }>) {
        let note = r.note?.trim() || '';
        if (adjustedIds.has(r.personId) && !note.includes(MISSING_EXIT_NOTE)) note = [note, MISSING_EXIT_NOTE].filter(Boolean).join(' | ');
        saved.push(await tx.personDailyRating.upsert({
          where: { businessDay_personId: { businessDay, personId: r.personId } },
          create: { businessDay, personId: r.personId, rating: r.rating, note: note || null, ratedByUserId: session.userId },
          update: { rating: r.rating, note: note || null, ratedByUserId: session.userId },
        }));
      }
      return saved;
    }, { isolationLevel: 'Serializable' });
    if (!results) return NextResponse.json({ error: 'La jornada ya está cerrada. Reábrala para modificar las calificaciones.' }, { status: 409 });

    return NextResponse.json({ ok: true, count: results.length });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') return NextResponse.json({ error: 'La jornada cambió al mismo tiempo. Actualiza los datos y vuelve a intentarlo.' }, { status: 409 });
    console.error('Error saving person ratings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
