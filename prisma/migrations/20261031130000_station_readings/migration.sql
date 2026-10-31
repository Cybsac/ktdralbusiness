ALTER TABLE "StationTerminal" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
CREATE TABLE "StationReading" (
  "id" TEXT NOT NULL,
  "stationId" TEXT NOT NULL,
  "terminalId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "senderName" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  CONSTRAINT "StationReading_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StationReading_stationId_confirmedAt_createdAt_idx" ON "StationReading"("stationId", "confirmedAt", "createdAt");
ALTER TABLE "StationReading" ADD CONSTRAINT "StationReading_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "OperationStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
