-- Additive only: no existing prize, token or history data is changed.
CREATE TABLE IF NOT EXISTS "PrizeAuthorizationConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "policy" JSONB NOT NULL,
  "secret" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrizeAuthorizationConfig_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "PrizeAuthorizationAttempt" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrizeAuthorizationAttempt_pkey" PRIMARY KEY ("key")
);
CREATE INDEX IF NOT EXISTS "PrizeAuthorizationAttempt_resetAt_idx" ON "PrizeAuthorizationAttempt"("resetAt");
