import { DateTime } from "luxon";

/** Age at a calendar date; null means not verified and must never be treated as an adult. */
export function ageAtDate(birthDate: string | null, date: string): number | null {
  const parse = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? DateTime.fromISO(value, { zone: "UTC" })
      : DateTime.invalid("invalid date");
  if (!birthDate) return null;
  const birth = parse(birthDate),
    target = parse(date);
  if (!birth.isValid || !target.isValid || birth > target) return null;
  let age = target.year - birth.year;
  // Leap-day birthdays reach their anniversary on March 1 in non-leap years.
  if (target.month < birth.month || (target.month === birth.month && target.day < birth.day)) age--;
  return age;
}
export function adultAtDate(birthDate: string | null, date: string): boolean | null {
  const age = ageAtDate(birthDate, date);
  return age === null ? null : age >= 18;
}
