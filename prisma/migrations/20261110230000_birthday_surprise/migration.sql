ALTER TABLE "BirthdayReservation" ALTER COLUMN "documento" DROP NOT NULL;
ALTER TABLE "BirthdayReservation" ADD COLUMN "isSurprise" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "organizerDni" TEXT,
  ADD COLUMN "organizerName" TEXT,
  ADD COLUMN "cardName" TEXT;
CREATE INDEX "BirthdayReservation_organizerDni_date_idx" ON "BirthdayReservation"("organizerDni", "date");
