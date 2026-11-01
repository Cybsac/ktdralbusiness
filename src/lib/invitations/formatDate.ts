import { invitationDay } from "./calendar";
import { DateTime } from "luxon";
import { INVITATION_POLICY as P } from "./policy";
function format(value: string | null | undefined, pattern: string, calendar = false) {
  if (!value) return "";
  const date = calendar ? invitationDay(value) : DateTime.fromISO(value, { zone: P.timezone });
  return date.isValid ? date.setLocale("es").toFormat(pattern) : "";
}
export const fmtLimaDate = (iso?: string | null) => format(iso, "yyyy-MM-dd", true);
export const fmtLimaDateTime = (iso?: string | null) => format(iso, "yyyy-MM-dd HH:mm");
export const fmtLimaDateShort = (iso?: string | null) =>
  format(iso, "d LLL yyyy", true)
    .replace(/\./g, "")
    .replace(/(^|\s)([a-záéíóúñ])/g, (_match, prefix, letter) => prefix + letter.toUpperCase());
export const fmtLimaDateDayMonth = (iso?: string | null) =>
  format(iso, "d 'de' LLLL", true).replace(
    /(de )([a-záéíóúñ])/g,
    (_match, prefix, letter) => prefix + letter.toUpperCase()
  );
export const fmtLimaDateLong = (iso?: string | null) =>
  format(iso, "d 'de' LLLL yyyy", true).replace(
    /(de )([a-záéíóúñ])/g,
    (_match, prefix, letter) => prefix + letter.toUpperCase()
  );
