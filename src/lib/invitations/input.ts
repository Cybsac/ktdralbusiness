import { z } from "zod";
import { invitationDay } from "./calendar";
import { INVITATION_POLICY as P } from "./policy";
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
export const eventFields = {
  name: z.string().trim().min(1).max(200),
  description: optionalText(1000),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => invitationDay(value).isValid, "Invalid date"),
  timeSlot: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  location: optionalText(200),
  maxGuests: z.number().int().min(1).max(P.maxGuests).nullable().optional(),
  templateUrl: z.string().url().nullable().optional(),
};
export const createEventSchema = z.object(eventFields).strict();
export const updateEventSchema = createEventSchema.partial().strict();
export const guestSchema = z
  .object({
    guestName: z.string().trim().min(1).max(200),
    guestPhone: optionalText(40),
    guestWhatsapp: optionalText(40),
    guestEmail: z
      .union([z.string().email().max(200), z.literal("")])
      .nullable()
      .optional(),
    guestDni: optionalText(40),
    guestCategory: z.enum(["normal", "influencer", "vip"]).nullable().optional(),
    courtesyNote: optionalText(500),
    additionalNote: optionalText(500),
    notes: optionalText(500),
  })
  .strict();
export const updateGuestSchema = guestSchema.partial();
export const bulkGuestSchema = z
  .object({ guests: z.array(guestSchema).min(1).max(P.bulkLimit) })
  .strict();
