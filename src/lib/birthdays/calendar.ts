import { DateTime } from "luxon";
import { BIRTHDAY_POLICY as P } from "./policy";
/** Historical midnight-UTC values represented calendar dates, not an arrival instant. */
export function birthdayDay(value: Date | string) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return DateTime.fromISO(value, { zone: P.timezone }).startOf("day");
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return DateTime.invalid("Invalid birthday date");
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0)
    return DateTime.fromISO(date.toISOString().slice(0, 10), { zone: P.timezone }).startOf("day");
  return DateTime.fromJSDate(date, { zone: P.timezone }).startOf("day");
}
export const birthdayDateKey = (date: Date | string) => birthdayDay(date).toISODate()!;
export const birthdayToday = (now = new Date()) =>
  DateTime.fromJSDate(now, { zone: P.timezone }).startOf("day");
export const parseDateStringToLima = (value: string) => birthdayDay(value);
export const limaDateTimeToJSDate = (date: DateTime) => date.toJSDate();
export const birthdayExpiration = (date: Date | string) =>
  birthdayDay(date).endOf("day").toJSDate();

/** Reservation days were historically stored at either 00:00Z or local midnight. */
export function birthdayStoredRange(value: Date | string) {
  const key = birthdayDateKey(value);
  return { gte: new Date(`${key}T00:00:00.000Z`), lte: new Date(`${key}T23:59:59.999Z`) };
}
export function birthdayYearRange(value: Date | string) {
  const year = birthdayDay(value).year;
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}
