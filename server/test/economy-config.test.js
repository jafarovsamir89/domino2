const test = require("node:test");
const assert = require("node:assert/strict");

const {
    DEFAULT_PLATFORM_API_URL,
    normalizePlatformApiUrl,
    resolvePlatformApiUrl,
    buildEconomyUrl,
    probePlatformApiUrl
} = require("../economyConfig");

test("normalizePlatformApiUrl returns the default when empty", () => {
    assert.equal(normalizePlatformApiUrl(""), DEFAULT_PLATFORM_API_URL);
    assert.equal(normalizePlatformApiUrl(undefined), DEFAULT_PLATFORM_API_URL);
    assert.equal(resolvePlatformApiUrl(""), DEFAULT_PLATFORM_API_URL);
    assert.equal(resolvePlatformApiUrl(undefined), normalizePlatformApiUrl(process.env.PLATFORM_API_URL));
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

test("probePlatformApiUrl flags html health responses as invalid", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: false,
        status: 404,
        headers: {
            get: () => "text/html; charset=utf-8"
        },
        text: async () => "<!DOCTYPE html><html><body>Domino2 Admin</body></html>"
    });

    try {
        const result = await probePlatformApiUrl("http://example.com");
        assert.deepEqual(result, {
            ok: false,
            url: "http://example.com",
            status: 404,
            contentType: "text/html; charset=utf-8",
            preview: "<!DOCTYPE html><html><body>Domino2 Admin</body></html>",
            reason: "html"
        });
    } finally {
        global.fetch = originalFetch;
    }
});
