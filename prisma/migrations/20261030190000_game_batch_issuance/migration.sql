BEGIN;
ALTER TABLE "Prize" ADD COLUMN "gameEnabled" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "staticEnabled" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "GameIssuance" ("key" TEXT NOT NULL PRIMARY KEY,"requestHash" TEXT NOT NULL,"batchId" TEXT,"snapshot" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "GameIssuance_batchId_fkey" FOREIGN KEY("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE);
CREATE UNIQUE INDEX "GameIssuance_batchId_key" ON "GameIssuance"("batchId");
CREATE FUNCTION game_issuance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."key" IS DISTINCT FROM OLD."key" OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash" OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR (NEW."batchId" IS NOT NULL AND NEW."batchId" IS DISTINCT FROM OLD."batchId") THEN RAISE EXCEPTION 'Issuance evidence is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER game_issuance_immutable BEFORE UPDATE ON "GameIssuance" FOR EACH ROW EXECUTE FUNCTION game_issuance_immutable();
COMMIT;
