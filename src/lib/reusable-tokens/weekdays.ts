import { DateTime, Info } from "luxon";
import { REUSABLE_TIMEZONE } from "./policy";

export const REUSABLE_WEEKDAYS = Info.weekdays("long", { locale: "es" }).map((label, index) => ({
  value: index + 1,
  label,
}));

export function reusableScheduleLabel(
  start: string | Date,
  end: string | Date,
  weekdays: number[] = []
) {
  const first = DateTime.fromJSDate(new Date(start), { zone: REUSABLE_TIMEZONE });
  const last = DateTime.fromJSDate(new Date(end), { zone: REUSABLE_TIMEZONE });
  if (!first.isValid || !last.isValid) return "Horario no disponible";
  const days = weekdays.length
    ? REUSABLE_WEEKDAYS.filter((day) => weekdays.includes(day.value))
        .map((day) => day.label)
        .join(", ")
    : "Todos los días";
  const from = first.toFormat("HH:mm"),
    until = last.toFormat("HH:mm");
  if (from === until && last > first) return `${days} · todo el día`;
  const overnight = first.hour * 60 + first.minute > last.hour * 60 + last.minute;
  return `${days} · ${from}–${until}${overnight ? " (día siguiente)" : ""}`;
}
