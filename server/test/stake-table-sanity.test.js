const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function extractStakeKeys(text) {
    return new Set((String(text || "").match(/stake_\d+/g) || []).map((value) => String(value).trim()));
}

test("client stake keys are a safe subset of backend supported stake keys", () => {
    const root = path.resolve(__dirname, "..", "..");
    const backendSource = fs.readFileSync(path.join(root, "apps/api/src/modules/economy/economy.service.ts"), "utf8");
    const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const appJs = fs.readFileSync(path.join(root, "www/js/app.js"), "utf8");

    const backendKeys = extractStakeKeys(backendSource);
    const clientKeys = new Set([
        ...extractStakeKeys(indexHtml),
        ...extractStakeKeys(appJs)
    ]);

    const unsupported = [...clientKeys].filter((key) => !backendKeys.has(key));

    assert.equal(indexHtml.includes("stake_250"), false);
    assert.equal(appJs.includes("stake_250"), false);
    assert.deepEqual(unsupported, []);
});
