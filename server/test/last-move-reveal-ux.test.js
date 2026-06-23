const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

function assertOrder(source, tokens, label) {
    let lastIndex = -1;
    for (const token of tokens) {
        const index = source.indexOf(token);
        assert.notEqual(index, -1, `${label}: missing token ${token}`);
        assert.ok(index > lastIndex, `${label}: token out of order ${token}`);
        lastIndex = index;
    }
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
    assert.equal(source.includes("+ 1500"), false);
    assert.equal(source.includes("this.addScore(wi, bonus, { broadcast: false, scoreSource: \"hand_bonus\" })"), true);
    assert.equal(source.includes("scoreSource: \"table\""), true);
    assert.equal(source.includes("bonusSource: \"hand_bonus\""), true);
    assert.equal(source.includes("tableScoreDelta"), true);
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
        assert.equal(source.includes("this._pendingPostFinalSchemaState = null;"), true);
        assert.equal(source.includes("this._pendingPostFinalSchemaState = { state, source };"), true);
        assert.equal(source.includes("flushPendingPostFinalSchemaState()"), true);
        assert.equal(source.includes("shouldDeferPostFinalSchemaState(state)"), true);
        assert.equal(source.includes("queuePostFinalSchemaState(state, source = 'schema')"), true);
        assert.equal(source.includes("_boardAnimationPromiseByTileId"), true);
        assert.equal(source.includes("requestAnimationFrame(() => {"), true);
        assert.equal(source.includes("this._boardAnimationPromise = new Promise((resolve) => {"), true);
        assert.equal(source.includes("await this.waitForFinalMoveVisualSettled();"), true);
        assert.equal(source.includes("this.delayLastMoveSettlement(() => this.endRound(pi, true)"), true);
        assert.equal(source.includes("this.delayLastMoveSettlement(()=>this.endDeal(pi,false)"), true);
        assert.equal(source.includes("this.delayLastMoveSettlement(()=>this.endDeal(this.findFishWinner(),true)"), true);
        assert.equal(source.includes("onNetworkScorePopup(score)"), true);
        assert.equal(source.includes("setTimeout(() => this.endRound(pi, true), 800);"), false);
        assert.equal(source.includes("_lastFinalMoveTileId"), true);
        assert.equal(source.includes("_lastFinalMoveVisualSource"), true);
        assert.equal(source.includes("_lastFinalMoveTableScoreDelta"), true);
        assert.equal(source.includes("debugLog('[DealEnd]'"), true);
        assert.equal(source.includes("await this.waitForFinalMoveVisualSettled();\n        this.flushPendingPostFinalSchemaState();\n        this.gameActive = false;"), true);
        assertOrder(source, [
            "this.finalMoveVisualPromise = (async () => {",
            "await animationPromise;",
            "if (finalTableScoreDelta > 0) {",
            "this.showScoreFeedback(finalTableScoreDelta, { source: finalScoreSource || 'table' });",
            "await new Promise((resolve) => setTimeout(resolve, LAST_MOVE_REVEAL_DELAY_MS));"
        ], "final move popup ordering");
        assertOrder(source, [
            "await this.waitForFinalMoveVisualSettled();",
            "this.flushPendingPostFinalSchemaState();",
            "this.gameActive = false;"
        ], "post-final state flush ordering");
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
