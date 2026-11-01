CREATE TABLE "InvitationTemplateAsset" (
 "id" TEXT NOT NULL,
 "storageKey" TEXT NOT NULL,
 "url" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "nextCheckAt" TIMESTAMP(3) NOT NULL,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "lastError" TEXT,
 CONSTRAINT "InvitationTemplateAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvitationTemplateAsset_storageKey_key" ON "InvitationTemplateAsset"("storageKey");
CREATE UNIQUE INDEX "InvitationTemplateAsset_url_key" ON "InvitationTemplateAsset"("url");
CREATE INDEX "InvitationTemplateAsset_nextCheckAt_idx" ON "InvitationTemplateAsset"("nextCheckAt");
