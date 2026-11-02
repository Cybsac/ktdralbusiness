BEGIN;
-- The lock closes the gap between the historical import and installing the capture triggers.
LOCK TABLE "Token", "ReusableTokenRedemption" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE "ActivityCredit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "voidedAt" TIMESTAMP(3)
);
CREATE INDEX "ActivityCredit_userId_voidedAt_occurredAt_idx" ON "ActivityCredit"("userId", "voidedAt", "occurredAt");
CREATE TABLE "ActivityBalance" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "total" INTEGER NOT NULL DEFAULT 0 CHECK ("total" >= 0)
);

CREATE TABLE "ActivityMilestone" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "threshold" INTEGER NOT NULL UNIQUE CHECK ("threshold" > 0),
  "points" INTEGER NOT NULL CHECK ("points" >= 0),
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ActivityMilestoneAward" (
  "userId" TEXT NOT NULL,
  "milestoneId" TEXT NOT NULL REFERENCES "ActivityMilestone"("id") ON DELETE RESTRICT,
  "threshold" INTEGER NOT NULL,
  "points" INTEGER NOT NULL,
  "earnedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  PRIMARY KEY ("userId", "milestoneId")
);
CREATE INDEX "ActivityMilestoneAward_userId_revokedAt_idx" ON "ActivityMilestoneAward"("userId", "revokedAt");

INSERT INTO "ActivityMilestone" ("id", "threshold", "points") VALUES
  ('initial-50', 50, 5), ('initial-100', 100, 5), ('initial-200', 200, 10),
  ('initial-500', 500, 30), ('initial-1000', 1000, 50);

INSERT INTO "ActivityCredit" ("id", "userId", "source", "occurredAt")
SELECT 'reusable:' || r."id", r."userId", 'reusable', r."createdAt"
FROM "ReusableTokenRedemption" r JOIN "User" u ON u."id" = r."userId"
WHERE r."userId" IS NOT NULL AND r."type" IN ('deliver', 'redeem');

INSERT INTO "ActivityCredit" ("id", "userId", "source", "occurredAt")
SELECT 'token:' || t."id", t."deliveredByUserId",
  CASE WHEN b."staticTargetUrl" IS NULL THEN 'roulette' ELSE 'interactive' END, t."deliveredAt"
FROM "Token" t JOIN "Batch" b ON b."id" = t."batchId" JOIN "User" u ON u."id" = t."deliveredByUserId"
WHERE t."deliveredAt" IS NOT NULL AND t."deliveredByUserId" IS NOT NULL
  AND (b."staticTargetUrl" IS NOT NULL OR b."isReusable" = FALSE);

INSERT INTO "ActivityBalance" ("userId", "total")
SELECT "userId", COUNT(*)::int FROM "ActivityCredit" WHERE "voidedAt" IS NULL GROUP BY "userId";

-- Historical awards use the time of the actual operation that reached the threshold.
WITH ordered AS (
  SELECT "userId", "occurredAt",
    ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "occurredAt", "id") AS n
  FROM "ActivityCredit" WHERE "voidedAt" IS NULL
)
INSERT INTO "ActivityMilestoneAward" ("userId", "milestoneId", "threshold", "points", "earnedAt")
SELECT o."userId", m."id", m."threshold", m."points", o."occurredAt"
FROM ordered o JOIN "ActivityMilestone" m ON o.n = m."threshold" WHERE m."enabled";

CREATE FUNCTION activity_refresh_awards(p_user TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE n BIGINT;
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('activity-milestone-policy', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('activity-user:' || p_user, 0));
  SELECT COALESCE((SELECT "total" FROM "ActivityBalance" WHERE "userId" = p_user), 0) INTO n;
  UPDATE "ActivityMilestoneAward" SET "revokedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = p_user AND "revokedAt" IS NULL AND "threshold" > n;
  UPDATE "ActivityMilestoneAward" SET "revokedAt" = NULL
    WHERE "userId" = p_user AND "revokedAt" IS NOT NULL AND "threshold" <= n;
  INSERT INTO "ActivityMilestoneAward" ("userId", "milestoneId", "threshold", "points", "earnedAt")
  SELECT p_user, m."id", m."threshold", m."points", CURRENT_TIMESTAMP
  FROM "ActivityMilestone" m WHERE m."enabled" AND m."threshold" <= n
  ON CONFLICT ("userId", "milestoneId") DO NOTHING;
END $$;

CREATE FUNCTION activity_credit_changed() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('activity-milestone-policy', 0));
  IF TG_OP = 'UPDATE' AND OLD."userId" <> NEW."userId" THEN
    -- Stable lock order when an operation is reassigned.
    PERFORM pg_advisory_xact_lock(hashtextextended('activity-user:' || LEAST(OLD."userId", NEW."userId"), 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('activity-user:' || GREATEST(OLD."userId", NEW."userId"), 0));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('activity-user:' || NEW."userId", 0));
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."voidedAt" IS NULL THEN
      INSERT INTO "ActivityBalance" ("userId", "total") VALUES (NEW."userId", 1)
      ON CONFLICT ("userId") DO UPDATE SET "total" = "ActivityBalance"."total" + 1;
    END IF;
  ELSE
    IF OLD."voidedAt" IS NULL AND (NEW."voidedAt" IS NOT NULL OR OLD."userId" <> NEW."userId") THEN
      UPDATE "ActivityBalance" SET "total" = "total" - 1 WHERE "userId" = OLD."userId";
    END IF;
    IF NEW."voidedAt" IS NULL AND (OLD."voidedAt" IS NOT NULL OR OLD."userId" <> NEW."userId") THEN
      INSERT INTO "ActivityBalance" ("userId", "total") VALUES (NEW."userId", 1)
      ON CONFLICT ("userId") DO UPDATE SET "total" = "ActivityBalance"."total" + 1;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."userId" <> NEW."userId" THEN
    PERFORM activity_refresh_awards(OLD."userId");
  END IF;
  PERFORM activity_refresh_awards(NEW."userId");
  RETURN NEW;
END $$;
CREATE TRIGGER activity_credit_awards AFTER INSERT OR UPDATE OF "userId", "voidedAt" ON "ActivityCredit"
FOR EACH ROW EXECUTE FUNCTION activity_credit_changed();

CREATE FUNCTION activity_capture_reusable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."userId" IS NOT NULL AND NEW."type" IN ('deliver', 'redeem') AND EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."userId") THEN
    INSERT INTO "ActivityCredit" ("id", "userId", "source", "occurredAt")
    VALUES ('reusable:' || NEW."id", NEW."userId", 'reusable', NEW."createdAt")
    ON CONFLICT ("id") DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activity_reusable_insert AFTER INSERT ON "ReusableTokenRedemption"
FOR EACH ROW EXECUTE FUNCTION activity_capture_reusable();

CREATE FUNCTION activity_capture_token() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE batch_row RECORD;
BEGIN
  IF NEW."deliveredAt" IS NULL OR NEW."deliveredByUserId" IS NULL OR NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."deliveredByUserId") THEN
    UPDATE "ActivityCredit" SET "voidedAt" = CURRENT_TIMESTAMP WHERE "id" = 'token:' || NEW."id" AND "voidedAt" IS NULL;
  ELSE
    SELECT "staticTargetUrl", "isReusable" INTO batch_row FROM "Batch" WHERE "id" = NEW."batchId";
    IF FOUND AND (batch_row."staticTargetUrl" IS NOT NULL OR batch_row."isReusable" = FALSE) THEN
      INSERT INTO "ActivityCredit" ("id", "userId", "source", "occurredAt", "voidedAt")
      VALUES ('token:' || NEW."id", NEW."deliveredByUserId",
        CASE WHEN batch_row."staticTargetUrl" IS NULL THEN 'roulette' ELSE 'interactive' END,
        NEW."deliveredAt", NULL)
      ON CONFLICT ("id") DO UPDATE SET "userId" = EXCLUDED."userId", "source" = EXCLUDED."source",
        "occurredAt" = EXCLUDED."occurredAt", "voidedAt" = NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activity_token_insert AFTER INSERT ON "Token"
FOR EACH ROW EXECUTE FUNCTION activity_capture_token();
CREATE TRIGGER activity_token_update AFTER UPDATE OF "deliveredAt", "deliveredByUserId" ON "Token"
FOR EACH ROW WHEN (OLD."deliveredAt" IS DISTINCT FROM NEW."deliveredAt" OR OLD."deliveredByUserId" IS DISTINCT FROM NEW."deliveredByUserId")
EXECUTE FUNCTION activity_capture_token();
COMMIT;
