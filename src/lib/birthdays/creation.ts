import { birthdayYearRange } from "./calendar";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { birthdayDay, birthdayToday, birthdayDateKey } from "./calendar";
import { BIRTHDAY_POLICY as P } from "./policy";
import { reservationCreateSchema } from "./reservation-input";
import { lockBirthdayDocument } from "./locking";
import type { CreateReservationInput, ReservationWithRelations } from "./types";
export async function createReservation(
  input: CreateReservationInput
): Promise<ReservationWithRelations> {
  const day = birthdayDay(input.date);
  if (!day.isValid) throw new Error("INVALID_DATE");
  const fields = reservationCreateSchema.parse({ ...input, date: birthdayDateKey(input.date) });
  if (day < birthdayToday()) throw new Error("RESERVATION_DATE_PAST");
  if (!input.isAdmin && day > birthdayToday().plus({ days: P.publicBookingDays }))
    throw new Error("DATE_TOO_FAR");
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
    const pack = await tx.birthdayPack.findFirst({ where: { id: fields.packId, active: true } });
    if (!pack) throw new Error("INVALID_PACK");
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
        date: day.toJSDate(),
        timeSlot: fields.timeSlot,
        packId: fields.packId,
        guestsPlanned: fields.guestsPlanned,
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
