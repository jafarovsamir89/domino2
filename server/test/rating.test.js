const test = require("node:test");
const assert = require("node:assert/strict");

const {
    calculateLegacyPlayerRating,
    getLegacyPlayerRatingTitleCode
} = require("../accountStore");

test("legacy rating baseline matches the platform baseline", () => {
    assert.equal(calculateLegacyPlayerRating({}), 1000);
});

test("legacy rating reacts to match outcomes", () => {
    const strong = calculateLegacyPlayerRating({
        wins: 12,
        losses: 2,
        draws: 1,
        matchesPlayed: 15,
        currentStreak: 5,
        bestStreak: 7
    });
    const weak = calculateLegacyPlayerRating({
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

test("legacy title tiers match the platform tiers", () => {
    assert.equal(getLegacyPlayerRatingTitleCode(1000), "rookie");
    assert.equal(getLegacyPlayerRatingTitleCode(1075), "bronze");
    assert.equal(getLegacyPlayerRatingTitleCode(1200), "silver");
    assert.equal(getLegacyPlayerRatingTitleCode(1950), "legend");
});
