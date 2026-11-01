/** Accept only local navigation, including against protocol-relative and encoded variants. */
export function safeLocalRedirect(value: string | null | undefined, fallback = "/u") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value))
    return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f]/.test(decoded)) return fallback;
    const url = new URL(value, "https://local.invalid");
    return url.origin === "https://local.invalid" ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
