import { DateTime } from "luxon";
import { z } from "zod";
export const rosterDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => DateTime.fromISO(value, { zone: "UTC" }).isValid);
export const rosterRoleNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .transform((value) => value.replace(/\s+/g, " "));
export function rosterRoleKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim()
    .replace(/\s+/g, " ");
}
export function canEditRoster(role: string) {
  return role === "ADMIN" || role === "COORDINATOR";
}
