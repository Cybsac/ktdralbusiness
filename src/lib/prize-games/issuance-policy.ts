export const ISSUANCE_POLICY = {
  maxValidityDays: 3650,
  defaultDays: 7,
  defaultMaxTokens: 10000,
  absoluteMaxTokens: 50000,
  defaultChunk: 1000,
  defaultTimeoutMs: 30000,
  transactionAttempts: 3,
  recentBatches: 7,
  clientTimeoutMs: 180000,
} as const;
function integer(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid ${name}`);
  return value;
}
export function issuanceSettings() {
  return {
    maxTokens: integer(
      "BATCH_MAX_TOKENS_AUTO",
      ISSUANCE_POLICY.defaultMaxTokens,
      1,
      ISSUANCE_POLICY.absoluteMaxTokens
    ),
    chunk: integer("BATCH_CREATE_CHUNK", ISSUANCE_POLICY.defaultChunk, 1, 5000),
    timeout: integer(
      "BATCH_TRANSACTION_TIMEOUT_MS",
      ISSUANCE_POLICY.defaultTimeoutMs,
      5000,
      120000
    ),
  };
}
