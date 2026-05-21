const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(root, relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("tempo UX constants keep bots readable and round summaries visible long enough", () => {
    const root = path.resolve(__dirname, "..", "..");
    const files = ["server/DominoRoom.js", "js/app.js", "www/js/app.js"];

    for (const relativePath of files) {
        const text = read(root, relativePath);
        assert.match(text, /BOT_THINK_DELAY_MS\s*=\s*1500/);
        assert.match(text, /DEAL_END_MODAL_MS\s*=\s*5000/);
    }
});
