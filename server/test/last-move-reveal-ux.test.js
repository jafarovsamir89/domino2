const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

test("server delays last-move settlement and blocks new actions during reveal", () => {
    const source = read("server/DominoRoom.js");

    const requiredTokens = [
        "const LAST_MOVE_REVEAL_DELAY_MS = 1200;",
        "this.lastMoveRevealTimer = null;",
        "this.lastMoveRevealPending = false;",
        "scheduleLastMoveSettlement(callback, delay = LAST_MOVE_REVEAL_DELAY_MS)",
        "this.lastMoveRevealPending = true;",
        "if (this.lastMoveRevealPending) return { ok: false, reason: \"result_reveal_pending\", pi };",
        "this.scheduleLastMoveSettlement(() => this.endRound(pi, true));",
        "this.scheduleLastMoveSettlement(() => this.endDeal(pi, false));",
        "this.scheduleLastMoveSettlement(() => this.endDeal(this.findFishWinner(), true));"
    ];

    for (const token of requiredTokens) {
        assert.equal(source.includes(token), true, token);
    }

    assert.equal(source.includes("this.endRound(pi, true);\n            return;"), false);
    assert.equal(source.includes("this.endDeal(pi, false);\n            return;"), false);
    assert.equal(source.includes("this.endDeal(this.findFishWinner(), true);\n            return true;"), false);
});

test("client mirrors the reveal delay and pause menu chrome in both copies", () => {
    const appSource = read("js/app.js");
    const webAppSource = read("www/js/app.js");
    const htmlSource = read("index.html");
    const webHtmlSource = read("www/index.html");
    const cssSource = read("css/style.css");
    const webCssSource = read("www/css/style.css");

    for (const source of [appSource, webAppSource]) {
        assert.equal(source.includes("const LAST_MOVE_REVEAL_DELAY_MS = 1200;"), true);
        assert.equal(source.includes("delayLastMoveSettlement(callback, delay = LAST_MOVE_REVEAL_DELAY_MS, finalInfo = null)"), true);
        assert.equal(source.includes("this.delayLastMoveSettlement(() => this.endRound(pi, true)"), true);
        assert.equal(source.includes("this.delayLastMoveSettlement(()=>this.endDeal(pi,false)"), true);
        assert.equal(source.includes("this.delayLastMoveSettlement(()=>this.endDeal(this.findFishWinner(),true)"), true);
        assert.equal(source.includes("onNetworkScorePopup(score)"), true);
        assert.equal(source.includes("setTimeout(() => this.endRound(pi, true), 800);"), false);
    }

    for (const source of [htmlSource, webHtmlSource]) {
        assert.equal(source.includes('pause-menu-btn'), true);
        assert.equal(source.includes('pause-icon'), true);
        assert.equal(source.includes('data-i18n="menu-open"'), false);
    }

    for (const source of [cssSource, webCssSource]) {
        assert.equal(source.includes('.menu-btn.pause-menu-btn::before'), true);
        assert.equal(source.includes('.pause-menu-btn {'), true);
        assert.equal(source.includes('.pause-icon::before,'), true);
        assert.equal(source.includes('.pause-icon::after {'), true);
    }
});
