import { requirePrizeAuthorization, prizeDeliveryAudit } from '@/lib/prize-authorization/service';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { QRUtils } from '@/lib/qrUtils';

export async function POST(request: NextRequest) {
  const prizeGate = await requirePrizeAuthorization(request, 'offers');
  if (prizeGate) return prizeGate;
  try {
    const { qrData } = await request.json();

    if (!qrData) {
      return NextResponse.json(
        { error: 'Datos del QR requeridos' },
        { status: 400 }
      );
    }

    // Parsear datos del QR
    const parsedData = QRUtils.parseQRData(qrData);
    if (!parsedData) {
      return NextResponse.json(
        { error: 'Código QR inválido' },
        { status: 400 }
      );
    }

    // Buscar la compra por ID y código QR
    const purchase = await prisma.offerPurchase.findFirst({
      where: {
        id: parsedData.purchaseId,
        qrCode: parsedData.qrCode
      },
      include: {
        offer: true,
        user: {
          select: {
            id: true,
            person: {
              select: {
                name: true,
                whatsapp: true
              }
            }
          }
        }
      }
    });

    if (!purchase) {
      return NextResponse.json(
        { error: 'Compra no encontrada o QR inválido' },
        { status: 404 }
      );
    }

    // Verificar que la compra no haya sido ya validada
    if (purchase.status === 'CONFIRMED') {
      return NextResponse.json(
        { error: 'Esta compra ya fue validada anteriormente' },
        { status: 400 }
      );
    }

    // Actualizar estado de la compra a CONFIRMED
    await prisma.$transaction(async tx => {
      const changed = await tx.offerPurchase.updateMany({ where: { id: purchase.id, status: purchase.status }, data: { status: 'CONFIRMED', paymentStatus: 'completed' } });
      if (!changed.count) throw new Error('ALREADY_DELIVERED');
      await tx.eventLog.create({ data: prizeDeliveryAudit(request, 'offers', purchase.id) });
    });

    return NextResponse.json({
      success: true,
      data: {
        purchaseId: purchase.id,
        offerTitle: purchase.offer.title,
        customerName: purchase.customerName,
        amount: Number(purchase.amount),
        validatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_DELIVERED') return NextResponse.json({ message: 'La oferta ya fue entregada.' }, { status: 409 });
    console.error('Error validating QR:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
