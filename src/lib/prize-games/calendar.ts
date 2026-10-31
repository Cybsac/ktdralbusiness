import { DateTime } from "luxon";

export interface GameCalendar {
  timeZone: string;
  calendarCloseHour: number;
}
export function getGameCalendar(): GameCalendar {
  const timeZone = process.env.TOKENS_TIMEZONE || "America/Lima";
  if (!DateTime.now().setZone(timeZone).isValid) throw new Error("Invalid TOKENS_TIMEZONE");
  const calendarCloseHour = Number(process.env.TOKENS_CALENDAR_CLOSE_HOUR || 3);
  if (!Number.isInteger(calendarCloseHour) || calendarCloseHour < 0 || calendarCloseHour > 23)
    throw new Error("Invalid TOKENS_CALENDAR_CLOSE_HOUR");
  return { timeZone, calendarCloseHour };
}
