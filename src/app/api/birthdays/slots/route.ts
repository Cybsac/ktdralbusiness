import { birthdayDay, birthdayStoredRange } from "@/lib/birthdays/calendar";
import { BIRTHDAY_POLICY as P } from "@/lib/birthdays/policy";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/apiError";
import { checkRateLimit } from "@/lib/rateLimit";
import { isBirthdaysEnabledPublic } from "@/lib/featureFlags";

export async function GET(req: NextRequest) {
  if (!isBirthdaysEnabledPublic()) {
    return apiError("NOT_FOUND", "Not found", undefined, 404);
  }
  const ip = req.headers.get("x-forwarded-for") || req.ip || "unknown";
  const rl = checkRateLimit(`birthdays:slots:${ip}`);
  if (!rl.ok) {
    return apiError("RATE_LIMITED", "Too many requests", undefined, 429, {
      "Retry-After": String(rl.retryAfterSeconds),
    });
  }
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date"); // expected YYYY-MM-DD
    if (!dateStr) return apiError("INVALID_DATE", "date (YYYY-MM-DD) is required", undefined, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !birthdayDay(dateStr).isValid)
      return apiError("INVALID_DATE", "Fecha inválida", undefined, 400);
    if (P.closedWeekdays.includes(birthdayDay(dateStr).weekday)) return apiOk({ date: dateStr, slots: [] });
    const range = birthdayStoredRange(dateStr);
    const reservations = await prisma.birthdayReservation.findMany({
      where: {
        date: range,
        status: { in: [...P.capacityStatuses] },
      },
      select: { timeSlot: true },
    });
    const counts = Object.fromEntries(P.publicSlots.map((s) => [s, 0])) as Record<string, number>;
    for (const r of reservations) counts[r.timeSlot] = (counts[r.timeSlot] || 0) + 1;
    const slots = P.publicSlots.map((slot) => ({
      slot,
      remaining: Math.max(0, P.maxReservationsPerSlot - (counts[slot] || 0)),
    }));
    return apiOk({ date: dateStr, slots });
  } catch (e) {
    return apiError("SLOTS_FETCH_ERROR", "Failed to compute availability");
  }
}
