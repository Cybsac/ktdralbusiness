CREATE TABLE "BirthdayPackCatalog" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "snapshot" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
INSERT INTO "BirthdayPackCatalog" (id,snapshot,"updatedAt")
 SELECT 'default',COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb),CURRENT_TIMESTAMP FROM "BirthdayPack" p;

CREATE TABLE "BirthdayStorageCleanup" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "storageKey" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "lastError" TEXT
);
CREATE UNIQUE INDEX "BirthdayStorageCleanup_storageKey_key" ON "BirthdayStorageCleanup"("storageKey");
CREATE INDEX "BirthdayStorageCleanup_nextAttemptAt_idx" ON "BirthdayStorageCleanup"("nextAttemptAt");
