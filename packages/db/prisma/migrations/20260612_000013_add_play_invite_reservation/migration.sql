-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PlayInviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'cancelled', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlayInvite" (
    "id" TEXT NOT NULL,
    "roomId" TEXT,
    "inviterPlayerId" TEXT NOT NULL,
    "inviteePlayerId" TEXT NOT NULL,
    "status" "PlayInviteStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "payloadJson" JSONB,
    "expiresAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlayInvite_inviteePlayerId_status_createdAt_idx" ON "PlayInvite"("inviteePlayerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlayInvite_inviterPlayerId_status_createdAt_idx" ON "PlayInvite"("inviterPlayerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlayInvite_roomId_status_idx" ON "PlayInvite"("roomId", "status");

-- AddForeignKey
ALTER TABLE "PlayInvite" ADD CONSTRAINT "PlayInvite_inviterPlayerId_fkey" FOREIGN KEY ("inviterPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayInvite" ADD CONSTRAINT "PlayInvite_inviteePlayerId_fkey" FOREIGN KEY ("inviteePlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
