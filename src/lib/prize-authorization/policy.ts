import { z } from "zod";

export const prizeScopes = {
  tokens: "Ruleta, premios y QR estáticos",
  reusable: "QR reutilizables",
  custom_qr: "QR personalizados y accesos canjeables",
  offers: "Entrega de ofertas",
  mundial: "Premios Mundial",
  exchange: "Premios por intercambios",
  points: "Canje de puntos",
  birthdays: "Entrega de cortesías de cumpleaños",
} as const;
export type PrizeScope = keyof typeof prizeScopes;
export const scopeKeys = Object.keys(prizeScopes) as PrizeScope[];
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Fecha inválida");
export const policySchema = z
  .object({
    enabled: z.boolean(),
    timezone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat("es", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Zona horaria inválida"),
    rotation: z.enum(["daily", "weekly", "monthly", "interval", "fixed"]),
    intervalMinutes: z.number().int().min(1).max(525600),
    anchorAt: z.string().datetime(),
    schedule: z.enum(["always", "range", "dates"]),
    startsAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
    dates: z.array(calendarDate).max(730),
    weekdays: z.array(z.number().int().min(1).max(7)),
    maxAttempts: z.number().int().min(1).max(30),
    lockMinutes: z.number().int().min(1).max(60),
  })
  .strip()
  .superRefine((value, ctx) => {
    if (
      value.schedule === "range" &&
      (!value.startsAt ||
        !value.endsAt ||
        new Date(value.startsAt).getTime() >= new Date(value.endsAt).getTime())
    )
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Define un rango válido de inicio y fin",
      });
    if (value.schedule === "dates" && !value.dates.length)
      ctx.addIssue({ code: "custom", path: ["dates"], message: "Selecciona al menos una fecha" });
  });
export type PrizePolicy = z.infer<typeof policySchema>;
export function defaultPrizePolicy(): PrizePolicy {
  return {
    enabled: true,
    timezone: "America/Lima",
    rotation: "daily",
    intervalMinutes: 1440,
    anchorAt: new Date().toISOString(),
    schedule: "always",
    startsAt: null,
    endsAt: null,
    dates: [],
    weekdays: [],
    maxAttempts: 5,
    lockMinutes: 5,
  };
}
