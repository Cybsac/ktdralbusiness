import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest, { params }: { params: { tokenId: string } }) {
  try {
    const session = await verifySessionCookie(getSessionCookieFromRequest(req));
    const auth = requireRole(session, ['STAFF', 'ADMIN', 'COORDINATOR']);
    if (!auth.ok) return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
    const token = await prisma.reusableToken.findUnique({ where: { id: params.tokenId }, select: { id: true, usedCount: true, maxUses: true, redeemedAt: true, deliveredAt: true } });
    if (!token) return NextResponse.json({ error: 'Token no encontrado' }, { status: 404 });
    const redemptions = await prisma.reusableTokenRedemption.findMany({ where: { tokenId: params.tokenId }, orderBy: { createdAt: 'desc' } });
    const users = await prisma.user.findMany({ where: { id: { in: redemptions.flatMap(item => item.userId ? [item.userId] : []) } }, select: { id: true, username: true, person: { select: { name: true } } } });
    const names = new Map(users.map(user => [user.id, user.person.name || user.username]));
    const detailed = redemptions.map(item => {
      let meta: { authorizationMethod?: string; responsibleName?: string } = {};
      try { const parsed: unknown = item.note ? JSON.parse(item.note) : null; if (parsed && typeof parsed === 'object') meta = parsed; } catch {}
      return { ...item, responsibleName: meta.responsibleName || (item.userId ? names.get(item.userId) || item.userId : null), authorizationMethod: meta.authorizationMethod ?? null };
    });
    return NextResponse.json({ tokenId: params.tokenId, usedCount: token.usedCount, maxUses: token.maxUses, redemptions: detailed });
  } catch (error) {
    console.error('Error fetching token history:', error);
    return NextResponse.json({ error: 'No se pudo consultar el historial' }, { status: 500 });
  }
}
