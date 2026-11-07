import { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/apiError";
import { birthdayManager } from "@/lib/birthdays/managementAuth";
import { getReservation } from "@/lib/birthdays/service";
import {
  reservationEditSchema,
  updateBirthdayReservation,
} from "@/lib/birthdays/updateReservation";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await birthdayManager(req))) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  const id = params.id;
  const r = await getReservation(id);
  if (!r) return apiError("NOT_FOUND", "Reservation not found", undefined, 404);
  return apiOk(r);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await birthdayManager(req);
  if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  const parsed = reservationEditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_BODY", "Revisa los datos ingresados", parsed.error.flatten(), 400);
  try {
    const result = await updateBirthdayReservation(params.id, parsed.data, session.userId);
    return apiOk(result);
  } catch (e) {
    const code =
      (e as { code?: string })?.code === "P2034"
        ? "EDIT_CONFLICT"
        : e instanceof Error
          ? e.message
          : "";
    const messages: Record<string, string> = {
      NOT_FOUND: "Reserva no encontrada",
      INVALID_PACK: "Paquete no disponible",
      DATE_PAST: "La nueva fecha no puede ser pasada",
      CLOSED_DAY: "No atendemos en la fecha seleccionada. Elige otro día.",
      ALREADY_USED: "No se puede cambiar fecha o paquete cuando ya se registraron ingresos",
      DUPLICATE_RESERVATION: "Ya existe una reserva con ese DNI en el mismo año",
      EDIT_CONFLICT: "La reserva cambió. Recarga antes de guardar.",
    };
    return apiError(
      messages[code] ? code : "INTERNAL_ERROR",
      messages[code] || "No se pudo guardar la reserva",
      undefined,
      code === "NOT_FOUND" ? 404 : code === "EDIT_CONFLICT" ? 409 : messages[code] ? 400 : 500
    );
  }
}
