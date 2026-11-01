import { apiError } from "@/lib/apiError";
const messages: Record<string, string> = {
  EVENT_NOT_FOUND: "Evento no encontrado",
  INVITATION_NOT_FOUND: "Invitado no encontrado",
  EVENT_UNAVAILABLE: "El evento no está activo",
  EXPIRED: "La invitación ha vencido",
  DATE_FUTURE: "El evento aún no está vigente",
  DATE_PAST: "La fecha del evento ya pasó",
  INVALID_SIGNATURE: "Invitación inválida",
  ALREADY_ARRIVED: "La llegada ya fue registrada",
  INVITATION_CANCELLED: "La invitación está cancelada",
  DUPLICATE_NAME: "Ya existe ese nombre en el evento",
  CAPACITY_EXCEEDED: "Se alcanzó el máximo de invitados",
  ALREADY_USED: "No se puede cambiar la fecha después de registrar ingresos",
  INVALID_TRANSITION: "El estado actual no permite esa acción",
  TEMPLATE_UNAVAILABLE: "La plantilla ya no está disponible. Vuelve a cargarla",
  TEMPLATE_INVALID: "La plantilla debe ser una imagen del almacenamiento autorizado",
  TEMPLATE_FETCH_FAILED: "No se pudo cargar la plantilla",
  TEMPLATE_TOO_LARGE: "La plantilla supera el tamaño permitido",
  CODE_GENERATION_FAILED: "No se pudo generar el código",
};
export function invitationFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (messages[code])
    return apiError(code, messages[code], undefined, code.includes("NOT_FOUND") ? 404 : 409);
  console.error("invitation.operation.failed", error);
  return apiError("INTERNAL_ERROR", "No se pudo completar la operación", undefined, 500);
}
