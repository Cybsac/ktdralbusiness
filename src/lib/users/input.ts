import { z } from "zod";
import { ALLOWED_AREAS } from "@/lib/areas";
import { parseBirthdayInput } from "@/lib/birthday";
import { USER_POLICY as P, USER_ROLES } from "./policy";
export const normalizeDocument = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/[\s-]/g, "")
    .toUpperCase();
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[A-Za-z0-9_.-]+$/);
export const passwordSchema = z
  .string()
  .min(P.passwordMin)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= P.passwordMax,
    "Contraseña demasiado larga"
  );
export const documentSchema = z
  .string()
  .transform(normalizeDocument)
  .pipe(z.string().regex(/^[A-Z0-9]{3,30}$/));
const birthday = z
  .string()
  .refine((value) => !!parseBirthdayInput(value), "Cumpleaños inválido")
  .nullable();
const whatsapp = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{8,15}$/))
  .nullable();
export const personSchema = z.object({
  name: z.string().trim().min(2).max(120),
  dni: documentSchema,
  area: z.enum(ALLOWED_AREAS),
  whatsapp,
  birthday,
});
export const createUserSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    role: z.enum(USER_ROLES).default("STAFF"),
    person: personSchema.optional(),
    code: z.string().trim().min(1).max(40).optional(),
  })
  .strict()
  .refine((value) => !!value.person !== !!value.code, "Indica persona o código existente");
export const updateUserSchema = z
  .object({
    username: usernameSchema.optional(),
    dni: documentSchema.optional(),
    personName: personSchema.shape.name.optional(),
    role: z.enum(USER_ROLES).optional(),
    area: z.enum(ALLOWED_AREAS).optional(),
    whatsapp: whatsapp.optional(),
    birthday: birthday.optional(),
    password: passwordSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "No hay cambios");
