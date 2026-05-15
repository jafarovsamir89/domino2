import test from "node:test";
import assert from "node:assert/strict";

import { calculatePlayerRating, getPlayerRatingTitleCode } from "../src/modules/ranking/player-ranking.js";

test("calculatePlayerRating returns the baseline for empty stats", () => {
  assert.equal(calculatePlayerRating({}), 1000);
});

test("calculatePlayerRating rewards winning streaks and punishes losses", () => {
  const strong = calculatePlayerRating({
    wins: 12,
    losses: 2,
    draws: 1,
    matchesPlayed: 15,
    currentStreak: 5,
    bestStreak: 7
  });
  const weak = calculatePlayerRating({
    wins: 2,
    losses: 12,
    draws: 1,
    matchesPlayed: 15,
    currentStreak: 0,
    bestStreak: 2
  });

  assert.ok(strong > 1000);
  assert.ok(weak < 1000);
  assert.ok(strong > weak);
});

test("getPlayerRatingTitleCode maps tiers consistently", () => {
  assert.equal(getPlayerRatingTitleCode(1000), "rookie");
  assert.equal(getPlayerRatingTitleCode(1075), "bronze");
  assert.equal(getPlayerRatingTitleCode(1200), "silver");
  assert.equal(getPlayerRatingTitleCode(1950), "legend");
});
