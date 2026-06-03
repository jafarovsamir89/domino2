CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "payloadJson" JSONB,
    "rewardJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InboxMessage_playerId_status_createdAt_idx" ON "InboxMessage"("playerId", "status", "createdAt");
CREATE INDEX "InboxMessage_playerId_type_createdAt_idx" ON "InboxMessage"("playerId", "type", "createdAt");

ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
