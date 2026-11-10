import { NextRequest } from 'next/server';
import { apiError, apiOk } from '@/lib/apiError';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { getReservation, purgeReservations } from '@/lib/birthdays/service';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const raw = getUserSessionCookieFromRequest(req as unknown as Request);
  const session = await verifyUserSessionCookie(raw);
  if (!session || !['STAFF', 'COORDINATOR', 'ADMIN'].includes(session.role)) return apiError('UNAUTHORIZED', undefined, undefined, 401);
  const r = await getReservation(params.id);
  if (!r) return apiError('NOT_FOUND', 'Reservation not found', undefined, 404);
  return apiOk(r);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const raw = getUserSessionCookieFromRequest(req as unknown as Request);
  const session = await verifyUserSessionCookie(raw);
  if (!session || !['STAFF', 'COORDINATOR', 'ADMIN'].includes(session.role)) return apiError('UNAUTHORIZED', undefined, undefined, 401);

  const reservation = await prisma.birthdayReservation.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, celebrantName: true },
  });

  if (!reservation) return apiError('NOT_FOUND', 'Reservation not found', undefined, 404);
  if (reservation.status !== 'canceled') {
    return apiError('RESERVATION_NOT_CANCELED', 'Solo se pueden eliminar reservas canceladas.', undefined, 400);
  }

  const result = await purgeReservations([params.id], session.userId);
  return apiOk({ ok: true, reservationId: params.id, ...result });
}
