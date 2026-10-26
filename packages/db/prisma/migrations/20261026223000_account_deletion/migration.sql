ALTER TABLE "Player" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN "deletionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AccountDeletion" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "playerId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL,
  "deleteAfter" TIMESTAMP(3) NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "forgetAfter" TIMESTAMP(3),
  "state" TEXT NOT NULL DEFAULT 'pending',
  CONSTRAINT "AccountDeletion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountDeletion_state_check" CHECK ("state" IN ('pending', 'erasing', 'completed')),
  CONSTRAINT "AccountDeletion_window_check" CHECK ("deleteAfter" >= "requestedAt")
);
CREATE UNIQUE INDEX "AccountDeletion_userId_key" ON "AccountDeletion"("userId");
CREATE UNIQUE INDEX "AccountDeletion_playerId_key" ON "AccountDeletion"("playerId");
CREATE INDEX "AccountDeletion_state_deleteAfter_idx" ON "AccountDeletion"("state", "deleteAfter");
CREATE INDEX "AccountDeletion_forgetAfter_idx" ON "AccountDeletion"("forgetAfter");
