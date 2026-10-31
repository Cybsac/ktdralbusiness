BEGIN;
CREATE TABLE "GamePrizeCatalogItem" (
  "businessDay" TEXT NOT NULL,
  "prizeId" TEXT NOT NULL,
  "stock" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GamePrizeCatalogItem_pkey" PRIMARY KEY ("businessDay", "prizeId"),
  CONSTRAINT "GamePrizeCatalogItem_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GamePrizeCatalogItem_stock_check" CHECK ("stock" IS NULL OR "stock" >= 0)
);
CREATE INDEX "GamePrizeCatalogItem_prizeId_idx" ON "GamePrizeCatalogItem"("prizeId");
ALTER TABLE "GameIssuance" ADD COLUMN "catalogDay" TEXT;
CREATE INDEX "GameIssuance_catalogDay_createdAt_idx" ON "GameIssuance"("catalogDay", "createdAt");
CREATE OR REPLACE FUNCTION game_issuance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."key" IS DISTINCT FROM OLD."key" OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash" OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR NEW."catalogDay" IS DISTINCT FROM OLD."catalogDay" OR (NEW."batchId" IS NOT NULL AND NEW."batchId" IS DISTINCT FROM OLD."batchId") THEN RAISE EXCEPTION 'Issuance evidence is immutable'; END IF; RETURN NEW; END $$;
COMMIT;
