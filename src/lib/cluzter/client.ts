import { CluzterError, getCluzterConfig } from "./config";

/** Internal transport for explicitly implemented operations only. No automatic retries: calls may consume credits. */
export async function cluzterGet(path: string): Promise<unknown> {
  const { baseUrl, token, timeoutMs } = getCluzterConfig();
  const url = new URL(path, baseUrl);
  if (!path.startsWith("/api/") || url.origin !== baseUrl.origin)
    throw new CluzterError("INVALID_INPUT");
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new CluzterError("UNAVAILABLE");
  }
  if (!response.ok) {
    if (response.status === 404) throw new CluzterError("NOT_FOUND");
    if (response.status === 401 || response.status === 403) throw new CluzterError("AUTH");
    if (response.status === 402) throw new CluzterError("QUOTA");
    if (response.status === 429) throw new CluzterError("RATE_LIMITED");
    throw new CluzterError("UNAVAILABLE");
  }
  try {
    return await response.json();
  } catch {
    throw new CluzterError("INVALID_RESPONSE");
  }
}
