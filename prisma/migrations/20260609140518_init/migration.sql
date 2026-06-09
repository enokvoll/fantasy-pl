-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('AVAILABLE', 'DOUBTFUL', 'SUSPENDED', 'INJURED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'DEF', 'MID', 'FWD');

-- CreateEnum
CREATE TYPE "LeagueType" AS ENUM ('REDRAFT', 'KEEPER', 'DYNASTY');

-- CreateEnum
CREATE TYPE "ScoringType" AS ENUM ('H2H', 'ROTO', 'TOTAL_POINTS');

-- CreateEnum
CREATE TYPE "LeagueStatus" AS ENUM ('SETUP', 'DRAFTING', 'IN_SEASON', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DraftType" AS ENUM ('SNAKE', 'AUCTION', 'SLOW');

-- CreateEnum
CREATE TYPE "WaiverType" AS ENUM ('FAAB', 'ROLLING', 'REVERSE_STANDINGS', 'CONTINUOUS', 'FREE_AGENT');

-- CreateEnum
CREATE TYPE "SlotType" AS ENUM ('STARTER', 'BENCH', 'IR');

-- CreateEnum
CREATE TYPE "AcquireType" AS ENUM ('DRAFT', 'WAIVER', 'FREE_AGENT', 'TRADE');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WaiverRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'VETOED', 'PROCESSING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('APPROVE', 'VETO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "FplTeam" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "code" INTEGER NOT NULL,

    CONSTRAINT "FplTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" INTEGER NOT NULL,
    "webName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "position" "Position" NOT NULL,
    "fplTeamId" INTEGER NOT NULL,
    "nowCost" INTEGER NOT NULL,
    "status" "PlayerStatus" NOT NULL DEFAULT 'AVAILABLE',
    "photo" TEXT,
    "news" TEXT,
    "chancePlayingNextRound" INTEGER,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "form" TEXT DEFAULT '0.0',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" INTEGER NOT NULL,
    "gameweekId" INTEGER NOT NULL,
    "kickoffTime" TIMESTAMP(3),
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "homeTeamScore" INTEGER,
    "awayTeamScore" INTEGER,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "finished" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameWeek" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "deadlineTime" TIMESTAMP(3) NOT NULL,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "dataChecked" BOOLEAN NOT NULL DEFAULT false,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isNext" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GameWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerGameweekStat" (
    "id" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "gameweekId" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "goalsScored" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "cleanSheets" INTEGER NOT NULL DEFAULT 0,
    "goalsConceded" INTEGER NOT NULL DEFAULT 0,
    "ownGoals" INTEGER NOT NULL DEFAULT 0,
    "penaltiesSaved" INTEGER NOT NULL DEFAULT 0,
    "penaltiesMissed" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "bonus" INTEGER NOT NULL DEFAULT 0,
    "bps" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "inDreamteam" BOOLEAN NOT NULL DEFAULT false,
    "rawExplain" JSONB,

    CONSTRAINT "PlayerGameweekStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "type" "LeagueType" NOT NULL DEFAULT 'REDRAFT',
    "scoringType" "ScoringType" NOT NULL DEFAULT 'H2H',
    "status" "LeagueStatus" NOT NULL DEFAULT 'SETUP',
    "maxTeams" INTEGER NOT NULL DEFAULT 12,
    "season" TEXT NOT NULL,
    "draftType" "DraftType" NOT NULL DEFAULT 'SNAKE',
    "draftDate" TIMESTAMP(3),
    "draftPickTimeSeconds" INTEGER NOT NULL DEFAULT 90,
    "slowDraftHoursPerPick" INTEGER,
    "rosterConfig" JSONB NOT NULL,
    "scoringConfig" JSONB,
    "waiverType" "WaiverType" NOT NULL DEFAULT 'ROLLING',
    "faabBudget" INTEGER,
    "waiverDay" INTEGER,
    "waiverProcessTime" TEXT,
    "keeperSlots" INTEGER NOT NULL DEFAULT 0,
    "contractYears" BOOLEAN NOT NULL DEFAULT false,
    "tradeDeadlineGameweek" INTEGER,
    "playoffStartGameweek" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "draftOrder" INTEGER,
    "waiverPriority" INTEGER,
    "faabBalance" INTEGER,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "pointsFor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pointsAgainst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterSlot" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" INTEGER,
    "slotType" "SlotType" NOT NULL DEFAULT 'STARTER',
    "position" "Position",
    "lineupPosition" INTEGER,
    "isStarting" BOOLEAN NOT NULL DEFAULT false,
    "isOnTradeBlock" BOOLEAN NOT NULL DEFAULT false,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acquireType" "AcquireType" NOT NULL DEFAULT 'DRAFT',
    "contractYear" INTEGER,
    "keeperRound" INTEGER,
    "dynastyYearsOwned" INTEGER,

    CONSTRAINT "RosterSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING',
    "currentPick" INTEGER NOT NULL DEFAULT 0,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "pickInRound" INTEGER NOT NULL,
    "overallPick" INTEGER NOT NULL,
    "ownerTeamId" TEXT NOT NULL,
    "originalTeamId" TEXT NOT NULL,
    "playerId" INTEGER,
    "isAutoPick" BOOLEAN NOT NULL DEFAULT false,
    "pickedAt" TIMESTAMP(3),

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPickSlot" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "isConditional" BOOLEAN NOT NULL DEFAULT false,
    "condition" TEXT,

    CONSTRAINT "DraftPickSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftQueue" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,

    CONSTRAINT "DraftQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftMessage" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matchup" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "gameweekId" INTEGER NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT,
    "homeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "awayScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Matchup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamGameweekScore" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "gameweekId" INTEGER NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "breakdown" JSONB,

    CONSTRAINT "TeamGameweekScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaiverRun" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "gameweekId" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3),
    "status" "WaiverRunStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "WaiverRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaiverClaim" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "waiverRunId" TEXT,
    "targetPlayerId" INTEGER NOT NULL,
    "dropPlayerId" INTEGER,
    "faabBid" INTEGER,
    "priority" INTEGER,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaiverClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "offeringTeamId" TEXT NOT NULL,
    "receivingTeamId" TEXT NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "isMultiTeam" BOOLEAN NOT NULL DEFAULT false,
    "votesRequired" INTEGER NOT NULL DEFAULT 0,
    "votesFor" INTEGER NOT NULL DEFAULT 0,
    "votesAgainst" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "adminOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeAsset" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "fromTeamId" TEXT NOT NULL,
    "toTeamId" TEXT NOT NULL,
    "playerId" INTEGER,
    "draftPickSlotId" TEXT,

    CONSTRAINT "TradeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeVote" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "vote" "VoteChoice" NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueMessage" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameweekStat_playerId_gameweekId_key" ON "PlayerGameweekStat"("playerId", "gameweekId");

-- CreateIndex
CREATE UNIQUE INDEX "League_inviteCode_key" ON "League"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "Team_userId_leagueId_key" ON "Team"("userId", "leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_leagueId_key" ON "Draft"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftQueue_draftId_teamId_playerId_key" ON "DraftQueue"("draftId", "teamId", "playerId");

-- CreateIndex
CREATE INDEX "DraftMessage_draftId_idx" ON "DraftMessage"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "Matchup_leagueId_gameweekId_homeTeamId_key" ON "Matchup"("leagueId", "gameweekId", "homeTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamGameweekScore_teamId_gameweekId_key" ON "TeamGameweekScore"("teamId", "gameweekId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeVote_tradeId_userId_key" ON "TradeVote"("tradeId", "userId");

-- CreateIndex
CREATE INDEX "LeagueMessage_leagueId_createdAt_idx" ON "LeagueMessage"("leagueId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_fplTeamId_fkey" FOREIGN KEY ("fplTeamId") REFERENCES "FplTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "GameWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "FplTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "FplTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameweekStat" ADD CONSTRAINT "PlayerGameweekStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameweekStat" ADD CONSTRAINT "PlayerGameweekStat_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "GameWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_originalTeamId_fkey" FOREIGN KEY ("originalTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPickSlot" ADD CONSTRAINT "DraftPickSlot_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPickSlot" ADD CONSTRAINT "DraftPickSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftQueue" ADD CONSTRAINT "DraftQueue_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftMessage" ADD CONSTRAINT "DraftMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "GameWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverRun" ADD CONSTRAINT "WaiverRun_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverRun" ADD CONSTRAINT "WaiverRun_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "GameWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_targetPlayerId_fkey" FOREIGN KEY ("targetPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_dropPlayerId_fkey" FOREIGN KEY ("dropPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_waiverRunId_fkey" FOREIGN KEY ("waiverRunId") REFERENCES "WaiverRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_offeringTeamId_fkey" FOREIGN KEY ("offeringTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_receivingTeamId_fkey" FOREIGN KEY ("receivingTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_draftPickSlotId_fkey" FOREIGN KEY ("draftPickSlotId") REFERENCES "DraftPickSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeVote" ADD CONSTRAINT "TradeVote_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeVote" ADD CONSTRAINT "TradeVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeVote" ADD CONSTRAINT "TradeVote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMessage" ADD CONSTRAINT "LeagueMessage_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMessage" ADD CONSTRAINT "LeagueMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
