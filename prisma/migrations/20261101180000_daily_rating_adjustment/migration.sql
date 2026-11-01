-- Additive change: retain every rating and note, including historical entries.
ALTER TABLE "PersonDailyRating" ADD COLUMN "originalRating" TEXT, ADD COLUMN "adjustmentReason" TEXT, ADD COLUMN "adjustedAt" TIMESTAMP(3);
-- Legacy notes identify an adjustment, but not its original rating or exact time.
UPDATE "PersonDailyRating" SET "adjustmentReason" = 'MISSING_EXIT' WHERE POSITION('Ajuste automático: no registró salida al cerrar la jornada.' IN COALESCE("note", '')) > 0;
