CREATE TABLE IF NOT EXISTS "GiftCatalog" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "assetKey" TEXT NOT NULL,
    "coinCost" INTEGER NOT NULL DEFAULT 100,
    "exchangeRateBps" INTEGER NOT NULL DEFAULT 7000,
    "rarity" TEXT NOT NULL DEFAULT 'common',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlayerGiftInventory" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "giftCatalogId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "receivedCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "exchangedCount" INTEGER NOT NULL DEFAULT 0,
    "lastReceivedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerGiftInventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GiftTransaction" (
    "id" TEXT NOT NULL,
    "senderPlayerId" TEXT NOT NULL,
    "recipientPlayerId" TEXT NOT NULL,
    "giftCatalogId" TEXT NOT NULL,
    "giftKeySnapshot" TEXT NOT NULL,
    "giftNameSnapshot" TEXT NOT NULL,
    "assetKeySnapshot" TEXT NOT NULL,
    "coinCost" INTEGER NOT NULL,
    "exchangeValue" INTEGER NOT NULL,
    "contextType" TEXT NOT NULL DEFAULT 'match',
    "contextId" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GiftCatalog_key_key" ON "GiftCatalog"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "GiftCatalog_assetKey_key" ON "GiftCatalog"("assetKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerGiftInventory_playerId_giftCatalogId_key" ON "PlayerGiftInventory"("playerId", "giftCatalogId");
CREATE INDEX IF NOT EXISTS "PlayerGiftInventory_playerId_updatedAt_idx" ON "PlayerGiftInventory"("playerId", "updatedAt");
CREATE INDEX IF NOT EXISTS "GiftTransaction_recipientPlayerId_createdAt_idx" ON "GiftTransaction"("recipientPlayerId", "createdAt");
CREATE INDEX IF NOT EXISTS "GiftTransaction_senderPlayerId_createdAt_idx" ON "GiftTransaction"("senderPlayerId", "createdAt");
CREATE INDEX IF NOT EXISTS "GiftTransaction_giftCatalogId_createdAt_idx" ON "GiftTransaction"("giftCatalogId", "createdAt");

ALTER TABLE "PlayerGiftInventory" ADD CONSTRAINT "PlayerGiftInventory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerGiftInventory" ADD CONSTRAINT "PlayerGiftInventory_giftCatalogId_fkey" FOREIGN KEY ("giftCatalogId") REFERENCES "GiftCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftTransaction" ADD CONSTRAINT "GiftTransaction_senderPlayerId_fkey" FOREIGN KEY ("senderPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftTransaction" ADD CONSTRAINT "GiftTransaction_recipientPlayerId_fkey" FOREIGN KEY ("recipientPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftTransaction" ADD CONSTRAINT "GiftTransaction_giftCatalogId_fkey" FOREIGN KEY ("giftCatalogId") REFERENCES "GiftCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
