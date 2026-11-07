ALTER TABLE "Person" ADD COLUMN "documentSexCode" TEXT;
CREATE TABLE "CluzterLookupLimit" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CluzterLookupLimit_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "CluzterLookupLimit_resetAt_idx" ON "CluzterLookupLimit"("resetAt");
