-- CreateEnum
CREATE TYPE "RookieDraftOrder" AS ENUM ('REVERSE_STANDINGS', 'REVERSE_STANDINGS_SNAKE', 'KEEP_ORDER');

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "isRookieDraft" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "rookieDraftOrder" "RookieDraftOrder" NOT NULL DEFAULT 'REVERSE_STANDINGS',
ADD COLUMN     "rookieDraftRounds" INTEGER NOT NULL DEFAULT 3;
