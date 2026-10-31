import { requirePrizeAuthorization, getPrizeActor } from '@/lib/prize-authorization/service';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiOk } from '@/lib/apiError';

// POST /api/admin/reusable-tokens/[tokenId]/deliver
// Marca un token reutilizable como entregado (solo para STAFF/ADMIN)

export async function POST(req: NextRequest, { params }: { params: { tokenId: string } }) {
  const prizeGate = await requirePrizeAuthorization(req, 'reusable');
  if (prizeGate) return prizeGate;

  try {
    const { tokenId } = params;
    if (!tokenId) {
      return apiError('TOKEN_ID_REQUIRED', 'tokenId requerido', undefined, 400);
    }

    const session = getPrizeActor(req);

    // Verificar que el token existe y es reutilizable
    const token = await prisma.reusableToken.findUnique({
      where: { id: tokenId },
      include: {
        prize: { select: { active: true, key: true, label: true } }
      }
    });

    if (!token) {
      return apiError('TOKEN_NOT_FOUND', 'Token no encontrado', undefined, 404);
    }

    if (!token.prize.active) return apiError('PRIZE_INACTIVE', 'Premio inactivo', undefined, 410);

    // No permitir marcar como entregado si ya está completamente usado
    if (token.usedCount >= token.maxUses) {
      return apiError('TOKEN_EXHAUSTED', `Token completamente usado (${token.usedCount}/${token.maxUses})`, undefined, 400);
    }

    // Marcar como entregado (permitir re-entregas)
    const deliveredAt = new Date();
    const updateData: any = {
      deliveredAt,
      deliveredByUserId: session.userId,
      redeemedAt: deliveredAt
    };

    // Incrementar usedCount cada vez que se marca como entregado
    // Esto refleja el número real de entregas realizadas
    updateData.usedCount = { increment: 1 };

    await prisma.$transaction(async tx => {
      const changed = await tx.reusableToken.updateMany({
        where: { id: tokenId, disabled: false, expiresAt: { gt: deliveredAt }, usedCount: { lt: token.maxUses } },
        data: updateData,
      });
      if (!changed.count) throw new Error('TOKEN_UNAVAILABLE');
      await tx.reusableTokenRedemption.create({ data: { tokenId, type: 'deliver', userId: session.userId, note: JSON.stringify({ authorizationMethod: session.method, responsibleName: session.name, credentialId: session.credentialId, credentialRevision: session.revision }) } });
    });

    return apiOk({
      tokenId,
      prizeId: token.prizeId,
      prize: token.prize,
      deliveredAt,
      deliveredBy: session.userId
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'TOKEN_UNAVAILABLE') return apiError('TOKEN_UNAVAILABLE', 'El QR está agotado, vencido o deshabilitado.', undefined, 409);
    console.error('Error marking reusable token as delivered:', error);
    return apiError('INTERNAL_ERROR', 'Error interno del servidor');
  }
}