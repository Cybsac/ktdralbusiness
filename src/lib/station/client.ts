export class StationRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export async function stationRequest(data: object) {
  const response = await fetch('/api/station', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new StationRequestError(result.message || 'No se pudo completar la solicitud', response.status);
  return result;
}
