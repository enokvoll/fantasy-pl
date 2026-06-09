-- CreateEnum
CREATE TYPE "TradeParticipantRole" AS ENUM ('PROPOSER', 'RECIPIENT');

-- CreateEnum
CREATE TYPE "TradeParticipantStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "TradeParticipant" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "TradeParticipantRole" NOT NULL DEFAULT 'RECIPIENT',
    "status" "TradeParticipantStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "TradeParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeParticipant_tradeId_teamId_key" ON "TradeParticipant"("tradeId", "teamId");

-- AddForeignKey
ALTER TABLE "TradeParticipant" ADD CONSTRAINT "TradeParticipant_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeParticipant" ADD CONSTRAINT "TradeParticipant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
