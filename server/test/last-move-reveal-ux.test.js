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

function extractBlock(source, anchor) {
    const start = source.indexOf(anchor);
    assert.notEqual(start, -1, `missing anchor: ${anchor}`);
    const braceStart = source.indexOf("{", start);
    assert.notEqual(braceStart, -1, `missing opening brace for: ${anchor}`);
    let depth = 0;
    for (let index = braceStart; index < source.length; index += 1) {
        const char = source[index];
        if (char === "{") depth += 1;
        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return source.slice(start, index + 1);
            }
        }
    }
    assert.fail(`missing closing brace for: ${anchor}`);
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
    const removedFinalMarkers = [
        "finalMoveVisualPromise",
        "finalMoveVisualActive",
        "_pendingPostFinalSchemaState",
        "_boardAnimationPromiseByTileId",
        "_suppressBoardRenderTileId",
        "waitForFinalMoveVisualSettled()",
        "shouldDeferPostFinalSchemaState(state)",
        "queuePostFinalSchemaState(state, source = 'schema')",
        "flushPendingPostFinalSchemaState()",
        "buildBoardRenderSignature(",
        "shouldPreserveOptimisticFinalBoardRender(",
        "consumeSuppressedBoardRender(",
        "_lastFinalMoveTileId",
        "_lastFinalMoveVisualSource",
        "_lastFinalMoveTableScoreDelta",
        "_lastFinalMoveHandBonus",
        "pendingFinalScorePopups"
    ];

    for (const source of [appSource, webAppSource]) {
        assert.equal(source.includes("const LAST_MOVE_REVEAL_DELAY_MS = 1200;"), true);
        assert.equal(source.includes("delayLastMoveSettlement(callback, delay = LAST_MOVE_REVEAL_DELAY_MS, finalInfo = null)"), true);
        assert.equal(source.includes("requestAnimationFrame(() => {"), true);
        assert.equal(source.includes("this._boardAnimationPromise = new Promise((resolve) => {"), true);
        assert.equal(source.includes("this.delayLastMoveSettlement(() => this.endRound(pi, true)"), true);
        assert.equal(source.includes("this.delayLastMoveSettlement(()=>this.endDeal(pi,false)"), true);
        assert.equal(source.includes("this.delayLastMoveSettlement(()=>this.endDeal(this.findFishWinner(),true)"), true);
        assert.equal(source.includes("onNetworkScorePopup(score)"), true);
        assert.equal(source.includes("setTimeout(() => this.endRound(pi, true), 800);"), false);
        assert.equal(source.includes("debugLog('[DealEnd]'"), true);
        for (const marker of removedFinalMarkers) {
            assert.equal(source.includes(marker), false, `removed final path marker should be absent: ${marker}`);
        }

        const deltaBlock = extractBlock(source, "onNetworkGameDelta(payload = {})");
        const scorePopupBlock = extractBlock(source, "onNetworkScorePopup(score)");
        const dealEndBlock = extractBlock(source, "onNetworkDealEnd(data)");
        const roundEndBlock = extractBlock(source, "onNetworkRoundEnd(data)");
        const resultPresenterBlock = extractBlock(source, "presentOnlineResultAfterBoardAnimation(presenter)");

        assert.equal(deltaBlock.includes("payload?.isFinalMove"), false, "final move should not have a dedicated delta branch");
        assert.equal(deltaBlock.includes("trackBoardAnimationPromise("), true, "delta path should track board animation through the shared helper");
        assert.equal(deltaBlock.includes("const shouldDelayScorePopup = scoreDelta > 0 && (action === 'play' || action === 'gosha') && (isBoardAnimationAction || isOwnOptimisticPlay);"), true, "final move score popup should use the same delay rule as ordinary moves");
        assert.equal(deltaBlock.includes("if (shouldDelayScorePopup && String(payload?.scoreSource || '').trim() !== 'hand_bonus')"), true, "table score popup should stay tied to shared animation completion");
        assert.equal(deltaBlock.includes("LAST_MOVE_REVEAL_DELAY_MS"), false, "delta path must not add an extra reveal timeout");

        assert.equal(scorePopupBlock.includes("scoreSource === 'hand_bonus' || scoreSource === 'deal_bonus'"), true, "hand bonus must stay out of +N popups");
        assert.equal(scorePopupBlock.includes("enqueueScorePopupAfterBoardAnimation(value);"), true, "late score popups should still respect active board animation");

        assert.equal(resultPresenterBlock.includes("await this.getBoardAnimationPromise();"), true, "result presentation should wait on the shared board animation promise");
        assert.equal(resultPresenterBlock.includes("setTimeout("), false, "result presentation should not add its own reveal timer");

        assert.equal(dealEndBlock.includes("presentOnlineResultAfterBoardAnimation("), true, "deal end should schedule result presentation after the shared board animation");
        assert.equal(dealEndBlock.includes("showPreResultStage("), false, "deal end should not run a separate pre-result animation chain");
        assert.equal(dealEndBlock.includes("await "), false, "deal end should not await a bespoke final animation chain");

        assert.equal(roundEndBlock.includes("presentOnlineResultAfterBoardAnimation("), true, "round end should schedule result presentation after the shared board animation");
        assert.equal(roundEndBlock.includes("showPreResultStage("), false, "round end should not run a separate pre-result animation chain");
        assert.equal(roundEndBlock.includes("await "), false, "round end should not await a bespoke final animation chain");
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
