const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

test("result modal test overlay class is present only on final result screens", () => {
    const htmlFiles = ["index.html", "www/index.html"];
    const cssFiles = ["css/style.css", "www/css/style.css"];

    for (const file of htmlFiles) {
        const content = read(file);
        assert.equal(content.includes('id="round-end-screen" class="screen overlay result-overlay-test"'), true, `${file} missing result overlay class on round end screen`);
        assert.equal(content.includes('id="game-over-screen" class="screen overlay result-overlay-test"'), true, `${file} missing result overlay class on game over screen`);
        assert.equal(content.includes('id="menu-screen" class="screen overlay result-overlay-test"'), false, `${file} should not add result overlay class to menu screen`);
    }

    for (const file of cssFiles) {
        const content = read(file);
        assert.equal(content.includes('/* TEST: ultra-transparent result modal. Remove result-overlay-test from HTML to return old style. */'), true, `${file} missing test override comment`);
        assert.equal(content.includes('.screen.overlay.result-overlay-test {'), true, `${file} missing result overlay override`);
        assert.equal(content.includes('rgba(15, 25, 35, 0.40)'), true, `${file} missing updated transparency`);
        assert.equal(content.includes('rgba(13, 23, 36, 0.32)'), true, `${file} missing updated transparency`);
        assert.equal(content.includes('rgba(240, 192, 64, 0.52)'), true, `${file} missing firm yellow border override`);
        assert.equal(content.includes('text-shadow:'), true, `${file} missing readability override`);
    }
});
