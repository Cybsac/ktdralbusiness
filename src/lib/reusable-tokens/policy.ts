export const REUSABLE_POLICY = {
  managementRoles: ["STAFF", "COORDINATOR", "ADMIN"],
  maxUses: 1000,
  pageSize: 20,
  maxPageSize: 100,
  maxDescription: 2000,
  maxBulkTokens: 1000,
  defaultDays: 30,
  defaultStart: "18:00",
  defaultEnd: "00:00",
  timeWindowLifetimeDays: 365,
  transactionAttempts: 3,
  pendingGenerationKey: "reusable:generation:pending:v1",
  availabilityRefreshMs: 30000,
} as const;
export const REUSABLE_TIMEZONE = process.env.NEXT_PUBLIC_TOKENS_TIMEZONE || "America/Lima";
