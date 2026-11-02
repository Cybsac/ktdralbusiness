import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isBusinessDay, isRating, canManageDailyEvaluation, MISSING_EXIT_NOTE, MISSING_EXIT_REASON, EVALUABLE_USER_ROLES } from '@/lib/daily-evaluation';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/admin/daily-evaluation/ratings?day=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const raw = getUserSessionCookieFromRequest(req);
    const session = await verifyUserSessionCookie(raw);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (!canManageDailyEvaluation(session.role)) return NextResponse.json({ error: 'Sin permiso para consultar calificaciones' }, { status: 403 });

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
    if (!canManageDailyEvaluation(user?.role ?? session.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Datos de calificaciones inválidos.' }, { status: 400 });
    const { businessDay, ratings } = body;
    if (!isBusinessDay(businessDay) || !Array.isArray(ratings)) {
      return NextResponse.json({ error: 'businessDay and ratings[] required' }, { status: 400 });
    }

    if (ratings.some((r: { personId?: unknown; rating?: unknown; note?: unknown } | null) => !r || typeof r.personId !== 'string' || !r.personId || !isRating(r.rating) || (r.note != null && typeof r.note !== 'string'))) {
      return NextResponse.json({ error: 'Calificación inválida' }, { status: 400 });
    }
    const submittedIds = new Set<string>(ratings.map((r: { personId: string }) => r.personId));
    if (submittedIds.size !== ratings.length) return NextResponse.json({ error: 'Calificaciones duplicadas' }, { status: 400 });
    const results = await prisma.$transaction(async (tx) => {
      const locked = await tx.dailyEvaluation.findUnique({ where: { businessDay }, select: { closedAt: true } });
      if (locked?.closedAt) return { error: 'La jornada ya está cerrada. Reábrala para modificar las calificaciones.', status: 409 as const };
      const scans = await tx.scan.findMany({ where: { businessDay, type: 'IN' }, select: { personId: true }, distinct: ['personId'] });
      const workers = await tx.person.findMany({ where: { id: { in: scans.map(scan => scan.personId) }, active: true, user: { role: { in: [...EVALUABLE_USER_ROLES] } } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      const eligible = new Set(workers.map(person => person.id));
      const missingWorkers = workers.filter(person => !submittedIds.has(person.id));
      if (missingWorkers.length) return { error: 'Debes calificar a cada colaborador presente antes de guardar.', status: 400 as const, missingWorkers };
      if ([...submittedIds].some(id => !eligible.has(id))) return { error: 'Solo se pueden calificar colaboradores presentes y habilitados.', status: 400 as const };
      const previous = await tx.personDailyRating.findMany({ where: { businessDay }, select: { personId: true, adjustmentReason: true } });
      const adjustedIds = new Set(previous.filter(item => item.adjustmentReason === MISSING_EXIT_REASON).map(item => item.personId));
      for (const r of ratings as Array<{ personId: string; rating: string; note?: string }>) {
        let note = r.note?.trim() || '';
        if (adjustedIds.has(r.personId) && !note.includes(MISSING_EXIT_NOTE)) note = [note, MISSING_EXIT_NOTE].filter(Boolean).join(' | ');
        await tx.personDailyRating.upsert({ where: { businessDay_personId: { businessDay, personId: r.personId } }, create: { businessDay, personId: r.personId, rating: r.rating, note: note || null, ratedByUserId: session.userId }, update: { rating: r.rating, note: note || null, ratedByUserId: session.userId } });
      }
      return { count: ratings.length };
    }, { isolationLevel: 'Serializable' });
    if ('error' in results) return NextResponse.json({ error: results.error, missingWorkers: results.missingWorkers }, { status: results.status });

    return NextResponse.json({ ok: true, count: results.count });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') return NextResponse.json({ error: 'La jornada cambió al mismo tiempo. Actualiza los datos y vuelve a intentarlo.' }, { status: 409 });
    console.error('Error saving person ratings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
