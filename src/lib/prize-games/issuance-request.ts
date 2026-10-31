import { DateTime } from "luxon";
import { z } from "zod";

import { TOKEN_EXPERIENCE_TYPES } from "@/lib/experiences/types";

import { getGameCalendar } from "./calendar";
import { PrizeGameError } from "./contracts";
import { ISSUANCE_POLICY as P } from "./issuance-policy";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ISSUANCE_REQUEST_DEFAULTS = {
  name: "Lote",
  experienceType: "roulette",
  includeQr: true,
  lazyQr: false,
  mode: "byDays",
} as const;
const common = {
  name: z.string().trim().min(1).max(120).default(ISSUANCE_REQUEST_DEFAULTS.name),
  experienceType: z.enum(TOKEN_EXPERIENCE_TYPES).default(ISSUANCE_REQUEST_DEFAULTS.experienceType),
  includeQr: z.boolean().default(true),
  lazyQr: z.boolean().default(false),
};
const modes = z.discriminatedUnion("mode", [
  z
    .object({
      ...common,
      mode: z.literal("byDays"),
      expirationDays: z.number().int().min(1).max(P.maxValidityDays),
    })
    .strict(),
  z.object({ ...common, mode: z.literal("singleDay"), singleDayDate: date }).strict(),
]);
export type IssuanceRequest = z.infer<typeof modes>;
export function parseIssuanceRequest(input: unknown): IssuanceRequest {
  const value = z.object({ mode: z.string().optional() }).passthrough().parse(input);
  return modes.parse({ ...value, mode: value.mode || ISSUANCE_REQUEST_DEFAULTS.mode });
}
export interface IssuanceValidity {
  functionalDate: Date;
  validFrom: Date | null;
  expiresAt: Date;
  expirationDays: number | null;
}
export function resolveIssuanceValidity(
  request: IssuanceRequest,
  now = new Date()
): IssuanceValidity {
  const calendar = getGameCalendar();
  const zone = calendar.timeZone;
  const local = DateTime.fromJSDate(now, { zone });
  if (!local.isValid) throw new Error("Invalid TOKENS_TIMEZONE");
  if (request.mode === "byDays") {
    return {
      functionalDate: local.startOf("day").toJSDate(),
      validFrom: now,
      expiresAt: local.plus({ days: request.expirationDays }).toJSDate(),
      expirationDays: request.expirationDays,
    };
  }
  const start = DateTime.fromISO(request.singleDayDate, { zone });
  if (!start.isValid || start.toISODate() !== request.singleDayDate)
    throw new PrizeGameError("INVALID_DATE", "Fecha inválida", 400);
  const end = start.plus({ days: 1 }).startOf("day").set({ hour: calendar.calendarCloseHour });
  if (end.toMillis() <= now.getTime())
    throw new PrizeGameError("INVALID_WINDOW", "La vigencia ya terminó", 400);
  return {
    functionalDate: start.startOf("day").toJSDate(),
    validFrom: start.toJSDate(),
    expiresAt: end.toJSDate(),
    expirationDays: null,
  };
}
