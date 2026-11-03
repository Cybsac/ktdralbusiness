function positiveInteger(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}
export const BIRTHDAY_POLICY = {
  timezone: process.env.NEXT_PUBLIC_BIRTHDAY_TIMEZONE || "America/Lima",
  maxGuests: 5000,
  maxName: 160,
  maxPackQr: 1000,
  publicBookingDays: 15,
  cleanupBatchSize: positiveInteger(process.env.BIRTHDAY_CLEANUP_BATCH_SIZE, 10),
  cleanupSchedule: process.env.BIRTHDAY_CLEANUP_CRON || "*/10 * * * *",
  storageScanPageSize: positiveInteger(process.env.BIRTHDAY_STORAGE_SCAN_PAGE_SIZE, 100),
  cleanupLeaseMs: 15 * 60 * 1000,
  cleanupRetryMs: 60 * 1000,
  publicSlots: (process.env.NEXT_PUBLIC_BIRTHDAY_SLOTS || "20:00,21:00,22:00,23:00,00:00")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)),
  staffSlots: (process.env.NEXT_PUBLIC_BIRTHDAY_STAFF_SLOTS || "20:00,21:00,22:00,23:00,00:00")
    .split(",").map((value) => value.trim()).filter((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)),
  maxReservationsPerSlot: positiveInteger(process.env.BIRTHDAY_MAX_RESERVATIONS_PER_SLOT, 5),
  capacityStatuses: ["pending_review", "approved", "completed"],
  defaultReferralCommission: 10,
  pageSize: 20,
  maxPageSize: 100,
  invitationCodeBytes: 16,
  invitationCodeLength: 10,
  universalTokenKind: "guest",
  legacyTokenKind: "host",
  arrivalRoles: ["host", "guest"],
  statuses: ["draft", "pending_review", "approved", "completed", "canceled"],
  entryStatuses: ["approved", "completed"],
} as const;
