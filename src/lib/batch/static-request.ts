import { RAFFLE_LIMITS } from "@/components/token-actions/types";
import { DateTime } from "luxon";
import { z } from "zod";

import { ACTION_TYPES, type ActionType, FEEDBACK_LIMITS } from "@/components/token-actions/types";

import { STATIC_BATCH_LIMITS } from "./static-policy";
export { STATIC_BATCH_LIMITS } from "./static-policy";
const text = z.string().trim().min(1, "Completa el contenido de la dinámica");
const optionalText = z.string().trim().optional();
const httpUrl = z
  .string()
  .url()
  .refine((url) => /^https?:\/\//i.test(url), "La URL debe usar http o https");
const payloadSchemas = {
  prize: z.object({}).optional(),
  trivia: z.object({
    questions: z
      .array(
        z.object({
          question: text,
          answers: z
            .array(z.object({ text, correct: z.boolean() }))
            .min(2)
            .refine(
              (answers) => answers.filter((answer) => answer.correct).length === 1,
              "Cada pregunta necesita exactamente una respuesta correcta"
            ),
          points: z.number().finite().nonnegative(),
        })
      )
      .min(1, "Añade al menos una pregunta"),
    successMessage: optionalText,
    failMessage: optionalText,
  }),
  phrase: z.object({
    phrases: z.array(text).min(1, "Añade al menos una frase"),
    style: z.enum(["motivational", "funny", "wisdom", "custom"]).optional(),
    bgColor: optionalText,
  }),
  challenge: z.object({
    challenges: z.array(text).min(1, "Añade al menos un reto"),
    difficulty: z.enum(["easy", "medium", "hard"]),
    requiresValidation: z.boolean(),
  }),
  raffle: z.object({
    raffleName: text,
    autoNumber: z.boolean(),
    maxParticipants: z
      .number()
      .int()
      .min(RAFFLE_LIMITS.minParticipants)
      .max(RAFFLE_LIMITS.maxParticipants)
      .optional(),
  }),
  message: z
    .object({ htmlContent: text, ctaLabel: optionalText, ctaUrl: httpUrl.optional() })
    .refine((data) => !data.ctaUrl || !!data.ctaLabel, "Añade el texto del enlace"),
  feedback: z
    .object({
      prompt: text,
      placeholder: optionalText,
      minLength: z.number().int().min(1).optional(),
      maxLength: z.number().int().max(FEEDBACK_LIMITS.storageMaxLength).optional(),
      thankYouMessage: optionalText,
    })
    .refine(
      (data) =>
        (data.minLength ?? FEEDBACK_LIMITS.minLength) <=
        (data.maxLength ?? FEEDBACK_LIMITS.maxLength),
      "La longitud mínima no puede superar la máxima"
    ),
} satisfies Record<ActionType, z.ZodTypeAny>;
export const staticValiditySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("byDays"),
    expirationDays: z
      .number()
      .int()
      .safe()
      .min(1)
      .refine(
        (days) => DateTime.now().plus({ days }).isValid,
        "La cantidad de días produce una fecha inválida"
      ),
  }),
  z.object({ mode: z.literal("singleDay"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({
    mode: z.literal("singleHour"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hour: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    durationMinutes: z.number().int().min(5).max(720).default(60),
  }),
]);
export const staticBatchRequestSchema = z
  .object({
    name: text.max(STATIC_BATCH_LIMITS.name),
    targetUrl: httpUrl.optional(),
    prizes: z
      .array(
        z.object({
          prizeId: text,
          count: z.number().int().positive().max(STATIC_BATCH_LIMITS.tokens),
        })
      )
      .default([]),
    tokenCount: z.number().int().positive().max(STATIC_BATCH_LIMITS.tokens).optional(),
    validity: staticValiditySchema,
    actionType: z.enum(ACTION_TYPES).default("prize"),
    actionPayload: z.string().max(STATIC_BATCH_LIMITS.payload).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.prizes.reduce((sum, prize) => sum + prize.count, 0) > STATIC_BATCH_LIMITS.tokens)
      ctx.addIssue({
        code: "custom",
        path: ["prizes"],
        message: "La cantidad total supera el límite del lote",
      });
    if (data.actionType === "prize") return;
    let payload: unknown;
    try {
      payload = JSON.parse(data.actionPayload || "");
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["actionPayload"],
        message: "Completa la configuración de la dinámica",
      });
      return;
    }
    const parsed = payloadSchemas[data.actionType].safeParse(payload);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        ctx.addIssue({
          code: "custom",
          path: ["actionPayload", ...issue.path],
          message: issue.message,
        });
  });
export type StaticBatchRequest = z.infer<typeof staticBatchRequestSchema>;
export function resolveStaticValidity(
  validity: StaticBatchRequest["validity"],
  now = DateTime.now()
) {
  if (validity.mode === "byDays") return { windowStart: null, windowEnd: null };
  const base = DateTime.fromISO(validity.date, { zone: "America/Lima" });
  if (!base.isValid) throw new Error("INVALID_DATE");
  const start =
    validity.mode === "singleDay"
      ? base.startOf("day")
      : DateTime.fromISO(`${validity.date}T${validity.hour}`, { zone: "America/Lima" });
  const minimum = validity.mode === "singleDay" ? now.setZone("America/Lima").startOf("day") : now;
  if (start < minimum) throw new Error("PAST_DATE");
  const end =
    validity.mode === "singleDay"
      ? base.endOf("day")
      : start.plus({ minutes: validity.durationMinutes });
  return { windowStart: start.toJSDate(), windowEnd: end.toJSDate() };
}
