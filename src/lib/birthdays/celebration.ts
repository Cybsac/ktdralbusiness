import type { DateTime } from "luxon";

import { birthdayDay, birthdayToday } from "./calendar";
import { BIRTHDAY_POLICY } from "./policy";

function nextOpen(day: DateTime<true>): DateTime<true> {
  for (let i = 0; i < 7 && BIRTHDAY_POLICY.closedWeekdays.includes(day.weekday); i++)
    day = day.plus({ days: 1 });
  return day;
}

/** Suggest the next birthday, moving a Monday celebration to Tuesday. */
export function suggestedCelebration(birthDate: string, now = new Date()): string {
  const birth = birthdayDay(birthDate);
  const today = birthdayToday(now);
  if (!birth.isValid || birth > today) return "";
  let birthday = birth.set({ year: today.year });
  birthday = nextOpen(birthday);
  if (birthday < today) {
    birthday = birth.set({ year: today.year + 1 });
    birthday = nextOpen(birthday);
  }
  return birthday.toISODate() || "";
}
