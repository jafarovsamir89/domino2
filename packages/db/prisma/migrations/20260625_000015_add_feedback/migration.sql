-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('new', 'resolved', 'rejected');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "message" TEXT NOT NULL,
    "category" TEXT,
    "contactEmail" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'new',
    "appVersion" TEXT,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_playerId_createdAt_idx" ON "Feedback"("playerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
