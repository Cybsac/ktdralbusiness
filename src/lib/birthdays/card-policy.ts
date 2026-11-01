import type { Prisma } from "@prisma/client";
import { birthdayExpiration } from "./calendar";
import { BIRTHDAY_POLICY as P } from "./policy";

export function birthdayCardAvailable(
  reservation: { status: string; date: Date },
  now = new Date()
) {
  return (
    (P.entryStatuses as readonly string[]).includes(reservation.status) &&
    birthdayExpiration(reservation.date) > now
  );
}
export function assertBirthdayCardAvailable(
  reservation: { status: string; date: Date },
  now = new Date()
) {
  if (!(P.entryStatuses as readonly string[]).includes(reservation.status))
    throw new Error("RESERVATION_UNAVAILABLE");
  if (birthdayExpiration(reservation.date) <= now) throw new Error("RESERVATION_DATE_PAST");
}
/** A future legacy token must not cause an image to disappear while its QR is still valid. */
export function birthdayCardsExpiredWhere(now: Date): Prisma.BirthdayReservationWhereInput {
  // Both historical midnight UTC and local midnight dates are interpreted by the calendar helper
  // before deletion. This coarse database filter keeps the scan bounded and index friendly.
  return { OR: [{ status: { notIn: [...P.entryStatuses] } }, { date: { lt: now } }] };
}
