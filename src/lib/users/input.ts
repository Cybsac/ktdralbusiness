import { z } from "zod";

import { ALLOWED_AREAS } from "@/lib/areas";
import { parseBirthdayInput } from "@/lib/birthday";

import { DOCUMENT_TYPES, isValidDocumentNumber, normalizeDocumentNumber } from "./document";
import { USER_POLICY as P, USER_ROLES } from "./policy";
export const normalizeDocument = normalizeDocumentNumber;
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
  documentType: z.enum(DOCUMENT_TYPES).nullable().optional(),
  area: z.enum(ALLOWED_AREAS),
  whatsapp,
  birthday,
  documentSexCode: z.enum(["1", "2"]).nullable().optional(),
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
  .refine((value) => !!value.person !== !!value.code, "Indica persona o código existente")
  .refine(
    (value) => !value.person || isValidDocumentNumber(value.person.dni, value.person.documentType),
    "El DNI peruano debe tener 8 dígitos"
  );
export const updateUserSchema = z
  .object({
    username: usernameSchema.optional(),
    dni: documentSchema.optional(),
    documentType: z.enum(DOCUMENT_TYPES).nullable().optional(),
    personName: personSchema.shape.name.optional(),
    role: z.enum(USER_ROLES).optional(),
    area: z.enum(ALLOWED_AREAS).optional(),
    whatsapp: whatsapp.optional(),
    birthday: birthday.optional(),
    documentSexCode: personSchema.shape.documentSexCode,
    password: passwordSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "No hay cambios");
