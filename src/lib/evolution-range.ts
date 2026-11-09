import { isBusinessDay } from "@/lib/daily-evaluation";

/** Inclusive range of calendar days. The limit protects the dashboard from oversized queries. */
export function evolutionRange(start: string, end: string, maxDays: number) {
  if (!isBusinessDay(start) || !isBusinessDay(end) || start > end) return null;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
  return Number.isSafeInteger(days) && days > 0 && days <= maxDays ? { start, end, days } : null;
}

export function evolutionMaxRangeDays() {
  const value = Number(process.env.EVOLUTION_MAX_RANGE_DAYS);
  return Number.isSafeInteger(value) && value > 0 ? value : 366;
}
