const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

function extractBlock(source, anchor) {
    // Match a class method declaration, not an earlier invocation of the same
    // text. The method signature can itself contain `{}` defaults.
    const declarations = [`    ${anchor} {`, `    async ${anchor} {`];
    const declaration = declarations.find((candidate) => source.includes(candidate));
    assert.ok(declaration, `missing method declaration: ${anchor}`);
    const declarationStart = source.indexOf(declaration);
    assert.notEqual(declarationStart, -1, `missing method declaration: ${anchor}`);
    const start = declarationStart + 4;
    const braceStart = declarationStart + declaration.length - 1;
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

test("server keeps the final board on game_delta and omits it from the immediate result sync", () => {
    const source = read("server/DominoRoom.js");

    const syncStateBlock = extractBlock(source, "syncState({ includeBoardJson = true } = {})");
    const performPlayBlock = extractBlock(source, "performPlay(pi, tileIndex, openEndIndex, isBot = false, meta = {})");
    const performGoshaBlock = extractBlock(source, "performGosha(pi, combo, isBot = false, meta = {})");
    const advanceTurnBlock = extractBlock(source, "advanceTurn()");
    const broadcastGameDeltaBlock = extractBlock(source, "broadcastGameDelta(base = {})");
    const gameDeltaPayloadBlock = extractBlock(source, "buildGameDeltaPayload(base = {})");
    const endDealBlock = extractBlock(source, "endDeal(wi, fish)");
    const endRoundBlock = extractBlock(source, "endRound(wi, isInstantWin)");
    const fullStateBlock = extractBlock(source, "buildFullStatePayloadForClient(client)");

    assert.equal(syncStateBlock.includes("updateSchemaState({ includeBoardJson });"), true, "syncState should accept an includeBoardJson switch");

    assert.equal(performPlayBlock.includes("this.broadcastGameDelta({"), true, "performPlay should still publish the board delta before closing the deal");
    assert.equal(performPlayBlock.includes("this.state.boardJson = JSON.stringify(this.internalBoard);"), true, "performPlay should persist the final board snapshot in memory");
    assert.equal(performPlayBlock.includes("scheduleLastMoveSettlement(() => this.endRound(pi, true))"), false, "performPlay must not delay the final result through the old reveal timer");
    assert.equal(performPlayBlock.includes("scheduleLastMoveSettlement(() => this.endDeal(pi, false))"), false, "performPlay must not delay deal_end through the old reveal timer");
    assert.equal(performPlayBlock.includes("scheduleLastMoveSettlement(() => this.endDeal(this.findFishWinner(), true))"), false, "performPlay must not delay fish settlement through the old reveal timer");
    assert.equal(performPlayBlock.includes("this.endRound(pi, true);"), true, "instant-win play should close the round immediately");
    assert.equal(performPlayBlock.includes("this.endDeal(pi, false);"), true, "empty-hand play should close the deal immediately");
    assert.equal(advanceTurnBlock.includes("if (blocked?.blocked)"), true, "advanceTurn should only close the deal for a real blocked result");
    assert.equal(advanceTurnBlock.includes("this.endDeal(Number.isInteger(Number(blocked?.winnerIndex)) ? Number(blocked.winnerIndex) : this.findFishWinner(), true);"), true, "blocked-board result should close the deal with the resolved winner");

    assert.equal(performGoshaBlock.includes("this.broadcastGameDelta({"), true, "performGosha should still publish the board delta before closing the deal");
    assert.equal(performGoshaBlock.includes("this.state.boardJson = JSON.stringify(this.internalBoard);"), true, "performGosha should persist the final board snapshot in memory");
    assert.equal(performGoshaBlock.includes("scheduleLastMoveSettlement(() => this.endRound(pi, true))"), false, "performGosha must not delay the final result through the old reveal timer");
    assert.equal(performGoshaBlock.includes("scheduleLastMoveSettlement(() => this.endDeal(pi, false))"), false, "performGosha must not delay deal_end through the old reveal timer");
    assert.equal(performGoshaBlock.includes("scheduleLastMoveSettlement(() => this.endDeal(this.findFishWinner(), true))"), false, "performGosha must not delay fish settlement through the old reveal timer");
    assert.equal(performGoshaBlock.includes("this.endRound(pi, true);"), true, "instant-win gosha should close the round immediately");
    assert.equal(performGoshaBlock.includes("this.endDeal(pi, false);"), true, "empty-hand gosha should close the deal immediately");

    assert.equal(broadcastGameDeltaBlock.includes("this.buildGameDeltaPayload(base)"), true, "game_delta should publish its prepared payload");
    assert.equal(gameDeltaPayloadBlock.includes("isFinalMove: Boolean(base.isFinalMove)"), true, "game_delta should still flag the final move");
    assert.equal(gameDeltaPayloadBlock.includes("finishInfo: base.finishInfo || null"), true, "game_delta should still carry finish info");
    assert.equal(gameDeltaPayloadBlock.includes("lastMoveRevealPending: Boolean(this.lastMoveRevealPending)"), true, "game_delta should still expose reveal state for the client contract");

    assert.equal(endDealBlock.includes("this.broadcast(\"deal_end\""), true, "deal_end should still be emitted");
    assert.equal(endDealBlock.includes("this.syncState({ includeBoardJson: false });"), true, "deal_end sync should not re-broadcast the final boardJson");
    assert.equal(endDealBlock.includes("this.scheduleNextDeal(DEAL_END_MODAL_MS);"), true, "deal_end should still advance the deal after the result window");

    assert.equal(endRoundBlock.includes("this.broadcast(\"round_end\""), true, "round_end should still be emitted");
    assert.equal(endRoundBlock.includes("this.syncState({ includeBoardJson: false });"), true, "round_end sync should not re-broadcast the final boardJson");
    assert.equal(endRoundBlock.includes("this.scheduleNextRound(2000);"), true, "round_end should still advance the round after the result window");

    assert.equal(fullStateBlock.includes("board: this.internalBoard.toJSON ? this.internalBoard.toJSON() : this.internalBoard"), true, "full_state should keep the authoritative board for reconnects");
});
