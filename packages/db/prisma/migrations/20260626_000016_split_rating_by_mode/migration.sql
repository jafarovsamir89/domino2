-- CreateTable
CREATE TABLE "PlayerModeStats" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL DEFAULT 'telefon',
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerModeStats_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "gameMode" TEXT NOT NULL DEFAULT 'telefon';

-- CreateIndex
CREATE UNIQUE INDEX "PlayerModeStats_playerId_gameMode_key" ON "PlayerModeStats"("playerId", "gameMode");

-- CreateIndex
CREATE INDEX "PlayerModeStats_gameMode_rating_matchesPlayed_wins_idx" ON "PlayerModeStats"("gameMode", "rating", "matchesPlayed", "wins");

-- CreateIndex
CREATE INDEX "Match_gameMode_createdAt_idx" ON "Match"("gameMode", "createdAt");

-- AddForeignKey
ALTER TABLE "PlayerModeStats" ADD CONSTRAINT "PlayerModeStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill telefon mode stats from legacy PlayerStats
INSERT INTO "PlayerModeStats" ("id", "playerId", "gameMode", "rating", "points", "wins", "losses", "draws", "matchesPlayed", "currentStreak", "bestStreak")
SELECT
    "playerId" || ':telefon',
    "playerId",
    'telefon',
    "rating",
    "points",
    "wins",
    "losses",
    "draws",
    "matchesPlayed",
    "currentStreak",
    "bestStreak"
FROM "PlayerStats"
ON CONFLICT ("playerId", "gameMode") DO NOTHING;
