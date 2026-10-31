import { requirePrizeAuthorization, prizeDeliveryAudit } from '@/lib/prize-authorization/service';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const prizeGate = await requirePrizeAuthorization(request, 'offers');
  if (prizeGate) return prizeGate;

  try {
    const body = await request.json();
    const { purchaseId } = body;

    if (!purchaseId) {
      return NextResponse.json(
        { error: 'ID de compra requerido' },
        { status: 400 }
      );
    }

    // Buscar la compra
    const purchase = await prisma.offerPurchase.findUnique({
      where: { id: purchaseId },
      include: {
        offer: true,
        user: {
          include: {
            person: true
          }
        }
      }
    });

    if (!purchase) {
      return NextResponse.json(
        { error: 'Compra no encontrada' },
        { status: 404 }
      );
    }

    // Verificar que esté en estado PENDING
    if (purchase.status !== 'PENDING') {
      return NextResponse.json(
        { error: `No se puede completar la entrega. Estado actual: ${purchase.status}` },
        { status: 400 }
      );
    }

    // Actualizar el estado a CONFIRMED
    const updatedPurchase = await prisma.$transaction(async tx => {
      const changed = await tx.offerPurchase.updateMany({ where: { id: purchaseId, status: 'PENDING' }, data: { status: 'CONFIRMED', updatedAt: new Date() } });
      if (!changed.count) throw new Error('ALREADY_DELIVERED');
      await tx.eventLog.create({ data: prizeDeliveryAudit(request, 'offers', purchaseId) });
      return tx.offerPurchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { offer: true } });
    });

    return NextResponse.json({
      success: true,
      message: 'Entrega completada exitosamente',
      purchase: {
        id: updatedPurchase.id,
        status: updatedPurchase.status,
        customerName: updatedPurchase.customerName,
        offerTitle: updatedPurchase.offer.title,
        amount: Number(updatedPurchase.amount),
        completedAt: updatedPurchase.updatedAt.toISOString()
      }
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_DELIVERED') return NextResponse.json({ message: 'La oferta ya fue entregada.' }, { status: 409 });
    console.error('Error completing offer delivery:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
