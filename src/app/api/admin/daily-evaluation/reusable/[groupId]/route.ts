import { NextRequest, NextResponse } from 'next/server';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessReusableTokens } from '@/lib/reusable-tokens/access';
import { reusableAvailability } from '@/lib/reusable-tokens/validity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(request));
    if (!session) return NextResponse.json({ error: 'Inicia sesión para consultar los QR.' }, { status: 401 });
    if (!canAccessReusableTokens(session.role, session.area)) return NextResponse.json({ error: 'No tienes acceso a los QR de este grupo.' }, { status: 403 });
    const group = await prisma.tokenGroup.findUnique({
      where: { id: params.groupId },
      select: { locked: true, tokens: { orderBy: { createdAt: 'desc' }, select: {
        id: true, maxUses: true, usedCount: true, expiresAt: true, disabled: true,
        startTime: true, endTime: true, prize: { select: { label: true, active: true } },
      } } },
    });
    if (!group || group.locked) return NextResponse.json({ error: 'Este grupo ya no está disponible.' }, { status: 404 });
    const now = new Date();
    const tokens = group.tokens.filter(token => reusableAvailability(token, now) === 'AVAILABLE').map(token => ({
      id: token.id, label: token.prize.label, usedCount: token.usedCount, maxUses: token.maxUses,
    }));
    return NextResponse.json({ tokens }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error fetching reusable group tokens:', error);
    return NextResponse.json({ error: 'No se pudieron cargar los QR del grupo.' }, { status: 500 });
  }
}
