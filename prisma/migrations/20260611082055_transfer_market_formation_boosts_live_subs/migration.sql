-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('OPEN', 'SETTLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "TradeStatus" ADD VALUE 'COUNTERED';

-- AlterEnum
ALTER TYPE "WaiverType" ADD VALUE 'MARKETPLACE';

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "auctionAntiSnipeMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "auctionMinIncrement" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "auctionWindowHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "formationBoostConfig" JSONB;

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "counterOfTradeId" TEXT;

-- CreateTable
CREATE TABLE "TransferAuction" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'OPEN',
    "startedByTeamId" TEXT NOT NULL,
    "currentBid" INTEGER NOT NULL,
    "currentBidTeamId" TEXT,
    "minIncrement" INTEGER NOT NULL DEFAULT 1,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferAuction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferBid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dropPlayerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferAuction_leagueId_status_idx" ON "TransferAuction"("leagueId", "status");

-- CreateIndex
CREATE INDEX "TransferBid_auctionId_idx" ON "TransferBid"("auctionId");

-- AddForeignKey
ALTER TABLE "TransferAuction" ADD CONSTRAINT "TransferAuction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAuction" ADD CONSTRAINT "TransferAuction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAuction" ADD CONSTRAINT "TransferAuction_startedByTeamId_fkey" FOREIGN KEY ("startedByTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferBid" ADD CONSTRAINT "TransferBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "TransferAuction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferBid" ADD CONSTRAINT "TransferBid_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_counterOfTradeId_fkey" FOREIGN KEY ("counterOfTradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
