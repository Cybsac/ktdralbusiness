BEGIN;
-- Consolidate outstanding quantities without changing prizes, lots or tokens.
CREATE TABLE "GamePrizeCatalogItem_next" (
 "prizeId" TEXT NOT NULL,
 "stock" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "GamePrizeCatalogItem_next_pkey" PRIMARY KEY ("prizeId"),
 CONSTRAINT "GamePrizeCatalogItem_next_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "GamePrizeCatalogItem_next_stock_check" CHECK ("stock" IS NULL OR "stock">=0)
);
INSERT INTO "GamePrizeCatalogItem_next" ("prizeId","stock","createdAt","updatedAt")
 SELECT "prizeId",CASE WHEN count(*) FILTER (WHERE stock IS NULL)>0 THEN NULL ELSE sum(stock)::integer END,min("createdAt"),max("updatedAt")
 FROM "GamePrizeCatalogItem" GROUP BY "prizeId";
-- Each old issuance already retains its original preparation date in immutable JSON.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "GameIssuance" WHERE "catalogDay" IS NOT NULL AND snapshot->>'catalogDay' IS DISTINCT FROM "catalogDay")
 THEN RAISE EXCEPTION 'Issuance provenance must be preserved before removing the obsolete date'; END IF;
END $$;
CREATE OR REPLACE FUNCTION game_issuance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."key" IS DISTINCT FROM OLD."key" OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash" OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR (NEW."batchId" IS NOT NULL AND NEW."batchId" IS DISTINCT FROM OLD."batchId") THEN RAISE EXCEPTION 'Issuance evidence is immutable'; END IF; RETURN NEW; END $$;
ALTER TABLE "GameIssuance" DROP COLUMN "catalogDay";
DROP TABLE "GamePrizeCatalogItem";
ALTER TABLE "GamePrizeCatalogItem_next" RENAME TO "GamePrizeCatalogItem";
ALTER TABLE "GamePrizeCatalogItem" RENAME CONSTRAINT "GamePrizeCatalogItem_next_pkey" TO "GamePrizeCatalogItem_pkey";
ALTER TABLE "GamePrizeCatalogItem" RENAME CONSTRAINT "GamePrizeCatalogItem_next_prizeId_fkey" TO "GamePrizeCatalogItem_prizeId_fkey";
ALTER TABLE "GamePrizeCatalogItem" RENAME CONSTRAINT "GamePrizeCatalogItem_next_stock_check" TO "GamePrizeCatalogItem_stock_check";
COMMIT;
