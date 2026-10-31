-- Additive migration. Capture only the state available at migration time;
-- earlier unrecorded edits cannot be reconstructed.
BEGIN;
ALTER TABLE "TriviaQuestionSet" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'PUBLIC', ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "TriviaQuestionSet" ADD CONSTRAINT "TriviaQuestionSet_audience_check" CHECK ("audience" IN ('PUBLIC','INTERNAL'));
ALTER TABLE "CommitmentAssignment" ADD COLUMN "revisionId" TEXT;
CREATE TABLE "InternalNewsRevision" (
 "id" TEXT NOT NULL PRIMARY KEY, "questionSetId" TEXT NOT NULL,
 "version" INTEGER NOT NULL, "snapshot" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "InternalNewsRevision_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "TriviaQuestionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InternalNewsRevision_questionSetId_version_key" ON "InternalNewsRevision"("questionSetId", "version");
CREATE INDEX "TriviaQuestionSet_audience_active_idx" ON "TriviaQuestionSet"("audience","active");
CREATE INDEX "CommitmentAssignment_revisionId_idx" ON "CommitmentAssignment"("revisionId");
UPDATE "TriviaQuestionSet" s SET "audience"='INTERNAL'
WHERE NULLIF(TRIM(s."regulationContent"),'') IS NOT NULL OR EXISTS (SELECT 1 FROM "CommitmentAssignment" a WHERE a."questionSetId"=s.id);
INSERT INTO "InternalNewsRevision" (id,"questionSetId",version,snapshot)
SELECT 'legacy-news-'||s.id,s.id,1,jsonb_build_object(
'id',s.id,'name',s.name,'description',s.description,'regulationContent',s."regulationContent",
'questions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'question',q.question,'order',q."order",'pointsForCorrect',q."pointsForCorrect",'pointsForIncorrect',q."pointsForIncorrect",
'answers',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'answer',a.answer,'isCorrect',a."isCorrect",'order',a."order") ORDER BY a."order",a.id) FROM "TriviaAnswer" a WHERE a."questionId"=q.id),'[]'::jsonb)) ORDER BY q."order",q.id)
FROM "TriviaQuestion" q WHERE q."questionSetId"=s.id AND q.active),'[]'::jsonb))
FROM "TriviaQuestionSet" s WHERE EXISTS (SELECT 1 FROM "CommitmentAssignment" a WHERE a."questionSetId"=s.id);
UPDATE "CommitmentAssignment" a SET "revisionId"=r.id FROM "InternalNewsRevision" r WHERE r."questionSetId"=a."questionSetId" AND r.version=1;
ALTER TABLE "CommitmentAssignment" ADD CONSTRAINT "CommitmentAssignment_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "InternalNewsRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Immutable content and references: status/completion remain updateable.
CREATE FUNCTION internal_news_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Internal news revisions are immutable'; END $$;
CREATE TRIGGER internal_news_revision_immutable BEFORE UPDATE OR DELETE ON "InternalNewsRevision" FOR EACH ROW EXECUTE FUNCTION internal_news_revision_immutable();
CREATE FUNCTION internal_news_assignment_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD."revisionId" IS NOT NULL AND (NEW."revisionId" IS DISTINCT FROM OLD."revisionId" OR NEW."questionSetId" IS DISTINCT FROM OLD."questionSetId" OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."mandatory" IS DISTINCT FROM OLD."mandatory" OR NEW."includeTrivia" IS DISTINCT FROM OLD."includeTrivia") THEN RAISE EXCEPTION 'Assigned news content is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER internal_news_assignment_revision_immutable BEFORE UPDATE ON "CommitmentAssignment" FOR EACH ROW EXECUTE FUNCTION internal_news_assignment_revision_immutable();
COMMIT;
