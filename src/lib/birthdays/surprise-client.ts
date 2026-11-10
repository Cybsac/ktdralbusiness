export async function confirmSurpriseDuplicate(
  organizerDni: string,
  celebrantName: string,
  date: string
): Promise<boolean> {
  const response = await fetch("/api/birthdays/surprise-duplicates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizerDni, celebrantName, date }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw new Error(result.message || "No se pudo comprobar si existe una reserva similar.");
  return (
    !result.possibleDuplicate ||
    window.confirm(
      "Hay una reserva sorpresa similar de este organizador en fechas cercanas. ¿Deseas continuar?"
    )
  );
}
