import { DateTime } from "luxon";

export function admissionAge(value: string | null, now = new Date()): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birth = DateTime.fromISO(value, { zone: "America/Lima" }).startOf("day");
  const today = DateTime.fromJSDate(now, { zone: "America/Lima" }).startOf("day");
  if (!birth.isValid || birth > today) return null;
  let age = today.year - birth.year;
  // A February 29 birthday falls on March 1 in non-leap years for admission.
  const anniversary = DateTime.fromObject(
    { year: today.year, month: birth.month, day: birth.day },
    { zone: "America/Lima" }
  );
  const birthdayThisYear = anniversary.isValid
    ? anniversary
    : DateTime.fromObject({ year: today.year, month: 3, day: 1 }, { zone: "America/Lima" });
  if (today < birthdayThisYear) age--;
  return age;
}
