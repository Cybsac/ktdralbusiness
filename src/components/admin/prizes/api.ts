export async function prizeRequest<T>(
  url: string,
  options?: Parameters<typeof fetch>[1]
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(body?.message || "No se pudo completar la operación");
  return body as T;
}
export function gameCatalogUrl(path: string) {
  return `${path}?${new URLSearchParams({ scope: "game" })}`;
}
