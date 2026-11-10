import { z } from "zod";
import { DateTime } from "luxon";
import { REUSABLE_POLICY as P, REUSABLE_TIMEZONE } from "./policy";
import { clockMinutes } from "./validity";
const time = z.string().refine((value) => {
  try {
    clockMinutes(value);
    return true;
  } catch {
    return false;
  }
}, "Hora inválida");
const endTime = z.string().refine((value) => {
  try {
    clockMinutes(value, true);
    return true;
  } catch {
    return false;
  }
}, "Hora inválida");
export const reusableGenerationSchema = z
  .object({
    requestKey: z.string().uuid(),
    prizeId: z.string().min(1),
    groupId: z.string().min(1).optional(),
    maxUses: z.number().int().min(1).max(P.maxUses),
    description: z.string().trim().max(P.maxDescription).optional(),
    validity: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("duration_days"),
        durationDays: z.number().int().safe().positive(),
      }),
      z.object({ type: z.literal("expires_at"), expiresAt: z.string().min(1) }),
      z.object({ type: z.literal("time_window"), startTime: time, endTime }),
      z.object({
        type: z.literal("specific_date"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: time.optional(),
        endTime: endTime.optional(),
      }),
    ]),
  })
  .strict();
export type ReusableGeneration = z.infer<typeof reusableGenerationSchema>;
export function resolveReusableValidity(
  validity: ReusableGeneration["validity"],
  now = new Date()
) {
  const local = DateTime.fromJSDate(now, { zone: REUSABLE_TIMEZONE });
  let expires = local;
  let validFrom: Date | null = null;
  let startTime: Date | null = null,
    endTime: Date | null = null;
  if (validity.type === "duration_days") expires = local.plus({ days: validity.durationDays });
  else if (validity.type === "expires_at")
    expires = DateTime.fromISO(validity.expiresAt, { zone: REUSABLE_TIMEZONE });
  else if (validity.type === "specific_date") {
    if (Boolean(validity.startTime) !== Boolean(validity.endTime)) throw new Error("INVALID_TIME");
    const day = DateTime.fromISO(validity.date, { zone: REUSABLE_TIMEZONE }).startOf("day");
    if (!day.isValid || day.toISODate() !== validity.date) throw new Error("INVALID_DATE");
    const begin = validity.startTime ? clockMinutes(validity.startTime) : 0;
    const finish = validity.endTime ? clockMinutes(validity.endTime, true) : 24 * 60;
    if (begin === finish) throw new Error("EMPTY_TIME_WINDOW");
    validFrom = day.plus({ minutes: begin }).toJSDate();
    expires = day.plus({ minutes: finish + (finish < begin ? 24 * 60 : 0) });
  } else {
    const begin = clockMinutes(validity.startTime),
      finish = clockMinutes(validity.endTime, true);
    if (begin === finish) throw new Error("EMPTY_TIME_WINDOW");
    const day = local.startOf("day");
    startTime = day.plus({ minutes: begin }).toJSDate();
    endTime = day.plus({ minutes: finish + (finish < begin ? 24 * 60 : 0) }).toJSDate();
    expires = local.plus({ days: P.timeWindowLifetimeDays });
  }
  if (!expires.isValid || expires.toMillis() <= now.getTime())
    throw new Error("INVALID_EXPIRATION");
  return { expiresAt: expires.toJSDate(), validFrom, startTime, endTime };
}
