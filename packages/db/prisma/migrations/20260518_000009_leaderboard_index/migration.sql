-- Speed up leaderboard reads by rating
CREATE INDEX IF NOT EXISTS "PlayerStats_rating_matchesPlayed_wins_idx"
    ON "PlayerStats"("rating", "matchesPlayed", "wins");
