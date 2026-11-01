import { businessDayWindowUtc, limaCalendarDayWindowUtc } from '@/lib/attendanceDay';
export function summaryWindow(day: string) {
  const { startUtc, endUtc } = businessDayWindowUtc(day);
  const { startUtc: fStart, endUtc: calendarEndUtc, endUtcInclusive: fEnd } = limaCalendarDayWindowUtc(day);
  return { startUtc, endUtc, fStart, calendarEndUtc, fEnd };
}
export type SummaryWindow = ReturnType<typeof summaryWindow>;
