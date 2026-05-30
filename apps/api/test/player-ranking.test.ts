import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateEloDelta,
  calculateEloExpectedScore,
  calculateEloUpdate,
  calculatePlayerRating,
  getPlayerRatingTitleCode,
  normalizeEloRating
} from "../src/modules/ranking/player-ranking.js";

test("calculatePlayerRating returns the stored elo baseline for empty stats", () => {
  assert.equal(calculatePlayerRating({}), 1000);
});

test("normalizeEloRating clamps the rating range", () => {
  assert.equal(normalizeEloRating(50), 300);
  assert.equal(normalizeEloRating(1000), 1000);
  assert.equal(normalizeEloRating(9000), 5000);
});

test("calculateEloExpectedScore is symmetric around equal ratings", () => {
  assert.equal(calculateEloExpectedScore(1000, 1000), 0.5);
  assert.ok(calculateEloExpectedScore(1200, 1000) > 0.5);
  assert.ok(calculateEloExpectedScore(1000, 1200) < 0.5);
});

test("calculateEloDelta uses provisional k factor for new players", () => {
  const winDelta = calculateEloDelta({
    playerRating: 1000,
    opponentRating: 1000,
    actualScore: 1,
    matchesPlayed: 0
  });
  const lossDelta = calculateEloDelta({
    playerRating: 1000,
    opponentRating: 1000,
    actualScore: 0,
    matchesPlayed: 0
  });

  assert.equal(winDelta, 20);
  assert.equal(lossDelta, -20);
});

test("calculateEloDelta switches to standard k after enough matches", () => {
  const winDelta = calculateEloDelta({
    playerRating: 1000,
    opponentRating: 1000,
    actualScore: 1,
    matchesPlayed: 25
  });

  assert.equal(winDelta, 16);
});

test("calculateEloUpdate applies penalties and clamps results", () => {
  const next = calculateEloUpdate({
    playerRating: 1000,
    opponentRating: 1000,
    actualScore: 0,
    matchesPlayed: 0,
    penalty: -5
  });

  assert.equal(next, 975);
});

test("getPlayerRatingTitleCode still maps tiers for compatibility", () => {
  assert.equal(getPlayerRatingTitleCode(1000), "rookie");
  assert.equal(getPlayerRatingTitleCode(1500), "platinum");
  assert.equal(getPlayerRatingTitleCode(1950), "legend");
});
