export const TOKEN_EXPERIENCE_TYPES = ["roulette", "scratch_card"] as const;

export type TokenExperienceType = (typeof TOKEN_EXPERIENCE_TYPES)[number];

export const DEFAULT_TOKEN_EXPERIENCE: TokenExperienceType = "roulette";

export function isTokenExperienceType(value: unknown): value is TokenExperienceType {
  return typeof value === "string" && (TOKEN_EXPERIENCE_TYPES as readonly string[]).includes(value);
}
