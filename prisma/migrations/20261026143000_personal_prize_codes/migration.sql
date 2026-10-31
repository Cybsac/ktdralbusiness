-- Adds personal credentials. Existing tokens, prizes and redemption histories are untouched.
CREATE TABLE "PrizeAuthorizationCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "secret" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrizeAuthorizationCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrizeAuthorizationCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PrizeAuthorizationCredential_userId_key" ON "PrizeAuthorizationCredential"("userId");
CREATE TABLE "PrizeAuthorizationCode" (
  "credentialId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "configRevision" INTEGER NOT NULL,
  "credentialRevision" INTEGER NOT NULL,
  "nonce" INTEGER NOT NULL,
  CONSTRAINT "PrizeAuthorizationCode_pkey" PRIMARY KEY ("credentialId"),
  CONSTRAINT "PrizeAuthorizationCode_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "PrizeAuthorizationCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PrizeAuthorizationCode_codeHash_key" ON "PrizeAuthorizationCode"("codeHash");
