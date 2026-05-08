-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "FriendConnectionStatus" AS ENUM ('pending', 'accepted', 'rejected', 'blocked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "RoomInvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'revoked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "FriendConnection" (
    "id" TEXT NOT NULL,
    "requesterPlayerId" TEXT NOT NULL,
    "addresseePlayerId" TEXT NOT NULL,
    "status" "FriendConnectionStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RoomInvitation" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "roomCode" TEXT,
    "roomMode" TEXT NOT NULL,
    "isTeamMode" BOOLEAN NOT NULL DEFAULT false,
    "stakeKey" TEXT,
    "stakeAmount" INTEGER NOT NULL DEFAULT 0,
    "humanSeats" INTEGER NOT NULL DEFAULT 0,
    "totalPlayers" INTEGER NOT NULL DEFAULT 0,
    "inviterPlayerId" TEXT NOT NULL,
    "inviteePlayerId" TEXT NOT NULL,
    "status" "RoomInvitationStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "payloadJson" JSONB,
    "expiresAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FriendConnection_requesterPlayerId_status_idx" ON "FriendConnection"("requesterPlayerId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FriendConnection_addresseePlayerId_status_idx" ON "FriendConnection"("addresseePlayerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FriendConnection_requesterPlayerId_addresseePlayerId_key" ON "FriendConnection"("requesterPlayerId", "addresseePlayerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoomInvitation_inviteePlayerId_status_createdAt_idx" ON "RoomInvitation"("inviteePlayerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoomInvitation_inviterPlayerId_status_createdAt_idx" ON "RoomInvitation"("inviterPlayerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoomInvitation_roomId_status_idx" ON "RoomInvitation"("roomId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoomInvitation_roomCode_status_idx" ON "RoomInvitation"("roomCode", "status");

-- AddForeignKey
ALTER TABLE "FriendConnection" ADD CONSTRAINT "FriendConnection_requesterPlayerId_fkey" FOREIGN KEY ("requesterPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendConnection" ADD CONSTRAINT "FriendConnection_addresseePlayerId_fkey" FOREIGN KEY ("addresseePlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInvitation" ADD CONSTRAINT "RoomInvitation_inviterPlayerId_fkey" FOREIGN KEY ("inviterPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInvitation" ADD CONSTRAINT "RoomInvitation_inviteePlayerId_fkey" FOREIGN KEY ("inviteePlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
