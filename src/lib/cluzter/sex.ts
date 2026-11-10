/** Translate the provider's document code; return null for unknown or invalid configuration. */
export function documentSex(code: string | null, maleCode = "1"): "MALE" | "FEMALE" | null {
  if ((maleCode !== "1" && maleCode !== "2") || (code !== "1" && code !== "2")) return null;
  return code === maleCode ? "MALE" : "FEMALE";
}
