-- Add enum values for room-ready lifecycle
ALTER TYPE "PlayInviteStatus" ADD VALUE IF NOT EXISTS 'room_created';
ALTER TYPE "PlayInviteStatus" ADD VALUE IF NOT EXISTS 'joined';
ALTER TYPE "PlayInviteStatus" ADD VALUE IF NOT EXISTS 'failed_to_join';

-- Add roomCode so room-ready invites can be resumed after reconnect
ALTER TABLE "PlayInvite"
  ADD COLUMN IF NOT EXISTS "roomCode" TEXT;

-- Add lookup index for room-ready invites
CREATE INDEX IF NOT EXISTS "PlayInvite_roomCode_status_idx" ON "PlayInvite"("roomCode", "status");
