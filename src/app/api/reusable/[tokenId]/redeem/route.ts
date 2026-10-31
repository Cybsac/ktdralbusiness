import { requirePrizeAuthorization, getPrizeActor } from '@/lib/prize-authorization/service';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { DateTime } from 'luxon';

// POST /api/reusable/[tokenId]/redeem
// Redime un token reutilizable (incrementa usedCount)

export async function POST(req: NextRequest, { params }: { params: { tokenId: string } }) {
  const prizeGate = await requirePrizeAuthorization(req, 'reusable');
  if (prizeGate) return prizeGate;

  try {
    const { tokenId } = params;
    if (!tokenId) {
      return apiError('TOKEN_ID_REQUIRED', 'tokenId requerido', undefined, 400);
    }

    const session = getPrizeActor(req);

    // Verificar que el token existe
    const token = await prisma.reusableToken.findUnique({
      where: { id: tokenId },
      include: {
        prize: { select: { active: true, key: true, label: true, color: true } }
      }
    });

    if (!token) {
      return apiError('TOKEN_NOT_FOUND', 'Token no encontrado', undefined, 404);
    }

    if (!token.prize.active) return apiError('PRIZE_INACTIVE', 'Premio inactivo', undefined, 410);

    // Verificar que no esté deshabilitado
    if (token.disabled) {
      return apiError('TOKEN_DISABLED', 'Token deshabilitado', undefined, 403);
    }

    // Verificar expiración usando Lima timezone
    const now = DateTime.now().setZone('America/Lima');
    const expiresAt = DateTime.fromJSDate(token.expiresAt).setZone('America/Lima');
    if (expiresAt <= now) {
      return apiError('TOKEN_EXPIRED', 'Token expirado', undefined, 410);
    }

    // Verificar ventana horaria si aplica
    if (token.startTime && token.endTime) {
      const startTime = DateTime.fromJSDate(token.startTime).setZone('America/Lima');
      const endTime = DateTime.fromJSDate(token.endTime).setZone('America/Lima');
      
      // @ts-ignore
      const currentHour = now.hour;
      // @ts-ignore
      const startHour = startTime.hour;
      // @ts-ignore
      const endHour = endTime.hour;

      if (currentHour < startHour || currentHour >= endHour) {
        return apiError('OUTSIDE_TIME_WINDOW', 'Fuera de horario válido', undefined, 403);
      }
    }

    // Verificar que no haya alcanzado el límite de usos
    if (token.usedCount >= token.maxUses) {
      return apiError('USAGE_LIMIT_REACHED', 'Límite de usos alcanzado', undefined, 403);
    }

    // Incrementar usedCount y registrar fecha de último canje
    const updatedToken = await prisma.$transaction(async tx => {
      const changed = await tx.reusableToken.updateMany({
        where: { id: tokenId, disabled: false, expiresAt: { gt: new Date() }, usedCount: { lt: token.maxUses } },
        data: { usedCount: { increment: 1 }, redeemedAt: new Date() },
      });
      if (!changed.count) throw new Error('TOKEN_UNAVAILABLE');
      await tx.reusableTokenRedemption.create({ data: { tokenId, type: 'redeem', userId: session.userId, note: JSON.stringify({ authorizationMethod: session.method, responsibleName: session.name, credentialId: session.credentialId, credentialRevision: session.revision }) } });
      return tx.reusableToken.findUniqueOrThrow({ where: { id: tokenId }, include: { prize: { select: { active: true, key: true, label: true, color: true } } } });
    });

    return NextResponse.json({
      success: true,
      token: {
        id: updatedToken.id,
        prize: updatedToken.prize,
        usedCount: updatedToken.usedCount,
        maxUses: updatedToken.maxUses,
        remainingUses: updatedToken.maxUses - updatedToken.usedCount
      },
      message: 'Token redimido exitosamente'
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'TOKEN_UNAVAILABLE') return apiError('TOKEN_UNAVAILABLE', 'El QR ya no está disponible.', undefined, 409);
    console.error('Error redeeming reusable token:', error);
    return apiError('INTERNAL_ERROR', 'Error interno del servidor');
  }
}