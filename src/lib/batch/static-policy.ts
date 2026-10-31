export const STATIC_BATCH_LIMITS = {
  tokens: 100000,
  name: 120,
  payload: 50000,
  insertChunk: 1000,
  transactionTimeoutMs: 60000,
} as const;
