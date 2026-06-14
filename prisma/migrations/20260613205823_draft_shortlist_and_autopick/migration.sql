-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "autoPickEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DraftShortlist" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,

    CONSTRAINT "DraftShortlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftShortlist_draftId_teamId_playerId_key" ON "DraftShortlist"("draftId", "teamId", "playerId");

-- AddForeignKey
ALTER TABLE "DraftShortlist" ADD CONSTRAINT "DraftShortlist_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
