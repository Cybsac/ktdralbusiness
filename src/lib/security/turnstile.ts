const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export async function verifyPublicChallenge(token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const hosts = (process.env.TURNSTILE_ALLOWED_HOSTNAMES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!secret || !hosts.length || typeof token !== "string" || !token || token.length > 2048)
    return false;
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    return (
      response.ok &&
      result.success === true &&
      result.action === "dni_lookup" &&
      typeof result.hostname === "string" &&
      hosts.includes(result.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}
