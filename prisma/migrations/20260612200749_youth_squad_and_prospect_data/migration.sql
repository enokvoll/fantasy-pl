-- AlterEnum
ALTER TYPE "SlotType" ADD VALUE 'YOUTH';

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "isYouthDraft" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "youthDraftRounds" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "youthSlots" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "youthSquadEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "starts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RosterSlot" ADD COLUMN     "developedByTeamId" TEXT,
ADD COLUMN     "developmentBonus" BOOLEAN NOT NULL DEFAULT false;
