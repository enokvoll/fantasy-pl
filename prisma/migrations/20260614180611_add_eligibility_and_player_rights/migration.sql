-- CreateEnum
CREATE TYPE "PlayerRightsStatus" AS ENUM ('HELD', 'AVAILABLE_TO_RESIGN');

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "departedAt" TIMESTAMP(3),
ADD COLUMN     "inFplPool" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "secondaryPositions" "Position"[] DEFAULT ARRAY[]::"Position"[];

-- CreateTable
CREATE TABLE "LeaguePlayerEligibility" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "positions" "Position"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaguePlayerEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRights" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "status" "PlayerRightsStatus" NOT NULL DEFAULT 'HELD',
    "reason" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaguePlayerEligibility_leagueId_idx" ON "LeaguePlayerEligibility"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaguePlayerEligibility_leagueId_playerId_key" ON "LeaguePlayerEligibility"("leagueId", "playerId");

-- CreateIndex
CREATE INDEX "PlayerRights_leagueId_status_idx" ON "PlayerRights"("leagueId", "status");

-- CreateIndex
CREATE INDEX "PlayerRights_teamId_idx" ON "PlayerRights"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRights_leagueId_playerId_key" ON "PlayerRights"("leagueId", "playerId");

-- AddForeignKey
ALTER TABLE "LeaguePlayerEligibility" ADD CONSTRAINT "LeaguePlayerEligibility_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePlayerEligibility" ADD CONSTRAINT "LeaguePlayerEligibility_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRights" ADD CONSTRAINT "PlayerRights_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRights" ADD CONSTRAINT "PlayerRights_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRights" ADD CONSTRAINT "PlayerRights_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
