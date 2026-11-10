ALTER TABLE "ReusableToken" ADD COLUMN "validFrom" TIMESTAMP(3);
CREATE INDEX "ReusableToken_validFrom_idx" ON "ReusableToken"("validFrom");
