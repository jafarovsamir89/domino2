-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "senderPlayerId" TEXT NOT NULL,
    "receiverPlayerId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectMessage_senderPlayerId_receiverPlayerId_createdAt_idx" ON "DirectMessage"("senderPlayerId", "receiverPlayerId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMessage_receiverPlayerId_senderPlayerId_createdAt_idx" ON "DirectMessage"("receiverPlayerId", "senderPlayerId", "createdAt");

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderPlayerId_fkey" FOREIGN KEY ("senderPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_receiverPlayerId_fkey" FOREIGN KEY ("receiverPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
