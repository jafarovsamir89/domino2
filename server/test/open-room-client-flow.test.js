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
        "closeBtn.addEventListener('click', (event) => {",
        "event.preventDefault();",
        "event.stopPropagation();",
        "void this.handleSeatSelectionClose('seat-picker-close');"
    ];

    for (const source of [appSource, webAppSource]) {
        for (const token of requiredTokens) {
            assert.equal(source.includes(token), true);
        }
        for (const token of closeHandlerTokens) {
            assert.equal(source.includes(token), true);
        }
        assert.equal(source.includes("closeBtn.addEventListener('click', () => this.hideSeatSelectionUi());"), false);
        assert.equal(source.includes("this.isTeamMode = Boolean(payload?.isTeamMode);"), false);
    }
});

test("client renders waiting room rows in a strict single-line format", () => {
    const appSource = read("js/app.js");
    const webAppSource = read("www/js/app.js");
    const cssSource = read("css/style.css");
    const jsTokens = [
        "chip.classList.add(kind);",
        "chip.classList.add(`is-${kind}`);",
        "displayName: this.t('seat-free')",
        "displayName: 'AI Bot'",
        "subtitle: this.t('online-ready')",
        "iconText: '○'"
    ];
    const cssTokens = [
        "room-player-chip.empty",
        "room-player-chip.bot",
        "room-player-chip-title-row",
        "room-player-chip-actions",
        "room-player-state",
        "room-slot-invite-btn",
        "white-space: nowrap"
    ];

    for (const source of [appSource, webAppSource]) {
        for (const token of jsTokens) {
            assert.equal(source.includes(token), true);
        }
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
