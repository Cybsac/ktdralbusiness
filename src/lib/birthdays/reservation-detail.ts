import { birthdayPackDto } from "./pack-catalog";
import { prisma } from "@/lib/prisma";
import { birthdayDateKey } from "./calendar";
export async function getReservation(id: string): Promise<any | null> {
  const reservation = await prisma.birthdayReservation.findUnique({
    where: { id },
    include: {
      pack: true,
      courtesyItems: true,
      photoDeliveries: true,
      createdByUser: { select: { id: true, username: true, person: { select: { name: true } } } },
    },
  });
  if (!reservation) return null;

  return {
    id: reservation.id,
    packId: reservation.packId,
    updatedAt: reservation.updatedAt.toISOString(),
    celebrantName: reservation.celebrantName,
    phone: reservation.phone,
    documento: reservation.documento,
    isSurprise: reservation.isSurprise,
    organizerDni: reservation.organizerDni,
    organizerName: reservation.organizerName,
    cardName: reservation.cardName,
    birthDate: reservation.birthDate?.toISOString().slice(0, 10) || null,
    email: reservation.email,
    date: birthdayDateKey(reservation.date), // YYYY-MM-DD
    timeSlot: reservation.timeSlot,
    pack: {
      id: reservation.pack.id,
      name: reservation.pack.name,
      qrCount: reservation.pack.qrCount,
      bottle: reservation.specialBottle || reservation.pack.bottle,
      perks: birthdayPackDto(reservation.pack).perks,
    },
    guestsPlanned: reservation.guestsPlanned,
    wantsPhotoSession: reservation.wantsPhotoSession,
    reservationSource: reservation.reservationSource,
    createdByUser: reservation.createdByUser,
    status: reservation.status,
    tokensGeneratedAt: reservation.tokensGeneratedAt?.toISOString() || null,
    hostArrivedAt: reservation.hostArrivedAt?.toISOString() || null,
    guestArrivals: reservation.guestArrivals || 0,
    createdAt: reservation.createdAt.toISOString(),
    courtesyItems: reservation.courtesyItems.map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      notes: item.notes,
    })),
    photoDeliveries: reservation.photoDeliveries.map((photo) => ({
      id: photo.id,
      kind: photo.kind,
      url: photo.url,
      status: photo.status,
    })),
  };
}
