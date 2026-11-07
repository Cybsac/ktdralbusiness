import { birthdayYearRange, birthdayStoredRange } from "./calendar";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { birthdayDay, birthdayToday, birthdayDateKey } from "./calendar";
import { BIRTHDAY_POLICY as P } from "./policy";
import { reservationCreateSchema } from "./reservation-input";
import { lockBirthdayDocument, lockBirthdaySlot } from "./locking";
import type { CreateReservationInput, ReservationWithRelations } from "./types";
export async function createReservation(
  input: CreateReservationInput
): Promise<ReservationWithRelations> {
  const day = birthdayDay(input.date);
  if (!day.isValid) throw new Error("INVALID_DATE");
  const fields = reservationCreateSchema.parse({ ...input, date: birthdayDateKey(input.date) });
  if (day < birthdayToday()) throw new Error("RESERVATION_DATE_PAST");
  if (P.closedWeekdays.includes(day.weekday)) throw new Error("CLOSED_DAY");
  if (!input.isAdmin && day > birthdayToday().plus({ days: P.publicBookingDays }))
    throw new Error("DATE_TOO_FAR");
  if (!input.isAdmin && !P.publicSlots.includes(fields.timeSlot)) throw new Error("INVALID_SLOT");
  const created = await prisma.$transaction(async (tx) => {
    await lockBirthdayDocument(tx, fields.documento, day.year);
    const duplicate = await tx.birthdayReservation.findFirst({
      where: {
        documento: fields.documento,
        date: birthdayYearRange(day.toJSDate()),
        status: { not: "canceled" },
      },
    });
    if (duplicate) throw new Error("DUPLICATE_DNI_YEAR");
    if (!input.isAdmin) {
      await lockBirthdaySlot(tx, birthdayDateKey(input.date), fields.timeSlot);
      const count = await tx.birthdayReservation.count({ where: { date: birthdayStoredRange(input.date), timeSlot: fields.timeSlot, status: { in: [...P.capacityStatuses] } } });
      if (count >= P.maxReservationsPerSlot) throw new Error("SLOT_FULL");
    }
    const pack = await tx.birthdayPack.findFirst({ where: { id: fields.packId, active: true } });
    if (!pack || (!input.isAdmin && (pack.isCustom || pack.qrCount < 1))) throw new Error("INVALID_PACK");
    if (
      input.referrerId &&
      !(await tx.birthdayReferrer.findFirst({
        where: { id: input.referrerId, active: true },
        select: { id: true },
      }))
    )
      throw new Error("INVALID_REFERRER");
    const configuration =
      day.weekday === 3 && pack.priceSoles === 0
        ? await tx.systemConfig.findUnique({
            where: { id: 1 },
            select: { wednesdaySpecialBottle: true },
          })
        : null;
    return tx.birthdayReservation.create({
      data: {
        celebrantName: fields.celebrantName,
        phone: fields.phone,
        documento: fields.documento,
        email: fields.email || null,
        birthDate: fields.birthDate ? new Date(`${fields.birthDate}T00:00:00.000Z`) : null,
        date: day.toJSDate(),
        timeSlot: fields.timeSlot,
        packId: fields.packId,
        guestsPlanned: input.isAdmin ? fields.guestsPlanned : pack.qrCount,
        wantsPhotoSession: fields.wantsPhotoSession,
        status: "approved",
        specialBottle: configuration?.wednesdaySpecialBottle || null,
        createdBy: input.createdBy || null,
        reservationSource: input.reservationSource || null,
        createdByUserId: input.createdByUserId || null,
        referrerId: input.referrerId || null,
      },
      include: {
        pack: true,
        inviteTokens: true,
        courtesyItems: true,
        photoDeliveries: true,
        createdByUser: { select: { id: true, username: true, person: { select: { name: true } } } },
      },
    });
  });
  await audit("birthday.createReservation", input.createdByUserId || input.createdBy, {
    id: created.id,
    date: created.date.toISOString(),
  });
  return {
    ...created,
    pack: { ...created.pack, bottle: created.specialBottle || created.pack.bottle },
  };
}
