BEGIN;

-- AlterEnum
ALTER TYPE "CoinLedgerType" ADD VALUE 'consume';

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "clientMessageId" TEXT;

-- CreateTable
CREATE TABLE "direct_message_thread" (
    "playerAId" TEXT NOT NULL,
    "playerBId" TEXT NOT NULL,
    "lastMessageId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "unreadCountA" INTEGER NOT NULL DEFAULT 0,
    "unreadCountB" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "fcm_token" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fcm_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "direct_message_thread_playerAId_lastMessageAt_idx" ON "direct_message_thread"("playerAId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "direct_message_thread_playerBId_lastMessageAt_idx" ON "direct_message_thread"("playerBId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "direct_message_thread_playerAId_playerBId_key" ON "direct_message_thread"("playerAId", "playerBId");

-- CreateIndex
CREATE UNIQUE INDEX "fcm_token_token_key" ON "fcm_token"("token");

-- CreateIndex
CREATE INDEX "fcm_token_playerId_idx" ON "fcm_token"("playerId");

-- CreateIndex
CREATE INDEX "DirectMessage_receiverPlayerId_readAt_idx" ON "DirectMessage"("receiverPlayerId", "readAt");

-- CreateIndex
CREATE INDEX "DirectMessage_createdAt_idx" ON "DirectMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DirectMessage_senderPlayerId_clientMessageId_key" ON "DirectMessage"("senderPlayerId", "clientMessageId");

-- CreateIndex
CREATE INDEX "Order_playerId_status_idx" ON "Order"("playerId", "status");

-- CreateIndex
CREATE INDEX "Payment_orderId_status_idx" ON "Payment"("orderId", "status");

-- CreateIndex
CREATE INDEX "PlayerBan_playerId_idx" ON "PlayerBan"("playerId");

-- CreateIndex
CREATE INDEX "PlayerReport_targetPlayerId_status_idx" ON "PlayerReport"("targetPlayerId", "status");

-- CreateIndex
CREATE INDEX "PlayerReport_reporterPlayerId_idx" ON "PlayerReport"("reporterPlayerId");

-- CreateIndex
CREATE INDEX "PlayerReport_matchId_idx" ON "PlayerReport"("matchId");

-- AddForeignKey
ALTER TABLE "direct_message_thread" ADD CONSTRAINT "direct_message_thread_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_thread" ADD CONSTRAINT "direct_message_thread_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_thread" ADD CONSTRAINT "direct_message_thread_lastMessageId_fkey" FOREIGN KEY ("lastMessageId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fcm_token" ADD CONSTRAINT "fcm_token_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Preserve existing conversations when switching thread reads to the new table.
WITH pairs AS (
  SELECT LEAST("senderPlayerId", "receiverPlayerId") AS a,
         GREATEST("senderPlayerId", "receiverPlayerId") AS b,
         COUNT(*) FILTER (WHERE "readAt" IS NULL AND "receiverPlayerId" = LEAST("senderPlayerId", "receiverPlayerId"))::INTEGER AS unread_a,
         COUNT(*) FILTER (WHERE "readAt" IS NULL AND "receiverPlayerId" = GREATEST("senderPlayerId", "receiverPlayerId"))::INTEGER AS unread_b
  FROM "DirectMessage" GROUP BY 1, 2
), latest AS (
  SELECT DISTINCT ON (LEAST("senderPlayerId", "receiverPlayerId"), GREATEST("senderPlayerId", "receiverPlayerId"))
    LEAST("senderPlayerId", "receiverPlayerId") AS a,
    GREATEST("senderPlayerId", "receiverPlayerId") AS b, "id", "createdAt"
  FROM "DirectMessage"
  ORDER BY 1, 2, "createdAt" DESC, "id" DESC
)
INSERT INTO "direct_message_thread" ("playerAId", "playerBId", "lastMessageId", "lastMessageAt", "unreadCountA", "unreadCountB")
SELECT p.a, p.b, l."id", l."createdAt", p.unread_a, p.unread_b
FROM pairs p JOIN latest l USING (a, b);

COMMIT;
