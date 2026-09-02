import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const RATING_LEVELS = ['MALO', 'REGULAR', 'BUENO', 'MUY_BUENO'] as const;
const MISSING_EXIT_NOTE = 'Ajuste automático: no registró salida al cerrar la jornada.';

function downgradeRating(rating: string) {
  const index = RATING_LEVELS.indexOf(rating as (typeof RATING_LEVELS)[number]);
  if (index <= 0) return 'MALO';
  return RATING_LEVELS[index - 1];
}

// GET /api/admin/daily-evaluation?day=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const raw = getUserSessionCookieFromRequest(req);
    const session = await verifyUserSessionCookie(raw);
    if (!session || !['ADMIN', 'COORDINATOR', 'STAFF', 'COLLAB'].includes(session.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const day = req.nextUrl.searchParams.get('day');
    if (!day) return NextResponse.json({ error: 'day param required' }, { status: 400 });

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
    if (!businessDay) {
      return NextResponse.json({ error: 'businessDay required' }, { status: 400 });
    }

    const validRatings = ['MALO', 'REGULAR', 'BUENO', 'MUY_BUENO'];
    if (rating && !validRatings.includes(rating)) {
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

    const { businessDay, action } = await req.json();
    if (!businessDay || !['close', 'reopen'].includes(action)) {
      return NextResponse.json({ error: 'businessDay and action (close/reopen) required' }, { status: 400 });
    }

    if (action === 'close') {
      // Prevent closing a future day
      const now = new Date();
      const limaHour = Number(now.toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false }));
      const ref = limaHour < 10 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
      const todayBusiness = ref.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
      if (businessDay > todayBusiness) {
        return NextResponse.json({ error: 'No se puede cerrar una jornada futura' }, { status: 400 });
      }

      const presentScans = await prisma.scan.findMany({
        where: { businessDay, type: 'IN' },
        select: { personId: true },
        distinct: ['personId'],
      });
      const presentPersonIds = presentScans.map((scan) => scan.personId);
      const presentWorkers = await prisma.person.findMany({
        where: {
          id: { in: presentPersonIds },
          active: true,
          user: { role: { in: ['COLLAB', 'STAFF'] } },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      const ratedWorkers = await prisma.personDailyRating.findMany({
        where: {
          businessDay,
          personId: { in: presentWorkers.map((person) => person.id) },
          rating: { in: ['MALO', 'REGULAR', 'BUENO', 'MUY_BUENO'] },
        },
        select: { personId: true, rating: true, note: true },
      });
      const ratedIds = new Set(ratedWorkers.map((rating) => rating.personId));
      const missingWorkers = presentWorkers.filter((person) => !ratedIds.has(person.id));
      if (missingWorkers.length > 0) {
        return NextResponse.json({
          error: 'Debes asignar una calificación individual a cada colaborador presente antes de cerrar la jornada.',
          missingWorkers,
        }, { status: 400 });
      }

      const exitScans = await prisma.scan.findMany({
        where: { businessDay, type: 'OUT', personId: { in: presentPersonIds } },
        select: { personId: true },
        distinct: ['personId'],
      });
      const peopleWithExit = new Set(exitScans.map((scan) => scan.personId));
      const missingExitIds = new Set(
        presentWorkers
          .filter((person) => !peopleWithExit.has(person.id))
          .map((person) => person.id)
      );
      const shouldApplyMissingExitAdjustment = !(await prisma.dailyEvaluation.findUnique({
        where: { businessDay },
        select: { closedAt: true },
      }))?.closedAt;

      const adjustedWorkers = ratedWorkers
        .filter((rating) => shouldApplyMissingExitAdjustment && missingExitIds.has(rating.personId))
        .map((rating) => {
          const note = rating.note?.includes(MISSING_EXIT_NOTE)
            ? rating.note
            : [rating.note, MISSING_EXIT_NOTE].filter(Boolean).join(' | ');
          return {
            personId: rating.personId,
            previousRating: rating.rating,
            rating: downgradeRating(rating.rating),
            note,
          };
        });

      const evaluation = await prisma.$transaction(async (tx) => {
        for (const adjustment of adjustedWorkers) {
          await tx.personDailyRating.update({
            where: { businessDay_personId: { businessDay, personId: adjustment.personId } },
            data: { rating: adjustment.rating, note: adjustment.note, ratedByUserId: session.userId },
          });
        }

        return tx.dailyEvaluation.upsert({
          where: { businessDay },
          create: {
            businessDay,
            closedAt: new Date(),
            closedByUserId: session.userId,
          },
          update: {
            closedAt: new Date(),
            closedByUserId: session.userId,
          },
        });
      });
      return NextResponse.json({ evaluation, adjustedWorkers });
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
    console.error('Error closing/reopening day:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
