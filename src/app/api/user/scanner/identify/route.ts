import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie, roleAtLeast } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { STATION_SCAN_MAX_LENGTH } from '@/lib/station/contracts';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(request));
  if (!session) return NextResponse.json({ error: 'Inicia sesión para consultar el código.' }, { status: 401 });
  const parsed = z.object({ code: z.string().min(1).max(STATION_SCAN_MAX_LENGTH) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Código inválido.' }, { status: 400 });
  try {
    const code = parsed.data.code.trim();
    const canValidateTickets = roleAtLeast(session.role, 'STAFF');
    const [ticket, ticketPackage, servicePoint] = await Promise.all([
      canValidateTickets ? prisma.ticket.findFirst({ where: { qrCode: code }, select: { id: true } }) : Promise.resolve(null),
      canValidateTickets ? prisma.ticketPackage.findUnique({ where: { qrCode: code }, select: { id: true } }) : Promise.resolve(null),
      prisma.servicePoint.findUnique({ where: { qrCode: code }, select: { name: true, number: true, active: true, location: { select: { name: true } } } }),
    ]);
    const target = ticketPackage ? { kind: 'ticket', code, package: true } : ticket ? { kind: 'ticket', code, package: false } : servicePoint ? { kind: 'servicePoint', label: servicePoint.name || servicePoint.number, location: servicePoint.location.name, active: servicePoint.active } : null;
    return NextResponse.json({ target }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error identifying scanner code:', error);
    return NextResponse.json({ error: 'No se pudo identificar el código.' }, { status: 500 });
  }
}
