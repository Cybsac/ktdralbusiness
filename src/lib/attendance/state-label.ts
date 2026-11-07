export const ATTENDANCE_LABELS: Record<string, string> = {
  MISSING_ENTRY: "Sin entrada registrada",
  MISSING_EXIT: "Falta marcar salida",
  IN_PROGRESS: "En jornada",
  COMPLETED: "Entrada y salida registradas",
  NOT_MARKED: "Sin entrada registrada",
  ABSENT: "Falta · sin entrada",
  SCHEDULED: "Programado",
  PENDING: "Pendiente de entrada",
  NO_MARKS: "Sin marcas",
};
export function attendanceLabel(state: string) {
  return ATTENDANCE_LABELS[state] || "Sin marcas";
}
