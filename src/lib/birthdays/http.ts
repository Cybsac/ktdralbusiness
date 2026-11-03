import { apiError } from "@/lib/apiError";
const messages: Record<string, string> = {
  RESERVATION_NOT_CANCELED: "Solo se pueden eliminar reservas canceladas",
  RESERVATION_DATE_PAST: "La fecha de reserva ya pasó",
  DATE_TOO_FAR: "La fecha excede la anticipación permitida",
  INVALID_REFERRER: "Referidor no disponible",
  NOT_FOUND: "Reserva no encontrada",
  RESERVATION_NOT_FOUND: "Reserva no encontrada",
  TOKEN_NOT_FOUND: "Token no encontrado",
  INVALID_TRANSITION: "El estado actual no permite esa acción",
  RESERVATION_UNAVAILABLE: "La reserva no está habilitada",
  RESERVATION_DATE_FUTURE: "La reserva aún no está vigente",
  TOKEN_EXPIRED: "El QR ha vencido",
  EXPIRED: "El QR ha vencido",
  TOKEN_EXHAUSTED: "Se agotaron los ingresos disponibles",
  INVALID_SIGNATURE: "QR inválido",
  DUPLICATE_DNI_YEAR: "Ya existe una reserva con ese DNI en el mismo año",
  EDIT_CONFLICT: "La reserva cambió. Actualiza antes de continuar",
  CARD_DATA_CHANGED: "La reserva cambió durante la generación. Reintenta",
  INVALID_PACK: "Paquete no disponible",
  COURTESY_NOT_INCLUDED: "Esta cortesía no corresponde al paquete",
  PUBLIC_CANCELLATION_UNAVAILABLE: "La reserva no puede cancelarse porque ya registra llegadas o no está disponible. Contacta con el equipo.",
  INVALID_SLOT: "El horario seleccionado no está disponible.",
  SLOT_FULL: "El horario seleccionado ya no tiene cupos. Elige otro horario.",
};
export function birthdayFailure(error: unknown, headers?: Record<string, string>) {
  const code =
    (error as { code?: string })?.code === "P2034"
      ? "EDIT_CONFLICT"
      : error instanceof Error
        ? error.message
        : "";
  if (messages[code])
    return apiError(
      code,
      messages[code],
      undefined,
      code.includes("NOT_FOUND") ? 404 : 409,
      headers
    );
  console.error("Birthday operation failed", error);
  return apiError("INTERNAL_ERROR", "No se pudo completar la operación", undefined, 500, headers);
}
