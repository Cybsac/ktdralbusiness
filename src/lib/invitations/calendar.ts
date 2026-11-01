import { DateTime } from "luxon";
import { INVITATION_POLICY as P } from "./policy";
export function invitationDay(value: Date | string) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return DateTime.fromISO(value, { zone: P.timezone }).startOf("day");
  return DateTime.fromJSDate(typeof value === "string" ? new Date(value) : value, {
    zone: P.timezone,
  }).startOf("day");
}
export const invitationToday = (now = new Date()) =>
  DateTime.fromJSDate(now, { zone: P.timezone }).startOf("day");
export const invitationExpiration = (value: Date | string) =>
  invitationDay(value).endOf("day").toJSDate();
export function assertEventAvailable(event: { status: string; date: Date }, now = new Date()) {
  if (event.status !== "active") throw new Error("EVENT_UNAVAILABLE");
  if (invitationExpiration(event.date) <= now) throw new Error("EXPIRED");
}
