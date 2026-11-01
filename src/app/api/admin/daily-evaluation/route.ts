import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

import { currentBusinessDay } from '@/lib/attendanceDay';
import { adjustMissingExit, isBusinessDay, isRating, MISSING_EXIT_NOTE, MISSING_EXIT_REASON } from '@/lib/daily-evaluation';

// GET /api/admin/daily-evaluation?day=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const raw = getUserSessionCookieFromRequest(req);
    const session = await verifyUserSessionCookie(raw);
    if (!session || !['ADMIN', 'COORDINATOR', 'STAFF', 'COLLAB'].includes(session.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (req.nextUrl.searchParams.has('configuration')) return NextResponse.json({ currentBusinessDay: currentBusinessDay() });
    const day = req.nextUrl.searchParams.get('day');
    if (!isBusinessDay(day)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });

    const evaluation = await prisma.dailyEvaluation.findUnique({
      where: { businessDay: day }
    });

    // Resolve user names for closedBy and evaluatedBy
    let closedByName: string | null = null;
    let evaluatedByName: string | null = null;
    if (evaluation?.closedByUserId) {
      const u = await prisma.user.findUnique({ where: { id: evaluation.closedByUserId }, select: { person: { select: { name: true } }, username: true } });
      closedByName = u?.person?.name || u?.username || null;
    }
    if (evaluation?.evaluatedByUserId) {
      const u = await prisma.user.findUnique({ where: { id: evaluation.evaluatedByUserId }, select: { person: { select: { name: true } }, username: true } });
      evaluatedByName = u?.person?.name || u?.username || null;
    }

    return NextResponse.json({ evaluation: evaluation ? { ...evaluation, closedByName, evaluatedByName } : null });
  } catch (error) {
    console.error('Error fetching daily evaluation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/daily-evaluation  — save rating + comment
/** Resolve current DB role for a verified session (cookie role may be stale). */
async function resolveRole(session: { userId: string; role: string }) {
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  return user?.role ?? session.role;
}

export async function POST(req: NextRequest) {
  try {
    const raw = getUserSessionCookieFromRequest(req);
    const session = await verifyUserSessionCookie(raw);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const currentRole = await resolveRole(session);
    if (!['ADMIN', 'COORDINATOR'].includes(currentRole)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { businessDay, rating, comment } = await req.json();
    if (!isBusinessDay(businessDay)) {
      return NextResponse.json({ error: 'businessDay required' }, { status: 400 });
    }

    if (rating && !isRating(rating)) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
    }

    // Check that the day is closed before allowing evaluation
    const existing = await prisma.dailyEvaluation.findUnique({ where: { businessDay } });
    if (!existing?.closedAt) {
      return NextResponse.json({ error: 'La jornada debe estar cerrada para evaluar' }, { status: 400 });
    }

    // Block if already evaluated (finalized)
    if (existing.rating) {
      return NextResponse.json({ error: 'Evaluación ya finalizada. Reabra la jornada para volver a evaluar.' }, { status: 403 });
    }

    const evaluation = await prisma.dailyEvaluation.update({
      where: { businessDay },
      data: {
        rating: rating || null,
        comment: comment?.trim() || null,
        evaluatedByUserId: session.userId,
      },
    });

    return NextResponse.json({ evaluation });
  } catch (error) {
    console.error('Error saving daily evaluation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/daily-evaluation  — close or reopen a day
export async function PATCH(req: NextRequest) {
  try {
    const raw = getUserSessionCookieFromRequest(req);
    const session = await verifyUserSessionCookie(raw);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const currentRole = await resolveRole(session);
    if (!['ADMIN', 'COORDINATOR'].includes(currentRole)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { businessDay, action, rating, comment, ratings } = await req.json();
    if (!isBusinessDay(businessDay) || !['close', 'reopen'].includes(action)) {
      return NextResponse.json({ error: 'businessDay and action (close/reopen) required' }, { status: 400 });
    }

    if (action === 'close') {
      const normalizedComment = typeof comment === 'string' ? comment.trim() : '';
      if (!isRating(rating)) return NextResponse.json({ error: 'Debes seleccionar una calificación global.' }, { status: 400 });
      if (!normalizedComment) return NextResponse.json({ error: 'El comentario global de la jornada es obligatorio.' }, { status: 400 });
      if (!Array.isArray(ratings)) return NextResponse.json({ error: 'Debes enviar las calificaciones individuales.' }, { status: 400 });
      if (businessDay > currentBusinessDay()) return NextResponse.json({ error: 'No se puede cerrar una jornada futura' }, { status: 400 });
      const submitted = new Map<string, { personId: string; rating: (typeof import('@/lib/daily-evaluation').RATING_LEVELS)[number]; note: string }>();
      for (const item of ratings) {
        if (!item || typeof item.personId !== 'string' || !item.personId || !isRating(item.rating) || (item.note != null && typeof item.note !== 'string') || submitted.has(item.personId)) {
          return NextResponse.json({ error: 'Calificaciones individuales inválidas o duplicadas.' }, { status: 400 });
        }
        submitted.set(item.personId, { personId: item.personId, rating: item.rating, note: item.note?.trim() || '' });
      }

      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.dailyEvaluation.findUnique({ where: { businessDay }, select: { closedAt: true } });
        if (existing?.closedAt) return { error: 'La jornada ya está cerrada.', status: 409 as const };
        const scans = await tx.scan.findMany({ where: { businessDay, type: { in: ['IN', 'OUT'] } }, select: { personId: true, type: true } });
        const inIds = [...new Set(scans.filter(s => s.type === 'IN').map(s => s.personId))];
        const outIds = new Set(scans.filter(s => s.type === 'OUT').map(s => s.personId));
        const workers = await tx.person.findMany({ where: { id: { in: inIds }, active: true, user: { role: { in: ['COLLAB', 'STAFF'] } } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
        const missingWorkers = workers.filter(person => !submitted.has(person.id));
        if (missingWorkers.length) return { error: 'Debes asignar una calificación individual a cada colaborador presente antes de cerrar la jornada.', status: 400 as const, missingWorkers };
        const previous = await tx.personDailyRating.findMany({ where: { businessDay, personId: { in: workers.map(p => p.id) } }, select: { personId: true, adjustmentReason: true } });
        const previouslyAdjusted = new Set(previous.filter(p => p.adjustmentReason === MISSING_EXIT_REASON).map(p => p.personId));
        const adjustedWorkers: Array<{ personId: string; previousRating: string; rating: string; note: string }> = [];
        for (const person of workers) {
          const input = submitted.get(person.id)!;
          const adjustment = !outIds.has(person.id) ? adjustMissingExit(input.rating, input.note, previouslyAdjusted.has(person.id)) : { rating: input.rating, note: input.note };
          // Preserve the historical marker even if an edited note omitted it.
          const note = previouslyAdjusted.has(person.id) && !adjustment.note.includes(MISSING_EXIT_NOTE)
            ? [adjustment.note, MISSING_EXIT_NOTE].filter(Boolean).join(' | ') : adjustment.note;
          if (adjustment.rating !== input.rating || (!outIds.has(person.id) && !previouslyAdjusted.has(person.id))) adjustedWorkers.push({ personId: person.id, previousRating: input.rating, rating: adjustment.rating, note });
          const newAdjustment = !outIds.has(person.id) && !previouslyAdjusted.has(person.id);
          const adjustmentFields = newAdjustment ? { originalRating: input.rating, adjustmentReason: MISSING_EXIT_REASON, adjustedAt: new Date() } : {};
          await tx.personDailyRating.upsert({ where: { businessDay_personId: { businessDay, personId: person.id } }, create: { businessDay, personId: person.id, rating: adjustment.rating, note: note || null, ratedByUserId: session.userId, ...adjustmentFields }, update: { rating: adjustment.rating, note: note || null, ratedByUserId: session.userId, ...adjustmentFields } });
        }
        const evaluation = await tx.dailyEvaluation.upsert({ where: { businessDay }, create: { businessDay, rating, comment: normalizedComment, evaluatedByUserId: session.userId, closedAt: new Date(), closedByUserId: session.userId }, update: { rating, comment: normalizedComment, evaluatedByUserId: session.userId, closedAt: new Date(), closedByUserId: session.userId } });
        return { evaluation, adjustedWorkers };
      }, { isolationLevel: 'Serializable' });
      if ('error' in result) return NextResponse.json({ error: result.error, missingWorkers: result.missingWorkers }, { status: result.status });
      return NextResponse.json(result);
    } else {
      // reopen — only ADMIN can reopen
      if (currentRole !== 'ADMIN') {
        return NextResponse.json({ error: 'Solo ADMIN puede reabrir una jornada' }, { status: 403 });
      }
      const evaluation = await prisma.dailyEvaluation.update({
        where: { businessDay },
        data: {
          closedAt: null,
          closedByUserId: null,
          rating: null,
          comment: null,
          evaluatedByUserId: null,
        },
      });
      return NextResponse.json({ evaluation });
    }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error.code === 'P2034' || error.code === 'P2002')) return NextResponse.json({ error: 'La jornada cambió al mismo tiempo. Actualiza los datos y vuelve a intentarlo.' }, { status: 409 });
    console.error('Error closing/reopening day:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
