import { DateTime } from "luxon";
import { REUSABLE_TIMEZONE } from "./policy";
export function clockMinutes(value: string, allowMidnight = false) {
  if (allowMidnight && value === "24:00") return 24 * 60;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("INVALID_TIME");
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
export function inReusableWindow(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  now = new Date()
) {
  if (!start && !end) return true;
  if (!start || !end) return false;
  const parse = (value: Date | string) =>
    (typeof value === "string" ? DateTime.fromISO(value) : DateTime.fromJSDate(value)).setZone(
      REUSABLE_TIMEZONE
    );
  const from = parse(start),
    until = parse(end),
    current = DateTime.fromJSDate(now).setZone(REUSABLE_TIMEZONE);
  if (!from.isValid || !until.isValid) return false;
  const minutes = current.hour * 60 + current.minute;
  const begin = from.hour * 60 + from.minute,
    finish = until.hour * 60 + until.minute;
  // 00:00 -> 24:00 is represented by successive local midnights.
  if (begin === finish) return until.toMillis() > from.toMillis();
  return finish > begin
    ? minutes >= begin && minutes < finish
    : minutes >= begin || minutes < finish;
}
export function reusableAvailability(
  token: {
    disabled: boolean;
    expiresAt: Date | string;
    usedCount: number;
    maxUses: number;
    startTime?: Date | string | null;
    endTime?: Date | string | null;
    prize?: { active?: boolean };
  },
  now = new Date()
) {
  if (token.prize?.active === false) return "PRIZE_INACTIVE";
  if (token.disabled) return "TOKEN_DISABLED";
  if (
    !Number.isFinite(new Date(token.expiresAt).getTime()) ||
    new Date(token.expiresAt).getTime() <= now.getTime()
  )
    return "TOKEN_EXPIRED";
  if (token.usedCount >= token.maxUses) return "TOKEN_EXHAUSTED";
  if (!inReusableWindow(token.startTime, token.endTime, now)) return "OUTSIDE_TIME_WINDOW";
  return "AVAILABLE";
}
