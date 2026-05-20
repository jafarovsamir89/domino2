const test = require("node:test");
const assert = require("node:assert/strict");

const {
    DEFAULT_PLATFORM_API_URL,
    normalizePlatformApiUrl,
    buildEconomyUrl
} = require("../economyConfig");

test("normalizePlatformApiUrl returns the default when empty", () => {
    assert.equal(normalizePlatformApiUrl(""), DEFAULT_PLATFORM_API_URL);
    assert.equal(normalizePlatformApiUrl(undefined), DEFAULT_PLATFORM_API_URL);
});

test("normalizePlatformApiUrl removes a single trailing slash", () => {
    assert.equal(normalizePlatformApiUrl("http://example.com/"), "http://example.com");
    assert.equal(normalizePlatformApiUrl("http://example.com//"), "http://example.com/");
});

test("buildEconomyUrl builds the reserve endpoint", () => {
    assert.equal(buildEconomyUrl("http://example.com/", "/api/economy/matches/reserve"), "http://example.com/api/economy/matches/reserve");
});

test("buildEconomyUrl builds the settle endpoint", () => {
    assert.equal(buildEconomyUrl("http://example.com", "/api/economy/matches/settle"), "http://example.com/api/economy/matches/settle");
});

test("buildEconomyUrl builds the refund endpoint", () => {
    assert.equal(buildEconomyUrl("http://example.com", "/api/economy/matches/refund"), "http://example.com/api/economy/matches/refund");
});
