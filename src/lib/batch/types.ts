// Shared batch-related TypeScript interfaces
// Keeping this minimal to avoid circular deps; extend cautiously.
export interface PrizeRequest {
  prizeId: string;
  count: number;
  /** Optional per-prize expiration; falls back to global expirationDays if omitted */
  expirationDays?: number;
}
