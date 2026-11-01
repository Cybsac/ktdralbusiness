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
    if (status === "approved" && current.status === "canceled") {
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
export const completeReservation = (id: string, actor?: string) =>
  changeReservationStatus(id, "completed", actor);
