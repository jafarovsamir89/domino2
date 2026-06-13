const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

test("client opens seat picker for team rooms regardless of visibility", () => {
    const appSource = read("js/app.js");
    const webAppSource = read("www/js/app.js");
    const oldCondition = "roomState.roomVisibility === 'open' && !this.gameActive && !roomState.gameActive && roomState.seatSelectionRequired === true && !roomState.gameOverReason && !roomState.matchOver";

    assert.equal(
        !appSource.includes(oldCondition) &&
        appSource.includes("shouldOpenSeatPickerAfterRoomCreate") &&
        appSource.includes("roomRequiresSeatPicker") &&
        appSource.includes("this.enterOpenRoomWaitingScreen(roomState);"),
        true
    );
    assert.equal(
        !webAppSource.includes(oldCondition) &&
        webAppSource.includes("shouldOpenSeatPickerAfterRoomCreate") &&
        webAppSource.includes("roomRequiresSeatPicker") &&
        webAppSource.includes("this.enterOpenRoomWaitingScreen(roomState);"),
        true
    );
});

test("client keeps team runtime and seat picker close flow explicit", () => {
    const appSource = read("js/app.js");
    const webAppSource = read("www/js/app.js");
    const requiredTokens = [
        "resolveRoomModeState(",
        "handleSeatSelectionClose('seat-picker-close')",
        "event.preventDefault();",
        "event.stopPropagation();",
        "roomRuntime: {",
        "roomStart: {",
        "startGamePayloadSafe",
        "lastRoomStatePlayersSafe",
        "teamAssignmentsSafe",
        "seatAssignmentsSafe",
        "lastRoomStateRoomStart",
        "scoreMode",
        "topHudMode",
        "isMoveHintSelectionActive()",
        "syncMoveHintSelectionUiState()",
        "lastProfileOpenBlockedByMoveHint",
        "lastProfileClickBlockedReason",
        "activeRoomIdBeforeClose",
        "gameStateBeforeClose",
        "lastAutoStartCheckAt"
    ];
    const closeHandlerTokens = [
        "event.preventDefault();",
        "event.stopPropagation();",
        "void this.handleSeatSelectionClose('seat-picker-close');"
    ];
    const debugTokens = [
        "lastCloseAttemptAt",
        "lastCloseAction",
        "lastCloseStartedGame",
        "lastCloseCalledStartGame",
        "lastCloseCalledSelectSeat",
        "lastCloseCalledReady",
        "lastCloseError"
    ];

    const extractCloseHandlerSnippet = (source) => {
        const start = source.indexOf("    async handleSeatSelectionClose(action = 'seat-picker-close') {");
        const end = source.indexOf("    isSeatSelectionUiVisible()", start);
        return start >= 0 && end > start ? source.slice(start, end) : '';
    };
    const extractCloseButtonSnippet = (source) => {
        const start = source.indexOf("        const closeBtn = document.createElement('button');");
        const end = source.indexOf("        headCopy.appendChild(kicker);", start);
        return start >= 0 && end > start ? source.slice(start, end) : '';
    };

    for (const source of [appSource, webAppSource]) {
        const closeSnippet = extractCloseHandlerSnippet(source);
        const buttonSnippet = extractCloseButtonSnippet(source);
        assert.equal(closeSnippet.length > 0, true);
        assert.equal(buttonSnippet.length > 0, true);

        for (const token of requiredTokens) {
            assert.equal(source.includes(token), true);
        }
        for (const token of closeHandlerTokens) {
            assert.equal(buttonSnippet.includes(token), true);
        }
        for (const token of debugTokens) {
            assert.equal(source.includes(token), true);
        }

        assert.equal(buttonSnippet.includes("closeBtn.addEventListener('click', (event) => {"), true);
        assert.equal(source.includes("closeBtn.addEventListener('click', () => this.hideSeatSelectionUi());"), false);
        assert.equal(source.includes("this.isTeamMode = Boolean(payload?.isTeamMode);"), false);
        assert.equal(closeSnippet.includes("this.startGame();"), false);
        assert.equal(closeSnippet.includes("this.selectSeat("), false);
        assert.equal(closeSnippet.includes("this.ready("), false);
    }
});

test("client renders waiting room rows in a strict single-line format", () => {
    const appSource = read("js/app.js");
    const webAppSource = read("www/js/app.js");
    const cssSource = read("css/style.css");
    const sourceTokens = [
        "chip.classList.add(kind);",
        "chip.classList.add(`is-${kind}`);"
    ];
    const snippetTokens = [
        "displayName: 'Bo\u015F'",
        "displayName: 'AI Bot'",
        "subtitle: 'Haz\u0131r'",
        "subtitle: 'D\u0259v\u0259t et'",
        "iconText: '\uD83E\uDD16'",
        "iconText: '\u25CB'",
        "seatNumber: humanSeats + i + 1",
        "inviteBtn.textContent = 'D\u0259v\u0259t et';"
    ];
    const cssTokens = [
        "grid-template-columns: auto auto minmax(0, 1fr) auto;",
        ".room-player-chip.empty",
        ".room-player-chip.bot",
        ".room-player-chip-title-row",
        ".room-player-chip-actions",
        ".room-player-state",
        ".room-slot-invite-btn",
        "white-space: nowrap"
    ];

    const extractWaitingRoomSnippet = (source) => {
        const start = source.indexOf("        const humanPlayerCount = (roomState.players || []).filter(player => !player.isBot).length;");
        const end = source.indexOf("        if (!roomState.gameActive) {", start);
        return start >= 0 && end > start ? source.slice(start, end) : '';
    };

    for (const source of [appSource, webAppSource]) {
        for (const token of sourceTokens) {
            assert.equal(source.includes(token), true);
        }
        const snippet = extractWaitingRoomSnippet(source);
        assert.equal(snippet.length > 0, true);
        for (const token of snippetTokens) {
            assert.equal(snippet.includes(token), true);
        }
        assert.equal(snippet.includes("Haz\u0131rd\u0131r"), false);
        assert.equal(snippet.includes("Oyuncu g\u00F6zl\u0259nilir"), false);
        assert.equal(snippet.includes("3. AI"), false);
        assert.equal(snippet.includes("this.t('friend-invite')"), false);
        assert.equal(snippet.includes("width: min(94vw, 560px)"), false);
        assert.equal(snippet.includes("padding: 14px"), false);
    }
    for (const token of cssTokens) {
        assert.equal(cssSource.includes(token), true);
    }
});

test("client blocks profile clicks while move hints are active and exposes safe debug state", () => {
    const appSource = read("js/app.js");
    const webAppSource = read("www/js/app.js");
    const cssSource = read("css/style.css");
    const requiredAppTokens = [
        "move-hint-selection-active",
        "_lastMoveHintSelectionActive",
        "_lastMoveHintShownAt",
        "_lastMoveHintClearedAt",
        "_lastLeftHintRectSafe",
        "_lastRightHintRectSafe",
        "_lastProfileClickBlockedAt",
        "_lastProfileClickBlockedReason",
        "_lastHintClickAt",
        "_lastHintClickSide",
        "_lastHintClickStoppedPropagation",
        "body.classList.toggle('move-hint-selection-active', active)",
        "this.isMoveHintSelectionActive()",
        "lastProfileOpenBlockedByMoveHint"
    ];
    const requiredCssTokens = [
        "body.move-hint-selection-active #game-screen .score-name-button",
        "body.move-hint-selection-active #game-screen .opp-label-button",
        "body.move-hint-selection-active #game-screen .player-name-btn"
    ];

    for (const source of [appSource, webAppSource]) {
        for (const token of requiredAppTokens) {
            assert.equal(source.includes(token), true);
        }
    }
    for (const token of requiredCssTokens) {
        assert.equal(cssSource.includes(token), true);
    }
});

test("client moves play invite entry points into room context", () => {
    const appSource = read("js/app.js");
    const webAppSource = read("www/js/app.js");
    const socialInviteCallSites = [
        "sendGameInviteToPlayer(item.friend, { source: 'friends-page' })",
        "sendGameInviteToPlayer(player, { source: 'friends-search' })",
        "sendGameInviteToPlayer(profile, { source: 'profile' })",
        "sendGameInviteToPlayer(item.friend, { source: 'friends-hub' })"
    ];
    const roomInviteHooks = [
        "openContextualRoomInvitePicker",
        "renderContextualRoomInvitePicker",
        "contextual-room-invite-overlay",
        "seat-selection-invite-btn",
        "room-slot-invite-btn"
    ];
    const seatPickerRoomBoundInviteStrings = [
        "source: 'seat-picker'",
        "openSeatPickerOnJoin: true",
        "const seatPickerRoomInviteContext = (() => {",
        "inviteContextSafe"
    ];
    const roomCreateFreezeStrings = [
        "const roomCreateMode = this.isTeamMode ? 'team' : 'ffa';",
        "roomMode: roomCreateMode",
        "isTeamMode: roomCreateMode === 'team'"
    ];

    for (const source of [appSource, webAppSource]) {
        for (const callSite of socialInviteCallSites) {
            assert.equal(source.includes(callSite), false);
        }
        for (const hook of roomInviteHooks) {
            assert.equal(source.includes(hook), true);
        }
        for (const token of seatPickerRoomBoundInviteStrings) {
            assert.equal(source.includes(token), true);
        }
        for (const token of roomCreateFreezeStrings) {
            assert.equal(source.includes(token), true);
        }
    }
});

test("client exposes team hud wallet gate and profile close debug hooks", () => {
    const appSource = read("js/app.js");
    const webAppSource = read("www/js/app.js");
    const requiredTokens = [
        "getRoomTeamHudState(",
        "teamAHudNames",
        "teamBHudNames",
        "canJoinRoomWithWalletGate(",
        "_lastJoinBlockedByCoins",
        "insufficient-coins-modal",
        "closePlayerProfileModal()",
        "_lastProfileCloseAction",
        "_lastProfileCloseTouchedGameState",
        "lastProfileOpenBlockedByMoveHint"
    ];

    for (const source of [appSource, webAppSource]) {
        for (const token of requiredTokens) {
            assert.equal(source.includes(token), true);
        }
    }
});

test("client friends page no longer appends an undefined invite button", () => {
    const appSource = read("js/app.js");
    const webAppSource = read("www/js/app.js");
    const orphanInviteButtonSequence = "action.appendChild(inviteBtn);\n                    action.appendChild(messageBtn);\n                    action.appendChild(removeBtn);";

    assert.equal(appSource.includes(orphanInviteButtonSequence), false);
    assert.equal(webAppSource.includes(orphanInviteButtonSequence), false);
});
