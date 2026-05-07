-- CreateEnum
CREATE TYPE "CoinLedgerType" AS ENUM ('grant', 'spend', 'reserve', 'release', 'payout', 'refund', 'daily_bonus', 'quest_reward', 'achievement_reward', 'tournament_entry', 'tournament_prize', 'admin_adjustment', 'shop_purchase', 'ad_reward');

-- CreateEnum
CREATE TYPE "CoinStakeStatus" AS ENUM ('reserved', 'settled', 'refunded', 'canceled');

-- CreateEnum
CREATE TYPE "CoinTournamentEntryStatus" AS ENUM ('registered', 'active', 'eliminated', 'refunded', 'paid');

-- CreateTable
CREATE TABLE "CoinEconomyConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "dailyBaseAmount" INTEGER NOT NULL DEFAULT 25,
    "dailyStreakBonus" INTEGER NOT NULL DEFAULT 5,
    "dailyMaxStreak" INTEGER NOT NULL DEFAULT 7,
    "dailyClaimCooldown" INTEGER NOT NULL DEFAULT 20,
    "matchCommissionBps" INTEGER NOT NULL DEFAULT 500,
    "tournamentCommissionBps" INTEGER NOT NULL DEFAULT 1000,
    "adRewardAmount" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinEconomyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinWallet" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
    "lifetimeSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinLedgerEntry" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" "CoinLedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reservedBefore" INTEGER NOT NULL DEFAULT 0,
    "reservedAfter" INTEGER NOT NULL DEFAULT 0,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "note" TEXT,
    "payloadJson" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinDailyBonusClaim" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "claimDate" TEXT NOT NULL,
    "streakDay" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinDailyBonusClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinQuest" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rewardAmount" INTEGER NOT NULL DEFAULT 0,
    "maxProgress" INTEGER NOT NULL DEFAULT 1,
    "period" TEXT NOT NULL DEFAULT 'once',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinQuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinQuestProgress" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'active',
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinQuestProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinStakeTable" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stakeAmount" INTEGER NOT NULL DEFAULT 0,
    "commissionBps" INTEGER NOT NULL DEFAULT 500,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinStakeTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinMatchStake" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "matchId" TEXT,
    "playerId" TEXT NOT NULL,
    "stakeTableId" TEXT NOT NULL,
    "stakeAmount" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "CoinStakeStatus" NOT NULL DEFAULT 'reserved',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinMatchStake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinTournament" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "entryFee" INTEGER NOT NULL DEFAULT 0,
    "prizePool" INTEGER NOT NULL DEFAULT 0,
    "commissionBps" INTEGER NOT NULL DEFAULT 1000,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinTournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinTournamentEntry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "CoinTournamentEntryStatus" NOT NULL DEFAULT 'registered',
    "entryFee" INTEGER NOT NULL DEFAULT 0,
    "payoutAmount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinTournamentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoinEconomyConfig_key_key" ON "CoinEconomyConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CoinWallet_playerId_key" ON "CoinWallet"("playerId");

-- CreateIndex
CREATE INDEX "CoinLedgerEntry_playerId_createdAt_idx" ON "CoinLedgerEntry"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "CoinLedgerEntry_referenceType_referenceId_idx" ON "CoinLedgerEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "CoinLedgerEntry_idempotencyKey_key" ON "CoinLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CoinDailyBonusClaim_playerId_claimDate_key" ON "CoinDailyBonusClaim"("playerId", "claimDate");

-- CreateIndex
CREATE UNIQUE INDEX "CoinQuest_key_key" ON "CoinQuest"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CoinQuestProgress_playerId_questId_key" ON "CoinQuestProgress"("playerId", "questId");

-- CreateIndex
CREATE UNIQUE INDEX "CoinStakeTable_key_key" ON "CoinStakeTable"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CoinMatchStake_roomId_playerId_stakeTableId_key" ON "CoinMatchStake"("roomId", "playerId", "stakeTableId");

-- CreateIndex
CREATE INDEX "CoinMatchStake_roomId_status_idx" ON "CoinMatchStake"("roomId", "status");

-- CreateIndex
CREATE INDEX "CoinMatchStake_matchId_idx" ON "CoinMatchStake"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "CoinTournament_key_key" ON "CoinTournament"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CoinTournamentEntry_tournamentId_playerId_key" ON "CoinTournamentEntry"("tournamentId", "playerId");

-- AddForeignKey
ALTER TABLE "CoinWallet" ADD CONSTRAINT "CoinWallet_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinLedgerEntry" ADD CONSTRAINT "CoinLedgerEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinLedgerEntry" ADD CONSTRAINT "CoinLedgerEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinDailyBonusClaim" ADD CONSTRAINT "CoinDailyBonusClaim_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinQuestProgress" ADD CONSTRAINT "CoinQuestProgress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinQuestProgress" ADD CONSTRAINT "CoinQuestProgress_questId_fkey" FOREIGN KEY ("questId") REFERENCES "CoinQuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinMatchStake" ADD CONSTRAINT "CoinMatchStake_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinMatchStake" ADD CONSTRAINT "CoinMatchStake_stakeTableId_fkey" FOREIGN KEY ("stakeTableId") REFERENCES "CoinStakeTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinTournamentEntry" ADD CONSTRAINT "CoinTournamentEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "CoinTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinTournamentEntry" ADD CONSTRAINT "CoinTournamentEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerEntitlement" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_key_key" ON "CatalogProduct"("key");

-- CreateIndex
CREATE INDEX "CatalogPrice_productId_idx" ON "CatalogPrice"("productId");

-- CreateIndex
CREATE INDEX "CatalogPrice_currency_idx" ON "CatalogPrice"("currency");

-- CreateIndex
CREATE INDEX "Order_playerId_idx" ON "Order"("playerId");

-- CreateIndex
CREATE INDEX "Order_productId_idx" ON "Order"("productId");

-- CreateIndex
CREATE INDEX "Order_priceId_idx" ON "Order"("priceId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerEntitlement_playerId_productKey_key" ON "PlayerEntitlement"("playerId", "productKey");

-- AddForeignKey
ALTER TABLE "CatalogPrice" ADD CONSTRAINT "CatalogPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "CatalogPrice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerEntitlement" ADD CONSTRAINT "PlayerEntitlement_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
