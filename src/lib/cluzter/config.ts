/** Configuration is read only on the server; no credential is exposed to the browser. */
export type CluzterConfig = { baseUrl: URL; token: string; timeoutMs: number };
export class CluzterError extends Error {
  constructor(
    public readonly code:
      | "NOT_CONFIGURED"
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "AUTH"
      | "QUOTA"
      | "RATE_LIMITED"
      | "UNAVAILABLE"
      | "INVALID_RESPONSE"
  ) {
    super(code);
    this.name = "CluzterError";
  }
}
export function getCluzterConfig(): CluzterConfig {
  if (typeof window !== "undefined") throw new CluzterError("NOT_CONFIGURED");
  const token = process.env.CLUZTER_API_TOKEN?.trim();
  if (!token) throw new CluzterError("NOT_CONFIGURED");
  const timeoutMs = Number(process.env.CLUZTER_TIMEOUT_MS || 8000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 60000)
    throw new CluzterError("NOT_CONFIGURED");
  let baseUrl: URL;
  try {
    baseUrl = new URL(process.env.CLUZTER_API_BASE_URL || "https://api2.cluzter.dev");
  } catch {
    throw new CluzterError("NOT_CONFIGURED");
  }
  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    baseUrl.pathname !== "/"
  )
    throw new CluzterError("NOT_CONFIGURED");
  return { baseUrl, token, timeoutMs };
}
