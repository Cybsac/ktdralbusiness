function positive(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
export const INVITATION_POLICY = {
  transactionTimeoutMs: positive(process.env.INVITATION_TRANSACTION_TIMEOUT_MS, 30000),
  timezone: process.env.NEXT_PUBLIC_INVITATION_TIMEZONE || "America/Lima",
  templateWidth: 1080,
  templateHeight: 1920,
  maxUploadBytes: positive(process.env.INVITATION_MAX_TEMPLATE_BYTES, 10 * 1024 * 1024),
  fetchTimeoutMs: positive(process.env.INVITATION_TEMPLATE_TIMEOUT_MS, 15000),
  uploadLeaseMs: positive(process.env.INVITATION_UPLOAD_LEASE_MS, 15 * 60 * 1000),
  cleanupBatchSize: positive(process.env.INVITATION_CLEANUP_BATCH_SIZE, 20),
  cleanupSchedule: process.env.INVITATION_CLEANUP_CRON || "*/10 * * * *",
  retryMs: 60 * 1000,
  codeLength: 10,
  codeAttempts: 5,
  maxGuests: 5000,
  bulkLimit: 500,
  upcomingDays: 30,
  upcomingLimit: 5,
  maxPixels: 40 * 1000 * 1000,
} as const;
