import { z } from "zod";
import { BIRTHDAY_POLICY as P } from "./policy";
import { birthdayDay } from "./calendar";
export const reservationFields = {
  celebrantName: z
    .string()
    .trim()
    .min(3)
    .max(P.maxName)
    .refine((value) => value.split(/\s+/).length >= 2, "Ingresa nombre y apellido"),
  phone: z.string().regex(/^\d{9}$/, "El WhatsApp debe tener 9 dígitos"),
  documento: z.string().regex(/^\d{8}$/, "El DNI debe tener 8 dígitos"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => birthdayDay(value).isValid && birthdayDay(value) <= birthdayDay(new Date()), "Fecha de nacimiento inválida").optional(),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => birthdayDay(value).isValid, "Fecha inválida"),
  timeSlot: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  packId: z.string().min(1),
  guestsPlanned: z.number().int().min(1).max(P.maxGuests),
  wantsPhotoSession: z.boolean().default(false),
};
export const birthdayCardNameField = z.string().trim().min(1).max(P.maxName).regex(/^\S+$/, "Ingresa un solo nombre para la tarjeta");
export const reservationCreateSchema = z.object({
  ...reservationFields,
  cardName: birthdayCardNameField.optional(),
  referrerId: z.string().optional(),
});

export const surpriseReservationCreateSchema = reservationCreateSchema.omit({ documento: true }).extend({
  isSurprise: z.literal(true),
  celebrantName: birthdayCardNameField,
  birthDate: z.undefined().optional(),
  documento: z.null().optional(),
  organizerDni: reservationFields.documento,
  organizerName: reservationFields.celebrantName,
  organizerBirthDate: reservationFields.birthDate.unwrap(),
  cardName: birthdayCardNameField,
});
