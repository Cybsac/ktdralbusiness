import { purgeBirthdayCards } from "./retention";
import { birthdayYearRange } from "./calendar";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { lockBirthdayReservation, lockBirthdayDocument } from "./locking";
import { birthdayDay } from "./calendar";
const transitions: Record<string, readonly string[]> = {
  approved: ["draft", "pending_review", "approved", "canceled"],
  canceled: ["draft", "pending_review", "approved", "completed", "canceled"],
  completed: ["approved", "completed"],
};
export async function changeReservationStatus(
  id: string,
  status: keyof typeof transitions,
  actor?: string,
  reason?: string
) {
  const reservation = await prisma.$transaction(async (tx) => {
    await lockBirthdayReservation(tx, id);
    const current = await tx.birthdayReservation.findUnique({ where: { id } });
    if (!current) throw new Error("NOT_FOUND");
    if (!transitions[status].includes(current.status)) throw new Error("INVALID_TRANSITION");
    if (status === "approved" && current.status === "canceled" && current.documento) {
      const day = birthdayDay(current.date);
      await lockBirthdayDocument(tx, current.documento, day.year);
      if (
        await tx.birthdayReservation.findFirst({
          where: {
            id: { not: id },
            documento: current.documento,
            date: birthdayYearRange(day.toJSDate()),
            status: { not: "canceled" },
          },
        })
      )
        throw new Error("DUPLICATE_DNI_YEAR");
    }
    return tx.birthdayReservation.update({ where: { id }, data: { status, updatedBy: actor } });
  });
  if (status === "canceled") {
    try {
      await purgeBirthdayCards([id], actor, new Date());
    } catch (error) {
      console.warn("Canceled birthday cards await scheduled cleanup", error);
    }
  }
  await audit(`birthday.${status}`, actor, { id, reason });
  return reservation;
}
export const approveReservation = (id: string, actor?: string) =>
  changeReservationStatus(id, "approved", actor);
export const cancelReservation = (id: string, reason?: string, actor?: string) =>
  changeReservationStatus(id, "canceled", actor, reason);
/** Public cancellation is limited to the untouched reservation owned by its signed link. */
export async function cancelPublicReservation(id: string) {
  const reservation = await prisma.$transaction(async tx => {
    await lockBirthdayReservation(tx, id);
    const current = await tx.birthdayReservation.findUnique({ where: { id }, include: { inviteTokens: { select: { usedCount: true } } } });
    if (!current) throw new Error('NOT_FOUND');
    if (current.reservationSource !== 'PUBLIC' || !['draft', 'pending_review', 'approved', 'canceled'].includes(current.status) || current.hostArrivedAt || current.guestArrivals > 0 || current.inviteTokens.some(token => token.usedCount > 0)) throw new Error('PUBLIC_CANCELLATION_UNAVAILABLE');
    if (current.status === 'canceled') return current;
    return tx.birthdayReservation.update({ where: { id }, data: { status: 'canceled', updatedBy: 'PUBLIC' } });
  });
  try { await purgeBirthdayCards([id], 'PUBLIC', new Date()); }
  catch (error) { console.warn('Canceled birthday cards await scheduled cleanup', error); }
  await audit('birthday.canceled', 'PUBLIC', { id });
  return reservation;
}
export const completeReservation = (id: string, actor?: string) =>
  changeReservationStatus(id, "completed", actor);
