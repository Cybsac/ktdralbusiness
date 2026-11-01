ALTER TABLE "ReusableToken" ADD COLUMN "generationKey" TEXT, ADD COLUMN "generationHash" TEXT;
CREATE UNIQUE INDEX "ReusableToken_generationKey_key" ON "ReusableToken"("generationKey");
ALTER TABLE "ReusableTokenRedemption" ADD COLUMN "operationKey" TEXT;
CREATE UNIQUE INDEX "ReusableTokenRedemption_tokenId_operationKey_key" ON "ReusableTokenRedemption"("tokenId","operationKey");
