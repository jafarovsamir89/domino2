import './endpoints.js';
import { Tile, createFullSet, shuffle, getHandSize, determineFirstPlayer, handPoints, getOpeningPlayScore, hasInvalidOpeningHand, roundTo5 } from './model.js';
import { Board, cloneBoard, reconstructBoard } from './board.js';
import { AIPlayer } from './ai.js';
import { Renderer } from './renderer.js?v=social-live-2';
import { translations } from './translations.js';
import { AccountClient } from './account.js';
import { VoiceChatManager } from './voice.js';
import { sndPlace, sndScore, sndDraw, sndPass, sndWin, sndGosha, startMenuMusic, startGameMusic, nextTrack, toggleMute, stopMusic } from './sounds.js?v=social-live-1';
// NetworkManager is loaded as global script

const DOMINO_RULESETS = globalThis.DominoRulesets || null;
const TELEFON_RULESET_FALLBACK = Object.freeze({
    id: 'telefon',
    matchTarget: 365,
    instantWinThreshold: 35,
    getHandSize(playerCount) {
        return getHandSize(playerCount);
    },
    determineFirstPlayer(hands) {
        return determineFirstPlayer(hands);
    },
    needsRedeal(hand) {
        return hasInvalidOpeningHand(hand);
    },
    openingPlayScore(tile, currentScore) {
        return getOpeningPlayScore(tile, currentScore);
    },
    scoreDuringPlay(board) {
        return board?.calculateScore?.() || 0;
    },
    handPoints(hand) {
        return handPoints(Array.isArray(hand) ? hand : []);
    },
    resolveBlocked(state = {}) {
        const board = state.board || state.internalBoard || null;
        const hands = Array.isArray(state.hands) ? state.hands : [];
        const boneyard = Array.isArray(state.boneyard) ? state.boneyard : [];
        if (!board?.isBlocked?.(hands, boneyard)) return null;
        if (state.isTeamMode) {
            const getTeamMembers = typeof state.getTeamMembers === 'function'
                ? (teamIndex) => Array.from(state.getTeamMembers(teamIndex) || [])
                : (teamIndex) => {
                    const members = [];
                    for (let index = 0; index < hands.length; index += 1) {
                        if ((index % 2) === teamIndex) members.push(index);
                    }
                    return members;
                };
            const team0 = getTeamMembers(0);
            const team1 = getTeamMembers(1);
            const team0Points = team0.reduce((sum, index) => sum + handPoints(hands[index] || []), 0);
            const team1Points = team1.reduce((sum, index) => sum + handPoints(hands[index] || []), 0);
            const winningTeam = team0Points <= team1Points ? 0 : 1;
            const winners = getTeamMembers(winningTeam);
            let winnerIndex = winners[0] ?? 0;
            let minPoints = Infinity;
            for (const index of winners) {
                const points = handPoints(hands[index] || []);
                if (points < minPoints) {
                    minPoints = points;
                    winnerIndex = index;
                }
            }
            return { blocked: true, fish: true, winnerIndex, teamIndex: winningTeam };
        }
        let winnerIndex = 0;
        let minPoints = Infinity;
        for (let index = 0; index < hands.length; index += 1) {
            const points = handPoints(hands[index] || []);
            if (points < minPoints) {
                minPoints = points;
                winnerIndex = index;
            }
        }
        return { blocked: true, fish: true, winnerIndex, teamIndex: null };
    },
    resolveRoundEnd(state = {}) {
        const score = Number(state.score || 0);
        const hand = Array.isArray(state.hand) ? state.hand : [];
        const playerIndex = Number.isInteger(Number(state.playerIndex)) ? Number(state.playerIndex) : 0;
        const instantWinEnabled = state.instantWinEnabled !== false;
        const instantWinThreshold = Number(state.instantWinThreshold || IWIN);
        if (instantWinEnabled && score >= instantWinThreshold) {
            return {
                isFinalMove: true,
                isInstantWin: true,
                finishKind: state.isGosha ? 'instant_win_gosha' : 'instant_win',
                winnerIndex: playerIndex,
                fish: false,
                dealEnd: false,
                roundEnd: true
            };
        }
        if (hand.length === 0) {
            return {
                isFinalMove: true,
                isInstantWin: false,
                finishKind: state.isGosha ? 'gosha' : 'tile',
                winnerIndex: playerIndex,
                fish: false,
                dealEnd: true,
                roundEnd: false
            };
        }
        const blocked = TELEFON_RULESET_FALLBACK.resolveBlocked(state);
        if (blocked) {
            return {
                isFinalMove: true,
                isInstantWin: false,
                finishKind: 'fish',
                winnerIndex: blocked.winnerIndex,
                fish: true,
                dealEnd: true,
                roundEnd: false
            };
        }
        return {
            isFinalMove: false,
            isInstantWin: false,
            finishKind: state.isGosha ? 'gosha' : 'tile',
            winnerIndex: playerIndex,
            fish: false,
            dealEnd: false,
            roundEnd: false
        };
    }
});

function getRuleset(mode = 'telefon') {
    return DOMINO_RULESETS?.getRuleset?.(mode) || TELEFON_RULESET_FALLBACK;
}

function getBoardStartAxis() {
    if (typeof window === 'undefined') return 'horizontal';
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const queryParam = urlParams.get('boardStart');
        if (queryParam === 'vertical' || queryParam === 'horizontal') {
            return queryParam;
        }
        const storageParam = window.localStorage?.getItem('dominoBoardStartAxis');
        if (storageParam === 'vertical' || storageParam === 'horizontal') {
            return storageParam;
        }
    } catch (e) {
        // ignore
    }
    return 'horizontal';
}

const TARGET=365, MAX_R=3, DLOSS=255, IWIN=35;
const TURN_TIMEOUT_MS = 30000;
const BOT_THINK_DELAY_MS = 1500;
const CLASSIC101_BOT_DRAW_STEP_DELAY_MS = 550;
const DEAL_END_MODAL_MS = 5000;
const LAST_MOVE_REVEAL_DELAY_MS = 1200;
const RESULT_MODAL_AFTER_LAND_DELAY_MS = 500;
function loadMode101Enabled() {
    try {
        if (window.DOMINO_ENABLE_MODE_101 === false) return false;
        if (window.DOMINO_ENABLE_MODE_101 === true) return true;
        const stored = window.localStorage?.getItem('domino:enableMode101');
        if (stored === '0' || stored === 'false') return false;
        if (stored === '1' || stored === 'true') return true;
    } catch {}
    return true;
}
const ENABLE_MODE_101 = loadMode101Enabled();
const DEFAULT_TABLE_SKIN_KEY = 'table_skin_default';
const DEFAULT_TABLE_SKIN = {
    key: DEFAULT_TABLE_SKIN_KEY,
    name: 'Aurora Felt',
    description: 'Blue-green premium felt with a warm gold edge.',
    assetUrl: '/assets/cosmetics/table/table_skin_01.webp'
};

const DEFAULT_TABLE_SKINS = [
    {
        key: 'table_skin_02',
        name: 'Midnight Carbon',
        description: 'Dark carbon weave with a subtle studio shine.',
        assetUrl: '/assets/cosmetics/table/table_skin_02.webp'
    },
    {
        key: 'table_skin_03',
        name: 'Emerald Classic',
        description: 'Rich green felt with clean tournament contrast.',
        assetUrl: '/assets/cosmetics/table/table_skin_03.webp'
    },
    {
        key: 'table_skin_04',
        name: 'Ocean Drift',
        description: 'Deep blue surface with soft motion lines.',
        assetUrl: '/assets/cosmetics/table/table_skin_04.webp'
    },
    {
        key: 'table_skin_05',
        name: 'Walnut Table',
        description: 'Warm wood grain for a premium club feel.',
        assetUrl: '/assets/cosmetics/table/table_skin_05.webp'
    },
    {
        key: 'table_skin_06',
        name: 'Ivory Marble',
        description: 'Light marble with elegant veins and depth.',
        assetUrl: '/assets/cosmetics/table/table_skin_06.webp'
    },
    {
        key: 'table_skin_07',
        name: 'Royal Crimson',
        description: 'Luxury crimson felt for high stakes players.',
        assetUrl: '/assets/cosmetics/table/table_skin_07.webp'
    },
    {
        key: 'table_skin_08',
        name: 'Obsidian Glass',
        description: 'Sleek volcanic glass with a neon glow.',
        assetUrl: '/assets/cosmetics/table/table_skin_08.webp'
    },
    {
        key: 'table_skin_09',
        name: 'Golden Oasis',
        description: 'Shimmering desert sand under premium polished glass.',
        assetUrl: '/assets/cosmetics/table/table_skin_09.webp'
    }
];

function isDebugLoggingEnabled() {
    if (typeof window === 'undefined') return false;
    try {
        const stored = window.localStorage?.getItem("dominoDebugLogs");
        if (stored === "false") return false;
        return true; // Enabled by default now!
    } catch {
        return true;
    }
}

function debugLog(...args) {
    if (isDebugLoggingEnabled()) console.log(...args);
}

function fmLog(tag, data) {
    try { console.log(`[FM ${performance.now().toFixed(1)}] ${tag}`, data ? JSON.stringify(data) : ''); } catch {}
}

const DOMINO_CLIENT_BUILD = {
    gitCommit: '7c5f3a1',
    builtAt: new Date().toISOString(),
    socialRealtimeDebugVersion: 'browser-production-trace-v42-deal-end-result',
    cacheFixVersion: 'domino-v81'
};

if (typeof window !== 'undefined') {
    window.DOMINO_CLIENT_BUILD = DOMINO_CLIENT_BUILD;
}

function getFirstNameDisplayName(value, fallback = 'Player') {
    const sanitize = (input, nextFallback = 'Player') => String(input || nextFallback)
        .replace(/<[^>]*>/g, ' ')
        .replace(/[^\p{L}\p{N} _.-]/gu, '')
        .trim()
        .slice(0, 24) || nextFallback;
    const normalized = sanitize(value || '', '').trim();
    if (!normalized) return sanitize(fallback, 'Player');
    const firstToken = normalized.split(/\s+/).find(Boolean);
    const candidate = sanitize(firstToken || fallback, 'Player');
    const lowered = candidate.toLowerCase();
    if (!candidate || lowered === 'undefined' || lowered === 'null' || lowered === 'nan') {
        return sanitize(fallback, 'Player');
    }
    return candidate;
}

const AUTH_ICON_SVGS = {
    google: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h10.27A10.99 10.99 0 0 1 24 38c-7.732 0-14-6.268-14-14s6.268-14 14-14c3.468 0 6.642 1.272 9.074 3.368l5.657-5.657C35.886 3.765 30.279 1.5 24 1.5 11.574 1.5 1.5 11.574 1.5 24S11.574 46.5 24 46.5 46.5 36.426 46.5 24c0-1.44-.135-2.847-.389-3.917z"/><path fill="#EA4335" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.468 0 6.642 1.272 9.074 3.368l5.657-5.657C35.886 3.765 30.279 1.5 24 1.5c-7.79 0-14.63 4.29-17.694 11.191z"/><path fill="#34A853" d="M24 46.5c6.109 0 11.64-2.339 15.82-6.156l-6.255-5.286C31.249 37.014 27.835 38 24 38c-5.984 0-11.033-3.87-12.85-9.238l-6.52 5.025C8.254 41.98 15.64 46.5 24 46.5z"/><path fill="#4285F4" d="M43.611 20.083H42V20H24v8h10.27a11.04 11.04 0 0 1-4.34 4.353l.003-.002 6.255 5.286C35.607 39.57 41 35 41 24c0-1.44-.135-2.847-.389-3.917z"/></svg>`,
    apple: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 814 1000" aria-hidden="true"><path fill="#fff" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>`,
    user: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 12.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z" stroke="currentColor" stroke-width="1.7"/><path d="M4.75 19a7.25 7.25 0 0 1 14.5 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    logout: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 5.75h-3.5A2.75 2.75 0 0 0 3.75 8.5v7A2.75 2.75 0 0 0 6.5 18.25H10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M13 8.5 16.5 12 13 15.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.25 12h-7.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    email: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6.75A2.75 2.75 0 0 1 6.75 4h10.5A2.75 2.75 0 0 1 20 6.75v10.5A2.75 2.75 0 0 1 17.25 20H6.75A2.75 2.75 0 0 1 4 17.25V6.75Z" stroke="currentColor" stroke-width="1.8"/><path d="m5.5 7.5 6.5 5 6.5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    pencil: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14.5 5.5 4 4L8 20H4v-4L14.5 5.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m13 7 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    camera: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.5 6.75 9.86 5h4.28l1.36 1.75H18A2.25 2.25 0 0 1 20.25 9v7A2.25 2.25 0 0 1 18 18.25H6A2.25 2.25 0 0 1 3.75 16V9A2.25 2.25 0 0 1 6 6.75h2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="currentColor" stroke-width="1.6"/></svg>`
};

const SHOP_ICON_SVGS = {
    cart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 4.75h2.3l1.45 7.2A2.25 2.25 0 0 0 9.48 13.8h7.47a2.25 2.25 0 0 0 2.16-1.66l1.38-5.1H7.18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.25 19.25a1 1 0 1 1 0 .01Zm8.25 0a1 1 0 1 1 0 .01Z" fill="currentColor"/><path d="M6.5 4.75 7.6 10.1M8.2 13.8h10.75" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    coin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.75c5.11 0 9.25 1.9 9.25 4.25S17.11 11.25 12 11.25 2.75 9.35 2.75 7 6.89 2.75 12 2.75Z" stroke="currentColor" stroke-width="1.6"/><path d="M3 7v10c0 2.35 4.03 4.25 9 4.25s9-1.9 9-4.25V7" stroke="currentColor" stroke-width="1.6"/><path d="M3 12c0 2.35 4.03 4.25 9 4.25s9-1.9 9-4.25M12 6.5c2.76 0 5 .83 5 1.85S14.76 10.2 12 10.2 7 9.37 7 8.35 9.24 6.5 12 6.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    video: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="m10 9 4.8 3-4.8 3V9Z" fill="currentColor"/></svg>`
};

const SOCIAL_ICON_SVGS = {
    messages: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 5.5h11A2.5 2.5 0 0 1 20 8v5a2.5 2.5 0 0 1-2.5 2.5H11l-4.75 3.25V15.5H6.5A2.5 2.5 0 0 1 4 13V8a2.5 2.5 0 0 1 2.5-2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 9h8M8 12h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
};

class DominoGame {
    constructor() {
        this.renderer = new Renderer(this); this.board = new Board(); this.board.startAxis = getBoardStartAxis(); this.configureBoardForCurrentMode(this.board);
        this.playerMissingSuits = [];
        this.playerCount=2; this.onlinePlayerCount=2; this.onlineAiCount=0; this.playerName=''; this.difficulty='medium';
        this.onlineStakeKey = 'stake_200';
        this.onlineRoomVisibility = 'closed';
        this.onlineRoomSource = 'closed';
        this.openRoomsPrevScreen = null;
        this._openRoomsRefreshId = null;
        this.onlineEconomyMode = 'coins';
        this.onlineRoundBankAmount = 0;
        this.soloEconomyMode = 'coins';
        this.soloStakeKey = 'stake_50';
        this.hands=[]; this.boneyard=[]; this.scores=[]; this.roundWins=[];
        this.playerNames=[]; this.currentPlayer=0; this.matchRound=1; this.deal=1;
        this.selectedTileIndex=-1; this.validMoves=[]; this.gameActive=false;
        this.humanPlayerIndex=0; this.matchOver=false; this.roundOver=false; this.lastDealWinner=null;
        this.isTeamMode=false; this.teamScores=[0,0]; this.teamRoundWins=[0,0];
        this.turnInProgress=false; // Guard against double-turn bug
        this.turnVersion=1;
        this.lastTurnStartTime=0;
        this.aiTurnQueued=false;
        this._turnCycleId = 0;
        this._firstTurnTimeout = null;
        this._aiTurnTimeout = null;
        this._turnAdvanceTimeout = null;
        this._dealEndTimeout = null;
        this._turnTimeoutId = null;
        this._turnTimerTickId = null;
        this._nextDealAdvanceTimeout = null;
        this.turnDurationMs = TURN_TIMEOUT_MS;
        this.turnDeadlineAt = 0;
        this.turnTimeoutMs = TURN_TIMEOUT_MS;
        this.postMoveAdvanceMs = 2000;
        this.postMoveWindowActive = false;
        this.postMoveWindowEndsAt = 0;
        this.serverTimeOffsetMs = 0;
        this.lastServerTimeSyncAt = 0;
        this.roomAvatarBySessionId = new Map();
        this.lastDisconnectEconomySummary = null;
        this.disconnectEconomyApplied = false;
        this.mobileAuthPending = false;
        this.network = new NetworkManager(this);
        this.lastAccidentalDisconnectAt = 0;
        this.resumeLastAttemptAt = 0;
        this.resumeLastSuccess = 0;
        this.resumeLastError = '';
        this.lastGameEndModalReason = '';
        this.voice = new VoiceChatManager(this);
        this.account = new AccountClient(() => this.network.getServerUrl());
        this.accountProfile = this.account.getStoredProfile();
        this.authResolved = false;
        this.accountDetails = null;
        this.accountOnline = false;
        this.accountMode = 'login';
        this.pendingAvatarMode = 'keep';
        this.pendingAvatarDataUrl = null;
        this.pendingAvatarProfile = null;
        this.localPresenceLastSentAt = 0;
        this.localPresenceClearQueued = false;
        this.currentLang = this.loadSavedLanguage();
        this.preferredStartMode = this.loadPreferredStartMode();
        this.startModeFlipLocked = false;
        this.startModeFlipUnlockTimer = null;
        this.mode = 'telefon';
        this.ruleset = getRuleset(this.mode);
        this.matchRuleState = null;
        this.lastClassic101RoundResult = null;
        this.currentMatchStartedAt = null;
        this.currentMatchSessionId = null;
        this.activeMatchEconomyMode = 'coins';
        this.activeMatchStakeKey = 'stake_50';
        this.currentRoundStakeSessionId = null;
        this.currentRoundStakeKey = 'stake_50';
        this.currentRoundStakeAmount = 0;
        this.currentRoundBankAmount = 0;
        this.coinMatchSummary = { spent: 0, won: 0 };
        this.roundStage = null;
        this.roundStageTimer = null;
        this.openingRequiredTileId = '';
        this.openingRequiredTileIndex = -1;
        this.openingRequiredPlayerIndex = -1;
        this.lastShownStageKey = '';
        this.lastResultStageKey = '';
        this.onlineCoinSummary = { spent: 0, won: 0 };
        this.currentRoomState = null;
        this.botTakeoverUi = null;
        this.seatSelectionUi = null;
        this._lastRoomCreateVisibility = null;
        this._lastRoomCreateMode = null;
        this._lastRoomCreateRequiresSeatPicker = false;
        this._lastSeatPickerOpenAttemptAt = 0;
        this._lastSeatPickerOpenSource = '';
        this._lastSeatPickerOpenSkippedReason = '';
        this._lastSeatPickerCloseAttemptAt = 0;
        this._lastSeatPickerCloseAction = '';
        this._lastSeatPickerCloseStartedGame = false;
        this._lastSeatPickerCloseError = '';
        this._lastCloseAttemptAt = 0;
        this._lastCloseAction = '';
        this._lastCloseStartedGame = false;
        this._lastCloseCalledStartGame = false;
        this._lastCloseCalledSelectSeat = false;
        this._lastCloseCalledReady = false;
        this._lastCloseError = '';
        this._lastSeatPickerInviteButtonRendered = false;
        this._lastSeatPickerInviteButtonDisabledReason = '';
        this._lastSeatPickerInviteContextSafe = null;
        this._lastSeatPickerOpenedAfterRoomBoundInvite = false;
        this._lastStartGamePayloadSafe = null;
        this._lastRoomStateAt = 0;
        this._lastRoomStateIsTeamMode = null;
        this._lastRoomStateRoomMode = '';
        this._lastRoomStatePlayersSafe = [];
        this._lastRoomStateTeamAssignmentsSafe = [];
        this._lastRoomStateSeatAssignmentsSafe = [];
        this._lastMoveHintSelectionActive = false;
        this._lastMoveHintShownAt = 0;
        this._lastMoveHintClearedAt = 0;
        this._lastLeftHintRectSafe = null;
        this._lastRightHintRectSafe = null;
        this._lastProfileClickBlockedAt = 0;
        this._lastProfileClickBlockedReason = '';
        this._lastHintClickAt = 0;
        this._lastHintClickSide = '';
        this._lastHintClickStoppedPropagation = false;
        this._lastProfileOpenAt = 0;
        this._lastProfileCloseAt = 0;
        this._lastProfileCloseAction = '';
        this._lastProfileCloseTouchedGameState = false;
        this._lastProfileCloseError = '';
        this._lastProfileOpenAttemptAt = 0;
        this._lastProfileOpenBlockedByMoveHint = false;
        this._lastTeamHudRenderAt = 0;
        this._lastTeamHudRenderSource = '';
        this._lastTeamHudTeamsSafe = [];
        this._lastTeamAHudNames = [];
        this._lastTeamBHudNames = [];
        this._lastJoinStakeRequired = 0;
        this._lastJoinBalance = 0;
        this._lastJoinBlockedByCoins = false;
        this._lastJoinBlockedAt = 0;
        this._lastJoinBlockedRoomId = '';
        this._lastJoinBlockedInviteId = '';
        this._lastInsufficientCoinsModalShownAt = 0;
        this.insufficientCoinsPrevScreen = '';
        this._resolvedRoomModeFromState = '';
        this._lastRoomStateGameMode = '';
        this._resolvedScoreMode = '';
        this._resolvedTopHudMode = '';
        this.pendingReconnectResolution = false;
        this.openRooms = [];
        this.socialCenterTab = 'friends';
        this.socialCenterView = 'list';
        this.onlineSocialPanel = 'rooms';
        this.onlineRoomFilters = {
            search: '',
            roomModes: ['ffa', 'team'],
            gameMode: this.preferredStartMode === 'classic101' ? 'classic101' : 'telefon',
            stakeKeys: ['stake_200', 'stake_500', 'stake_1000', 'stake_5000']
        };
        this.pendingSharedRoomCode = '';
        this.friendSearchResults = [];
        this.friendHub = { accepted: [], incoming: [], outgoing: [] };
        this.friendPresenceMap = new Map();
        this.contextualRoomInviteState = null;
        this.contextualRoomInviteCandidates = [];
        this._lastContextualInviteOpenSource = '';
        this._lastContextualInviteRoomId = '';
        this._lastContextualInviteRoomCode = '';
        this._lastContextualInviteRoomMode = '';
        this._lastContextualInviteTargetSlotIndex = null;
        this._lastContextualInviteSelectedFriendId = '';
        this._lastContextualInviteSendAt = 0;
        this._lastContextualInviteSendResultSafe = null;
        this._lastContextualInviteSendError = '';
        this.friendPickerOpen = false;
        this.friendPickerSource = '';
        this.friendPickerOnlineCount = 0;
        this.friendPickerOfflineCount = 0;
        this.friendPickerExcludedAlreadyInRoomCount = 0;
        this.roomInvitations = { incoming: [], sent: [] };
        this.roomInvitationsLoading = false;
        this.gameInviteState = {
            inviteId: '',
            inviteePlayerId: '',
            inviteeDisplayName: '',
            sessionId: '',
            role: '',
            roomLinked: false,
            createPromptShown: false,
            waitingPromptShown: false
        };
        this._gameInviteRefreshId = null;
        this._gameInviteRefreshUntil = 0;
        this._lastIncomingInviteSignature = '';
        this._lastDmEventAt = 0;
        this._lastInviteEventAt = 0;
        this._lastFriendEventAt = 0;
        this._lastInviteSendAttemptAt = 0;
        this._lastInviteSendPayloadSafe = null;
        this._lastInviteSendTransport = 'unknown';
        this._lastInviteSendEndpoint = '';
        this._lastInviteSendHttpStatus = null;
        this._lastInviteSendResultSafe = null;
        this._lastInviteSendError = '';
        this._lastInviteReceivedAt = 0;
        this._lastInviteReceivedPayloadSafe = null;
        this._lastInviteUpdateAt = 0;
        this._lastInviteUpdatePayloadSafe = null;
        this._lastIncomingInvitesSafe = [];
        this._lastPlayInviteEventAt = 0;
        this._lastPlayInviteSendAttemptAt = 0;
        this._lastPlayInviteSendPayloadSafe = null;
        this._lastPlayInviteSendTransport = 'unknown';
        this._lastPlayInviteSendEndpoint = '';
        this._lastPlayInviteSendHttpStatus = null;
        this._lastPlayInviteSendResultSafe = null;
        this._lastPlayInviteSendError = '';
        this._lastPlayInviteReceivedAt = 0;
        this._lastPlayInviteReceivedPayloadSafe = null;
        this._lastPlayInviteUpdateAt = 0;
        this._lastPlayInviteUpdatePayloadSafe = null;
        this._lastPlayInviteAcceptedAt = 0;
        this._lastPlayInviteAcceptedPayloadSafe = null;
        this._lastPlayInviteAcceptedFlowType = '';
        this._lastPlayInviteAcceptedHadRoomId = false;
        this._lastPlayInviteAcceptedJoinAttemptAt = 0;
        this._lastPlayInviteAcceptedJoinRoomId = '';
        this._lastPlayInviteAcceptedJoinRoomCode = '';
        this._lastPlayInviteAcceptedJoinError = '';
        this._lastPlayInviteAcceptedWaitingSuppressedForRoomBound = false;
        this._lastAcceptedInviteWasRoomBound = false;
        this._lastContextualInvitePayloadSafe = null;
        this._lastContextualInviteResultSafe = null;
        this._lastContextualInviteFlowType = '';
        this._lastContextualInviteRoomIdPersisted = false;
        this._lastContextualInviteRoomCodePersisted = false;
        this._lastPlayInviteRoomAttachAttemptAt = 0;
        this._lastPlayInviteRoomAttachPayloadSafe = null;
        this._lastPlayInviteRoomAttachResultSafe = null;
        this._lastPlayInviteRoomAttachError = '';
        this._lastPlayInviteRoomReadyAt = 0;
        this._lastPlayInviteRoomReadyPayloadSafe = null;
        this._lastPlayInviteAutoJoinAttemptAt = 0;
        this._lastPlayInviteAutoJoinError = '';
        this._lastPlayInviteCancelAttemptAt = 0;
        this._lastPlayInviteCancelSource = 'unknown';
        this._lastPlayInviteCancelPayloadSafe = null;
        this._lastPlayInviteCancelResultSafe = null;
        this._lastPlayInviteCancelError = '';
        this._duplicateLegacyInviteSuppressedCount = 0;
        this.acceptingInviteIds = new Set();
        this.decliningInviteIds = new Set();
        this.acceptedWaitingInviteIds = new Set();
        this.playInviteRoomReadyIds = new Set();
        this.playInviteJoiningIds = new Set();
        this.playInviteAutoJoinAttemptedIds = new Set();
        this._roomInvitationsRenderState = null;
        this._socialInviteTrace = null;
        this._roomInvitationsLastLoadedAt = 0;
        this._roomInvitationsLastError = '';
        this._mainSocialBadgeCount = 0;
        this._mainSocialBadgeVisible = false;
        this._socialCenterBadgeCount = 0;
        this._activeHeaderPlayerId = '';
        this._activeHeaderName = '';
        this._headerProfileMatchesConversation = true;
        this._socialDebugPanelRefreshTimer = null;
        this.socialSummary = null;
        this.socialSummaryLoaded = false;
        this._socialSse = null;
        this._socialSseReconnectTimer = null;
        this._socialSseRetryCount = 0;
        this._socialSocket = null;
        this._socialSocketReady = false;
        this._socialSocketReconnectTimer = null;
        this._socialSocketRetryCount = 0;
        this._socialSocketProbePending = false;
        this._socialSocketInitAttemptCount = 0;
        this._socialSocketLastInitReason = '';
        this._socialSocketLastInitAt = 0;
        this._socialSocketConnectRequestedAt = 0;
        this._socialSocketHealthProbeStartedAt = 0;
        this._socialSocketHealthProbeFinishedAt = 0;
        this._socialSocketLastHealthStatus = '';
        this._socialSocketAuthRefreshPending = false;
        this._socialSocketFallbackTimer = null;
        this._socialSocketFallbackActive = false;
        this._socialSocketPath = '';
        this._socialSocketUrl = '';
        this._socialSocketLastConnectError = '';
        this._socialSocketLastEventAt = 0;
        this._socialSocketAuthToken = "";
        this._socialSocketAuthRefreshAttempted = false;
        this._socialRealtimeClosedAt = 0;
        this._socialRealtimeDestroyedAt = 0;
        this._conversationLoadInFlightByPlayer = new Map();
        this._messageThreadsLoadInFlight = null;
        this._roomInvitationsLoadInFlight = null;
        this._socialRefreshTimers = new Map();
        this._socialRefreshInFlight = new Set();
        this._socialRefreshQueued = new Set();
        this.socialInboxState = {
            items: [],
            threads: [],
            unreadCount: 0,
            loading: false,
            error: ''
        };
        this.pendingSoloSettlement = Promise.resolve();
        this._realtimeRenderRafId = 0;
        this._realtimeRenderFlags = null;
        this._realtimeRenderSignatures = {
            scores: '',
            info: '',
            opponents: '',
            hand: '',
            board: ''
        };
        this.pendingScorePopupAfterBoardAnimation = [];
        this._boardAnimationPromise = Promise.resolve();
        this._boardAnimationActive = null;
        this.lastFinishInfo = null;
        this._onlineResultPresentationToken = 0;
        this._pendingOptimisticPlayTileId = '';
        this._pendingOptimisticPlayActionId = '';
        this._lastMoveRevealTimeout = null;
        this._appJsLoadedAt = DOMINO_CLIENT_BUILD.builtAt;
        this.reactionPalette = [
            { code: '1F923', label: 'ROFL' },
            { code: '1F609', label: 'Wink' },
            { code: '1F618', label: 'Kiss' },
            { code: '1F929', label: 'Star' },
            { code: '1F914', label: 'Think' },
            { code: '1F62E-200D-1F4A8', label: 'Exhale' },
            { code: '1F634', label: 'Sleep' },
            { code: '1F62D', label: 'Cry' },
            { code: '1F92C', label: 'Swear' },
            { code: '1F48B', label: 'Kiss Mark' }
        ];
        this.giftCatalog = [];
        this.giftInventory = [];
        this.giftHistory = { sent: [], received: [], items: [] };
        this.giftRecipients = [];
        this.giftPickerContext = {
            source: 'social',
            activePlayerId: '',
            roomId: '',
            roomCode: ''
        };
        this.selectedGiftRecipientId = '';
        this.lastGiftSentAt = 0;
        this.lastGiftSentKey = '';
        this.onlineResultActive = false;
        this.coinShopStatus = null;
        this.tableSkinShop = null;
        this.coinShopLoading = false;
        this.coinShopClaiming = false;
        this.tableSkinLoading = false;
        this.tableSkinBusy = false;
        this.accountProfileTab = 'skins';
        this.accountMessagesState = {
            threads: [],
            activePlayerId: '',
            activePlayerProfile: null,
            messages: [],
            threadsLoading: false,
            conversationLoading: false,
            sendLoading: false,
            error: ''
        };
        this.leaderboardScope = 'overall';
        this.leaderboardGameMode = this.getSelectedGameMode();
        this.playerProfileState = null;
        this.playerReportState = null;
        this.socialCenterUnreadCount = 0;
        this.dailyBonusState = {
            loading: false,
            status: null,
            claiming: false,
            claimingMode: '',
            rewardedAdAvailable: null,
            rewardedAdStartedAt: 0,
            rewardedAdCompletedAt: 0,
            rewardedAdCancelledAt: 0,
            rewardedAdError: '',
            lastDailyBonusClaimMode: '',
            lastDailyBonusClaimReward: 0,
            error: ''
        };
        this._lastDailyBonusRenderAt = 0;
        this._lastDailyBonusRenderSource = '';
        this._dailyBonusUiRendered = false;
        this.pendingOnlineAction = null;
        this.pendingOnlineActionTimer = null;
        this.dailyBonusTickerId = null;
        this._coinShopTickId = null;
        this.lastReactionSentAt = 0;
        this.lastReactionSentType = '';
        this._reactionDragState = null;
        this.setLanguage(this.currentLang);
        this.setupStartScreen(); this.setupGameControls(); this.setupMenu();
        this.applySharedRoomCodeFromUrl();
        this.setupMobileAuthResume();
        this.bootstrapAccount();

        // Watchdog for turn freeze
        this._watchdogId = setInterval(() => {
            if (this.turnInProgress && Date.now() - this.lastTurnStartTime > 6000) {
                this.log("Watchdog: Resetting stuck turn");
                this.turnInProgress = false;
            }
        }, 2000);
        if (typeof localforage !== 'undefined') {
            localforage.config({
                name: 'Domino2Chat',
                storeName: 'chat_store'
            });
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                void this.processOfflineOutbox();
            });
        }
        window.addEventListener('beforeunload', () => this.destroy(), { once: true });
    }

    destroy() {
        clearInterval(this._watchdogId);
        this._watchdogId = null;
        this.closeSocialRealtime();
        this.clearPendingOnlineAction({ rollback: false });
        if (this._reactionOutsideHandler) {
            document.removeEventListener('pointerdown', this._reactionOutsideHandler, true);
            this._reactionOutsideHandler = null;
        }
        if (this._giftOutsideHandler) {
            document.removeEventListener('pointerdown', this._giftOutsideHandler, true);
            this._giftOutsideHandler = null;
        }
        if (this._voiceRosterOutsideHandler) {
            document.removeEventListener('pointerdown', this._voiceRosterOutsideHandler, true);
            this._voiceRosterOutsideHandler = null;
        }
        this.stopSocialDebugPanelAutoRefresh();
        this.stopOpenRoomsAutoRefresh();
        this.stopCoinShopTicker();
        this.voice?.destroy?.();
        this.clearTurnTimers();
    }
    async getCachedThreads(currentPlayerId) {
        if (typeof localforage === 'undefined' || !currentPlayerId) return [];
        try {
            const cacheKey = `chat_threads_${currentPlayerId}`;
            const cached = await localforage.getItem(cacheKey);
            return Array.isArray(cached) ? cached : [];
        } catch (err) {
            debugLog("[Chat Cache] Failed to load threads", err);
            return [];
        }
    }

    async saveCachedThreads(currentPlayerId, threads) {
        if (typeof localforage === 'undefined' || !currentPlayerId) return;
        try {
            const cacheKey = `chat_threads_${currentPlayerId}`;
            await localforage.setItem(cacheKey, threads);
        } catch (err) {
            debugLog("[Chat Cache] Failed to save threads", err);
        }
    }

    async getCachedMessages(currentPlayerId, peerId) {
        if (typeof localforage === 'undefined' || !currentPlayerId || !peerId) return [];
        try {
            const cacheKey = `chat_messages_${currentPlayerId}_${peerId}`;
            const cached = await localforage.getItem(cacheKey);
            return Array.isArray(cached) ? cached : [];
        } catch (err) {
            debugLog("[Chat Cache] Failed to load messages", err);
            return [];
        }
    }

    async saveCachedMessages(currentPlayerId, peerId, messages) {
        if (typeof localforage === 'undefined' || !currentPlayerId || !peerId) return;
        try {
            const cacheKey = `chat_messages_${currentPlayerId}_${peerId}`;
            const capped = Array.isArray(messages) ? messages.slice(-100) : [];
            await localforage.setItem(cacheKey, capped);
        } catch (err) {
            debugLog("[Chat Cache] Failed to save messages", err);
        }
    }

    async addMessageToOutbox(targetId, text, tempId) {
        const currentPlayerId = String(this.account?.playerId || this.account?.id || '').trim();
        if (!currentPlayerId || typeof localforage === 'undefined') return;
        try {
            const cacheKey = `chat_outbox_${currentPlayerId}`;
            const outbox = await localforage.getItem(cacheKey).catch(() => null) || [];
            const filtered = outbox.filter(item => item.tempId !== tempId);
            filtered.push({
                tempId,
                targetId,
                text,
                createdAt: new Date().toISOString(),
                retryCount: 0
            });
            await localforage.setItem(cacheKey, filtered);
        } catch (err) {
            debugLog("[Chat Outbox] Failed to save to outbox", err);
        }
    }

    async removeMessageFromOutbox(tempId) {
        const currentPlayerId = String(this.account?.playerId || this.account?.id || '').trim();
        if (!currentPlayerId || typeof localforage === 'undefined') return;
        try {
            const cacheKey = `chat_outbox_${currentPlayerId}`;
            const outbox = await localforage.getItem(cacheKey).catch(() => null) || [];
            const filtered = outbox.filter(item => item.tempId !== tempId);
            await localforage.setItem(cacheKey, filtered);
        } catch (err) {
            debugLog("[Chat Outbox] Failed to remove from outbox", err);
        }
    }

    async processOfflineOutbox() {
        if (this._processingOutbox) return;
        const currentPlayerId = String(this.account?.playerId || this.account?.id || '').trim();
        if (!currentPlayerId || typeof localforage === 'undefined') return;

        try {
            const cacheKey = `chat_outbox_${currentPlayerId}`;
            const outbox = await localforage.getItem(cacheKey).catch(() => null) || [];
            if (!outbox.length) return;

            if (navigator && !navigator.onLine) return;

            this._processingOutbox = true;
            debugLog(`[Chat Outbox] Processing ${outbox.length} pending messages...`);

            for (const item of outbox) {
                try {
                    const result = await this.sendDirectMessageWithFallback(item.targetId, item.text, item.tempId);
                    const sentMessage = result?.item;
                    await this.removeMessageFromOutbox(item.tempId);
                    
                    const state = this.accountMessagesState || {};
                    if (String(state.activePlayerId || '').trim() === item.targetId) {
                        const messages = Array.isArray(state.messages) ? [...state.messages] : [];
                        const tempIndex = messages.findIndex((row) => String(row?.id || '').trim() === item.tempId);
                        if (tempIndex >= 0) {
                            messages[tempIndex] = {
                                ...sentMessage,
                                isOptimistic: false,
                                localStatus: 'sent'
                            };
                            this.accountMessagesState = {
                                ...state,
                                messages
                            };
                            this.renderAccountMessagesPanel();
                        }
                    }
                } catch (err) {
                    debugLog(`[Chat Outbox] Failed to process message ${item.tempId}`, err);
                    item.retryCount = (item.retryCount || 0) + 1;
                }
            }
            
            const updatedOutbox = await localforage.getItem(cacheKey).catch(() => null) || [];
            const remaining = updatedOutbox.map(o => {
                const match = outbox.find(item => item.tempId === o.tempId);
                return match ? { ...o, retryCount: match.retryCount } : o;
            }).filter(o => o.retryCount < 5);
            await localforage.setItem(cacheKey, remaining);

        } catch (err) {
            debugLog("[Chat Outbox] Error processing outbox", err);
        } finally {
            this._processingOutbox = false;
        }
    }

    setupStartScreen() {
        this.ensureStartScreenEnhancements();
        this.ensureGameHudEnhancements();
        this.ensureMenuEnhancements();
        this.ensureAuthIconMarkup();
        this.ensureSocialIconMarkup();
        this.ensureSocialCenterUi();
        this.ensureSocialDebugPanel();
        this.ensureNameEditModal();
        this.ensureSeatSelectionUi();
        this.setLanguage(this.currentLang);
        this.syncStartModeUI();

        const openSoloBtn = document.getElementById('open-solo-modal-btn');
        const openOnlineBtn = document.getElementById('open-online-modal-btn');
        const onlineCreateChoiceBtn = document.getElementById('online-create-choice-btn');
        const onlineConnectChoiceBtn = document.getElementById('online-connect-choice-btn');
        const accountBtn = document.getElementById('account-btn');
        const openLeaderboardBtn = document.getElementById('open-leaderboard-btn');
        const openFriendsBtn = document.getElementById('open-friends-btn');
        const openSocialBtn = document.getElementById('open-social-btn');
        const landingGoogleBtn = document.getElementById('landing-google-login-btn');
        const landingAppleBtn = document.getElementById('landing-apple-login-btn');
        const resumeSessionBtn = document.getElementById('resume-session-btn');
        const soloModalClose = document.getElementById('solo-modal-close');
        const onlineModalClose = document.getElementById('online-modal-close');
        const accountModalClose = document.getElementById('account-modal-close');
        const leaderboardModalClose = document.getElementById('leaderboard-modal-close');
        const friendsModalClose = document.getElementById('friends-modal-close');
        const socialCenterModalClose = document.getElementById('social-center-modal-close');
        const coinShopModalClose = document.getElementById('coin-shop-modal-close');
        const cosmeticsShopModalClose = document.getElementById('cosmetics-shop-modal-close');
        const coinShopVideoBtn = document.getElementById('coin-shop-video-btn');
        const startScreen = document.getElementById('start-screen');
        if (startScreen && startScreen.dataset.modeToggleBound !== '1') {
            startScreen.dataset.modeToggleBound = '1';
            startScreen.addEventListener('click', (event) => {
                const button = event.target?.closest?.('[data-mode-toggle]');
                if (!button) return;
                const nextMode = String(button.dataset.modeToggle || '').trim();
                if (!nextMode) return;
                this.setPreferredStartMode(nextMode);
            });
        }

        if (openSoloBtn) openSoloBtn.addEventListener('click', () => {
            this.syncSoloOptions();
            this.showStartModal('solo');
        });
        if (openOnlineBtn) openOnlineBtn.addEventListener('click', () => {
            this.onlineRoomSource = 'closed';
            this.onlineRoomVisibility = 'closed';
            this.resetMultiplayerPanels(false);
            this.syncMultiplayerOptions();
            this.showStartModal('online');
            this.showOnlineLanding();
        });
        const openRoomsBtn = document.getElementById('open-rooms-btn');
        const openRoomsCreateBtn = document.getElementById('open-rooms-create-btn');
        const startCoinShopBtn = document.getElementById('start-coin-shop-btn');
        const startCosmeticsShopBtn = document.getElementById('start-cosmetics-shop-btn');
        if (openRoomsBtn) openRoomsBtn.addEventListener('click', () => this.showOpenRoomsModal());
        if (openRoomsCreateBtn) openRoomsCreateBtn.addEventListener('click', () => {
            this.onlineRoomSource = 'open';
            this.onlineRoomVisibility = 'open';
            this.prefillOnlineNameIfPossible();
            this.hideOpenRoomsModal({ restorePreviousScreen: true });
            this.showStartModal('online');
            this.showOnlineCreateFlow('open');
        });
        if (openLeaderboardBtn) openLeaderboardBtn.addEventListener('click', async () => {
            await this.openLeaderboardModal();
        });
        document.querySelectorAll('[data-leaderboard-scope]').forEach((button) => {
            button.addEventListener('click', () => {
                void this.loadLeaderboard(button.dataset.leaderboardScope || 'overall', this.getSelectedGameMode());
            });
        });
        if (openFriendsBtn) openFriendsBtn.addEventListener('click', async () => {
            await this.openFriendsModal();
        });
        if (openSocialBtn) openSocialBtn.addEventListener('click', async () => {
            await this.openSocialCenterModal('friends');
        });
        const socialCenterTabs = document.getElementById('social-center-tabs');
        const socialCenterModal = document.getElementById('social-center-modal');
        if (socialCenterTabs && !socialCenterTabs.dataset.bound) {
            socialCenterTabs.dataset.bound = '1';
            socialCenterTabs.addEventListener('click', async (event) => {
                const button = event.target.closest?.('[data-social-tab]');
                if (!button) return;
                const tab = String(button.dataset.socialTab || '').trim();
                if (!tab) return;
                await this.loadSocialCenterTab(tab);
            });
        }
        if (socialCenterModal && socialCenterModal.dataset.feedbackBound !== '1') {
            socialCenterModal.dataset.feedbackBound = '1';
            socialCenterModal.addEventListener('click', (event) => {
                const target = event.target?.closest?.('#social-feedback-btn');
                if (!target) return;
                event.preventDefault();
                this.openFeedbackModal();
            });
        }
        if (startCoinShopBtn) startCoinShopBtn.addEventListener('click', async () => {
            await this.openCoinShopModal();
        });
        if (startCosmeticsShopBtn) startCosmeticsShopBtn.addEventListener('click', async () => {
            await this.openCosmeticsShopModal();
        });
        if (onlineCreateChoiceBtn) onlineCreateChoiceBtn.addEventListener('click', () => {
            this.showOnlineCreateFlow();
        });
        if (onlineConnectChoiceBtn) onlineConnectChoiceBtn.addEventListener('click', () => {
            this.showOnlineJoinFlow();
        });
        const onlineSocialRefreshBtn = document.getElementById('online-social-refresh-btn');
        const openRoomsModalClose = document.getElementById('open-rooms-modal-close');
        if (onlineSocialRefreshBtn) onlineSocialRefreshBtn.addEventListener('click', () => void this.loadFriendsHub());
        if (openRoomsModalClose) openRoomsModalClose.addEventListener('click', () => this.closeOpenRoomsModal());
        if (accountBtn) accountBtn.addEventListener('click', async () => {
            await this.openAccountModal();
        });
        if (leaderboardModalClose) leaderboardModalClose.addEventListener('click', () => this.closeLeaderboardModal());
        if (friendsModalClose) friendsModalClose.addEventListener('click', () => this.closeFriendsModal());
        const playerProfileModalClose = document.getElementById('player-profile-modal-close');
        const playerProfileModal = document.getElementById('player-profile-modal');
        if (playerProfileModal && playerProfileModal.dataset.bound !== '1') {
            playerProfileModal.dataset.bound = '1';
            playerProfileModal.addEventListener('click', (event) => event.stopPropagation());
            playerProfileModal.querySelector('.modal-card')?.addEventListener('click', (event) => event.stopPropagation());
        }
        if (playerProfileModalClose) playerProfileModalClose.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.closePlayerProfileModal();
        });
        if (landingGoogleBtn) landingGoogleBtn.addEventListener('click', () => this.startGoogleAccountSignIn());
        if (landingAppleBtn) landingAppleBtn.addEventListener('click', () => this.startAppleAccountSignIn());
        if (resumeSessionBtn) resumeSessionBtn.addEventListener('click', async () => {
            await this.resumeSavedSession();
        });
        if (soloModalClose) soloModalClose.addEventListener('click', () => this.showStartModal(null));
        if (onlineModalClose) onlineModalClose.addEventListener('click', () => this.closeOnlineModalToSource());
        if (accountModalClose) accountModalClose.addEventListener('click', () => this.closeAccountModal());
        if (socialCenterModalClose) socialCenterModalClose.addEventListener('click', () => this.closeSocialCenterModal());
        if (coinShopModalClose) coinShopModalClose.addEventListener('click', () => this.closeCoinShopModal());
        if (cosmeticsShopModalClose) cosmeticsShopModalClose.addEventListener('click', () => this.closeCosmeticsShopModal());
        if (coinShopVideoBtn) coinShopVideoBtn.addEventListener('click', async () => {
            await this.claimCoinShopVideoReward();
        });
        document.querySelectorAll('#friends-search-input').forEach((friendsSearchInput) => {
            friendsSearchInput.addEventListener('input', () => this.scheduleFriendsSearch());
        });

        const soloNameInput = document.getElementById('player-name');
        const onlineNameInput = document.getElementById('player-name-online');
        const dlossInput = document.getElementById('dloss-setting');
        if (soloNameInput && onlineNameInput) {
            const syncName = (source, target) => {
                source.addEventListener('input', () => {
                    target.value = source.value;
                });
            };
            syncName(soloNameInput, onlineNameInput);
            syncName(onlineNameInput, soloNameInput);
        }
        if (dlossInput) {
            const clampLossValue = () => {
                const digits = String(dlossInput.value || '').replace(/\D/g, '').slice(0, 3);
                const next = digits === '' ? '' : String(Math.min(365, parseInt(digits, 10)));
                dlossInput.value = next;
            };
            dlossInput.addEventListener('input', clampLossValue);
            dlossInput.addEventListener('blur', () => {
                if (!dlossInput.value) dlossInput.value = '255';
                clampLossValue();
            });
            clampLossValue();
        }

        document.querySelectorAll('#player-count-group .btn-option').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('#player-count-group .btn-option').forEach(x => x.classList.remove('active'));
                b.classList.add('active'); this.playerCount = parseInt(b.dataset.value, 10);
            });
        });
        document.querySelectorAll('#difficulty-group .btn-option').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('#difficulty-group .btn-option').forEach(x => x.classList.remove('active'));
                b.classList.add('active'); this.difficulty = b.dataset.value;
                this.syncSoloOptions();
            });
        });
        document.getElementById('start-game-btn')?.addEventListener('click', async () => {
            const name = this.requirePlayerName('solo');
            if (!name) return;
            const profile = await this.requireRegisteredAccount('account-registration-required');
            if (!profile) return;
            this.playerName = name;
            this.isTeamMode = false;
            const soloSelection = this.readSoloEconomySelectionFromUi();
            this.soloEconomyMode = soloSelection.mode;
            this.soloStakeKey = soloSelection.stakeKey;
            this.syncSoloOptions();
            this.syncMultiplayerOptions();
            this.myHand = null;
            await this.startNewGame();
        });

        document.querySelectorAll('#online-player-count-group .btn-option').forEach(b => {
            b.addEventListener('click', () => {
                if (b.disabled) return;
                this.onlinePlayerCount = parseInt(b.dataset.value, 10);
                this.syncMultiplayerOptions();
            });
        });

        const onlineAiInput = document.getElementById('online-ai-count');
        if (onlineAiInput) {
            onlineAiInput.addEventListener('input', () => {
                const maxAi = this.isTeamMode ? 2 : Math.max(0, this.onlinePlayerCount - 1);
                const nextValue = Math.max(0, Math.min(maxAi, parseInt(onlineAiInput.value, 10) || 0));
                this.onlineAiCount = nextValue;
                this.syncMultiplayerOptions();
            });
        }

        document.querySelectorAll('#multi-mode-group .btn-option').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('#multi-mode-group .btn-option').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                this.isTeamMode = (b.dataset.value === 'team');
                if (this.isTeamMode) {
                    this.onlinePlayerCount = 4;
                }
                this.syncMultiplayerOptions();
            });
        });

        document.querySelectorAll('#solo-stake-group .btn-option').forEach((button) => {
            button.addEventListener('click', () => {
                if (button.disabled) return;
                document.querySelectorAll('#solo-stake-group .btn-option').forEach((item) => item.classList.remove('active'));
                button.classList.add('active');
                this.soloStakeKey = button.dataset.value || 'stake_50';
                this.syncSoloOptions();
            });
        });

        document.querySelectorAll('#online-stake-group .btn-option').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('#online-stake-group .btn-option').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                this.onlineStakeKey = b.dataset.value || 'stake_50';
                this.syncMultiplayerOptions();
            });
        });

        document.getElementById('host-game-btn')?.addEventListener('click', async () => {
            const name = this.requirePlayerName('online');
            if (!name) return;
            const roomCreateMode = this.isTeamMode ? 'team' : 'ffa';
            const roomCreateOptions = {
                isTeamMode: roomCreateMode === 'team',
                roomMode: roomCreateMode,
                gameMode: this.getSelectedGameMode(),
                playerCount: this.onlinePlayerCount,
                aiCount: this.onlineAiCount,
                roomVisibility: this.onlineRoomVisibility === "open" ? "open" : "closed",
                stakeKey: this.onlineStakeKey || "stake_200",
                instantWinEnabled: document.getElementById('instant-win-setting')?.checked,
                dlossThreshold: parseInt(document.getElementById('dloss-setting')?.value || '255', 10)
            };
            this._lastStartGamePayloadSafe = this.buildStartGamePayloadSafe(roomCreateOptions);
            const profile = await this.requireRegisteredAccount('account-registration-required-online');
            if (!profile) {
                this.setHostStatus(this.t('account-registration-required-online'));
                return;
            summary.textContent = `${this.format('online-room-summary', { humans, bots: this.onlineAiCount, total: this.onlinePlayerCount })} · ${stakeLabel}`;
            }
            this.playerName = name;
            this.showMultiplayerPanel('host');
            this.setHostStatus(this.t('online-room-status-created'));
            this.network.hostGame(async (roomId) => {
                const inviteCode = await this.network.resolveRoomCode(roomId).catch(() => null);
                const roomCode = String(inviteCode || '').trim().toUpperCase();
                document.getElementById('room-code-display').textContent = roomCode || String(roomId || '').trim();
                void this.attachGameInviteRoom(roomId).catch(() => {});
                this.setHostStatus(this.t('online-room-status-waiting'));
                document.getElementById('online-invite-status-banner')?.classList.add('is-hidden');
            }, (err) => {
                this.setHostStatus(`${this.t('online-room-status-error')}: ${err}`);
            }, roomCreateOptions);
        });

        document.getElementById('join-game-btn')?.addEventListener('click', () => {
            this.showMultiplayerPanel('join');
            this.setJoinStatus(this.t('online-room-join-hint'));
        });

        document.getElementById('connect-btn')?.addEventListener('click', async () => {
            const code = String(document.getElementById('join-code-input')?.value || '').trim().toUpperCase();
            if (!code) return;
            await this.joinOnlineRoom(code);
        });

        document.getElementById('join-code-input')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                document.getElementById('connect-btn')?.click();
            }
        });
        document.getElementById('open-room-search-input')?.addEventListener('input', () => {
            this.onlineRoomFilters.search = document.getElementById('open-room-search-input').value || '';
            void this.loadOpenRooms();
        });
        document.querySelectorAll('.open-room-mode-toggle').forEach((button) => button.addEventListener('click', () => {
            this.toggleOpenRoomModeFilter(button.dataset.roomMode || '');
            void this.loadOpenRooms();
        }));
        document.querySelectorAll('.open-room-stake-toggle').forEach((button) => button.addEventListener('click', () => {
            this.toggleOpenRoomStakeFilter(button.dataset.stakeKey || '');
            void this.loadOpenRooms();
        }));
        document.querySelectorAll('#friends-search-input').forEach((friendsSearchInput) => {
            friendsSearchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    void this.searchFriendsPage();
                }
            });
        });
        const friendSearchInput = document.getElementById('friend-search-input');
        if (friendSearchInput) {
            friendSearchInput.addEventListener('input', () => {
                if (this._friendSearchTimer) {
                    clearTimeout(this._friendSearchTimer);
                }
                this._friendSearchTimer = window.setTimeout(() => {
                    this._friendSearchTimer = null;
                    void this.searchFriends();
                }, 300);
            });
            friendSearchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    if (this._friendSearchTimer) {
                        clearTimeout(this._friendSearchTimer);
                        this._friendSearchTimer = null;
                    }
                    void this.searchFriends();
                }
            });
        }
        document.getElementById('copy-room-code-btn')?.addEventListener('click', async () => {
            await this.shareCurrentRoomCode();
        });
        document.getElementById('host-cancel-btn')?.addEventListener('click', () => {
            this.closeOnlineModalToSource();
        });
        document.getElementById('join-cancel-btn')?.addEventListener('click', () => {
            this.closeOnlineModalToSource();
        });

        const googleLoginBtn = document.getElementById('google-login-btn');
        const appleLoginBtn = document.getElementById('apple-login-btn');
        const editNameBtn = document.getElementById('account-edit-name-btn');
        const editAvatarBtn = document.getElementById('account-edit-avatar-btn');
        const refreshAccountBtn = document.getElementById('account-refresh-btn');
        const logoutAccountBtn = document.getElementById('account-logout-btn');
        const nameModalCloseBtn = document.getElementById('account-name-modal-close');
        const nameModalCancelBtn = document.getElementById('account-name-modal-cancel');
        const avatarModalCloseBtn = document.getElementById('account-avatar-modal-close');
        const avatarModalCancelBtn = document.getElementById('account-avatar-modal-cancel');

        if (googleLoginBtn) googleLoginBtn.addEventListener('click', () => {
            this.startGoogleAccountSignIn();
        });
        if (appleLoginBtn) appleLoginBtn.addEventListener('click', () => {
            this.startAppleAccountSignIn();
        });

        if (refreshAccountBtn) refreshAccountBtn.addEventListener('click', async () => {
            await this.loadAccountProfile();
        });
        if (editNameBtn) editNameBtn.addEventListener('click', () => this.openNameEditModal());
        if (editAvatarBtn) editAvatarBtn.addEventListener('click', () => this.openAvatarEditModal());
        if (logoutAccountBtn) logoutAccountBtn.addEventListener('click', async () => {
            await this.sendSocialPresenceUpdate('offline').catch(() => {});
            this.closeSocialRealtime();
            await this.account.logout();
            stopMusic();
            this.accountProfile = null;
            this.accountDetails = null;
            this.accountOnline = false;
            this.resetSocialCenterState();
            this.setAccountMode('login');
            this.setAccountStatus('');
            this.renderAccountModal();
            this.syncStartAuthButton();
            this.syncStartAuthGate();
            this.updateSocialCenterBadge();
            this.dailyBonusState.status = null;
            this.dailyBonusState.loading = false;
            this.dailyBonusState.claiming = false;
            this.dailyBonusState.claimingMode = '';
            this.dailyBonusState.rewardedAdAvailable = null;
            this.dailyBonusState.rewardedAdStartedAt = 0;
            this.dailyBonusState.rewardedAdCompletedAt = 0;
            this.dailyBonusState.rewardedAdCancelledAt = 0;
            this.dailyBonusState.rewardedAdError = '';
            this.dailyBonusState.lastDailyBonusClaimMode = '';
            this.dailyBonusState.lastDailyBonusClaimReward = 0;
            this.dailyBonusState.error = '';
            this.stopDailyBonusTicker();
            this.renderDailyBonusCard();
        });
        if (nameModalCloseBtn) nameModalCloseBtn.addEventListener('click', () => this.closeNameEditModal());
        if (nameModalCancelBtn) nameModalCancelBtn.addEventListener('click', () => this.closeNameEditModal());
        if (avatarModalCloseBtn) avatarModalCloseBtn.addEventListener('click', () => this.closeAvatarEditModal());
        if (avatarModalCancelBtn) avatarModalCancelBtn.addEventListener('click', () => this.closeAvatarEditModal());
        document.getElementById('account-name-form')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.saveAccountDisplayName();
        });
        document.getElementById('account-avatar-form')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.saveAccountAvatar();
        });

        const startLangSelect = document.getElementById('start-lang-select');
        if (startLangSelect) {
            startLangSelect.addEventListener('change', () => {
                const lang = String(startLangSelect.value || '').trim().toLowerCase();
                if (lang) this.setLanguage(lang);
            });
        }
        this.syncMultiplayerOptions();
        this.resetMultiplayerPanels(false);
        this.showStartModal(null);
        this.renderAccountModal();
        this.syncStartAuthButton();
        this.syncStartAuthGate();
        this.ensureShopIconMarkup();
        const dailyBonusClaimBtn = document.getElementById('daily-bonus-claim-btn');
        if (dailyBonusClaimBtn) {
            dailyBonusClaimBtn.addEventListener('click', () => {
                const status = this.dailyBonusState.status;
                const doubleAvailable = Boolean(status && status.doubleClaimAvailable);
                if (doubleAvailable) {
                    this.claimDailyBonus('rewarded_x2');
                } else {
                    this.claimDailyBonus('normal');
                }
            });
        }
    }

    readPlayerName(preferred = 'any') {
        const primary = document.getElementById('player-name');
        const online = document.getElementById('player-name-online');
        const value = preferred === 'online'
            ? (online?.value || primary?.value || '').trim()
            : preferred === 'solo'
                ? (primary?.value || online?.value || '').trim()
                : (primary?.value || online?.value || '').trim();
        return this.sanitizeName(value, '');
    }

    async bootstrapAccount() {
        try {
            const details = await this.account.bootstrap(this.getSelectedGameMode());
            this.accountDetails = details;
            this.accountProfile = details?.profile || details?.user || this.account.getStoredProfile();
            this.accountOnline = this.hasAuthenticatedAccount(this.accountProfile);
            this.accountMode = this.accountOnline ? 'profile' : 'login';
            this.prefillAccountNames();
            this.applyActiveTableSkin();
            if (this.accountOnline) {
                void this.loadTableSkinShop();
                void this.loadGiftHub();
                void this.loadDailyBonusStatus();
                void this.ensureSocialRealtimeStarted('account-ready');
                startMenuMusic();
            } else {
                this.tableSkinShop = null;
            }
            this.renderAccountModal();
            this.syncStartAuthButton();
            this.refreshResumeBanner(null);
            await this.validateStoredResumeSnapshot();
            void this.loadSocialSummary();
            if (this.hasAuthenticatedAccount()) {
                void this.ensureSocialRealtimeStarted('session-restored');
            }
            if (!this.hasAuthenticatedAccount()) this.setAccountStatus(this.t('account-login-required'));
        } catch (err) {
            debugLog('bootstrapAccount failed:', err);
            this.accountOnline = this.hasAuthenticatedAccount(this.accountProfile);
            if (!this.accountOnline) {
                this.accountMode = 'login';
            }
        } finally {
            this.authResolved = true;
            const startScreen = document.getElementById('start-screen');
            if (startScreen) startScreen.classList.remove('auth-checking');
            try {
                sessionStorage.removeItem('dominoAuthPending');
            } catch (_) {}
            this.syncStartAuthGate();
        }
    }

    hasAuthenticatedAccount(profile = this.accountProfile) {
        return Boolean(profile) && !profile.isGuest;
    }

    async requireRegisteredAccount(messageKey = 'account-registration-required') {
        await this.loadAccountProfile();
        if (this.hasAuthenticatedAccount()) {
            return this.accountProfile;
        }
        this.accountMode = 'login';
        this.closeStartModals();
        this.syncStartAuthGate();
        this.renderAccountModal();
        this.syncStartAuthButton();
        this.setAccountStatus(this.t(messageKey));
        this.renderer.showMessage(this.t(messageKey), 2200);
        return null;
    }

    prefillAccountNames() {
        const name = this.accountProfile?.gameDisplayName || this.getOnlineDisplayName?.() || '';
        const email = this.accountProfile?.email || '';
        if (!name) return;
        const soloNameInput = document.getElementById('player-name');
        const onlineNameInput = document.getElementById('player-name-online');
        const accountDisplayNameInput = document.getElementById('account-display-name-input');
        if (soloNameInput && !soloNameInput.value.trim()) soloNameInput.value = name;
        if (onlineNameInput && !onlineNameInput.value.trim()) onlineNameInput.value = name;
        if (accountDisplayNameInput && !accountDisplayNameInput.value.trim()) accountDisplayNameInput.value = name;
    }

    async ensureGuestAccount(name, options = {}) {
        void name;
        void options;
        return this.requireRegisteredAccount('account-registration-required');
    }

    async loadAccountProfile(mode = this.getSelectedGameMode()) {
        try {
            const details = await this.account.getProfileDetails(mode);
            if (details) {
                this.accountDetails = details;
                this.accountProfile = details?.profile || details?.user || this.accountProfile;
                this.accountOnline = true;
                if (this.accountProfile) this.accountMode = 'profile';
                this.prefillAccountNames();
                this.applyActiveTableSkin();
                void this.loadTableSkinShop();
                this.renderAccountModal();
                this.syncStartAuthButton();
                void this.loadGiftHub();
                void this.loadSocialSummary();
                void this.loadDailyBonusStatus();
                this.setAccountStatus(this.t('account-online'));
                this._socialSocketFallbackActive = false;
                void this.ensureSocialRealtimeStarted('account-ready');
                this.initSocialSse();
                return details;
            }
        } catch (err) {
            this.setAccountStatus(err.message || this.t('account-server-unavailable'));
        }

        const hadProfile = Boolean(this.accountProfile);
        this.accountOnline = false;
        this.accountDetails = null;
        if (!hadProfile) this.accountProfile = null;
        if (!hadProfile) this.applyActiveTableSkin();
        this.resetSocialCenterState();
        this.renderAccountModal();
        this.syncStartAuthButton();
        this.updateSocialCenterBadge();
        if (!hadProfile) this.syncStartAuthGate();
        return null;
    }

    async openAccountModal() {
        if (!this.hasAuthenticatedAccount()) {
            this.syncStartAuthGate();
            return;
        }
        this.closePlayerProfileModal();
        this.closeStartModals();
        this.ensureAccountModalPortal();

        // Track and deactivate current screen
        const startScreen = document.getElementById('start-screen');
        const gameScreen = document.getElementById('game-screen');
        if (startScreen && startScreen.classList.contains('active')) {
            this.profilePrevScreen = 'start-screen';
            startScreen.classList.remove('active');
        } else if (gameScreen && gameScreen.classList.contains('active')) {
            this.profilePrevScreen = 'game-screen';
            gameScreen.classList.remove('active');
        } else if (!this.profilePrevScreen) {
            this.profilePrevScreen = 'start-screen';
        }

        const modal = document.getElementById('account-modal');
        if (modal) {
            if (modal.parentElement !== document.body) document.body.appendChild(modal);
            modal.style.zIndex = '';
            modal.classList.add('active');
        }
        this.accountMode = this.accountProfile ? 'profile' : 'login';
        this.renderAccountModal();
        this.syncStartAuthButton();
        await this.loadAccountProfile(this.getSelectedGameMode());
        void this.loadTableSkinShop();
        await this.loadGiftHub();
    }

    async openLeaderboardModal() {
        this.closeStartModals();
        this.closePlayerProfileModal();
        this.closeAccountModal();
        this.closeCoinShopModal();
        this.closeCosmeticsShopModal();
        const startScreen = document.getElementById('start-screen');
        const gameScreen = document.getElementById('game-screen');
        if (startScreen && startScreen.classList.contains('active')) {
            this.leaderboardPrevScreen = 'start-screen';
            startScreen.classList.remove('active');
        } else if (gameScreen && gameScreen.classList.contains('active')) {
            this.leaderboardPrevScreen = 'game-screen';
            gameScreen.classList.remove('active');
        } else if (!this.leaderboardPrevScreen) {
            this.leaderboardPrevScreen = 'start-screen';
        }
        const modal = document.getElementById('leaderboard-modal');
        if (!modal) return;
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.style.zIndex = '';
        modal.classList.add('active');
        this.leaderboardGameMode = this.getSelectedGameMode();
        await this.loadLeaderboard(this.leaderboardScope || 'overall', this.leaderboardGameMode);
    }

    closeLeaderboardModal() {
        document.getElementById('leaderboard-modal')?.classList.remove('active');
        const prevScreenId = this.leaderboardPrevScreen || 'start-screen';
        const gameActive = document.getElementById('game-screen')?.classList.contains('active');
        if (!gameActive) {
            const prevScreen = document.getElementById(prevScreenId);
            if (prevScreen) prevScreen.classList.add('active');
        }
        this.leaderboardPrevScreen = null;
    }

    async openFriendsModal() {
        await this.openSocialCenterModal('friends');
    }

    closeFriendsModal() {
        this.closeSocialCenterModal();
    }

    async openSocialCenterModal(tab = 'friends', playerRef = null) {
        this.closeStartModals();
        this.closePlayerProfileModal();
        this.closeAccountModal();
        this.closeCoinShopModal();
        this.closeCosmeticsShopModal();
        this.closeLeaderboardModal();
        const modal = document.getElementById('social-center-modal');
        if (!modal) return;
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        const chat = document.getElementById('social-chats-panel');
        if (chat && chat.parentElement !== document.body) document.body.appendChild(chat);
        modal.dataset.opened = 'true';
        modal.classList.add('active');
        document.getElementById('start-screen')?.classList.remove('active');
        document.getElementById('social-chats-panel')?.classList.add('is-hidden');
        void this.ensureSocialRealtimeStarted('social-center-open');
        this.startSocialHubAutoRefresh();
        await this.loadSocialCenterTab(tab, playerRef);
    }

    closeSocialCenterModal() {
        this.stopSocialHubAutoRefresh();
        const modal = document.getElementById('social-center-modal');
        if (modal) modal.dataset.opened = 'false';
        modal?.classList.remove('active');
        document.getElementById('social-chats-panel')?.classList.add('is-hidden');
        document.getElementById('start-screen')?.classList.add('active');
        this.socialCenterTab = 'friends';
        this.socialCenterView = 'list';
        this.accountMessagesState = {
            ...(this.accountMessagesState || {}),
            activePlayerId: '',
            activePlayerProfile: null
        };
    }

    async loadSocialCenterTab(tab = 'friends', playerRef = null) {
        const nextTab = tab === 'friends' || tab === 'invites' || tab === 'inbox'
            ? tab
            : 'friends';

        let activePlayerId = '';
        if (playerRef) {
            activePlayerId = String(playerRef?.playerId || playerRef?.userId || playerRef?.id || playerRef || '').trim();
        }

        this.socialCenterTab = nextTab;
        this.socialCenterView = nextTab === 'inbox' && playerRef ? 'conversation' : 'list';

        if (nextTab === 'inbox' && this.socialCenterView === 'conversation' && activePlayerId) {
            const currentState = this.accountMessagesState || {};
            const isDifferentPlayer = String(currentState.activePlayerId || '').trim() !== activePlayerId;
            const cachedProfile = this.findCachedPlayerProfile(activePlayerId);
            this.accountMessagesState = {
                ...currentState,
                activePlayerId: activePlayerId,
                activePlayerProfile: isDifferentPlayer ? cachedProfile : (currentState.activePlayerProfile || cachedProfile),
                messages: isDifferentPlayer ? [] : (currentState.messages || []),
                conversationLoading: isDifferentPlayer,
                error: ''
            };
        } else if (playerRef && activePlayerId) {
            this.accountMessagesState = {
                ...(this.accountMessagesState || {}),
                activePlayerId: activePlayerId,
                error: ''
            };
        }

        this.renderSocialCenter();

        if (this.socialCenterView === 'conversation') {
            this.renderAccountMessagesPanel();
        }

        if (!this.hasAuthenticatedAccount()) {
            this.updateSocialCenterBadge();
            return;
        }

        void this.ensureSocialRealtimeStarted('social-tab-load');

        if (nextTab === 'inbox') {
            if (this.socialCenterView === 'conversation' && activePlayerId) {
                // Prioritize loading conversation first
                const convPromise = this.loadConversationWithPlayer(activePlayerId, true);

                // Run other updates in parallel
                void this.loadInboxPage().then(() => {
                    this.loadSocialInvitesPage().catch(() => {});
                });
                void this.loadMessageThreads();

                await convPromise;
            } else {
                await this.loadInboxPage();
                await this.loadSocialInvitesPage().catch(() => {});
            }
        } else {
            await this.loadSocialSummary();
            if (nextTab === 'friends') {
                await this.loadFriendsPage();
                await this.loadSocialInvitesPage().catch(() => {});
            } else if (nextTab === 'invites') {
                await this.loadSocialInvitesPage();
            }
        }

        await this.loadSocialSummary();
        this.updateSocialCenterBadge();
    }

    ensureFeedbackModal() {
        if (document.getElementById('feedback-modal')) return;
        if (typeof document === 'undefined' || !document.body) return;

        const modal = document.createElement('div');
        modal.id = 'feedback-modal';
        modal.className = 'modal-backdrop social-feedback-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <section class="modal-card social-feedback-card">
                <div class="modal-header account-modal-header feedback-modal-header">
                    <div class="account-modal-title-wrap feedback-modal-copy">
                        <p class="section-kicker" data-i18n="feedback-kicker">Support</p>
                        <h2 data-i18n="feedback-title">Обратная связь</h2>
                        <p class="modal-desc" data-i18n="feedback-desc">Tell us what you want to improve.</p>
                    </div>
                    <button class="btn btn-menu modal-close-btn account-modal-close-btn" id="social-feedback-close" type="button" aria-label="Close">×</button>
                </div>
                <form id="feedback-form" class="feedback-form">
                    <div class="feedback-field">
                        <label for="feedback-modal-category" data-i18n="feedback-category-label">Topic</label>
                        <select id="feedback-modal-category" class="feedback-category-select">
                            <option value="general" data-i18n="feedback-category-general">General</option>
                            <option value="bug" data-i18n="feedback-category-bug">Bug</option>
                            <option value="suggestion" data-i18n="feedback-category-suggestion">Suggestion</option>
                            <option value="other" data-i18n="feedback-category-other">Other</option>
                        </select>
                    </div>
                    <div class="feedback-field">
                        <label for="feedback-modal-contact" data-i18n="feedback-contact-label">Contact email</label>
                        <input type="email" id="feedback-modal-contact" class="feedback-contact-input" maxlength="254" data-i18n="feedback-contact-placeholder" placeholder="Optional email for reply">
                    </div>
                    <div class="feedback-field">
                        <label for="feedback-modal-message" data-i18n="feedback-message-label">Message</label>
                        <textarea id="feedback-modal-message" class="feedback-message-textarea" maxlength="2000" data-i18n="feedback-message-placeholder" placeholder="Tell us what happened or what should change"></textarea>
                    </div>
                    <div class="feedback-status" id="feedback-modal-status" role="status" aria-live="polite"></div>
                    <div class="feedback-actions">
                        <button class="btn btn-primary btn-large modal-primary-btn" id="feedback-modal-send" type="submit" data-i18n="feedback-send">Send</button>
                    </div>
                </form>
            </section>
        `;
        document.body.appendChild(modal);
        this.translateFeedbackModal(modal);

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.closeFeedbackModal();
            }
        });
        modal.querySelector('.modal-card')?.addEventListener('click', (event) => event.stopPropagation());

        document.getElementById('social-feedback-close')?.addEventListener('click', () => this.closeFeedbackModal());
        document.getElementById('feedback-form')?.addEventListener('submit', (event) => {
            event.preventDefault();
            void this.submitFeedback();
        });
    }

    translateFeedbackModal(root = document.getElementById('feedback-modal')) {
        if (!root) return;
        const lang = translations[this.currentLang] ? this.currentLang : 'az';
        const t = translations[lang] || translations.az;
        root.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = String(el.dataset.i18n || '').trim();
            const value = t[key] || translations.en?.[key] || translations.az?.[key] || key;
            if (!value) return;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = value;
            } else {
                el.textContent = value;
            }
        });
        const closeLabel = t['modal-close'] || translations.en?.['modal-close'] || translations.az?.['modal-close'] || 'Close';
        root.querySelectorAll('.modal-close-btn').forEach((button) => {
            button.title = closeLabel;
            button.setAttribute('aria-label', closeLabel);
        });
        const sendButton = root.querySelector('#feedback-modal-send');
        if (sendButton) {
            const sendLabel = t['feedback-send'] || translations.en?.['feedback-send'] || translations.az?.['feedback-send'] || 'Send';
            sendButton.title = sendLabel;
            sendButton.setAttribute('aria-label', sendLabel);
        }
    }

    ensurePlayerReportModal() {
        if (document.getElementById('player-report-modal')) return;
        if (typeof document === 'undefined' || !document.body) return;

        const modal = document.createElement('div');
        modal.id = 'player-report-modal';
        modal.className = 'modal-backdrop social-feedback-modal player-report-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <section class="modal-card social-feedback-card player-report-card">
                <div class="modal-header account-modal-header feedback-modal-header">
                    <div class="account-modal-title-wrap feedback-modal-copy">
                        <p class="section-kicker" data-i18n="player-report-kicker">Moderation</p>
                        <h2 id="player-report-title-text" data-i18n="player-report-title">Report player</h2>
                        <p class="modal-desc" id="player-report-desc" data-i18n="player-report-desc">Tell us what happened.</p>
                    </div>
                    <button class="btn btn-menu modal-close-btn account-modal-close-btn" id="player-report-close" type="button" aria-label="Close">×</button>
                </div>
                <form id="player-report-form" class="feedback-form">
                    <input type="hidden" id="player-report-target-id" value="">
                    <div class="feedback-field">
                        <label for="player-report-category" data-i18n="player-report-category-label">Category</label>
                        <select id="player-report-category" class="feedback-category-select">
                            <option value="chat" data-i18n="player-report-category-chat">Chat</option>
                            <option value="voice" data-i18n="player-report-category-voice">Voice</option>
                            <option value="avatar" data-i18n="player-report-category-avatar">Avatar</option>
                            <option value="other" data-i18n="player-report-category-other">Other</option>
                        </select>
                    </div>
                    <div class="feedback-field">
                        <label for="player-report-message" data-i18n="player-report-message-label">Reason</label>
                        <textarea id="player-report-message" class="feedback-message-textarea" maxlength="2000" data-i18n="player-report-message-placeholder" placeholder="Write a short reason"></textarea>
                    </div>
                    <div class="feedback-status" id="player-report-status" role="status" aria-live="polite"></div>
                    <div class="feedback-actions feedback-actions-single">
                        <button class="btn btn-primary btn-large modal-primary-btn" id="player-report-send" type="submit" data-i18n="player-report-send">Send report</button>
                    </div>
                </form>
            </section>
        `;
        document.body.appendChild(modal);
        this.translatePlayerReportModal(modal);

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.closePlayerReportModal();
            }
        });
        modal.querySelector('.modal-card')?.addEventListener('click', (event) => event.stopPropagation());

        document.getElementById('player-report-close')?.addEventListener('click', () => this.closePlayerReportModal());
        document.getElementById('player-report-form')?.addEventListener('submit', (event) => {
            event.preventDefault();
            void this.submitPlayerReport();
        });
    }

    translatePlayerReportModal(root = document.getElementById('player-report-modal')) {
        if (!root) return;
        const lang = translations[this.currentLang] ? this.currentLang : 'az';
        const t = translations[lang] || translations.az;
        root.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = String(el.dataset.i18n || '').trim();
            const value = t[key] || translations.en?.[key] || translations.az?.[key] || key;
            if (!value) return;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                if (el.tagName === 'SELECT') {
                    return;
                }
                el.placeholder = value;
            } else {
                el.textContent = value;
            }
        });
        const closeLabel = t['modal-close'] || translations.en?.['modal-close'] || translations.az?.['modal-close'] || 'Close';
        root.querySelectorAll('.modal-close-btn').forEach((button) => {
            button.title = closeLabel;
            button.setAttribute('aria-label', closeLabel);
        });
        const sendButton = root.querySelector('#player-report-send');
        if (sendButton) {
            const sendLabel = t['player-report-send'] || translations.en?.['player-report-send'] || translations.az?.['player-report-send'] || 'Send report';
            sendButton.title = sendLabel;
            sendButton.setAttribute('aria-label', sendLabel);
        }
    }

    openPlayerReportModal(playerRef, options = {}) {
        this.ensurePlayerReportModal();
        const modal = document.getElementById('player-report-modal');
        if (!modal) return false;
        const targetPlayerId = this.resolvePlayerProfileId(playerRef);
        if (!targetPlayerId) return false;
        const status = document.getElementById('player-report-status');
        const targetIdInput = document.getElementById('player-report-target-id');
        const category = document.getElementById('player-report-category');
        const message = document.getElementById('player-report-message');
        if (targetIdInput) targetIdInput.value = targetPlayerId;
        if (category) category.value = String(options.category || 'chat').trim() || 'chat';
        if (message) message.value = '';
        if (status) status.textContent = '';
        const title = document.getElementById('player-report-title-text');
        const desc = document.getElementById('player-report-desc');
        if (title) title.textContent = this.t('player-report-title');
        if (desc) desc.textContent = this.t('player-report-desc');
        this.translatePlayerReportModal(modal);
        document.body.appendChild(modal);
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('active');
        message?.focus?.();
        return true;
    }

    closePlayerReportModal() {
        const modal = document.getElementById('player-report-modal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        this.playerReportState = null;
    }

    async submitPlayerReport() {
        const modal = document.getElementById('player-report-modal');
        if (!modal) return;
        const targetPlayerId = String(document.getElementById('player-report-target-id')?.value || '').trim();
        const category = String(document.getElementById('player-report-category')?.value || 'chat').trim() || 'chat';
        const message = String(document.getElementById('player-report-message')?.value || '').trim();
        const status = document.getElementById('player-report-status');
        const sendButton = document.getElementById('player-report-send');
        if (!targetPlayerId || !message) {
            if (status) status.textContent = this.t('player-report-required');
            return;
        }
        if (sendButton) sendButton.disabled = true;
        if (status) status.textContent = this.t('feedback-sending');
        try {
            await this.account.reportPlayer(targetPlayerId, {
                category,
                reason: message
            });
            if (status) status.textContent = this.t('player-report-sent');
            this.renderer.showMessage(this.t('player-report-sent'), 1600);
            this.closePlayerReportModal();
        } catch (err) {
            if (status) status.textContent = err?.message || this.t('player-report-failed');
        } finally {
            if (sendButton) sendButton.disabled = false;
        }
    }

    openFeedbackModal() {
        this.ensureFeedbackModal();
        const modal = document.getElementById('feedback-modal');
        if (!modal) return;
        this.translateFeedbackModal(modal);
        const category = document.getElementById('feedback-modal-category');
        const contact = document.getElementById('feedback-modal-contact');
        const message = document.getElementById('feedback-modal-message');
        const status = document.getElementById('feedback-modal-status');
        if (category) category.value = 'general';
        if (contact) contact.value = String(this.accountProfile?.email || '').trim();
        if (message) message.value = '';
        if (status) status.textContent = '';
        document.body.appendChild(modal);
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('active');
        message?.focus?.();
    }

    closeFeedbackModal() {
        const modal = document.getElementById('feedback-modal');
        modal?.classList.remove('active');
        modal?.setAttribute('aria-hidden', 'true');
    }

    async submitFeedback() {
        const messageInput = document.getElementById('feedback-modal-message');
        const categoryInput = document.getElementById('feedback-modal-category');
        const contactInput = document.getElementById('feedback-modal-contact');
        const status = document.getElementById('feedback-modal-status');
        const sendBtn = document.getElementById('feedback-modal-send');
        const message = String(messageInput?.value || '').trim();
        const category = String(categoryInput?.value || 'general').trim() || 'general';
        const contactEmail = String(contactInput?.value || '').trim();

        if (!message) {
            if (status) status.textContent = this.t('feedback-message-required');
            messageInput?.focus?.();
            return false;
        }

        if (sendBtn) sendBtn.disabled = true;
        if (status) status.textContent = this.t('feedback-sending');
        try {
            await this.account.submitFeedback({
                message,
                category,
                contactEmail: contactEmail || undefined,
                locale: this.currentLang,
                appVersion: String(window.DOMINO_CLIENT_BUILD?.gitCommit || '').trim() || undefined
            });
            this.renderer.showMessage(this.t('feedback-sent'), 1800);
            if (status) status.textContent = this.t('feedback-sent');
            this.closeFeedbackModal();
            return true;
        } catch (err) {
            const messageText = err?.message || this.t('feedback-send-failed');
            if (status) status.textContent = messageText;
            this.renderer.showMessage(messageText, 2200);
            return false;
        } finally {
            if (sendBtn) sendBtn.disabled = false;
        }
    }

    closePlayerProfileModal() {
        this._lastProfileCloseAt = Date.now();
        this._lastProfileCloseAction = 'close-button';
        this._lastProfileCloseTouchedGameState = false;
        this._lastProfileCloseError = '';
        try {
            const currentRoomId = String(this.currentRoomState?.roomId || this.getCurrentRoomCode?.() || '').trim() || null;
            const currentGameState = {
                gameActive: Boolean(this.gameActive),
                matchOver: Boolean(this.matchOver),
                roundOver: Boolean(this.roundOver),
                roomId: currentRoomId,
                screen: document.getElementById('game-screen')?.classList.contains('active') ? 'game-screen' : 'start-screen'
            };
            this._lastProfileCloseActiveRoomIdBefore = currentRoomId;
            this._lastProfileCloseGameStateBefore = currentGameState;
            document.getElementById('player-profile-modal')?.classList.remove('active');
            this.playerProfileState = null;
            this._lastProfileCloseActiveRoomIdAfter = String(this.currentRoomState?.roomId || this.getCurrentRoomCode?.() || '').trim() || null;
            this._lastProfileCloseGameStateAfter = {
                gameActive: Boolean(this.gameActive),
                matchOver: Boolean(this.matchOver),
                roundOver: Boolean(this.roundOver),
                roomId: this._lastProfileCloseActiveRoomIdAfter,
                screen: document.getElementById('game-screen')?.classList.contains('active') ? 'game-screen' : 'start-screen'
            };
        } catch (error) {
            this._lastProfileCloseError = String(error?.message || error || '').trim();
            throw error;
        }
    }

    async openPlayerProfileModal(playerRef) {
        this._lastProfileOpenAttemptAt = Date.now();
        this._lastProfileOpenBlockedByMoveHint = this.isMoveHintSelectionActive();
        if (this._lastProfileOpenBlockedByMoveHint) {
            this._lastProfileClickBlockedAt = this._lastProfileOpenAttemptAt;
            this._lastProfileClickBlockedReason = 'move-hint-selection-active';
            return false;
        }
        const playerId = this.resolvePlayerProfileId(playerRef);
        const modal = document.getElementById('player-profile-modal');
        if (!modal || !playerId) return;
        this._lastProfileOpenAt = Date.now();

        document.body.appendChild(modal);
        modal.style.zIndex = '32000';
        modal.style.position = 'fixed';
        modal.classList.add('active');
        this.playerProfileState = {
            id: playerId,
            loading: true,
            profile: null
        };
        this.renderPlayerProfileModal();

        if (!this.hasAuthenticatedAccount()) {
            this.playerProfileState.loading = false;
            this.playerProfileState.error = this.t('player-profile-login-required');
            this.renderPlayerProfileModal();
            return;
        }

        try {
            const profile = await this.account.getPlayerProfile(playerId);
            this.playerProfileState = {
                id: playerId,
                loading: false,
                profile: profile || null,
                error: ''
            };
            this.renderPlayerProfileModal();
        } catch (err) {
            this.playerProfileState = {
                id: playerId,
                loading: false,
                profile: null,
                error: err?.message || this.t('player-profile-load-failed')
            };
            this.renderPlayerProfileModal();
        }
    }

    async openConversationWithPlayer(playerRef) {
        const playerId = this.resolvePlayerProfileId(playerRef);
        if (!playerId) return;
        if (!this.hasAuthenticatedAccount()) {
            await this.openAccountModal();
            return;
        }
        this.socialCenterTab = 'inbox';
        this.socialCenterView = 'conversation';

        const currentState = this.accountMessagesState || {};
        const isDifferentPlayer = String(currentState.activePlayerId || '').trim() !== playerId;
        this.accountMessagesState = {
            ...currentState,
            activePlayerId: playerId,
            activePlayerProfile: isDifferentPlayer ? null : currentState.activePlayerProfile,
            messages: isDifferentPlayer ? [] : (currentState.messages || []),
            error: ''
        };
        void this.ensureSocialRealtimeStarted('conversation-open');
        const modal = document.getElementById('social-center-modal');
        if (modal?.classList.contains('active')) {
            await this.loadSocialCenterTab('inbox', playerId);
            return;
        }
        await this.openSocialCenterModal('inbox', playerId);
    }

    resetSocialCenterState() {
        this.closeSocialRealtime();
        this.socialSummary = {
            inboxUnreadCount: 0,
            chatUnreadCount: 0,
            inviteUnreadCount: 0,
            friendRequestCount: 0,
            totalUnreadCount: 0
        };
        this.socialSummaryLoaded = false;
        this.socialInboxState = {
            items: [],
            unreadCount: 0,
            loading: false,
            error: ''
        };
        this.roomInvitations = { incoming: [], sent: [] };
        this.roomInvitationsLoading = false;
        this._lastDmEventAt = 0;
        this._lastInviteEventAt = 0;
        this._lastFriendEventAt = 0;
        this._lastInviteSendAttemptAt = 0;
        this._lastInviteSendPayloadSafe = null;
        this._lastInviteSendTransport = 'unknown';
        this._lastInviteSendEndpoint = '';
        this._lastInviteSendHttpStatus = null;
        this._lastInviteSendResultSafe = null;
        this._lastInviteSendError = '';
        this._lastInviteReceivedAt = 0;
        this._lastInviteReceivedPayloadSafe = null;
        this._lastInviteUpdateAt = 0;
        this._lastInviteUpdatePayloadSafe = null;
        this._lastIncomingInvitesSafe = [];
        this._lastPlayInviteEventAt = 0;
        this._lastPlayInviteSendAttemptAt = 0;
        this._lastPlayInviteSendPayloadSafe = null;
        this._lastPlayInviteSendTransport = 'unknown';
        this._lastPlayInviteSendEndpoint = '';
        this._lastPlayInviteSendHttpStatus = null;
        this._lastPlayInviteSendResultSafe = null;
        this._lastPlayInviteSendError = '';
        this._lastPlayInviteReceivedAt = 0;
        this._lastPlayInviteReceivedPayloadSafe = null;
        this._lastPlayInviteUpdateAt = 0;
        this._lastPlayInviteUpdatePayloadSafe = null;
        this._lastPlayInviteAcceptedAt = 0;
        this._lastPlayInviteAcceptedPayloadSafe = null;
        this._lastPlayInviteRoomAttachAttemptAt = 0;
        this._lastPlayInviteRoomAttachPayloadSafe = null;
        this._lastPlayInviteRoomAttachResultSafe = null;
        this._lastPlayInviteRoomAttachError = '';
        this._lastPlayInviteRoomReadyAt = 0;
        this._lastPlayInviteRoomReadyPayloadSafe = null;
        this._lastPlayInviteAutoJoinAttemptAt = 0;
        this._lastPlayInviteAutoJoinError = '';
        this._lastPlayInviteCancelAttemptAt = 0;
        this._lastPlayInviteCancelSource = 'unknown';
        this._lastPlayInviteCancelPayloadSafe = null;
        this._lastPlayInviteCancelResultSafe = null;
        this._lastPlayInviteCancelError = '';
        this._roomInvitationsRenderState = null;
        this._socialInviteTrace = null;
        this._roomInvitationsLastLoadedAt = 0;
        this._roomInvitationsLastError = '';
        this._mainSocialBadgeCount = 0;
        this._mainSocialBadgeVisible = false;
        this._socialCenterBadgeCount = 0;
        this._activeHeaderPlayerId = '';
        this._activeHeaderName = '';
        this._headerProfileMatchesConversation = true;
        this._conversationLoadInFlightByPlayer?.clear?.();
        this._messageThreadsLoadInFlight = null;
        this._roomInvitationsLoadInFlight = null;
        this._socialSoftRefreshTimer = null;
    }

    clearSocialSocketReconnectTimer() {
        if (this._socialSocketReconnectTimer) {
            clearTimeout(this._socialSocketReconnectTimer);
            this._socialSocketReconnectTimer = null;
        }
    }

    clearSocialSocketFallbackTimer() {
        if (this._socialSocketFallbackTimer) {
            clearTimeout(this._socialSocketFallbackTimer);
            this._socialSocketFallbackTimer = null;
        }
    }

    isSocialSocketDebugEnabled() {
        try {
            return window.DOMINO_DEBUG_SOCIAL === true || window.localStorage?.getItem("dominoDebugSocial") === "true";
        } catch {
            return window.DOMINO_DEBUG_SOCIAL === true;
        }
    }

    logSocialSocket(eventName, payload = {}) {
        if (!this.isSocialSocketDebugEnabled()) return;
        console.debug(`[SocialSocket] ${eventName}`, payload);
    }

    logSocialInvite(eventName, payload = {}) {
        if (!this.isSocialSocketDebugEnabled()) return;
        console.debug(`[SocialInvite] ${eventName}`, payload);
    }

    isSocialDebugPanelEnabled() {
        try {
            const params = new URLSearchParams(window.location?.search || '');
            return params.get('socialDebug') === '1' || window.localStorage?.getItem('dominoDebugSocial') === 'true';
        } catch {
            return window.DOMINO_DEBUG_SOCIAL === true;
        }
    }

    safeInviteDebugRecord(invite = {}) {
        return {
            id: String(invite?.id || '').trim() || null,
            roomId: String(invite?.roomId || '').trim() || null,
            roomCode: String(invite?.roomCode || '').trim() || null,
            inviterPlayerId: String(invite?.inviterPlayerId || invite?.inviter?.id || '').trim() || null,
            inviteePlayerId: String(invite?.inviteePlayerId || invite?.invitee?.id || '').trim() || null,
            status: String(invite?.status || '').trim() || null,
            kind: String(invite?.kind || '').trim() || null,
            createdAt: String(invite?.createdAt || '').trim() || null
        };
    }

    getSocialDebugState() {
        const realtime = this.getSocialRealtimeStatus?.() || {};
        const messagesState = this.accountMessagesState || {};
        const roomInvitations = this.roomInvitations || { incoming: [], sent: [] };
        const incomingInvites = Array.isArray(roomInvitations.incoming) ? roomInvitations.incoming : [];
        const outgoingInvites = Array.isArray(roomInvitations.sent) ? roomInvitations.sent : [];
        const messages = Array.isArray(messagesState.messages) ? messagesState.messages : [];
        const threads = Array.isArray(messagesState.threads) ? messagesState.threads : [];
        const activeRoom = this.getActiveInviteRoomContext?.() || {};
        const serverSummaryUnread = Math.max(0, Number(this.socialSummary?.totalUnreadCount || 0) || 0);
        const playInviteCounts = this.getPlayInviteCounts();
        const acceptedWaitingInvites = this.getAcceptedWaitingPlayInvites();
        const waitingPlayersSafe = acceptedWaitingInvites.slice(0, 3).map((invite) => ({
            id: String(invite?.invitee?.id || invite?.inviteePlayerId || '').trim() || null,
            displayName: String(invite?.invitee?.displayName || '').trim() || null,
            status: String(invite?.status || '').trim() || null
        }));
        const currentRoomState = this.currentRoomState || {};
        const resolvedRoomMode = this.resolveRoomModeState(currentRoomState, null);
        const lastRoomStatePlayersSafe = Array.isArray(this._lastRoomStatePlayersSafe) && this._lastRoomStatePlayersSafe.length
            ? this._lastRoomStatePlayersSafe
            : this.buildRoomStatePlayersSafe(currentRoomState);
        const lastRoomStateTeamAssignmentsSafe = Array.isArray(this._lastRoomStateTeamAssignmentsSafe) && this._lastRoomStateTeamAssignmentsSafe.length
            ? this._lastRoomStateTeamAssignmentsSafe
            : this.buildTeamAssignmentsSafe(currentRoomState);
        const lastRoomStateSeatAssignmentsSafe = Array.isArray(this._lastRoomStateSeatAssignmentsSafe) && this._lastRoomStateSeatAssignmentsSafe.length
            ? this._lastRoomStateSeatAssignmentsSafe
            : this.buildSeatAssignmentsSafe(currentRoomState);
        const lastRoomStateRoomStart = this._lastRoomStateRoomStart || currentRoomState?.roomStart || {};
        const activePlayerId = String(messagesState.activePlayerId || '').trim();
        const activeHeaderPlayerId = String(this._activeHeaderPlayerId || '').trim();
        const headerProfileMatchesConversation = !activePlayerId || !activeHeaderPlayerId || activeHeaderPlayerId === activePlayerId;
        const roomStartPlayers = Array.isArray(lastRoomStatePlayersSafe) ? lastRoomStatePlayersSafe : [];
        const roomStartHumanCount = roomStartPlayers.filter((player) => !player?.isBot).length;
        const roomStartBotCount = roomStartPlayers.filter((player) => Boolean(player?.isBot)).length;
        const roomStartReadyPlayersCount = roomStartPlayers.filter((player) => Boolean(player?.isConnected) && (!Boolean(currentRoomState?.isTeamMode) || (Number.isInteger(Number(player?.seatIndex)) && Number(player.seatIndex) >= 0))).length;
        const networkDisconnectDebug = this.network?.getDisconnectDebugState?.() || {};

        return {
            socket: {
                socketConnected: Boolean(realtime?.socketConnected),
                socketReady: Boolean(realtime?.socketReady),
                fallbackMode: String(realtime?.fallbackMode || '').trim() || null,
                ioEngineTransport: String(realtime?.ioEngineTransport || '').trim() || null,
                socketObjectExists: Boolean(realtime?.socketObjectExists),
                lastConnectError: String(realtime?.lastConnectError || '').trim()
            },
            currentUser: {
                currentPlayerId: String(this.getCurrentAccountPlayerId?.() || this.accountProfile?.playerId || this.accountProfile?.id || '').trim() || null,
                displayName: String(this.accountProfile?.displayName || this.accountProfile?.name || '').trim() || null,
                authenticated: Boolean(this.hasAuthenticatedAccount?.()),
                socialSummaryLoaded: Boolean(this.socialSummaryLoaded)
            },
            network: {
                lastNetworkLeaveRoomExplicit: networkDisconnectDebug.lastNetworkLeaveRoomExplicit,
                lastExplicitLeaveSentAt: Number(networkDisconnectDebug.lastExplicitLeaveSentAt || 0) || 0,
                lastAccidentalDisconnectAt: Number(networkDisconnectDebug.lastAccidentalDisconnectAt || this.lastAccidentalDisconnectAt || 0) || 0,
                resumeLastAttemptAt: Number(this.resumeLastAttemptAt || 0) || 0,
                resumeLastSuccess: Number(this.resumeLastSuccess || 0) || 0,
                resumeLastError: String(this.resumeLastError || '').trim() || null,
                lastGameEndModalReason: String(this.lastGameEndModalReason || '').trim() || null
            },
            chat: {
                currentConversationPlayerId: activePlayerId || null,
                activeHeaderPlayerId: activeHeaderPlayerId || null,
                activeHeaderName: String(this._activeHeaderName || '').trim() || null,
                headerProfileMatchesConversation,
                conversationLoading: Boolean(messagesState.conversationLoading),
                conversationMessageCount: messages.length,
                messageThreadsCount: threads.length,
                lastDmEventAt: Number(this._lastDmEventAt || 0) || 0,
                lastDmError: String(this._lastDmError || '').trim(),
                globalUnreadCount: serverSummaryUnread,
                mainSocialBadgeCount: Number(this._mainSocialBadgeCount || 0) || 0
            },
            invites: {
                activeRoomId: String(activeRoom?.roomId || '').trim() || null,
                activeRoomCode: String(activeRoom?.roomCode || '').trim() || null,
                activeRoomContextSource: String(activeRoom?.source || '').trim() || null,
                lastInviteSendAttemptAt: Number(this._lastInviteSendAttemptAt || 0) || 0,
                lastInviteSendPayloadSafe: this._lastInviteSendPayloadSafe || null,
                lastInviteSendTransport: String(this._lastInviteSendTransport || 'unknown').trim() || 'unknown',
                lastInviteSendEndpoint: String(this._lastInviteSendEndpoint || '').trim() || null,
                lastInviteSendHttpStatus: this._lastInviteSendHttpStatus ?? null,
                lastInviteSendResultSafe: this._lastInviteSendResultSafe || null,
                lastInviteSendError: String(this._lastInviteSendError || '').trim(),
                lastInviteReceivedAt: Number(this._lastInviteReceivedAt || 0) || 0,
                lastInviteReceivedPayloadSafe: this._lastInviteReceivedPayloadSafe || null,
                lastInviteUpdateAt: Number(this._lastInviteUpdateAt || 0) || 0,
                lastInviteUpdatePayloadSafe: this._lastInviteUpdatePayloadSafe || null,
                playInviteIncomingCount: playInviteCounts.incoming,
                playInviteOutgoingCount: playInviteCounts.outgoing,
                acceptedWaitingCount: playInviteCounts.waiting,
                incomingInviteCount: incomingInvites.length,
                outgoingInviteCount: outgoingInvites.length,
                roomInvitationsLoading: Boolean(this.roomInvitationsLoading),
                roomInvitationsLastLoadedAt: Number(this._roomInvitationsLastLoadedAt || 0) || 0,
                roomInvitationsLastError: String(this._roomInvitationsLastError || '').trim(),
                lastIncomingInvitesSafe: (this._lastIncomingInvitesSafe?.length ? this._lastIncomingInvitesSafe : incomingInvites.map((invite) => this.safeInviteDebugRecord(invite))).slice(0, 5),
                lastPlayInviteSendPayload: this._lastPlayInviteSendPayloadSafe || null,
                lastPlayInviteError: String(this._lastPlayInviteSendError || '').trim(),
                lastPlayInviteEventAt: Number(this._lastPlayInviteEventAt || 0) || 0,
                renderState: this._roomInvitationsRenderState || null,
                socialInviteTrace: this._socialInviteTrace || null,
                contextualRoomInvite: {
                    openSource: String(this._lastContextualInviteOpenSource || '').trim() || null,
                    roomId: String(this._lastContextualInviteRoomId || '').trim() || null,
                    roomCode: String(this._lastContextualInviteRoomCode || '').trim() || null,
                    roomMode: String(this._lastContextualInviteRoomMode || '').trim() || null,
                    targetSlotIndex: Number.isInteger(Number(this._lastContextualInviteTargetSlotIndex)) ? Number(this._lastContextualInviteTargetSlotIndex) : null,
                    selectedFriendId: String(this._lastContextualInviteSelectedFriendId || '').trim() || null,
                    sendAt: Number(this._lastContextualInviteSendAt || 0) || 0,
                    sendResultSafe: this._lastContextualInviteSendResultSafe || null,
                    sendError: String(this._lastContextualInviteSendError || '').trim() || null,
                    flowType: String(this._lastContextualInviteFlowType || '').trim() || null,
                    roomIdPersisted: Boolean(this._lastContextualInviteRoomIdPersisted),
                    roomCodePersisted: Boolean(this._lastContextualInviteRoomCodePersisted),
                    payloadSafe: this._lastContextualInvitePayloadSafe || null,
                    resultSafe: this._lastContextualInviteResultSafe || null
                },
                friendPicker: {
                    open: Boolean(this.friendPickerOpen),
                    source: String(this.friendPickerSource || '').trim() || null,
                    onlineCount: Number(this.friendPickerOnlineCount || 0) || 0,
                    offlineCount: Number(this.friendPickerOfflineCount || 0) || 0,
                    excludedAlreadyInRoomCount: Number(this.friendPickerExcludedAlreadyInRoomCount || 0) || 0
                }
            },
            roomRuntime: {
                activeRoomId: String(currentRoomState?.roomId || activeRoom?.roomId || '').trim() || null,
                activeRoomCode: String(currentRoomState?.roomCode || activeRoom?.roomCode || '').trim() || null,
                roomModeFromState: String(this._lastRoomStateRoomMode || resolvedRoomMode.roomModeFromState || '').trim() || null,
                isTeamModeFromState: typeof this._lastRoomStateIsTeamMode === 'boolean'
                    ? this._lastRoomStateIsTeamMode
                    : (typeof resolvedRoomMode.isTeamModeFromState === 'boolean' ? resolvedRoomMode.isTeamModeFromState : null),
                localIsTeamMode: Boolean(this.isTeamMode),
                scoreMode: String(this._resolvedScoreMode || resolvedRoomMode.scoreMode || (this.isTeamMode ? 'team' : 'solo')).trim() || null,
                topHudMode: String(this._resolvedTopHudMode || resolvedRoomMode.topHudMode || (this.isTeamMode ? 'team' : 'solo')).trim() || null,
                startGamePayloadSafe: this._lastStartGamePayloadSafe || null,
                lastRoomStateIsTeamMode: typeof this._lastRoomStateIsTeamMode === 'boolean' ? this._lastRoomStateIsTeamMode : null,
                lastRoomStateRoomMode: String(this._lastRoomStateRoomMode || '').trim() || null,
                lastRoomStatePlayersSafe,
                teamAssignmentsSafe: lastRoomStateTeamAssignmentsSafe,
                seatAssignmentsSafe: lastRoomStateSeatAssignmentsSafe,
                lastSeatPickerCloseAttemptAt: Number(this._lastSeatPickerCloseAttemptAt || 0) || 0,
                lastSeatPickerCloseAction: String(this._lastSeatPickerCloseAction || '').trim() || null,
                lastSeatPickerCloseStartedGame: Boolean(this._lastSeatPickerCloseStartedGame),
                lastSeatPickerCloseError: String(this._lastSeatPickerCloseError || '').trim() || null,
                lastCloseAttemptAt: Number(this._lastCloseAttemptAt || 0) || 0,
                lastCloseAction: String(this._lastCloseAction || '').trim() || null,
                lastCloseStartedGame: Boolean(this._lastCloseStartedGame),
                lastCloseCalledStartGame: Boolean(this._lastCloseCalledStartGame),
                lastCloseCalledSelectSeat: Boolean(this._lastCloseCalledSelectSeat),
                lastCloseCalledReady: Boolean(this._lastCloseCalledReady),
                lastCloseError: String(this._lastCloseError || '').trim() || null
            },
            roomStart: {
                roomMode: String((currentRoomState?.roomStart?.roomMode || this._lastRoomStateRoomStart?.roomMode || resolvedRoomMode.roomModeFromState || (this.isTeamMode ? 'team' : 'ffa'))).trim() || null,
                isTeamMode: typeof (currentRoomState?.roomStart?.isTeamMode ?? this._lastRoomStateRoomStart?.isTeamMode) === 'boolean'
                    ? Boolean(currentRoomState?.roomStart?.isTeamMode ?? this._lastRoomStateRoomStart?.isTeamMode)
                    : Boolean(currentRoomState?.isTeamMode ?? this.isTeamMode),
                maxPlayers: Number(currentRoomState?.roomStart?.maxPlayers || this._lastRoomStateRoomStart?.maxPlayers || currentRoomState?.totalPlayers || this.onlinePlayerCount || 0) || 0,
                occupiedSeats: Number(currentRoomState?.roomStart?.occupiedSeats || this._lastRoomStateRoomStart?.occupiedSeats || lastRoomStatePlayersSafe.length || 0) || 0,
                humanCount: Number(currentRoomState?.roomStart?.humanCount || this._lastRoomStateRoomStart?.humanCount || roomStartPlayers.filter((player) => !player?.isBot).length || 0) || 0,
                botCount: Number(currentRoomState?.roomStart?.botCount || this._lastRoomStateRoomStart?.botCount || roomStartPlayers.filter((player) => Boolean(player?.isBot)).length || 0) || 0,
                readyPlayersCount: Number(currentRoomState?.roomStart?.readyPlayersCount || this._lastRoomStateRoomStart?.readyPlayersCount || roomStartReadyPlayersCount || 0) || 0,
                botsReadyCount: Number(currentRoomState?.roomStart?.botsReadyCount || this._lastRoomStateRoomStart?.botsReadyCount || roomStartPlayers.filter((player) => Boolean(player?.isBot)).length || 0) || 0,
                pendingInvitesCount: Number(playInviteCounts.pending || 0) || 0,
                joinedInviteCount: Number(playInviteCounts.joined || 0) || 0,
                lastAutoStartCheckAt: Number(currentRoomState?.roomStart?.lastAutoStartCheckAt || this._lastAutoStartCheckAt || 0) || 0,
                lastAutoStartBlockedReason: String(currentRoomState?.roomStart?.lastAutoStartBlockedReason || this._lastAutoStartBlockedReason || '').trim() || null,
                lastAutoStartTriggeredAt: Number(currentRoomState?.roomStart?.lastAutoStartTriggeredAt || this._lastAutoStartTriggeredAt || 0) || 0
            },
            moveHints: {
                active: this.isMoveHintSelectionActive(),
                lastShownAt: Number(this._lastMoveHintShownAt || 0) || 0,
                lastClearedAt: Number(this._lastMoveHintClearedAt || 0) || 0,
                lastLeftHintRectSafe: this._lastLeftHintRectSafe || null,
                lastRightHintRectSafe: this._lastRightHintRectSafe || null,
                lastProfileClickBlockedAt: Number(this._lastProfileClickBlockedAt || 0) || 0,
                lastProfileClickBlockedReason: String(this._lastProfileClickBlockedReason || '').trim() || null,
                lastHintClickAt: Number(this._lastHintClickAt || 0) || 0,
                lastHintClickSide: String(this._lastHintClickSide || '').trim() || null,
                lastHintClickStoppedPropagation: Boolean(this._lastHintClickStoppedPropagation)
            },
            profile: {
                lastProfileOpenAt: Number(this._lastProfileOpenAt || 0) || 0,
                lastProfileCloseAt: Number(this._lastProfileCloseAt || 0) || 0,
                lastProfileCloseAction: String(this._lastProfileCloseAction || '').trim() || null,
                lastProfileCloseTouchedGameState: Boolean(this._lastProfileCloseTouchedGameState),
                lastProfileCloseError: String(this._lastProfileCloseError || '').trim() || null,
                activeRoomIdBeforeClose: String(this._lastProfileCloseActiveRoomIdBefore || '').trim() || null,
                activeRoomIdAfterClose: String(this._lastProfileCloseActiveRoomIdAfter || '').trim() || null,
                gameStateBeforeClose: this._lastProfileCloseGameStateBefore || null,
                gameStateAfterClose: this._lastProfileCloseGameStateAfter || null,
                lastProfileOpenAttemptAt: Number(this._lastProfileOpenAttemptAt || 0) || 0,
                lastProfileOpenBlockedByMoveHint: Boolean(this._lastProfileOpenBlockedByMoveHint)
            },
            teamHud: {
                topHudMode: String(this._resolvedTopHudMode || resolvedRoomMode.topHudMode || (this.isTeamMode ? 'team' : 'solo')).trim() || null,
                teamHudTeamsSafe: this._lastTeamHudTeamsSafe || [],
                teamAHudNames: Array.isArray(this._lastTeamAHudNames) ? this._lastTeamAHudNames.slice(0, 6) : [],
                teamBHudNames: Array.isArray(this._lastTeamBHudNames) ? this._lastTeamBHudNames.slice(0, 6) : [],
                isTeamModeFromState: typeof this._lastRoomStateIsTeamMode === 'boolean' ? this._lastRoomStateIsTeamMode : null,
                roomModeFromState: String(this._lastRoomStateRoomMode || resolvedRoomMode.roomModeFromState || '').trim() || null,
                lastTeamHudRenderAt: Number(this._lastTeamHudRenderAt || 0) || 0,
                lastTeamHudRenderSource: String(this._lastTeamHudRenderSource || '').trim() || null
            },
            seatPicker: {
                lastRoomCreateVisibility: String(this._lastRoomCreateVisibility || '').trim() || null,
                lastRoomCreateMode: String(this._lastRoomCreateMode || '').trim() || null,
                lastRoomCreateRequiresSeatPicker: Boolean(this._lastRoomCreateRequiresSeatPicker),
                lastSeatPickerOpenAttemptAt: Number(this._lastSeatPickerOpenAttemptAt || 0) || 0,
                lastSeatPickerOpenSource: String(this._lastSeatPickerOpenSource || '').trim() || null,
                lastSeatPickerOpenSkippedReason: String(this._lastSeatPickerOpenSkippedReason || '').trim() || null,
                inviteButtonRendered: Boolean(this._lastSeatPickerInviteButtonRendered),
                inviteButtonDisabledReason: String(this._lastSeatPickerInviteButtonDisabledReason || '').trim() || null,
                openedAfterRoomBoundInvite: Boolean(this._lastSeatPickerOpenedAfterRoomBoundInvite),
                inviteContextSafe: this._lastSeatPickerInviteContextSafe || null,
                renderError: ''
            },
            playInvite: {
                rawPlayInviteIncomingCount: playInviteCounts.rawIncoming,
                visiblePlayInviteIncomingCount: playInviteCounts.visibleIncoming,
                rawPlayInviteOutgoingCount: playInviteCounts.rawOutgoing,
                visiblePlayInviteOutgoingCount: playInviteCounts.visibleOutgoing,
                incomingCount: playInviteCounts.incoming,
                outgoingCount: playInviteCounts.outgoing,
                acceptedWaitingCount: playInviteCounts.waiting,
                waitingPlayersSafe,
                lastPlayInviteEventAt: Number(this._lastPlayInviteEventAt || 0) || 0,
                lastPlayInviteAcceptedAt: Number(this._lastPlayInviteAcceptedAt || 0) || 0,
                lastPlayInviteAcceptedPayloadSafe: this._lastPlayInviteAcceptedPayloadSafe || null,
                lastPlayInviteAcceptedFlowType: String(this._lastPlayInviteAcceptedFlowType || '').trim() || null,
                lastPlayInviteAcceptedHadRoomId: Boolean(this._lastPlayInviteAcceptedHadRoomId),
                lastPlayInviteAcceptedJoinAttemptAt: Number(this._lastPlayInviteAcceptedJoinAttemptAt || 0) || 0,
                lastPlayInviteAcceptedJoinRoomId: String(this._lastPlayInviteAcceptedJoinRoomId || '').trim() || null,
                lastPlayInviteAcceptedJoinRoomCode: String(this._lastPlayInviteAcceptedJoinRoomCode || '').trim() || null,
                lastPlayInviteAcceptedJoinError: String(this._lastPlayInviteAcceptedJoinError || '').trim() || null,
                lastPlayInviteAcceptedWaitingSuppressedForRoomBound: Boolean(this._lastPlayInviteAcceptedWaitingSuppressedForRoomBound),
                lastAcceptedInviteWasRoomBound: Boolean(this._lastAcceptedInviteWasRoomBound),
                lastPlayInviteRoomAttachAttemptAt: Number(this._lastPlayInviteRoomAttachAttemptAt || 0) || 0,
                lastPlayInviteRoomAttachPayloadSafe: this._lastPlayInviteRoomAttachPayloadSafe || null,
                lastPlayInviteRoomAttachResultSafe: this._lastPlayInviteRoomAttachResultSafe || null,
                lastPlayInviteRoomAttachError: String(this._lastPlayInviteRoomAttachError || '').trim(),
                lastPlayInviteRoomReadyAt: Number(this._lastPlayInviteRoomReadyAt || 0) || 0,
                lastPlayInviteRoomReadyPayloadSafe: this._lastPlayInviteRoomReadyPayloadSafe || null,
                lastPlayInviteAutoJoinAttemptAt: Number(this._lastPlayInviteAutoJoinAttemptAt || 0) || 0,
                lastPlayInviteAutoJoinError: String(this._lastPlayInviteAutoJoinError || '').trim(),
                lastPlayInviteCancelAttemptAt: Number(this._lastPlayInviteCancelAttemptAt || 0) || 0,
                lastPlayInviteCancelSource: String(this._lastPlayInviteCancelSource || 'unknown').trim() || 'unknown',
                lastPlayInviteCancelPayloadSafe: this._lastPlayInviteCancelPayloadSafe || null,
                lastPlayInviteCancelResultSafe: this._lastPlayInviteCancelResultSafe || null,
                lastPlayInviteCancelError: String(this._lastPlayInviteCancelError || '').trim(),
                expiredHiddenCount: Number(playInviteCounts.expiredHiddenCount || 0) || 0,
                cancelledHiddenCount: Number(playInviteCounts.cancelledHiddenCount || 0) || 0,
                declinedHiddenCount: Number(playInviteCounts.declinedHiddenCount || 0) || 0,
                duplicateLegacyInviteSuppressedCount: Number(this._duplicateLegacyInviteSuppressedCount || 0) || 0
            },
            walletGate: {
                lastJoinStakeRequired: Number(this._lastJoinStakeRequired || 0) || 0,
                lastJoinBalance: Number(this._lastJoinBalance || 0) || 0,
                lastJoinBlockedByCoins: Boolean(this._lastJoinBlockedByCoins),
                lastJoinBlockedAt: Number(this._lastJoinBlockedAt || 0) || 0,
                lastJoinBlockedRoomId: String(this._lastJoinBlockedRoomId || '').trim() || null,
                lastJoinBlockedInviteId: String(this._lastJoinBlockedInviteId || '').trim() || null,
                lastInsufficientCoinsModalShownAt: Number(this._lastInsufficientCoinsModalShownAt || 0) || 0
            },
            badge: {
                serverSummaryUnread,
                mainSocialBadgeCount: Number(this._mainSocialBadgeCount || 0) || 0,
                mainSocialBadgeVisible: Boolean(this._mainSocialBadgeVisible),
                socialCenterBadgeCount: Number(this._socialCenterBadgeCount || 0) || 0
            }
        };
    }

    getDailyBonusDebugState() {
        const status = this.dailyBonusState.status || {};
        const claimMode = String(this.dailyBonusState.claimingMode || this.dailyBonusState.lastDailyBonusClaimMode || '').trim() || null;
        const card = document.getElementById('daily-bonus-card');
        const rewardedBtn = document.getElementById('daily-bonus-rewarded-btn');
        const rewardedVisible = this.isElementVisible(rewardedBtn);
        const x2Reward = Number(status.todayReward?.amount ?? status.todayAmount ?? 0) * 2 || 0;
        return {
            clientBuildBuiltAt: String(window.DOMINO_CLIENT_BUILD?.builtAt || '').trim() || null,
            dailyBonusUiRendered: Boolean(this._dailyBonusUiRendered && card && !card.classList.contains('is-hidden')),
            dailyBonusX2ButtonExists: Boolean(rewardedBtn),
            dailyBonusX2ButtonVisible: rewardedVisible,
            dailyBonusX2ButtonDisabled: Boolean(rewardedBtn?.disabled),
            todayReward: Number(status.todayReward?.amount ?? status.todayAmount ?? 0) || 0,
            x2Reward,
            claimMode,
            baseReward: Number(status.todayReward?.amount ?? status.todayAmount ?? 0) || 0,
            multiplier: claimMode === 'rewarded_x2' ? 2 : 1,
            reward: Number(this.dailyBonusState.lastDailyBonusClaimReward || status.todayReward?.amount || 0) || 0,
            rewardedAdAvailable: this.dailyBonusState.rewardedAdAvailable === null ? null : Boolean(this.dailyBonusState.rewardedAdAvailable),
            rewardedAdStartedAt: Number(this.dailyBonusState.rewardedAdStartedAt || 0) || 0,
            rewardedAdCompletedAt: Number(this.dailyBonusState.rewardedAdCompletedAt || 0) || 0,
            rewardedAdCancelledAt: Number(this.dailyBonusState.rewardedAdCancelledAt || 0) || 0,
            rewardedAdError: String(this.dailyBonusState.rewardedAdError || '').trim() || null,
            lastDailyBonusClaimMode: String(this.dailyBonusState.lastDailyBonusClaimMode || '').trim() || null,
            lastDailyBonusClaimReward: Number(this.dailyBonusState.lastDailyBonusClaimReward || 0) || 0,
            dailyBonusTimezone: String(status.timezone || '').trim() || null,
            dailyBonusDateKey: String(status.dailyBonusDateKey || status.claimDate || '').trim() || null,
            dailyBonusNextClaimAt: String(status.dailyBonusNextClaimAt || status.nextClaimAt || '').trim() || null,
            dailyBonusClaimedToday: Boolean(status.claimedToday),
            dailyBonusCanClaim: Boolean(status.canClaim ?? status.claimable),
            dailyBonusStreakDay: Number(status.streakDay || 0) || 0,
            dailyBonusLastError: String(this.dailyBonusState.error || '').trim() || null,
            lastDailyBonusRenderAt: Number(this._lastDailyBonusRenderAt || 0) || 0,
            dailyBonusRenderSource: String(this._lastDailyBonusRenderSource || '').trim() || null
        };
    }

    isElementVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle?.(element);
        if (!style) return Boolean(element.offsetParent || element.getClientRects?.().length);
        return style.display !== 'none'
            && style.visibility !== 'hidden'
            && style.opacity !== '0'
            && Boolean(element.getClientRects?.().length);
    }

    getDailyBonusButtonsSnapshot() {
        const buttons = Array.from(document.querySelectorAll('#daily-bonus-card button'));
        return buttons.map((button) => ({
            text: String(button.textContent || '').trim(),
            disabled: Boolean(button.disabled),
            visible: this.isElementVisible(button),
            className: String(button.className || '').trim()
        }));
    }

    stopSocialDebugPanelAutoRefresh() {
        if (this._socialDebugPanelRefreshTimer) {
            clearInterval(this._socialDebugPanelRefreshTimer);
            this._socialDebugPanelRefreshTimer = null;
        }
    }

    ensureSocialDebugPanel() {
        if (!this.isSocialDebugPanelEnabled()) return;
        window.DOMINO_DEBUG_SOCIAL = true;
        try {
            window.localStorage?.setItem('dominoDebugSocial', 'true');
        } catch {}
        if (document.getElementById('domino-social-debug-panel')) {
            this.renderSocialDebugPanel();
            return;
        }

        const panel = document.createElement('aside');
        panel.id = 'domino-social-debug-panel';
        panel.style.cssText = [
            'position:fixed',
            'right:10px',
            'bottom:10px',
            'z-index:99999',
            'width:min(420px,calc(100vw - 20px))',
            'max-height:min(680px,85vh)',
            'overflow:auto',
            'border:1px solid rgba(255,255,255,.22)',
            'border-radius:14px',
            'background:rgba(12,18,28,.94)',
            'color:#eef6ff',
            'box-shadow:0 18px 60px rgba(0,0,0,.38)',
            'font:12px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace',
            'padding:10px'
        ].join(';');
        panel.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;margin-bottom:8px">
                <strong style="font:700 13px/1.2 sans-serif">Social Debug</strong>
                <button type="button" data-social-debug-toggle style="border:0;border-radius:8px;padding:5px 8px">hide</button>
            </div>
            <div data-social-debug-actions style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px"></div>
            <pre data-social-debug-output style="white-space:pre-wrap;word-break:break-word;margin:0;max-height:520px;overflow:auto"></pre>
        `;
        document.body.appendChild(panel);

        const actions = panel.querySelector('[data-social-debug-actions]');
        const makeButton = (label, handler) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.style.cssText = 'border:0;border-radius:8px;padding:6px 8px;background:#d8ecff;color:#071521;font:700 11px/1 sans-serif';
            button.addEventListener('click', handler);
            actions?.appendChild(button);
        };

        makeButton('Refresh debug state', () => this.renderSocialDebugPanel());
        makeButton('Copy debug state', async () => {
            const text = JSON.stringify(this.getSocialDebugState(), null, 2);
            try {
                await navigator.clipboard?.writeText(text);
            } catch {
                window.prompt('Copy debug state', text);
            }
        });
        makeButton('Force load incoming invites', async () => {
            await this.loadSocialInvitesPage(true).catch(() => {});
            this.renderSocialDebugPanel();
        });
        makeButton('Force social summary refresh', async () => {
            await this.loadSocialSummary().catch(() => {});
            this.updateGlobalSocialBadge();
            this.renderSocialDebugPanel();
        });
        makeButton('Force socket status refresh', async () => {
            await this.ensureSocialRealtimeStarted?.('debug-panel-force').catch?.(() => {});
            this.renderSocialDebugPanel();
        });

        panel.querySelector('[data-social-debug-toggle]')?.addEventListener('click', () => {
            const output = panel.querySelector('[data-social-debug-output]');
            const actionsEl = panel.querySelector('[data-social-debug-actions]');
            const hidden = output?.hasAttribute('hidden');
            output?.toggleAttribute('hidden', !hidden);
            actionsEl?.toggleAttribute('hidden', !hidden);
        });

        this.stopSocialDebugPanelAutoRefresh();
        this._socialDebugPanelRefreshTimer = setInterval(() => this.renderSocialDebugPanel(), 2500);
        this.renderSocialDebugPanel();
    }

    renderSocialDebugPanel() {
        if (!this.isSocialDebugPanelEnabled()) return;
        const panel = document.getElementById('domino-social-debug-panel');
        const output = panel?.querySelector('[data-social-debug-output]');
        if (!output) return;
        output.textContent = JSON.stringify(this.getSocialDebugState(), null, 2);
    }

    isMoveHintSelectionActive() {
        return Boolean(
            this.gameActive
            && !this.matchOver
            && !this.roundOver
            && Number.isInteger(Number(this.selectedTileIndex))
            && Number(this.selectedTileIndex) >= 0
        );
    }

    syncMoveHintSelectionUiState() {
        const active = this.isMoveHintSelectionActive();
        if (document.body) {
            document.body.classList.toggle('move-hint-selection-active', active);
        }
        if (active !== this._lastMoveHintSelectionActive) {
            const now = Date.now();
            if (active) {
                this._lastMoveHintShownAt = now;
                const toSafeRect = (el) => {
                    const rect = el?.getBoundingClientRect?.();
                    if (!rect) return null;
                    return {
                        left: Math.round(rect.left),
                        top: Math.round(rect.top),
                        right: Math.round(rect.right),
                        bottom: Math.round(rect.bottom),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    };
                };
                this._lastLeftHintRectSafe = toSafeRect(document.querySelector('#arrow-overlay .arrow-btn.arrow-left'));
                this._lastRightHintRectSafe = toSafeRect(document.querySelector('#arrow-overlay .arrow-btn.arrow-right'));
            } else {
                this._lastMoveHintClearedAt = now;
                this._lastLeftHintRectSafe = null;
                this._lastRightHintRectSafe = null;
            }
        }
        this._lastMoveHintSelectionActive = active;
        return active;
    }

    getFriendPlayerId(friendRef) {
        const directPlayerId = String(
            friendRef?.playerId
            || friendRef?.friend?.playerId
            || friendRef?.friend?.id
            || friendRef?.invitee?.id
            || friendRef?.inviter?.id
            || friendRef?.id
            || ''
        ).trim();
        return directPlayerId;
    }

    isPlayInviteWaiting(invite) {
        const status = String(invite?.status || '').trim().toLowerCase();
        return this.isPlayInviteRecord(invite) && status === 'accepted' && !this.isPlayInviteRoomBound(invite);
    }

    isPlayInviteRoomBound(invite) {
        if (!this.isPlayInviteRecord(invite)) return false;
        return Boolean(
            String(invite?.roomId || '').trim()
            || String(invite?.roomCode || '').trim()
            || String(invite?.payloadJson?.roomId || '').trim()
            || String(invite?.payloadJson?.roomCode || '').trim()
            || String(invite?.payloadJson?.roomContext?.roomId || '').trim()
            || String(invite?.payloadJson?.roomContext?.roomCode || '').trim()
        );
    }

    isPlayInviteRecord(invite) {
        const kind = String(invite?.kind || '').trim().toLowerCase();
        if (kind === 'play') return true;
        return !String(invite?.roomId || '').trim();
    }

    isPlayInviteActive(invite) {
        const status = String(invite?.status || '').trim().toLowerCase();
        if (!status) return false;
        if (!this.isPlayInviteRecord(invite)) return false;
        const expiresAtStr = invite?.expiresAt ? String(invite.expiresAt).trim() : '';
        const isExpired = expiresAtStr && new Date(expiresAtStr).getTime() <= Date.now();
        if (status === 'pending') return !isExpired;
        if (status === 'accepted') return true;
        if (status === 'room_created' || status === 'failed_to_join') return true;
        return false;
    }

    findOutgoingPlayInviteForPlayer(playerId) {
        const targetId = String(playerId || '').trim();
        if (!targetId) return null;
        const outgoing = Array.isArray(this.roomInvitations?.sent) ? this.roomInvitations.sent : [];
        return outgoing.find((invite) => {
            const inviteeId = String(invite?.invitee?.id || '').trim();
            return inviteeId === targetId && this.isPlayInviteActive(invite);
        }) || null;
    }

    getPlayInviteCounts() {
        const invitations = this.roomInvitations || { incoming: [], sent: [] };
        const incoming = Array.isArray(invitations.incoming) ? invitations.incoming : [];
        const sent = Array.isArray(invitations.sent) ? invitations.sent : [];
        const incomingPlay = incoming.filter((invite) => this.isPlayInviteRecord(invite));
        const sentPlay = sent.filter((invite) => this.isPlayInviteRecord(invite));
        const incomingActive = incomingPlay.filter((invite) => this.isPlayInviteActive(invite));
        const sentActive = sentPlay.filter((invite) => this.isPlayInviteActive(invite));
        const waitingInvites = [...incomingActive, ...sentActive].filter((invite) => this.isPlayInviteWaiting(invite));
        const activePlayInvites = [...incomingActive, ...sentActive];
        const hiddenStatusCounts = [...incomingPlay, ...sentPlay].reduce((acc, invite) => {
            const status = String(invite?.status || '').trim().toLowerCase();
            if (status === 'expired') acc.expiredHidden += 1;
            if (status === 'cancelled') acc.cancelledHidden += 1;
            if (status === 'declined') acc.declinedHidden += 1;
            return acc;
        }, { expiredHidden: 0, cancelledHidden: 0, declinedHidden: 0 });
        const pendingCount = activePlayInvites.filter((invite) => String(invite?.status || '').trim().toLowerCase() === 'pending').length;
        const joinedCount = activePlayInvites.filter((invite) => String(invite?.status || '').trim().toLowerCase() === 'joined').length;
        return {
            rawIncoming: incomingPlay.length,
            rawOutgoing: sentPlay.length,
            visibleIncoming: incomingActive.length,
            visibleOutgoing: sentActive.length,
            incoming: incomingActive.length,
            outgoing: sentActive.length,
            waiting: waitingInvites.length,
            pending: pendingCount,
            joined: joinedCount,
            expiredHiddenCount: hiddenStatusCounts.expiredHidden,
            cancelledHiddenCount: hiddenStatusCounts.cancelledHidden,
            declinedHiddenCount: hiddenStatusCounts.declinedHidden
        };
    }

    getAcceptedWaitingPlayInvites() {
        const invitations = this.roomInvitations || { incoming: [], sent: [] };
        const incoming = Array.isArray(invitations.incoming) ? invitations.incoming : [];
        const outgoing = Array.isArray(invitations.sent) ? invitations.sent : [];
        const waiting = [...incoming, ...outgoing].filter((invite) => this.isPlayInviteActive(invite) && this.isPlayInviteWaiting(invite));
        const unique = new Map();
        waiting.forEach((invite) => {
            const id = String(invite?.id || '').trim();
            if (!id || unique.has(id)) return;
            unique.set(id, invite);
        });
        return Array.from(unique.values());
    }

    getPlayInviteStatusLabel(invite) {
        const status = String(invite?.status || '').trim().toLowerCase();
        const currentPlayerId = this.getCurrentAccountPlayerId();
        const inviterPlayerId = String(invite?.inviter?.id || invite?.inviterPlayerId || '').trim();
        const inviteePlayerId = String(invite?.invitee?.id || invite?.inviteePlayerId || '').trim();
        if (status === 'accepted' && !this.isPlayInviteRoomBound(invite)) {
            if (inviteePlayerId === currentPlayerId) {
                return this.currentLang === 'az'
                    ? 'Otaq gözlənilir'
                    : 'Waiting for room';
            }
            if (inviterPlayerId === currentPlayerId) {
                return this.currentLang === 'az'
                    ? 'Dost gözləyir'
                    : 'Friend waiting';
            }
        }
        if (status === 'room_created') {
            if (inviteePlayerId === currentPlayerId) {
                return this.currentLang === 'az'
                    ? 'Otaq hazırdır'
                    : 'Room ready';
            }
            if (inviterPlayerId === currentPlayerId) {
                return this.currentLang === 'az'
                    ? 'Otaq hazırdır'
                    : 'Room ready';
            }
        }
        if (status === 'joined') {
            if (inviteePlayerId === currentPlayerId) {
                return this.currentLang === 'az'
                    ? 'Qoşuldunuz.'
                    : 'Joined.';
            }
            if (inviterPlayerId === currentPlayerId) {
                return this.currentLang === 'az'
                    ? 'Dost otağa qoşuldu.'
                    : 'Friend joined the room.';
            }
        }
        if (status === 'failed_to_join') {
            return this.currentLang === 'az'
                ? 'Qoşulma uğursuz oldu.'
                : 'Failed to join.';
        }
        if (status === 'declined') {
            return this.currentLang === 'az'
                ? 'Rədd edildi'
                : 'Declined';
        }
        if (status === 'cancelled') {
            return this.currentLang === 'az'
                ? 'Ləğv edildi'
                : 'Cancelled';
        }
        if (status === 'expired') {
            return this.currentLang === 'az'
                ? 'Müddəti bitdi'
                : 'Expired';
        }
        return this.getRoomInvitationStatusLabel(invite);
    }

    buildInviteDebugPayloadSafe(payload = {}) {
        const sourcePayload = payload && typeof payload === 'object' ? payload : {};
        const payloadJson = sourcePayload?.payloadJson && typeof sourcePayload.payloadJson === 'object' && !Array.isArray(sourcePayload.payloadJson)
            ? sourcePayload.payloadJson
            : null;
        const roomSettings = sourcePayload?.roomSettings && typeof sourcePayload.roomSettings === 'object' && !Array.isArray(sourcePayload.roomSettings)
            ? sourcePayload.roomSettings
            : null;
        const roomContext = payloadJson?.roomContext && typeof payloadJson.roomContext === 'object' && !Array.isArray(payloadJson.roomContext)
            ? payloadJson.roomContext
            : null;
        const inviteIds = Array.isArray(sourcePayload?.inviteIds) ? sourcePayload.inviteIds : [];
        return {
            inviteId: String(sourcePayload?.id || '').trim() || null,
            roomId: String(sourcePayload?.roomId || '').trim() || null,
            roomCode: String(sourcePayload?.roomCode || '').trim() || null,
            inviteePlayerId: String(sourcePayload?.inviteePlayerId || sourcePayload?.invitee?.id || '').trim() || null,
            inviterPlayerId: String(sourcePayload?.inviter?.id || '').trim() || null,
            status: String(sourcePayload?.status || sourcePayload?.type || '').trim() || null,
            roomMode: String(sourcePayload?.roomMode || '').trim() || null,
            stakeAmount: Number.isFinite(Number(sourcePayload?.stakeAmount)) ? Number(sourcePayload.stakeAmount) : null,
            inviteIdsCount: inviteIds.length,
            roomSettings: roomSettings ? {
                roomMode: String(roomSettings.roomMode || '').trim() || null,
                stakeKey: String(roomSettings.stakeKey || '').trim() || null,
                stakeAmount: Number.isFinite(Number(roomSettings.stakeAmount)) ? Number(roomSettings.stakeAmount) : null,
                humanSeats: Number.isFinite(Number(roomSettings.humanSeats)) ? Number(roomSettings.humanSeats) : null,
                totalPlayers: Number.isFinite(Number(roomSettings.totalPlayers)) ? Number(roomSettings.totalPlayers) : null,
                maxPlayers: Number.isFinite(Number(roomSettings.maxPlayers)) ? Number(roomSettings.maxPlayers) : null,
                isTeamMode: typeof roomSettings.isTeamMode === 'boolean' ? roomSettings.isTeamMode : null
            } : null,
            targetSlotIndex: Number.isInteger(Number(payloadJson?.targetSlotIndex)) ? Number(payloadJson.targetSlotIndex) : null,
            openSeatPickerOnJoin: typeof payloadJson?.openSeatPickerOnJoin === 'boolean' ? payloadJson.openSeatPickerOnJoin : null,
            roomContext: roomContext ? {
                roomId: String(roomContext.roomId || '').trim() || null,
                roomCode: String(roomContext.roomCode || '').trim() || null,
                roomMode: String(roomContext.roomMode || '').trim() || null,
                roomVisibility: String(roomContext.roomVisibility || '').trim() || null,
                stakeAmount: Number.isFinite(Number(roomContext.stakeAmount)) ? Number(roomContext.stakeAmount) : null,
                targetSlotIndex: Number.isInteger(Number(roomContext.targetSlotIndex)) ? Number(roomContext.targetSlotIndex) : null,
                openSeatPickerOnJoin: typeof roomContext.openSeatPickerOnJoin === 'boolean' ? roomContext.openSeatPickerOnJoin : null,
                inviterPlayerId: String(roomContext.inviterPlayerId || '').trim() || null,
                inviteePlayerId: String(roomContext.inviteePlayerId || '').trim() || null,
                source: String(roomContext.source || '').trim() || null
            } : null,
            source: String(sourcePayload?.source || payloadJson?.source || sourcePayload?.note || '').trim() || null,
            socketConnected: Boolean(this._socialSocket?.connected),
            socketReady: Boolean(this._socialSocketReady)
        };
    }

    buildStartGamePayloadSafe(payload = {}) {
        const sourcePayload = payload && typeof payload === 'object' ? payload : {};
        return {
            roomMode: String(sourcePayload?.roomMode || '').trim() || null,
            isTeamMode: typeof sourcePayload?.isTeamMode === 'boolean' ? sourcePayload.isTeamMode : null,
            roomVisibility: String(sourcePayload?.roomVisibility || '').trim() || null,
            playerCount: Number.isFinite(Number(sourcePayload?.playerCount)) ? Number(sourcePayload.playerCount) : null,
            aiCount: Number.isFinite(Number(sourcePayload?.aiCount)) ? Number(sourcePayload.aiCount) : null,
            stakeKey: String(sourcePayload?.stakeKey || '').trim() || null,
            instantWinEnabled: typeof sourcePayload?.instantWinEnabled === 'boolean' ? sourcePayload.instantWinEnabled : null,
            dlossThreshold: Number.isFinite(Number(sourcePayload?.dlossThreshold)) ? Number(sourcePayload.dlossThreshold) : null
        };
    }

    resolveRoomModeState(roomState = this.currentRoomState, schemaState = null) {
        const sourceRoomState = roomState && typeof roomState === 'object' ? roomState : {};
        const sourceSchemaState = schemaState && typeof schemaState === 'object' ? schemaState : {};
        const roomModeFromState = String(
            sourceRoomState.roomMode
            || sourceRoomState.scoreMode
            || sourceSchemaState.roomMode
            || sourceSchemaState.scoreMode
            || ''
        ).trim().toLowerCase();
        const isTeamModeFromState = typeof sourceRoomState.isTeamMode === 'boolean'
            ? sourceRoomState.isTeamMode
            : typeof sourceSchemaState.isTeamMode === 'boolean'
                ? sourceSchemaState.isTeamMode
                : null;
        const isTeamMode = isTeamModeFromState !== null
            ? isTeamModeFromState
            : roomModeFromState === 'team' || roomModeFromState === '2v2' || roomModeFromState === 'partnership'
                ? true
                : roomModeFromState === 'ffa' || roomModeFromState === 'solo'
                    ? false
                    : Boolean(this.isTeamMode);
        const roomMode = roomModeFromState === 'team' || roomModeFromState === '2v2' || roomModeFromState === 'partnership'
            ? 'team'
            : roomModeFromState === 'ffa' || roomModeFromState === 'solo'
                ? 'ffa'
                : (isTeamMode ? 'team' : 'ffa');
        const scoreMode = String(sourceRoomState.scoreMode || sourceSchemaState.scoreMode || (isTeamMode ? 'team' : 'solo')).trim().toLowerCase() || (isTeamMode ? 'team' : 'solo');
        return {
            roomMode,
            roomModeFromState: roomModeFromState || null,
            isTeamMode,
            isTeamModeFromState,
            scoreMode,
            topHudMode: isTeamMode ? 'team' : 'solo'
        };
    }

    buildRoomStatePlayersSafe(roomState = this.currentRoomState) {
        const players = Array.isArray(roomState?.players) ? roomState.players : [];
        return players.slice(0, 6).map((player) => ({
            sessionId: String(player?.sessionId || '').trim() || null,
            playerId: String(player?.playerId || '').trim() || null,
            displayName: String(player?.name || '').trim() || null,
            seatIndex: Number.isInteger(Number(player?.seatIndex)) ? Number(player.seatIndex) : -1,
            seatNumber: Number.isInteger(Number(player?.seatNumber)) ? Number(player.seatNumber) : (Number.isInteger(Number(player?.seatIndex)) && Number(player.seatIndex) >= 0 ? Number(player.seatIndex) + 1 : 0),
            team: Number.isInteger(Number(player?.team)) ? Number(player.team) : null,
            isBot: Boolean(player?.isBot),
            isConnected: Boolean(player?.isConnected),
            controller: String(player?.controller || '').trim() || 'human',
            takeoverActive: Boolean(player?.takeoverActive),
            takeoverReason: String(player?.takeoverReason || '').trim() || null
        }));
    }

    buildTeamAssignmentsSafe(roomState = this.currentRoomState) {
        const players = Array.isArray(roomState?.players) ? roomState.players : [];
        const declaredTeams = Array.isArray(roomState?.teams) ? roomState.teams : [];
        return [0, 1].map((teamIndex) => {
            const declaredTeam = declaredTeams[teamIndex] || {};
            const members = players.filter((player) => Number(player?.team) === teamIndex);
            return {
                index: teamIndex,
                name: String(declaredTeam?.name || (teamIndex === 0 ? 'Team A' : 'Team B')).trim() || null,
                score: Number.isFinite(Number(declaredTeam?.score)) ? Number(declaredTeam.score) : Number(Array.isArray(roomState?.teamScores) ? roomState.teamScores[teamIndex] : 0),
                roundWins: Number.isFinite(Number(declaredTeam?.roundWins)) ? Number(declaredTeam.roundWins) : Number(Array.isArray(roomState?.teamRoundWins) ? roomState.teamRoundWins[teamIndex] : 0),
                memberSessionIds: Array.isArray(declaredTeam?.memberSessionIds) && declaredTeam.memberSessionIds.length
                    ? declaredTeam.memberSessionIds.slice(0, 4).map((value) => String(value || '').trim()).filter(Boolean)
                    : members.map((player) => String(player?.sessionId || '').trim()).filter(Boolean),
                memberPlayerIds: Array.isArray(declaredTeam?.memberPlayerIds) && declaredTeam.memberPlayerIds.length
                    ? declaredTeam.memberPlayerIds.slice(0, 4).map((value) => String(value || '').trim()).filter(Boolean)
                    : members.map((player) => String(player?.playerId || '').trim()).filter(Boolean)
            };
        });
    }

    buildSeatAssignmentsSafe(roomState = this.currentRoomState) {
        const totalSeats = Number(roomState?.totalPlayers || roomState?.humanSeats || this.playerCount || 0);
        const players = Array.isArray(roomState?.players) ? roomState.players : [];
        const bySeat = new Map();
        players.forEach((player) => {
            const seatIndex = Number(player?.seatIndex);
            if (Number.isInteger(seatIndex) && seatIndex >= 0) {
                bySeat.set(seatIndex, player);
            }
        });
        return Array.from({ length: Math.max(0, totalSeats) }, (_, seatIndex) => {
            const player = bySeat.get(seatIndex) || null;
            return {
                seatIndex,
                seatNumber: seatIndex + 1,
                playerId: String(player?.playerId || '').trim() || null,
                sessionId: String(player?.sessionId || '').trim() || null,
                displayName: String(player?.name || '').trim() || null,
                team: Number.isInteger(Number(player?.team)) ? Number(player.team) : null,
                isBot: Boolean(player?.isBot),
                isConnected: Boolean(player?.isConnected),
                controller: String(player?.controller || '').trim() || 'human',
                takeoverActive: Boolean(player?.takeoverActive)
            };
        });
    }

    getRoomStatePlayerBySessionId(sessionId, roomState = this.currentRoomState) {
        const normalizedSessionId = String(sessionId || '').trim();
        if (!normalizedSessionId) return null;
        const players = Array.isArray(roomState?.players) ? roomState.players : [];
        return players.find((player) => String(player?.sessionId || '').trim() === normalizedSessionId) || null;
    }

    getLocalRoomPlayerState(roomState = this.currentRoomState) {
        return this.getRoomStatePlayerBySessionId(this.network?.room?.sessionId || '', roomState);
    }

    isBotTakeoverSeat(player) {
        return Boolean(player && (player.takeoverActive || player.controller === 'bot'));
    }

    isLocalSeatBotControlled(roomState = this.currentRoomState) {
        return this.isBotTakeoverSeat(this.getLocalRoomPlayerState(roomState));
    }

    getRoomStatePlayerSubtitle(player) {
        if (!player) return this.t('online-ready');
        if (this.isBotTakeoverSeat(player)) {
            return this.t('bot-takeover-playing') || 'Bot is playing';
        }
        if (player.isConnected === false) {
            return this.t('online-offline');
        }
        return this.t('online-ready');
    }

    ensureBotTakeoverUi() {
        if (this.botTakeoverUi?.wrap?.isConnected) {
            return this.botTakeoverUi;
        }
        const host = document.getElementById('game-screen');
        if (!host) return null;

        const wrap = document.createElement('div');
        wrap.className = 'bot-takeover-banner is-hidden';

        const text = document.createElement('div');
        text.className = 'bot-takeover-banner-text';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-action btn-strong bot-takeover-banner-btn';
        button.textContent = this.t('bot-takeover-return-control') || 'Return control';
        button.addEventListener('click', () => {
            this.network?.sendResumeControl?.();
        });

        wrap.appendChild(text);
        wrap.appendChild(button);
        host.appendChild(wrap);
        this.botTakeoverUi = { wrap, text, button };
        return this.botTakeoverUi;
    }

    syncBotTakeoverUiState(roomState = this.currentRoomState) {
        const ui = this.ensureBotTakeoverUi();
        if (!ui) return;
        const localPlayer = this.getLocalRoomPlayerState(roomState);
        const active = this.gameActive && this.isBotTakeoverSeat(localPlayer);
        ui.text.textContent = this.t('bot-takeover-active') || 'Bot is playing for you right now.';
        ui.button.textContent = this.t('bot-takeover-return-control') || 'Return control';
        ui.wrap.classList.toggle('is-hidden', !active);
    }

    onBotTakeover(payload = {}) {
        const roomState = this.currentRoomState;
        const seatIndex = Number(payload?.seatIndex);
        const roomPlayers = Array.isArray(roomState?.players) ? roomState.players : [];
        const affectedPlayer = Number.isInteger(seatIndex) && seatIndex >= 0
            ? roomPlayers.find((player) => Number(player?.seatIndex) === seatIndex || Number(player?.index) === seatIndex)
            : null;
        if (affectedPlayer) {
            affectedPlayer.controller = 'bot';
            affectedPlayer.takeoverActive = true;
            affectedPlayer.takeoverReason = String(payload?.reason || '').trim() || affectedPlayer.takeoverReason || 'disconnect';
            affectedPlayer.isConnected = true;
        }
        if (this.isLocalSeatBotControlled(roomState)) {
            this.selectedTileIndex = -1;
            this.renderer?.removeArrows?.();
            this.syncMoveHintSelectionUiState?.();
        }
        this.syncBotTakeoverUiState(roomState);
        this.scheduleRealtimeRender({
            boardChanged: false,
            handChanged: true,
            opponentHandsChanged: true,
            scoresChanged: false,
            infoChanged: false,
            force: true
        });
    }

    onBotResume(payload = {}) {
        const roomState = this.currentRoomState;
        const seatIndex = Number(payload?.seatIndex);
        const roomPlayers = Array.isArray(roomState?.players) ? roomState.players : [];
        const localPlayer = this.getLocalRoomPlayerState(roomState);
        const wasLocalTakeover = this.isBotTakeoverSeat(localPlayer);
        const affectedPlayer = Number.isInteger(seatIndex) && seatIndex >= 0
            ? roomPlayers.find((player) => Number(player?.seatIndex) === seatIndex || Number(player?.index) === seatIndex)
            : null;
        if (affectedPlayer) {
            affectedPlayer.controller = 'human';
            affectedPlayer.takeoverActive = false;
            affectedPlayer.takeoverReason = '';
            affectedPlayer.isConnected = true;
        }
        this.syncBotTakeoverUiState(roomState);
        this.scheduleRealtimeRender({
            boardChanged: false,
            handChanged: true,
            opponentHandsChanged: true,
            scoresChanged: false,
            infoChanged: false,
            force: true
        });
        if (affectedPlayer && localPlayer && affectedPlayer === localPlayer && wasLocalTakeover) {
            this.renderer?.showMessage?.(this.t('bot-takeover-you-back') || 'You are back in the game.', 1800);
        }
    }

    recordInviteSendAttempt(payload = {}) {
        this._lastInviteSendAttemptAt = Date.now();
        this._lastInviteSendPayloadSafe = this.buildInviteDebugPayloadSafe(payload);
        this._lastInviteSendTransport = 'unknown';
        this._lastInviteSendEndpoint = '';
        this._lastInviteSendHttpStatus = null;
        this._lastInviteSendResultSafe = null;
        this._lastInviteSendError = '';
        this.logSocialInvite('send attempt', this._lastInviteSendPayloadSafe);
        this.renderSocialDebugPanel();
    }

    recordInviteSendResult(result = {}, meta = {}) {
        const source = result?.invite || result?.item || result || {};
        this._lastInviteSendResultSafe = {
            ok: result?.ok === false ? false : true,
            transport: String(meta?.transport || this._lastInviteSendTransport || 'unknown').trim(),
            live: Boolean(result?.live),
            ...this.buildInviteDebugPayloadSafe(source)
        };
        this._lastInviteSendTransport = String(meta?.transport || this._lastInviteSendTransport || 'unknown').trim() || 'unknown';
        this._lastInviteSendEndpoint = String(meta?.endpoint || this._lastInviteSendEndpoint || '').trim();
        this._lastInviteSendHttpStatus = Number.isFinite(Number(meta?.httpStatus)) ? Number(meta.httpStatus) : this._lastInviteSendHttpStatus;
        this._lastInviteSendError = '';
        this.logSocialInvite('send result', this._lastInviteSendResultSafe);
        this.renderSocialDebugPanel();
    }

    recordInviteSendError(error, payload = {}, meta = {}) {
        const message = String(error?.message || error || this.t('friends-load-failed')).trim();
        this._lastInviteSendAttemptAt = this._lastInviteSendAttemptAt || Date.now();
        this._lastInviteSendPayloadSafe = this._lastInviteSendPayloadSafe || this.buildInviteDebugPayloadSafe(payload);
        this._lastInviteSendTransport = String(meta?.transport || this._lastInviteSendTransport || 'unknown').trim() || 'unknown';
        this._lastInviteSendEndpoint = String(meta?.endpoint || this._lastInviteSendEndpoint || '').trim();
        this._lastInviteSendHttpStatus = Number.isFinite(Number(meta?.httpStatus)) ? Number(meta.httpStatus) : this._lastInviteSendHttpStatus;
        this._lastInviteSendResultSafe = null;
        this._lastInviteSendError = message;
        this.logSocialInvite('send error', {
            ...this._lastInviteSendPayloadSafe,
            error: message
        });
        this.renderSocialDebugPanel();
    }

    recordPlayInviteSendAttempt(payload = {}) {
        this._lastPlayInviteSendAttemptAt = Date.now();
        this._lastPlayInviteSendPayloadSafe = this.buildInviteDebugPayloadSafe(payload);
        this._lastPlayInviteSendTransport = 'unknown';
        this._lastPlayInviteSendEndpoint = '';
        this._lastPlayInviteSendHttpStatus = null;
        this._lastPlayInviteSendResultSafe = null;
        this._lastPlayInviteSendError = '';
        this._lastPlayInviteEventAt = this._lastPlayInviteEventAt || 0;
        this.logSocialInvite('play send attempt', this._lastPlayInviteSendPayloadSafe);
        this.renderSocialDebugPanel();
    }

    recordPlayInviteSendResult(result = {}, meta = {}) {
        const source = result?.invite || result?.item || result || {};
        this._lastPlayInviteSendResultSafe = {
            ok: result?.ok === false ? false : true,
            transport: String(meta?.transport || this._lastPlayInviteSendTransport || 'unknown').trim(),
            live: Boolean(result?.live),
            ...this.buildInviteDebugPayloadSafe(source)
        };
        this._lastPlayInviteSendTransport = String(meta?.transport || this._lastPlayInviteSendTransport || 'unknown').trim() || 'unknown';
        this._lastPlayInviteSendEndpoint = String(meta?.endpoint || this._lastPlayInviteSendEndpoint || '').trim();
        this._lastPlayInviteSendHttpStatus = Number.isFinite(Number(meta?.httpStatus)) ? Number(meta.httpStatus) : this._lastPlayInviteSendHttpStatus;
        this._lastPlayInviteSendError = '';
        this.logSocialInvite('play send result', this._lastPlayInviteSendResultSafe);
        this.renderSocialDebugPanel();
    }

    recordPlayInviteSendError(error, payload = {}, meta = {}) {
        const message = String(error?.message || error || this.t('friends-load-failed')).trim();
        this._lastPlayInviteSendAttemptAt = this._lastPlayInviteSendAttemptAt || Date.now();
        this._lastPlayInviteSendPayloadSafe = this._lastPlayInviteSendPayloadSafe || this.buildInviteDebugPayloadSafe(payload);
        this._lastPlayInviteSendTransport = String(meta?.transport || this._lastPlayInviteSendTransport || 'unknown').trim() || 'unknown';
        this._lastPlayInviteSendEndpoint = String(meta?.endpoint || this._lastPlayInviteSendEndpoint || '').trim();
        this._lastPlayInviteSendHttpStatus = Number.isFinite(Number(meta?.httpStatus)) ? Number(meta.httpStatus) : this._lastPlayInviteSendHttpStatus;
        this._lastPlayInviteSendResultSafe = null;
        this._lastPlayInviteSendError = message;
        this.logSocialInvite('play send error', {
            ...this._lastPlayInviteSendPayloadSafe,
            error: message
        });
        this.renderSocialDebugPanel();
    }

    recordPlayInviteCancelAttempt(payload = {}, source = 'unknown') {
        this._lastPlayInviteCancelAttemptAt = Date.now();
        this._lastPlayInviteCancelSource = String(source || 'unknown').trim() || 'unknown';
        this._lastPlayInviteCancelPayloadSafe = this.buildInviteDebugPayloadSafe(payload);
        this._lastPlayInviteCancelResultSafe = null;
        this._lastPlayInviteCancelError = '';
        this.renderSocialDebugPanel();
    }

    recordPlayInviteCancelResult(result = {}) {
        this._lastPlayInviteCancelResultSafe = {
            ok: result?.ok === false ? false : true,
            ...this.buildInviteDebugPayloadSafe(result?.item || result?.invite || result || {})
        };
        this._lastPlayInviteCancelError = '';
        this.renderSocialDebugPanel();
    }

    recordPlayInviteCancelError(error, payload = {}, source = 'unknown') {
        const message = String(error?.message || error || this.t('friends-load-failed')).trim();
        this._lastPlayInviteCancelAttemptAt = this._lastPlayInviteCancelAttemptAt || Date.now();
        this._lastPlayInviteCancelSource = String(source || 'unknown').trim() || 'unknown';
        this._lastPlayInviteCancelPayloadSafe = this._lastPlayInviteCancelPayloadSafe || this.buildInviteDebugPayloadSafe(payload);
        this._lastPlayInviteCancelResultSafe = null;
        this._lastPlayInviteCancelError = message;
        this.renderSocialDebugPanel();
    }

    getActiveInviteRoomContext() {
        const snapshot = this.getCurrentRoomSnapshot() || {};
        const roomId = String(
            snapshot?.roomId
            || this.currentRoomState?.roomId
            || this.network?.room?.roomId
            || this.network?.room?.id
            || ''
        ).trim();
        const roomCode = String(
            snapshot?.roomCode
            || this.currentRoomState?.roomCode
            || document.getElementById('room-code-display')?.textContent?.trim()
            || this.network?.room?.roomCode
            || ''
        ).trim().toUpperCase();
        return {
            roomId,
            roomCode,
            roomMode: String(snapshot?.roomMode || '').trim(),
            roomVisibility: String(snapshot?.roomVisibility || '').trim(),
            source: roomId
                ? (snapshot?.roomId ? 'snapshot' : this.currentRoomState?.roomId ? 'currentRoomState' : this.network?.room ? 'networkRoom' : 'unknown')
                : (roomCode ? 'roomCode-only' : 'none')
        };
    }

    getCurrentRoomInviteContext({ source = 'room-context', targetSlotIndex = null, openSeatPickerOnJoin = null } = {}) {
        const snapshot = this.getCurrentRoomSnapshot();
        if (!snapshot) return null;
        const inviterPlayerId = String(this.getCurrentAccountPlayerId?.() || this.accountProfile?.playerId || this.accountProfile?.id || '').trim();
        const roomMode = String(snapshot.roomMode || (snapshot.isTeamMode ? 'team' : 'ffa')).trim() || 'ffa';
        const normalizedTargetSlotIndex = Number.isInteger(Number(targetSlotIndex)) ? Number(targetSlotIndex) : null;
        const normalizedOpenSeatPicker = typeof openSeatPickerOnJoin === 'boolean'
            ? openSeatPickerOnJoin
            : roomMode === 'team';
        return {
            roomId: String(snapshot.roomId || '').trim() || null,
            roomCode: String(snapshot.roomCode || '').trim() || null,
            roomMode,
            roomVisibility: String(snapshot.roomVisibility || '').trim() || null,
            stakeKey: String(snapshot.stakeKey || this.onlineStakeKey || '').trim() || null,
            stakeAmount: Number.isFinite(Number(snapshot.stakeAmount)) ? Math.max(0, Number(snapshot.stakeAmount)) : 0,
            humanSeats: Number(snapshot.humanSeats || this.onlinePlayerCount || 0),
            totalPlayers: Number(snapshot.totalPlayers || this.onlinePlayerCount || 0),
            targetSlotIndex: normalizedTargetSlotIndex,
            openSeatPickerOnJoin: normalizedOpenSeatPicker,
            inviterPlayerId: inviterPlayerId || null,
            inviteePlayerId: null,
            source: String(source || 'room-context').trim() || 'room-context'
        };
    }

    getRoomTeamHudState(roomState = this.currentRoomState) {
        const state = roomState || {};
        const players = Array.isArray(state.players) ? state.players : [];
        const teamSources = Array.isArray(state.teams) && state.teams.length ? state.teams : [
            { index: 0, name: 'Team A', memberSessionIds: [], memberPlayerIds: [] },
            { index: 1, name: 'Team B', memberSessionIds: [], memberPlayerIds: [] }
        ];
        const readName = (player, fallback = '') => {
            const raw = String(player?.displayName || player?.name || player?.title || '').trim();
            if (raw) return raw;
            if (player?.isBot) return this.t('seat-bot') || 'Bot';
            return fallback || this.t('seat-free') || 'Empty';
        };
        const buildTeam = (teamIndex) => {
            const declared = teamSources[teamIndex] || {};
            const seatSlots = teamIndex === 0 ? [0, 2] : [1, 3];
            const declaredMemberIds = new Set([
                ...(Array.isArray(declared?.memberSessionIds) ? declared.memberSessionIds : []),
                ...(Array.isArray(declared?.memberPlayerIds) ? declared.memberPlayerIds : [])
            ].map((value) => String(value || '').trim()).filter(Boolean));
            const members = seatSlots.map((seatIndex, index) => {
                const player = players.find((row) => Number(row?.seatIndex) === seatIndex)
                    || players.find((row) => Number(row?.team) === teamIndex && Number(row?.seatIndex) === seatIndex)
                    || players.find((row) => declaredMemberIds.has(String(row?.sessionId || '').trim()) || declaredMemberIds.has(String(row?.playerId || row?.userId || row?.id || '').trim()))
                    || null;
                return {
                    sessionId: String(player?.sessionId || '').trim() || null,
                    playerId: String(player?.playerId || player?.userId || player?.id || '').trim() || null,
                    name: readName(player, player ? `Player ${index + 1}` : 'Empty'),
                    isBot: Boolean(player?.isBot),
                    isEmpty: !player,
                    seatIndex
                };
            });
            const names = members.map((player, index) => readName(player, player?.isEmpty ? 'Empty' : `Player ${index + 1}`)).filter(Boolean);
            return {
                index: teamIndex,
                name: String(declared?.name || (teamIndex === 0 ? 'Team A' : 'Team B')).trim() || (teamIndex === 0 ? 'Team A' : 'Team B'),
                names,
                members,
                score: Number.isFinite(Number(declared?.score)) ? Number(declared.score) : Number(Array.isArray(state.teamScores) ? state.teamScores[teamIndex] : 0),
                roundWins: Number.isFinite(Number(declared?.roundWins)) ? Number(declared.roundWins) : Number(Array.isArray(state.teamRoundWins) ? state.teamRoundWins[teamIndex] : 0)
            };
        };
        const teams = [buildTeam(0), buildTeam(1)];
        return {
            isTeamMode: Boolean(state?.isTeamMode),
            roomMode: String(state?.roomMode || (state?.isTeamMode ? 'team' : 'ffa')).trim() || (state?.isTeamMode ? 'team' : 'ffa'),
            teams,
            teamAHudNames: teams[0]?.names || [],
            teamBHudNames: teams[1]?.names || []
        };
    }

    setTeamHudDebugState(roomState = this.currentRoomState, source = 'render') {
        const teamHud = this.getRoomTeamHudState(roomState);
        this._lastTeamHudRenderAt = Date.now();
        this._lastTeamHudRenderSource = String(source || 'render').trim() || 'render';
        this._lastTeamHudTeamsSafe = Array.isArray(teamHud.teams)
            ? teamHud.teams.map((team) => ({
                index: Number(team?.index ?? 0),
                name: String(team?.name || '').trim() || null,
                score: Number(team?.score || 0),
                roundWins: Number(team?.roundWins || 0),
                names: Array.isArray(team?.names) ? team.names.slice(0, 4) : [],
                members: Array.isArray(team?.members) ? team.members.slice(0, 4) : []
            }))
            : [];
        this._lastTeamAHudNames = Array.isArray(teamHud.teamAHudNames) ? teamHud.teamAHudNames.slice(0, 4) : [];
        this._lastTeamBHudNames = Array.isArray(teamHud.teamBHudNames) ? teamHud.teamBHudNames.slice(0, 4) : [];
        return teamHud;
    }

    getCurrentWalletBalance() {
        const wallet = this.coinShopStatus?.wallet || this.accountDetails?.wallet || this.accountProfile?.wallet || null;
        const balance = Number(wallet?.balance ?? this.accountProfile?.coins ?? 0);
        return Number.isFinite(balance) ? Math.max(0, balance) : 0;
    }

    getRoomJoinStakeRequirements(roomContext = null, fallbackRoom = null) {
        const source = roomContext || fallbackRoom || this.getCurrentRoomSnapshot() || {};
        const stakeAmount = Number(
            source?.stakeAmount
            ?? source?.roomContext?.stakeAmount
            ?? source?.join?.stakeAmount
            ?? source?.roomSettings?.stakeAmount
            ?? source?.requiredStake
            ?? 0
        );
        const stakeKey = String(
            source?.stakeKey
            || source?.roomContext?.stakeKey
            || source?.join?.stakeKey
            || source?.roomSettings?.stakeKey
            || ''
        ).trim() || null;
        return {
            stakeAmount: Number.isFinite(stakeAmount) ? Math.max(0, Math.trunc(stakeAmount)) : 0,
            stakeKey
        };
    }

    canJoinRoomWithWalletGate(roomContext = null, fallbackRoom = null, context = {}) {
        const requirements = this.getRoomJoinStakeRequirements(roomContext, fallbackRoom);
        const requiredStake = Number(requirements.stakeAmount || 0) || 0;
        const currentBalance = this.getCurrentWalletBalance();
        this._lastJoinStakeRequired = requiredStake;
        this._lastJoinBalance = currentBalance;
        this._lastJoinBlockedRoomId = String(context?.roomId || roomContext?.roomId || fallbackRoom?.roomId || '').trim();
        this._lastJoinBlockedInviteId = String(context?.inviteId || roomContext?.inviteId || fallbackRoom?.inviteId || '').trim();
        this._lastJoinBlockedByCoins = false;
        if (!requiredStake || currentBalance >= requiredStake) {
            return true;
        }
        this.showInsufficientCoinsModal(requiredStake, currentBalance, {
            roomId: this._lastJoinBlockedRoomId,
            inviteId: this._lastJoinBlockedInviteId
        });
        return false;
    }

    showInsufficientCoinsModal(requiredStake = 0, currentBalance = 0, context = {}) {
        this._lastJoinStakeRequired = Number(requiredStake || 0) || 0;
        this._lastJoinBalance = Number(currentBalance || 0) || 0;
        this._lastJoinBlockedByCoins = true;
        this._lastJoinBlockedAt = Date.now();
        this._lastJoinBlockedRoomId = String(context?.roomId || '').trim();
        this._lastJoinBlockedInviteId = String(context?.inviteId || '').trim();
        this._lastInsufficientCoinsModalShownAt = this._lastJoinBlockedAt;
        this.ensureInsufficientCoinsModal();
        const modal = document.getElementById('insufficient-coins-modal');
        const title = document.getElementById('insufficient-coins-modal-title');
        const message = document.getElementById('insufficient-coins-modal-message');
        const balanceEl = document.getElementById('insufficient-coins-modal-balance');
        const requiredEl = document.getElementById('insufficient-coins-modal-required');
        if (title) {
            title.textContent = this.currentLang === 'az'
                ? 'Bu oyun üçün kifayət qədər coin yoxdur'
                : 'Not enough coins for this game';
        }
        if (message) {
            message.textContent = this.currentLang === 'az'
                ? 'Bu oyuna qoşulmaq üçün balansınızı artırın.'
                : 'Please top up your coins before joining this room.';
        }
        if (balanceEl) balanceEl.textContent = String(Math.max(0, Math.trunc(Number(currentBalance || 0) || 0)));
        if (requiredEl) requiredEl.textContent = String(Math.max(0, Math.trunc(Number(requiredStake || 0) || 0)));
        if (modal && modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        if (modal) {
            modal.style.zIndex = '33000';
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        }
        return modal;
    }

    ensureInsufficientCoinsModal() {
        if (document.getElementById('insufficient-coins-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'insufficient-coins-modal';
        modal.className = 'modal-backdrop insufficient-coins-modal';
        modal.innerHTML = `
            <section class="modal-card modal-card-wide insufficient-coins-card">
                <div class="modal-header">
                    <div>
                        <div class="section-kicker">${this.currentLang === 'az' ? 'Coin yoxlanışı' : 'Coin check'}</div>
                        <h2 id="insufficient-coins-modal-title"></h2>
                    </div>
                    <button class="btn btn-menu modal-close-btn insufficient-coins-close-btn" id="insufficient-coins-modal-close" type="button">${this.t('modal-close')}</button>
                </div>
                <div class="modal-body insufficient-coins-body">
                    <p id="insufficient-coins-modal-message"></p>
                    <div class="insufficient-coins-summary">
                        <div class="insufficient-coins-stat">
                            <span>${this.currentLang === 'az' ? 'Lazım olan' : 'Required'}</span>
                            <strong id="insufficient-coins-modal-required">0</strong>
                        </div>
                        <div class="insufficient-coins-stat">
                            <span>${this.currentLang === 'az' ? 'Balans' : 'Balance'}</span>
                            <strong id="insufficient-coins-modal-balance">0</strong>
                        </div>
                    </div>
                    <div class="modal-actions insufficient-coins-actions">
                        <button class="btn btn-action btn-strong" id="insufficient-coins-modal-shop-btn" type="button">${this.currentLang === 'az' ? 'Coin mağazası' : 'Coin shop'}</button>
                    </div>
                </div>
            </section>
        `;
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                event.preventDefault();
                event.stopPropagation();
                this.closeInsufficientCoinsModal();
            }
        });
        modal.querySelector('.modal-card')?.addEventListener('click', (event) => event.stopPropagation());
        document.body.appendChild(modal);
        const closeBtn = modal.querySelector('#insufficient-coins-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.closeInsufficientCoinsModal();
            });
        }
        const shopBtn = modal.querySelector('#insufficient-coins-modal-shop-btn');
        if (shopBtn) {
            shopBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.closeInsufficientCoinsModal();
                await this.openCoinShopModal();
            });
        }
        if (!this._insufficientCoinsModalEscapeHandler) {
            this._insufficientCoinsModalEscapeHandler = (event) => {
                if (event.key !== 'Escape') return;
                if (!document.getElementById('insufficient-coins-modal')?.classList.contains('active')) return;
                this.closeInsufficientCoinsModal();
            };
            document.addEventListener('keydown', this._insufficientCoinsModalEscapeHandler);
        }
    }

    closeInsufficientCoinsModal() {
        const modal = document.getElementById('insufficient-coins-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    getCurrentRoomPlayerIds() {
        const players = Array.isArray(this.currentRoomState?.players) ? this.currentRoomState.players : [];
        const ids = new Set();
        players.forEach((player) => {
            const playerId = String(player?.playerId || player?.userId || player?.id || player?.sessionId || '').trim();
            if (playerId) ids.add(playerId);
        });
        return ids;
    }

    isPlayerAlreadyInCurrentRoom(playerId) {
        const targetId = String(playerId || '').trim();
        if (!targetId) return false;
        return this.getCurrentRoomPlayerIds().has(targetId);
    }

    findOutgoingPlayInviteForRoomContext(playerId, roomContext = null) {
        const targetId = String(playerId || '').trim();
        if (!targetId) return null;
        const outgoing = Array.isArray(this.roomInvitations?.sent) ? this.roomInvitations.sent : [];
        const normalizedRoomId = String(roomContext?.roomId || '').trim();
        const normalizedRoomCode = String(roomContext?.roomCode || '').trim().toUpperCase();
        const normalizedRoomMode = String(roomContext?.roomMode || '').trim().toLowerCase();
        const normalizedSlotIndex = Number.isInteger(Number(roomContext?.targetSlotIndex)) ? Number(roomContext.targetSlotIndex) : null;
        return outgoing.find((invite) => {
            if (!this.isPlayInviteActive(invite)) return false;
            if (String(invite?.invitee?.id || '').trim() !== targetId) return false;
            const payload = invite?.payloadJson && typeof invite.payloadJson === 'object' && !Array.isArray(invite.payloadJson)
                ? invite.payloadJson
                : null;
            const payloadRoom = payload?.roomContext && typeof payload.roomContext === 'object' && !Array.isArray(payload.roomContext)
                ? payload.roomContext
                : null;
            const inviteRoomId = String(invite?.roomId || payloadRoom?.roomId || payload?.roomId || '').trim();
            const inviteRoomCode = String(invite?.roomCode || payloadRoom?.roomCode || payload?.roomCode || '').trim().toUpperCase();
            const inviteRoomMode = String(payloadRoom?.roomMode || payload?.roomMode || '').trim().toLowerCase();
            const inviteSlotIndex = Number.isInteger(Number(payloadRoom?.targetSlotIndex))
                ? Number(payloadRoom.targetSlotIndex)
                : Number.isInteger(Number(payload?.targetSlotIndex))
                    ? Number(payload.targetSlotIndex)
                    : null;
            if (normalizedRoomId && inviteRoomId && inviteRoomId !== normalizedRoomId) return false;
            if (normalizedRoomCode && inviteRoomCode && inviteRoomCode !== normalizedRoomCode) return false;
            if (normalizedRoomMode && inviteRoomMode && inviteRoomMode !== normalizedRoomMode) return false;
            if (normalizedSlotIndex !== null && inviteSlotIndex !== null && inviteSlotIndex !== normalizedSlotIndex) return false;
            return true;
        }) || null;
    }

    getContextualRoomInviteCandidates(context = {}) {
        const roomContext = this.getCurrentRoomInviteContext(context) || null;
        const accepted = Array.isArray(this.friendHub?.accepted) ? this.friendHub.accepted : [];
        const currentPlayerId = String(this.getCurrentAccountPlayerId?.() || this.accountProfile?.playerId || this.accountProfile?.id || '').trim();
        const roomPlayerIds = this.getCurrentRoomPlayerIds();
        const pendingInviteIds = new Set(
            (Array.isArray(this.roomInvitations?.sent) ? this.roomInvitations.sent : [])
                .filter((invite) => this.isPlayInviteActive(invite))
                .map((invite) => String(invite?.invitee?.id || '').trim())
                .filter(Boolean)
        );
        const candidates = accepted
            .map((item) => item?.friend || item)
            .filter((friend) => Boolean(String(friend?.id || '').trim()))
            .filter((friend) => String(friend?.id || '').trim() !== currentPlayerId)
            .filter((friend) => !roomPlayerIds.has(String(friend?.id || '').trim()))
            .map((friend) => ({
                ...friend,
                _status: this.getFriendPresenceStatus(friend, this.friendPresenceMap),
                _pendingInvite: pendingInviteIds.has(String(friend?.id || '').trim()) ? this.findOutgoingPlayInviteForRoomContext(friend?.id, roomContext) : null
            }))
            .sort((a, b) => {
                const aOnline = this.isFriendOnline(a, this.friendPresenceMap) ? 0 : 1;
                const bOnline = this.isFriendOnline(b, this.friendPresenceMap) ? 0 : 1;
                if (aOnline !== bOnline) return aOnline - bOnline;
                return String(a.displayName || '').localeCompare(String(b.displayName || ''));
            });
        const onlineCount = candidates.filter((friend) => this.isFriendOnline(friend, this.friendPresenceMap)).length;
        const offlineCount = candidates.length - onlineCount;
        const excludedAlreadyInRoomCount = accepted.length - candidates.length;
        return {
            roomContext,
            friends: candidates,
            onlineCount,
            offlineCount,
            excludedAlreadyInRoomCount
        };
    }

    touchSocialSocketEvent(eventName, payload = null) {
        this._socialSocketLastEventAt = Date.now();
        this.logSocialSocket(eventName, payload || {});
    }

    getSocialRealtimeStatus() {
        const socket = this._socialSocket;
        const token = String(this.account?.getSocialSocketAuthToken?.() || this.account?.platformGameToken || "").trim();
        const socketAvailable = typeof window.io === "function";
        const socketConnected = Boolean(socket?.connected);
        const socketPath = String(this.account?.getSocialSocketPath?.() || "/api/socket.io").trim();
        const socketUrl = String(this.account?.getSocialSocketUrl?.() || "").trim();
        const serviceWorkerController = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller || null : null;
        const fallbackMode = socketConnected || this._socialSocketReady || this._socialSocketProbePending
            ? "socket"
            : (this._socialSocketFallbackActive || (this._socialSse && this._socialSse.readyState === 1)
                ? "sse"
                : "polling");
        return {
            clientBuild: DOMINO_CLIENT_BUILD,
            appJsLoadedAt: String(this._appJsLoadedAt || '').trim(),
            pageUrl: String(window.location?.href || '').trim(),
            userAgent: String(window.navigator?.userAgent || '').trim(),
            platformApiBase: String(this.account?.platformApiBase || '').trim(),
            socketObjectExists: Boolean(socket),
            socketInitAttemptCount: Number(this._socialSocketInitAttemptCount || 0) || 0,
            socketLastInitReason: String(this._socialSocketLastInitReason || '').trim(),
            socketLastInitAt: Number(this._socialSocketLastInitAt || 0) || 0,
            socketProbePending: Boolean(this._socialSocketProbePending),
            socketConnectRequestedAt: Number(this._socialSocketConnectRequestedAt || 0) || 0,
            lastHealthProbeStatus: String(this._socialSocketLastHealthStatus || '').trim(),
            socketLastHealthStatus: String(this._socialSocketLastHealthStatus || '').trim(),
            socketHealthProbeStartedAt: Number(this._socialSocketHealthProbeStartedAt || 0) || 0,
            socketHealthProbeFinishedAt: Number(this._socialSocketHealthProbeFinishedAt || 0) || 0,
            socketAuthRefreshPending: Boolean(this._socialSocketAuthRefreshPending),
            socketFallbackActive: Boolean(this._socialSocketFallbackActive),
            sseObjectExists: Boolean(this._socialSse),
            socialRealtimeDestroyedOrClosedApprox: Number(this._socialRealtimeDestroyedAt || this._socialRealtimeClosedAt || 0) || 0,
            ioEngineTransport: String(socket?.io?.engine?.transport?.name || '').trim(),
            socketAvailable,
            socketConnected,
            socketReady: Boolean(this._socialSocketReady),
            socketUrl,
            socketPath,
            tokenExists: Boolean(token),
            localStorageGameTokenExists: Boolean(window.localStorage?.getItem('dominoPlatformGameToken')),
            fallbackMode,
            lastConnectError: String(this._socialSocketLastConnectError || "").trim(),
            lastEventAt: Number(this._socialSocketLastEventAt || 0) || 0,
            sseConnectedApprox: Boolean(this._socialSse && this._socialSse.readyState === 1),
            invitePollingActive: Boolean(this._gameInviteRefreshId),
            hasServiceWorkerController: Boolean(serviceWorkerController),
            serviceWorkerControllerUrl: String(serviceWorkerController?.scriptURL || '').trim(),
            serviceWorkerExpectedVersion: DOMINO_CLIENT_BUILD.socialRealtimeDebugVersion,
            cacheFixVersion: DOMINO_CLIENT_BUILD.cacheFixVersion
        };
    }

    closeSocialSocket() {
        this.clearSocialSocketReconnectTimer();
        this.clearSocialSocketFallbackTimer();
        this._socialSocketRetryCount = 0;
        this._socialSocketReady = false;
        this._socialSocketProbePending = false;
        this._socialSocketAuthRefreshPending = false;
        this._socialSocketAuthToken = "";
        if (this._socialSocket) {
            try {
                this._socialSocket.removeAllListeners?.();
                this._socialSocket.close?.();
            } catch (err) {
                debugLog("[SocialSocket] close failed", err);
            }
            this._socialSocket = null;
        }
    }

    closeSocialRealtime() {
        this.closeSocialSocket();
        this.closeSocialSse();
        this.clearSocialSoftRefreshTimer();
        this.clearSocialRefreshTimers();
        this.stopGameInviteRefresh();
        this.stopSocialHubAutoRefresh();
        this._socialRealtimeClosedAt = Date.now();
        this._socialSocketFallbackActive = false;
        this._socialSocketLastConnectError = '';
        this._socialSocketLastEventAt = 0;
        this._socialSocketAuthToken = '';
        this._socialSocketAuthRefreshPending = false;
        this._socialSocketAuthRefreshAttempted = false;
    }

    async ensureSocialRealtimeStarted(reason = 'unknown') {
        if (!this.hasAuthenticatedAccount()) return false;
        if (this._socialSocket?.connected || this._socialSocketProbePending) return true;

        const nextReason = String(reason || 'unknown').trim() || 'unknown';
        const token = String(this.account?.getSocialSocketAuthToken?.() || this.account?.platformGameToken || '').trim();
        if (!token && this.account?.syncPlatformSession) {
            try {
                await this.account.syncPlatformSession();
            } catch {}
        }

        this._socialSocketInitAttemptCount = (this._socialSocketInitAttemptCount || 0) + 1;
        this._socialSocketLastInitReason = nextReason;
        this._socialSocketLastInitAt = Date.now();

        const initialized = this.initSocialSocket(nextReason);
        if (!initialized) {
            this._socialSocketFallbackActive = true;
            if (!this._socialSse) {
                this.initSocialSse();
            }
        }
        return initialized;
    }

    initSocialRealtime(reason = 'unknown') {
        return this.ensureSocialRealtimeStarted(reason);
    }

    isSocialUnauthorizedError(value) {
        const text = String(value?.message || value?.error || value || '').trim().toLowerCase();
        const code = String(value?.code || value?.status || '').trim().toLowerCase();
        return code === 'unauthorized' || text.includes('unauthorized');
    }

    async attemptSocialSocketAuthRefresh(reason = 'connect_error', payload = {}) {
        if (!this.hasAuthenticatedAccount()) return false;
        if (this._socialSocketAuthRefreshPending || this._socialSocketAuthRefreshAttempted) {
            return false;
        }

        this._socialSocketAuthRefreshPending = true;
        this._socialSocketAuthRefreshAttempted = true;
        this.logSocialSocket('token-refresh-requested', {
            reason,
            code: String(payload?.code || '').trim(),
            message: String(payload?.message || payload?.error || '').trim()
        });

        try {
            this.closeSocialSocket();
            await this.account?.syncPlatformSession?.();
            if (!this.hasAuthenticatedAccount()) {
                throw new Error('auth_lost');
            }
            const initialized = this.initSocialSocket();
            if (!initialized) {
                throw new Error('socket_reinit_failed');
            }
            return true;
        } catch (error) {
            this.logSocialSocket('token-refresh-failed', {
                reason,
                error: String(error?.message || error || 'token_refresh_failed')
            });
            this._socialSocketFallbackActive = true;
            if (!this._socialSse) {
                this.initSocialSse();
            }
            return false;
        } finally {
            this._socialSocketAuthRefreshPending = false;
        }
    }

    isSocialRealtimeSocketReady() {
        return Boolean(this._socialSocket && this._socialSocket.connected);
    }

    applySocialPresenceUpdate(payload) {
        const playerId = String(payload?.playerId || payload?.player?.id || '').trim();
        if (!playerId) return null;
        const status = String(payload?.status || 'online').trim().toLowerCase();
        const normalizedStatus = status === 'in_game' ? 'in_game' : (status === 'offline' ? 'offline' : 'online');
        const entry = {
            playerId,
            displayName: String(payload?.displayName || payload?.player?.displayName || '').trim(),
            status: normalizedStatus,
            roomCode: String(payload?.roomCode || '').trim() || null,
            lastSeenAt: String(payload?.lastSeenAt || new Date().toISOString()),
            isConnected: normalizedStatus !== 'offline'
        };
        const next = new Map(this.friendPresenceMap instanceof Map ? this.friendPresenceMap : new Map());
        next.set(playerId, entry);
        this.friendPresenceMap = next;
        if (window.DOMINO_DEBUG_SOCIAL === true) {
            debugLog('[SocialPresence]', entry);
        }
        return entry;
    }

    removeTypingPlayer(threadPlayerId) {
        if (!this._typingPlayers) return;
        const entry = this._typingPlayers.get(threadPlayerId);
        if (entry) {
            clearTimeout(entry.timeoutId);
            this._typingPlayers.delete(threadPlayerId);
            this.renderAccountMessagesPanel();
        }
    }

    refreshSocialPresenceUi() {
        if (this.socialCenterTab === 'friends') {
            void this.loadFriendsPage(true).catch(() => {});
            return;
        }
        if (this.socialCenterView === 'conversation') {
            const activeId = String(this.accountMessagesState?.activePlayerId || '').trim();
            if (activeId) {
                void this.loadConversationWithPlayer(activeId, true).catch(() => {});
            }
        }
    }

    initSocialSocket(reason = 'unknown') {
        if (!this.hasAuthenticatedAccount()) {
            this.closeSocialSocket();
            return false;
        }

        const ioFactory = window.io;
        if (typeof ioFactory !== 'function') {
            return false;
        }

        const socketUrl = String(this.account?.getSocialSocketUrl?.() || '').trim();
        const socketPath = String(this.account?.getSocialSocketPath?.() || '/api/socket.io').trim();
        const token = String(this.account?.getSocialSocketAuthToken?.() || this.account?.platformGameToken || '').trim();
        if (!socketUrl) {
            return false;
        }

        if (!token) {
            if (!this._socialSocketAuthRefreshPending && this.account?.syncPlatformSession) {
                this._socialSocketAuthRefreshPending = true;
                this.logSocialSocket('token-refresh-requested', { socketUrl, socketPath });
                void this.account.syncPlatformSession().then(() => {
                    this._socialSocketAuthRefreshPending = false;
                    if (!this.hasAuthenticatedAccount()) return;
                    this.initSocialSocket('token-refresh-retry');
                }).catch((error) => {
                    this._socialSocketAuthRefreshPending = false;
                    this.logSocialSocket('token-refresh-failed', { error: String(error?.message || error || 'token_refresh_failed') });
                    this._socialSocketFallbackActive = true;
                    if (!this._socialSse) {
                        this.initSocialSse();
                    }
                });
            }
            return true;
        }

        const isLocalHost = ["localhost", "127.0.0.1"].includes(String(window.location?.hostname || "").trim().toLowerCase());
        const socialSocketEnabled = window.DOMINO_ENABLE_SOCIAL_SOCKET === true || !isLocalHost;
        if (!socialSocketEnabled) {
            return false;
        }

        if (this._socialSocket && this._socialSocket.connected) {
            return true;
        }

        if (this._socialSocket) {
            const sameEndpoint = this._socialSocketAuthToken === token && this._socialSocketPath === socketPath && this._socialSocketUrl === socketUrl;
            if (sameEndpoint) {
                if (!this._socialSocket.connected && !this._socialSocketProbePending && !this._socialSocketReady) {
                    this._socialSocketConnectRequestedAt = Date.now();
                    this._socialSocketLastInitReason = String(reason || 'unknown').trim() || 'unknown';
                    this._socialSocketLastInitAt = Date.now();
                    this.logSocialSocket('connect-request', {
                        reason: this._socialSocketLastInitReason,
                        reuse: true
                    });
                    try {
                        this._socialSocket.connect?.();
                    } catch (error) {
                        this._socialSocketLastConnectError = String(error?.message || error || 'socket_connect_failed');
                        this._socialSocketFallbackActive = true;
                        this.closeSocialSocket();
                        if (!this._socialSse) {
                            this.initSocialSse();
                        }
                    }
                }
                return true;
            }
            this.closeSocialSocket();
        }

        this._socialSocketInitAttemptCount = (this._socialSocketInitAttemptCount || 0) + 1;
        this._socialSocketLastInitReason = String(reason || 'unknown').trim() || 'unknown';
        this._socialSocketLastInitAt = Date.now();
        this.clearSocialSocketFallbackTimer();
        this._socialSocketLastConnectError = '';
        this._socialSocketUrl = socketUrl;
        this._socialSocketPath = socketPath;
        this.logSocialSocket('init', {
            reason: this._socialSocketLastInitReason,
            url: socketUrl,
            path: socketPath,
            tokenExists: Boolean(token)
        });

        const socket = ioFactory(socketUrl, {
            path: socketPath,
            auth: { token },
            transports: ['websocket', 'polling'],
            withCredentials: true,
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1500,
            reconnectionDelayMax: 30000
        });
        this._socialSocket = socket;
        this._socialSocketAuthToken = token;
        this._socialSocketReady = false;
        this._socialSocketProbePending = true;
        this._socialSocketConnectRequestedAt = Date.now();
        this._socialSocketHealthProbeStartedAt = Date.now();
        this._socialSocketLastHealthStatus = 'pending';

        const markTouch = (eventName, payload) => this.touchSocialSocketEvent(eventName, payload);

        socket.on('connect', () => {
            markTouch('connect', { url: socketUrl, path: socketPath });
            this._socialSocketReady = true;
            this._socialSocketRetryCount = 0;
            this._socialSocketProbePending = false;
            this._socialSocketLastConnectError = '';
            this._socialSocketFallbackActive = false;
            this._socialSocketAuthRefreshAttempted = false;
            this.clearSocialSocketReconnectTimer();
            this.clearSocialSocketFallbackTimer();
            this.sendSocialPresenceUpdate(this._socialPresenceStatus || 'online').catch(() => {});
            this.startGameInviteRefresh();
            this.closeSocialSse();
        });

        socket.on('connect_error', (error) => {
            const message = String(error?.message || error || 'connect_error');
            this._socialSocketLastConnectError = message;
            markTouch('connect_error', { message });
            this._socialSocketProbePending = false;
            this.clearSocialSocketFallbackTimer();
            if (this.isSocialUnauthorizedError(error) && !this._socialSocketAuthRefreshAttempted) {
                void this.attemptSocialSocketAuthRefresh('connect_error', { message }).catch(() => {});
                return;
            }
            if (this._socialSocket !== socket) return;
            this._socialSocketFallbackTimer = setTimeout(() => {
                if (this._socialSocket !== socket || socket.connected) return;
                this.logSocialSocket('fallback-to-sse', { message });
                this._socialSocketFallbackActive = true;
                try {
                    socket.removeAllListeners?.();
                    socket.close?.();
                } catch {}
                if (this._socialSocket === socket) this._socialSocket = null;
                this._socialSocketReady = false;
                this._socialSocketProbePending = false;
                if (!this._socialSse) {
                    this.initSocialSse();
                }
            }, 2500);
        });

        socket.on('disconnect', (reason) => {
            markTouch('disconnect', { reason: String(reason || '') });
            this._socialSocketReady = false;
            this._socialSocketProbePending = false;
            this.clearSocialSocketFallbackTimer();
            if (this.hasAuthenticatedAccount()) {
                this.startGameInviteRefresh();
            }
        });

        socket.on('social:ready', (payload) => {
            markTouch('social:ready', payload);
            this._socialSocketReady = true;
            if (payload?.status) {
                this._socialPresenceStatus = payload.status;
            }
            this.updateSocialCenterBadge();
        });

        socket.on('presence:update', (payload) => {
            markTouch('presence:update', payload);
            this.applySocialPresenceUpdate(payload);
            this.scheduleSocialRefresh('presence', { delayMs: 1200, reason: 'socket-presence-update' });
        });

        socket.on('dm:new', (payload) => {
            markTouch('dm:new', payload);
            this.applyRealtimeDirectMessage(payload);
        });

        // Removed dm:ack listener as we now rely on ack callback directly

        socket.on('dm:read', (payload) => {
            markTouch('dm:read', payload);
            const threadPlayerId = String(payload?.threadPlayerId || '').trim();
            if (!threadPlayerId) return;
            const state = this.accountMessagesState || {};
            const messages = Array.isArray(state.messages) ? state.messages.map((message) => {
                const isRelevant = String(message?.senderPlayerId || '').trim() === threadPlayerId
                    || String(message?.receiverPlayerId || '').trim() === threadPlayerId;
                if (!isRelevant) return message;
                return {
                    ...message,
                    readAt: message.readAt || payload?.readAt || new Date().toISOString()
                };
            }) : [];
            this.accountMessagesState = {
                ...(this.accountMessagesState || {}),
                messages
            };
            this.renderAccountMessagesPanel();
            this.updateSocialCenterBadge();
        });

        socket.on('typing:start', (payload) => {
            markTouch('typing:start', payload);
            const threadPlayerId = String(payload?.threadPlayerId || '').trim();
            if (!threadPlayerId) return;

            this._typingPlayers = this._typingPlayers || new Map();
            const existingTimeout = this._typingPlayers.get(threadPlayerId);
            if (existingTimeout) clearTimeout(existingTimeout.timeoutId);

            const timeoutId = setTimeout(() => {
                this.removeTypingPlayer(threadPlayerId);
            }, 5000);

            this._typingPlayers.set(threadPlayerId, {
                displayName: payload?.displayName || 'Someone',
                timeoutId
            });

            this.renderAccountMessagesPanel();
        });

        socket.on('typing:stop', (payload) => {
            markTouch('typing:stop', payload);
            const threadPlayerId = String(payload?.threadPlayerId || '').trim();
            if (!threadPlayerId) return;
            this.removeTypingPlayer(threadPlayerId);
        });

        socket.on('invite:new', (payload) => {
            markTouch('invite:new', payload);
            this.applyRealtimeRoomInvitation({ ...(payload || {}), __eventName: 'invite:new' });
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-invite-new' });
        });

        socket.on('invite:update', (payload) => {
            markTouch('invite:update', payload);
            this.applyRealtimeRoomInvitation({ ...(payload || {}), __eventName: 'invite:update' });
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-invite-update' });
        });

        socket.on('play-invite:new', (payload) => {
            markTouch('play-invite:new', payload);
            this.applyRealtimeRoomInvitation({ ...(payload || {}), __eventName: 'play-invite:new' });
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-play-invite-new' });
        });

        socket.on('play-invite:accepted', (payload) => {
            markTouch('play-invite:accepted', payload);
            this.applyRealtimeRoomInvitation({ ...(payload || {}), __eventName: 'play-invite:accepted' });
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-play-invite-accepted' });
        });

        socket.on('play-invite:room-ready', (payload) => {
            markTouch('play-invite:room-ready', payload);
            this.applyRealtimeRoomInvitation({ ...(payload || {}), __eventName: 'play-invite:room-ready' });
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-play-invite-room-ready' });
        });

        socket.on('play-invite:room-created', (payload) => {
            markTouch('play-invite:room-created', payload);
            this.applyRealtimeRoomInvitation({ ...(payload || {}), __eventName: 'play-invite:room-created' });
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-play-invite-room-created' });
        });

        socket.on('play-invite:joined', (payload) => {
            markTouch('play-invite:joined', payload);
            this.applyRealtimeRoomInvitation({ ...(payload || {}), __eventName: 'play-invite:joined' });
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-play-invite-joined' });
        });

        socket.on('play-invite:failed-to-join', (payload) => {
            markTouch('play-invite:failed-to-join', payload);
            this.applyRealtimeRoomInvitation({ ...(payload || {}), __eventName: 'play-invite:failed-to-join' });
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-play-invite-failed-to-join' });
        });

        socket.on('play-invite:declined', (payload) => {
            markTouch('play-invite:declined', payload);
            this.applyRealtimeRoomInvitation({ ...(payload || {}), __eventName: 'play-invite:declined' });
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-play-invite-declined' });
        });

        socket.on('play-invite:cancelled', (payload) => {
            markTouch('play-invite:cancelled', payload);
            this.applyRealtimeRoomInvitation({ ...(payload || {}), __eventName: 'play-invite:cancelled' });
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-play-invite-cancelled' });
        });

        socket.on('friend:update', (payload) => {
            markTouch('friend:update', payload);
            this.scheduleSocialRefresh('friends', { delayMs: 1400, reason: 'socket-friend-update' });
        });

        socket.on('social:error', (payload) => {
            markTouch('social:error', payload);
            this._socialSocketLastConnectError = String(payload?.message || payload?.error || payload?.code || 'social_error');
            if (this.isSocialUnauthorizedError(payload)) {
                void this.attemptSocialSocketAuthRefresh('social:error', payload).catch(() => {});
                return;
            }
        });

        try {
            this.logSocialSocket('connect-request', {
                reason: this._socialSocketLastInitReason,
                healthProbeStartedAt: this._socialSocketHealthProbeStartedAt
            });
            socket.connect?.();
        } catch (error) {
            this._socialSocketLastConnectError = String(error?.message || error || 'socket_connect_failed');
            this._socialSocketFallbackActive = true;
            this.closeSocialSocket();
            if (!this._socialSse) {
                this.initSocialSse();
            }
            return true;
        }

        const healthUrl = `${String(this.account?.platformApiBase || '').replace(/\/$/, '')}/health`;
        void fetch(healthUrl, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store'
        }).then((response) => {
            this._socialSocketHealthProbeFinishedAt = Date.now();
            this._socialSocketLastHealthStatus = response?.ok ? 'ok' : `error_${response?.status || 0}`;
            this.logSocialSocket('health-probe', {
                reason: this._socialSocketLastInitReason,
                status: this._socialSocketLastHealthStatus
            });
        }).catch((error) => {
            this._socialSocketHealthProbeFinishedAt = Date.now();
            this._socialSocketLastHealthStatus = String(error?.message || error || 'health_check_failed');
            this.logSocialSocket('health-probe', {
                reason: this._socialSocketLastInitReason,
                status: this._socialSocketLastHealthStatus
            });
        });

        return true;
    }

    async sendSocialPresenceUpdate(status = 'online', payload = {}) {
        const socket = this._socialSocket;
        const normalizedStatus = String(status || 'online').trim().toLowerCase() === 'in_game'
            ? 'in_game'
            : (String(status || '').trim().toLowerCase() === 'offline' ? 'offline' : 'online');
        this._socialPresenceStatus = normalizedStatus;
        if (!socket || !socket.connected) return null;
        return new Promise((resolve) => {
            socket.emit('presence:update', {
                status: normalizedStatus,
                roomCode: String(payload?.roomCode || '').trim() || null
            }, (response) => {
                if (response?.ok && response?.presence) {
                    this.applySocialPresenceUpdate(response.presence);
                }
                resolve(response || null);
            });
        });
    }

    async sendSocialSocketEvent(eventName, payload = {}) {
        const socket = this._socialSocket;
        if (!socket || !socket.connected) return null;
        return new Promise((resolve) => {
            socket.emit(eventName, payload, (response) => {
                resolve(response || null);
            });
        });
    }

    async sendSocialDirectMessage(targetId, text, tempId = '') {
        const socket = this._socialSocket;
        const cleanTargetId = String(targetId || '').trim();
        const cleanText = String(text || '').trim();
        if (!socket || !socket.connected || !cleanTargetId || !cleanText) {
            return null;
        }
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({ ok: false, error: 'timeout', tempId });
            }, 12000); // 12 seconds timeout

            socket.emit('dm:send', {
                tempId: String(tempId || '').trim(),
                receiverPlayerId: cleanTargetId,
                text: cleanText
            }, (response) => {
                clearTimeout(timeout);
                resolve(response || null);
            });
        });
    }

    async sendSocialDirectMessageRead(threadPlayerId) {
        const socket = this._socialSocket;
        const cleanId = String(threadPlayerId || '').trim();
        if (!socket || !socket.connected || !cleanId) return null;
        return new Promise((resolve) => {
            socket.emit('dm:read', {
                threadPlayerId: cleanId
            }, (response) => {
                resolve(response || null);
            });
        });
    }

    async sendSocialInviteCreate(payload = {}) {
        const socket = this._socialSocket;
        if (!socket || !socket.connected) return null;
        return new Promise((resolve) => {
            socket.emit('invite:create', payload || {}, (response) => {
                resolve(response || null);
            });
        });
    }

    async sendSocialPlayInviteCreate(payload = {}) {
        const socket = this._socialSocket;
        if (!socket || !socket.connected) return null;
        return new Promise((resolve) => {
            socket.emit('play-invite:create', payload || {}, (response) => {
                resolve(response || null);
            });
        });
    }

    async sendSocialInviteAccept(inviteId) {
        const socket = this._socialSocket;
        const cleanId = String(inviteId || '').trim();
        if (!socket || !socket.connected || !cleanId) return null;
        return new Promise((resolve) => {
            socket.emit('invite:accept', { inviteId: cleanId }, (response) => {
                resolve(response || null);
            });
        });
    }

    async sendSocialInviteDecline(inviteId) {
        const socket = this._socialSocket;
        const cleanId = String(inviteId || '').trim();
        if (!socket || !socket.connected || !cleanId) return null;
        return new Promise((resolve) => {
            socket.emit('invite:decline', { inviteId: cleanId }, (response) => {
                resolve(response || null);
            });
        });
    }

    async sendSocialInviteCancel(inviteId) {
        const socket = this._socialSocket;
        const cleanId = String(inviteId || '').trim();
        if (!socket || !socket.connected || !cleanId) return null;
        return new Promise((resolve) => {
            socket.emit('invite:cancel', { inviteId: cleanId }, (response) => {
                resolve(response || null);
            });
        });
    }

    async sendSocialPlayInviteAccept(inviteId) {
        const socket = this._socialSocket;
        const cleanId = String(inviteId || '').trim();
        if (!socket || !socket.connected || !cleanId) return null;
        return new Promise((resolve) => {
            socket.emit('play-invite:accept', { inviteId: cleanId }, (response) => {
                resolve(response || null);
            });
        });
    }

    async sendSocialPlayInviteDecline(inviteId) {
        const socket = this._socialSocket;
        const cleanId = String(inviteId || '').trim();
        if (!socket || !socket.connected || !cleanId) return null;
        return new Promise((resolve) => {
            socket.emit('play-invite:decline', { inviteId: cleanId }, (response) => {
                resolve(response || null);
            });
        });
    }

    async sendSocialPlayInviteCancel(inviteId) {
        const socket = this._socialSocket;
        const cleanId = String(inviteId || '').trim();
        if (!socket || !socket.connected || !cleanId) return null;
        return new Promise((resolve) => {
            socket.emit('play-invite:cancel', { inviteId: cleanId }, (response) => {
                resolve(response || null);
            });
        });
    }

    async sendDirectMessageWithFallback(targetId, text, tempId = '') {
        const socketResponse = await this.sendSocialDirectMessage(targetId, text, tempId).catch(() => null);
        if (socketResponse?.ok === false) {
            throw new Error(socketResponse.error || this.t('messages-send-failed') || this.t('chats-send-failed'));
        }
        if (socketResponse?.message || socketResponse?.item) {
            return {
                ok: true,
                item: socketResponse.message || socketResponse.item,
                live: true
            };
        }
        return this.account.sendDirectMessage(targetId, text, tempId);
    }

    async retrySendMessage(tempId) {
        const state = this.accountMessagesState || {};
        const messages = Array.isArray(state.messages) ? [...state.messages] : [];
        const index = messages.findIndex((m) => String(m.id || '').trim() === tempId);
        if (index < 0) return;

        const message = messages[index];
        const targetId = String(state.activePlayerId || '').trim();
        if (!targetId) return;

        messages[index] = {
            ...message,
            localStatus: 'sending',
            isOptimistic: true
        };
        this.accountMessagesState = {
            ...state,
            messages,
            sendLoading: true,
            error: ''
        };
        this.renderAccountMessagesPanel();

        void this.addMessageToOutbox(targetId, message.text, tempId);

        try {
            const result = await this.sendDirectMessageWithFallback(targetId, message.text, tempId);
            const sentMessage = result?.item || message;
            void this.removeMessageFromOutbox(tempId);
            const latestMessages = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
            const tempIndex = latestMessages.findIndex((row) => String(row?.id || '').trim() === tempId);
            if (tempIndex >= 0) {
                latestMessages[tempIndex] = {
                    ...sentMessage,
                    isOptimistic: false,
                    localStatus: 'sent'
                };
            }
            this.accountMessagesState = {
                ...(this.accountMessagesState || {}),
                messages: latestMessages,
                sendLoading: false,
                error: ''
            };
            this.applyRealtimeDirectMessage({
                type: 'message_sent',
                tempId: tempId,
                message: sentMessage,
                threadPlayerId: targetId
            });
        } catch (err) {
            const latestMessages = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
            const tempIndex = latestMessages.findIndex((row) => String(row?.id || '').trim() === tempId);
            if (tempIndex >= 0) {
                latestMessages[tempIndex] = {
                    ...latestMessages[tempIndex],
                    isOptimistic: false,
                    localStatus: 'failed'
                };
            }
            this.accountMessagesState = {
                ...(this.accountMessagesState || {}),
                messages: latestMessages,
                sendLoading: false,
                error: err?.message || this.t('messages-send-failed') || this.t('chats-send-failed')
            };
            this.renderAccountMessagesPanel();
            this.renderer.showMessage(err?.message || this.t('messages-send-failed'), 1800);
        }
    }

    async markDirectMessageThreadReadWithFallback(playerId) {
        const socketResponse = await this.sendSocialDirectMessageRead(playerId).catch(() => null);
        if (socketResponse?.ok === false) {
            return this.account.markMessageThreadRead(playerId);
        }
        if (socketResponse) {
            return socketResponse;
        }
        return this.account.markMessageThreadRead(playerId);
    }

    async sendRoomInviteWithFallback(roomId, payload = {}) {
        const requestPayload = { roomId, ...(payload || {}) };
        this.recordInviteSendAttempt(requestPayload);
        try {
            this._lastInviteSendTransport = this._socialSocket?.connected ? 'socket' : 'rest';
            this._lastInviteSendEndpoint = this._socialSocket?.connected ? 'socket:invite:create' : `/social/rooms/${encodeURIComponent(String(roomId || ''))}/invites`;
            this.renderSocialDebugPanel();
            const socketResponse = await this.sendSocialInviteCreate(requestPayload).catch(() => null);
            if (socketResponse?.ok === false) {
                const error = new Error(socketResponse.error || this.t('friends-load-failed'));
                this.recordInviteSendError(error, requestPayload, {
                    transport: 'socket',
                    endpoint: 'socket:invite:create'
                });
                throw error;
            }
            if (socketResponse?.invite || socketResponse?.item) {
                const result = {
                    ok: true,
                    item: socketResponse.invite || socketResponse.item,
                    live: true
                };
                this.recordInviteSendResult(result, {
                    transport: 'socket',
                    endpoint: 'socket:invite:create'
                });
                return result;
            }
            this._lastInviteSendTransport = this._socialSocket?.connected ? 'fallback' : 'rest';
            this._lastInviteSendEndpoint = `/social/rooms/${encodeURIComponent(String(roomId || ''))}/invites`;
            this.renderSocialDebugPanel();
            const result = await this.account.inviteFriendToRoom(roomId, payload);
            this.recordInviteSendResult(result, {
                transport: this._socialSocket?.connected ? 'fallback' : 'rest',
                endpoint: this._lastInviteSendEndpoint
            });
            return result;
        } catch (error) {
            this.recordInviteSendError(error, requestPayload, {
                transport: this._lastInviteSendTransport,
                endpoint: this._lastInviteSendEndpoint
            });
            throw error;
        }
    }

    async sendPlayInviteWithFallback(payload = {}) {
        const requestPayload = payload && typeof payload === 'object' ? { ...payload } : {};
        this.recordPlayInviteSendAttempt(requestPayload);
        try {
            this._lastPlayInviteSendTransport = this._socialSocket?.connected ? 'socket' : 'rest';
            this._lastPlayInviteSendEndpoint = this._socialSocket?.connected ? 'socket:play-invite:create' : '/social/play-invites';
            this.renderSocialDebugPanel();
            const socketResponse = await this.sendSocialPlayInviteCreate(requestPayload).catch(() => null);
            if (socketResponse?.ok === false) {
                const error = new Error(socketResponse.error || this.t('friends-load-failed'));
                this.recordPlayInviteSendError(error, requestPayload, {
                    transport: 'socket',
                    endpoint: 'socket:play-invite:create'
                });
                throw error;
            }
            if (socketResponse?.invite || socketResponse?.item) {
                const result = {
                    ok: true,
                    item: socketResponse.invite || socketResponse.item,
                    live: true
                };
                this.recordPlayInviteSendResult(result, {
                    transport: 'socket',
                    endpoint: 'socket:play-invite:create'
                });
                return result;
            }
            this._lastPlayInviteSendTransport = this._socialSocket?.connected ? 'fallback' : 'rest';
            this._lastPlayInviteSendEndpoint = '/social/play-invites';
            this.renderSocialDebugPanel();
            const result = await this.account.inviteFriendToPlay(requestPayload);
            this.recordPlayInviteSendResult(result, {
                transport: this._socialSocket?.connected ? 'fallback' : 'rest',
                endpoint: this._lastPlayInviteSendEndpoint
            });
            return result;
        } catch (error) {
            this.recordPlayInviteSendError(error, requestPayload, {
                transport: this._lastPlayInviteSendTransport,
                endpoint: this._lastPlayInviteSendEndpoint
            });
            throw error;
        }
    }

    async acceptPlayInviteWithFallback(inviteId) {
        const cleanId = String(inviteId || '').trim();
        if (!cleanId) return null;
        const socketResponse = await this.sendSocialPlayInviteAccept(cleanId).catch(() => null);
        if (socketResponse?.ok === false) {
            return socketResponse;
        }
        if (socketResponse?.item || socketResponse?.invite) {
            return {
                ok: true,
                item: socketResponse.item || socketResponse.invite,
                live: true
            };
        }
        return this.account.acceptPlayInvite(cleanId);
    }

    async declinePlayInviteWithFallback(inviteId) {
        const cleanId = String(inviteId || '').trim();
        if (!cleanId) return null;
        const socketResponse = await this.sendSocialPlayInviteDecline(cleanId).catch(() => null);
        if (socketResponse?.ok === false) {
            return socketResponse;
        }
        if (socketResponse?.item || socketResponse?.invite) {
            return {
                ok: true,
                item: socketResponse.item || socketResponse.invite,
                live: true
            };
        }
        return this.account.declinePlayInvite(cleanId);
    }

    async cancelPlayInviteWithFallback(inviteId, source = 'unknown') {
        const cleanId = String(inviteId || '').trim();
        if (!cleanId) return null;
        const requestPayload = { inviteId: cleanId, source: String(source || 'unknown').trim() || 'unknown' };
        this.recordPlayInviteCancelAttempt(requestPayload, source);
        const socketResponse = await this.sendSocialPlayInviteCancel(cleanId).catch(() => null);
        if (socketResponse?.ok === false) {
            this.recordPlayInviteCancelError(new Error(socketResponse.error || this.t('friends-load-failed')), requestPayload, source);
            return socketResponse;
        }
        if (socketResponse?.item || socketResponse?.invite) {
            const result = {
                ok: true,
                item: socketResponse.item || socketResponse.invite,
                live: true
            };
            this.recordPlayInviteCancelResult(result);
            return result;
        }
        try {
            const result = await this.account.cancelPlayInvite(cleanId);
            this.recordPlayInviteCancelResult(result || {});
            return result;
        } catch (error) {
            this.recordPlayInviteCancelError(error, requestPayload, source);
            throw error;
        }
    }

    async attachPlayInviteRoomWithFallback(payload = {}) {
        const requestPayload = payload && typeof payload === 'object' ? { ...payload } : {};
        this._lastPlayInviteRoomAttachAttemptAt = Date.now();
        this._lastPlayInviteRoomAttachPayloadSafe = this.buildInviteDebugPayloadSafe(requestPayload);
        try {
            const result = await this.account.attachPlayInviteRoom(requestPayload);
            const safeResult = {
                ok: true,
                count: Number(result?.count || 0) || 0,
                item: this.buildInviteDebugPayloadSafe(result?.item || {}),
                items: Array.isArray(result?.items) ? result.items.map((item) => this.buildInviteDebugPayloadSafe(item)).slice(0, 5) : []
            };
            this._lastPlayInviteRoomAttachResultSafe = safeResult;
            this._lastPlayInviteRoomAttachError = '';
            return result;
        } catch (error) {
            this._lastPlayInviteRoomAttachError = String(error?.message || error || '').trim();
            this._lastPlayInviteRoomAttachResultSafe = null;
            throw error;
        }
    }

    async markPlayInviteJoinedWithFallback(inviteId, payload = {}) {
        const cleanId = String(inviteId || '').trim();
        if (!cleanId) return null;
        try {
            return await this.account.markPlayInviteJoined(cleanId, payload || {});
        } catch (error) {
            this._lastPlayInviteAutoJoinError = String(error?.message || error || '').trim();
            throw error;
        }
    }

    async markPlayInviteFailedToJoinWithFallback(inviteId, payload = {}) {
        const cleanId = String(inviteId || '').trim();
        if (!cleanId) return null;
        try {
            return await this.account.markPlayInviteFailedToJoin(cleanId, payload || {});
        } catch (error) {
            this._lastPlayInviteAutoJoinError = String(error?.message || error || '').trim();
            throw error;
        }
    }

    async joinPlayInviteRoom(invite, { manual = false } = {}) {
        const inviteId = String(invite?.id || '').trim();
        const roomCode = String(invite?.roomCode || invite?.roomId || '').trim().toUpperCase();
        if (!inviteId || !this.isValidRoomCode(roomCode)) return false;
        if (this.playInviteJoiningIds.has(inviteId)) return false;
        if (!manual && this.playInviteAutoJoinAttemptedIds.has(inviteId)) return false;
        if (!manual && this.playInviteRoomReadyIds.has(inviteId) && this.network?.room) {
            return false;
        }
        if (!this.canJoinRoomWithWalletGate(invite, null, { inviteId, roomId: String(invite?.roomId || '').trim(), roomCode })) {
            return false;
        }

        this.playInviteJoiningIds.add(inviteId);
        if (!manual) {
            this.playInviteAutoJoinAttemptedIds.add(inviteId);
        }
        this._lastPlayInviteAcceptedJoinAttemptAt = Date.now();
        this._lastPlayInviteAcceptedJoinRoomId = String(invite?.roomId || '').trim();
        this._lastPlayInviteAcceptedJoinRoomCode = roomCode;
        this._lastPlayInviteAcceptedJoinError = '';
        this._lastPlayInviteAutoJoinAttemptAt = Date.now();
        this._lastPlayInviteAutoJoinError = '';
        this.renderer.showMessage(
            this.currentLang === 'az'
                ? 'Otaq hazırdır. Qoşulursunuz...'
                : 'Room is ready. Joining...',
            1400
        );

        try {
            const joined = await this.joinOnlineRoom({
                roomCode,
                roomId: String(invite?.roomId || '').trim() || null,
                stakeKey: String(invite?.stakeKey || invite?.join?.stakeKey || '').trim() || null,
                stakeAmount: Number(invite?.stakeAmount || invite?.join?.stakeAmount || 0) || 0,
                roomContext: invite?.roomContext || null,
                inviteId
            });
            if (joined) {
                await this.markPlayInviteJoinedWithFallback(inviteId, {
                    roomId: String(invite?.roomId || '').trim() || null,
                    roomCode,
                    reason: manual ? 'manual_join' : 'auto_join'
                }).catch(() => {});
                this.playInviteRoomReadyIds.delete(inviteId);
                this.acceptedWaitingInviteIds.delete(inviteId);
                return true;
            }
            throw new Error('join_failed');
        } catch (error) {
            const message = String(error?.message || error || '').trim();
            this._lastPlayInviteAutoJoinError = message;
            this._lastPlayInviteAcceptedJoinError = message;
            if (!manual && this.network?.room) {
                try {
                    await this.markPlayInviteFailedToJoinWithFallback(inviteId, {
                        roomId: String(invite?.roomId || '').trim() || null,
                        roomCode,
                        reason: message || 'auto_join_failed'
                    });
                } catch {}
            }
            return false;
        } finally {
            this.playInviteJoiningIds.delete(inviteId);
        }
    }

    async acceptRoomInviteWithFallback(inviteId) {
        const socketResponse = await this.sendSocialInviteAccept(inviteId).catch(() => null);
        if (socketResponse?.ok === false) {
            return socketResponse;
        }
        if (socketResponse?.join || socketResponse?.invite || socketResponse?.item) {
            const invite = socketResponse.invite || socketResponse.item || null;
            return {
                ok: true,
                item: invite,
                join: socketResponse.join || null,
                live: true
            };
        }
        return this.account.acceptRoomInvitation(inviteId);
    }

    async declineRoomInviteWithFallback(inviteId) {
        const socketResponse = await this.sendSocialInviteDecline(inviteId).catch(() => null);
        if (socketResponse?.ok === false) {
            throw new Error(socketResponse.error || this.t('friends-load-failed'));
        }
        if (socketResponse?.invite || socketResponse?.item) {
            return {
                ok: true,
                item: socketResponse.invite || socketResponse.item,
                live: true
            };
        }
        return this.account.declineRoomInvitation(inviteId);
    }

    async cancelRoomInviteWithFallback(inviteId) {
        const socketResponse = await this.sendSocialInviteCancel(inviteId).catch(() => null);
        if (socketResponse?.ok === false) {
            throw new Error(socketResponse.error || this.t('friends-load-failed'));
        }
        if (socketResponse?.invite || socketResponse?.item) {
            return {
                ok: true,
                item: socketResponse.invite || socketResponse.item,
                live: true
            };
        }
        return this.account.cancelRoomInvitation(inviteId);
    }

    initSocialSse() {
        if (!this.hasAuthenticatedAccount()) {
            this.closeSocialRealtime();
            return;
        }

        if (!this._socialSocketFallbackActive && this.initSocialSocket()) {
            return;
        }

        if (this._socialSse && this._socialSse.readyState === 1) return;
        if (this._socialSse && this._socialSse.readyState !== 1) {
            this.closeSocialSse();
        }
        this.clearSocialSseReconnectTimer();

        const url = this.account.getSocialSseUrl();
        if (window.DOMINO_DEBUG_SOCIAL === true) {
            console.debug("Initializing social SSE stream connection to:", url);
        }
        const sse = new EventSource(url, { withCredentials: true });
        this._socialSse = sse;
        const resetReconnectState = () => {
            this._socialSseRetryCount = 0;
            this.clearSocialSseReconnectTimer();
        };

        sse.onopen = () => {
            resetReconnectState();
            this.startGameInviteRefresh();
        };

        sse.addEventListener('message', async (event) => {
            try {
                resetReconnectState();
                const data = event.data ? JSON.parse(event.data) : null;
                if (!data) return;
                this.applyRealtimeDirectMessage(data);
            } catch (err) {
                console.error("SSE message handler error:", err);
            }
        });

        sse.addEventListener('heartbeat', () => {
            resetReconnectState();
        });

        sse.addEventListener('invite_update', async (event) => {
            try {
                const data = event.data ? JSON.parse(event.data) : null;
                if (data) {
                    this.applyRealtimeRoomInvitation({ ...(data || {}), __eventName: 'sse:invite_update' });
                }
                this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'sse-invite-update' });
            } catch (err) {
                console.error("SSE invite_update handler error:", err);
            }
        });

        sse.addEventListener('play_invite_update', async (event) => {
            try {
                const data = event.data ? JSON.parse(event.data) : null;
                if (data) {
                    this.applyRealtimeRoomInvitation({ ...(data || {}), __eventName: 'sse:play_invite_update' });
                }
                this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'sse-play-invite-update' });
            } catch (err) {
                console.error("SSE play_invite_update handler error:", err);
            }
        });

        sse.addEventListener('friend_update', async (event) => {
            try {
                this.scheduleSocialRefresh('friends', { delayMs: 1400, reason: 'sse-friend-update' });
            } catch (err) {
                console.error("SSE friend_update handler error:", err);
            }
        });

        sse.onerror = (e) => {
            if (this._socialSse !== sse) return;
            if (!this.hasAuthenticatedAccount()) {
                this.closeSocialSse();
                return;
            }
            debugLog("[SocialSSE] connection dropped", {
                readyState: sse.readyState
            });
            try {
                sse.close();
            } catch {}
            if (this._socialSse === sse) this._socialSse = null;
            this.scheduleSocialSseReconnect();
        };
    }

    async loadSocialSummary() {
        if (!this.hasAuthenticatedAccount()) {
            this.resetSocialCenterState();
            this.updateSocialCenterBadge();
            return this.socialSummary;
        }

        if (this._socialSummaryLoadInFlight) {
            return this._socialSummaryLoadInFlight;
        }

        this._socialSummaryLoadInFlight = (async () => {
            try {
                const summary = await this.account.getSocialSummary();
                this.socialSummary = {
                    inboxUnreadCount: Math.max(0, Number(summary?.inboxUnreadCount || 0)),
                    chatUnreadCount: Math.max(0, Number(summary?.chatUnreadCount || 0)),
                    inviteUnreadCount: Math.max(0, Number(summary?.inviteUnreadCount || 0)),
                    friendRequestCount: Math.max(0, Number(summary?.friendRequestCount || 0)),
                    totalUnreadCount: Math.max(0, Number(summary?.totalUnreadCount || 0))
                };
                this.socialSummaryLoaded = true;
            } catch {
                if (!this.socialSummaryLoaded) {
                    this.socialSummary = {
                        inboxUnreadCount: 0,
                        chatUnreadCount: 0,
                        inviteUnreadCount: 0,
                        friendRequestCount: 0,
                        totalUnreadCount: 0
                    };
                }
            } finally {
                this._socialSummaryLoadInFlight = null;
            }
            this.updateSocialCenterBadge();
            if (this.hasAuthenticatedAccount()) {
                void this.ensureSocialRealtimeStarted('summary-loaded');
            }
            if (this.hasAuthenticatedAccount()) {
                this.startGameInviteRefresh();
            }
            return this.socialSummary;
        })();

        return this._socialSummaryLoadInFlight;
    }

    async loadInboxPage(isBackground = false) {
        const list = document.getElementById('social-inbox-list');
        const summary = document.getElementById('social-inbox-summary');
        if (!list || !summary) return [];

        if (!this.hasAuthenticatedAccount()) {
            this.socialInboxState = {
                items: [],
                threads: [],
                unreadCount: 0,
                loading: false,
                error: this.t('friends-login-required')
            };
            this.renderSocialInboxPanel();
            this.updateSocialCenterBadge();
            return [];
        }

        if (this._inboxLoadInFlight) {
            return this._inboxLoadInFlight;
        }

        if (!isBackground) {
            this.socialInboxState = {
                ...(this.socialInboxState || {}),
                loading: true,
                error: ''
            };
            this.renderSocialInboxPanel();
        }

        this._inboxLoadInFlight = (async () => {
            try {
                const [data, threadData] = await Promise.all([
                    this.account.getInbox(),
                    this.loadMessageThreads().catch(() => [])
                ]);
                const items = Array.isArray(data?.items) ? data.items : [];
                const threads = Array.isArray(threadData) ? threadData : [];
                const unreadCount = Math.max(0, Number(data?.unreadCount || 0));
                this.socialInboxState = {
                    items,
                    threads,
                    unreadCount,
                    loading: false,
                    error: ''
                };
                this.renderSocialInboxPanel();
                await this.loadSocialSummary();
                return items;
            } catch (err) {
                this.socialInboxState = {
                    items: [],
                    unreadCount: 0,
                    loading: false,
                    error: err?.message || this.t('inbox-load-failed')
                };
                this.renderSocialInboxPanel();
                this.updateSocialCenterBadge();
                return [];
            } finally {
                this._inboxLoadInFlight = null;
            }
        })();

        return this._inboxLoadInFlight;
    }

    mergeConversationMessages(existingMessages = [], freshMessages = []) {
        const merged = new Map();
        
        const findExistingKey = (message) => {
            const id = String(message?.id || '').trim();
            const clientMsgId = String(message?.clientMessageId || message?.tempId || '').trim();
            
            if (id && merged.has(id)) return id;
            
            if (clientMsgId) {
                for (const [key, val] of merged.entries()) {
                    const valClientMsgId = String(val?.clientMessageId || val?.tempId || '').trim();
                    if (valClientMsgId === clientMsgId) {
                        return key;
                    }
                }
            }
            return null;
        };

        const addMessage = (message, preferFresh = false) => {
            const id = String(message?.id || '').trim();
            if (!id) return;
            
            const existingKey = findExistingKey(message);
            if (!existingKey) {
                merged.set(id, { ...message });
                return;
            }
            
            const current = merged.get(existingKey);
            merged.delete(existingKey);
            
            const mergedVal = preferFresh ? { ...current, ...message } : { ...message, ...current };
            const finalId = (!String(existingKey).startsWith('temp-') && String(id).startsWith('temp-')) ? existingKey : id;
            merged.set(finalId, mergedVal);
        };

        (Array.isArray(existingMessages) ? existingMessages : []).forEach((message) => addMessage(message, false));
        (Array.isArray(freshMessages) ? freshMessages : []).forEach((message) => addMessage(message, true));

        return Array.from(merged.values()).sort((left, right) => new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime());
    }

    mergeConversationThreads(existingThreads = [], freshThreads = [], activePlayerId = '') {
        const keyForThread = (thread) => String(thread?.player?.id || thread?.playerId || thread?.id || '').trim();
        const merged = new Map();
        const addThread = (thread) => {
            const key = keyForThread(thread);
            if (!key) return;
            const current = merged.get(key) || null;
            if (!current) {
                merged.set(key, { ...thread });
                return;
            }

            const currentStamp = new Date(current?.lastMessage?.createdAt || current?.updatedAt || 0).getTime();
            const freshStamp = new Date(thread?.lastMessage?.createdAt || thread?.updatedAt || 0).getTime();
            const preferFresh = freshStamp > currentStamp;
            const mergedThread = preferFresh ? { ...current, ...thread } : { ...thread, ...current };
            mergedThread.messageCount = Math.max(0, Number(current?.messageCount || 0), Number(thread?.messageCount || 0));
            mergedThread.unreadCount = String(key) === String(activePlayerId || '').trim()
                ? 0
                : (preferFresh ? Math.max(0, Number(thread?.unreadCount || 0)) : Math.max(0, Number(current?.unreadCount || 0)));
            merged.set(key, mergedThread);
        };

        (Array.isArray(existingThreads) ? existingThreads : []).forEach((thread) => addThread(thread));
        (Array.isArray(freshThreads) ? freshThreads : []).forEach((thread) => addThread(thread));

        return Array.from(merged.values()).sort((left, right) => new Date(right?.lastMessage?.createdAt || 0).getTime() - new Date(left?.lastMessage?.createdAt || 0).getTime());
    }

    mergeRoomInvitations(existingInvitations = {}, freshInvitations = {}, currentPlayerId = this.getCurrentAccountPlayerId()) {
        const merged = new Map();
        const freshIds = new Set();
        // Give recent realtime invite events a short grace window so polling does not flicker them away.
        const preserveMissingLocalInvites = (Date.now() - Number(this._lastInviteEventAt || 0)) < 10000;
        const addInvite = (invite) => {
            const id = String(invite?.id || '').trim();
            if (!id) return;
            const current = merged.get(id) || null;
            if (!current) {
                merged.set(id, { ...invite });
                return;
            }
            const currentStamp = new Date(current?.updatedAt || current?.createdAt || 0).getTime();
            const freshStamp = new Date(invite?.updatedAt || invite?.createdAt || 0).getTime();
            merged.set(id, freshStamp >= currentStamp ? { ...current, ...invite } : { ...invite, ...current });
        };

        const existingRows = [
            ...(Array.isArray(existingInvitations?.incoming) ? existingInvitations.incoming : []),
            ...(Array.isArray(existingInvitations?.sent) ? existingInvitations.sent : [])
        ];
        const freshRows = [
            ...(Array.isArray(freshInvitations?.incoming) ? freshInvitations.incoming : []),
            ...(Array.isArray(freshInvitations?.sent) ? freshInvitations.sent : [])
        ];
        freshRows.forEach((invite) => {
            const id = String(invite?.id || '').trim();
            if (id) freshIds.add(id);
            addInvite(invite);
        });
        existingRows.forEach((invite) => {
            const id = String(invite?.id || '').trim();
            if (!id) return;
            if (!freshIds.has(id) && !preserveMissingLocalInvites) return;
            addInvite(invite);
        });

        const all = Array.from(merged.values()).sort((left, right) => new Date(right?.updatedAt || right?.createdAt || 0).getTime() - new Date(left?.updatedAt || left?.createdAt || 0).getTime());
        const resolvedPlayerId = String(currentPlayerId || '').trim();
        const incoming = all.filter((invite) => String(invite?.invitee?.id || '').trim() === resolvedPlayerId);
        const sent = all.filter((invite) => String(invite?.inviter?.id || '').trim() === resolvedPlayerId);
        return { incoming, sent, items: all };
    }

    renderRoomInvitationsPanel() {
        const incomingList = document.getElementById('social-invites-incoming-list');
        const sentList = document.getElementById('social-invites-sent-list');
        const fallbackList = document.getElementById('social-invites-list');
        const hasSplitLayout = Boolean(incomingList && sentList);
        const invitesList = fallbackList || incomingList || sentList;
        if (!invitesList) return false;

        const invitations = this.roomInvitations || { incoming: [], sent: [] };
        const { incoming, sent } = this.getActiveRoomInvitations(invitations);
        
        const incomingSection = document.getElementById('social-invites-incoming-section');
        const sentSection = document.getElementById('social-invites-sent-section');
        if (incomingSection) incomingSection.classList.toggle('is-hidden', incoming.length === 0);
        if (sentSection) sentSection.classList.toggle('is-hidden', sent.length === 0);

        const acceptedWaitingCount = this.getAcceptedWaitingPlayInvites().length;
        const renderState = {
            incomingBeforeRender: Array.isArray(incoming) ? incoming.length : 0,
            sentBeforeRender: Array.isArray(sent) ? sent.length : 0,
            acceptedWaitingCount,
            renderedIncomingCount: 0,
            renderedSentCount: 0,
            emptyStateShown: false,
            emptyStateReason: ''
        };
        const renderList = (container, items, kind, emptyKey) => {
            if (!container) return;
            container.innerHTML = '';
            const activeItems = Array.isArray(items) ? items : [];
            if (!activeItems.length) {
                renderState.emptyStateShown = true;
                const hiddenWaiting = kind === 'sent' && acceptedWaitingCount > 0;
                renderState.emptyStateReason = this.roomInvitationsLoading
                    ? 'loading'
                    : (hiddenWaiting ? `${kind}:waiting-hidden` : `${kind}:empty`);
                this.setSummaryMessage(container, this.roomInvitationsLoading ? this.t('account-profile-loading') : this.t(emptyKey));
                return;
            }
            if (kind === 'incoming') {
                renderState.renderedIncomingCount = activeItems.length;
            } else {
                renderState.renderedSentCount = activeItems.length;
            }
            activeItems.forEach((invite) => {
                container.appendChild(this.createRoomInvitationCard(invite, kind));
            });
        };

        if (hasSplitLayout) {
            renderList(incomingList, incoming, 'incoming', 'no-room-invites');
            renderList(sentList, sent, 'sent', 'invite-sent-empty');
        } else {
            invitesList.innerHTML = '';
            const combined = [...incoming, ...sent].filter((invite) => this.isRoomInvitationActive(invite) || this.isPlayInviteActive(invite));
            if (!combined.length) {
                renderState.emptyStateShown = true;
                renderState.emptyStateReason = this.roomInvitationsLoading
                    ? 'loading'
                    : (acceptedWaitingCount > 0 ? 'combined:waiting-hidden' : 'combined:empty');
                this.setSummaryMessage(invitesList, this.roomInvitationsLoading ? this.t('account-profile-loading') : this.t('no-room-invites'));
            } else {
                renderState.renderedIncomingCount = incoming.filter((invite) => this.isRoomInvitationActive(invite) || this.isPlayInviteActive(invite)).length;
                renderState.renderedSentCount = sent.filter((invite) => this.isRoomInvitationActive(invite) || this.isPlayInviteActive(invite)).length;
                combined.forEach((invite) => {
                    invitesList.appendChild(this.createRoomInvitationCard(invite, incoming.some((item) => item?.id === invite?.id) ? 'incoming' : 'sent'));
                });
            }
        }

        this._roomInvitationsRenderState = renderState;
        this.renderSocialDebugPanel();
        return true;
    }

    renderSocialInboxPanel() {
        const list = document.getElementById('social-inbox-list');
        const summary = document.getElementById('social-inbox-summary');
        if (!list || !summary) return;

        const state = this.socialInboxState || {};
        const unreadCount = Math.max(0, Number(state.unreadCount || 0));
        const threads = Array.isArray(state.threads) ? state.threads : [];
        const threadUnreadCount = threads.reduce((sum, thread) => sum + Math.max(0, Number(thread?.unreadCount || 0)), 0);
        const totalUnreadCount = unreadCount + threadUnreadCount;
        if (!this.hasAuthenticatedAccount()) {
            summary.textContent = this.t('friends-login-required');
            this.setSummaryMessage(list, this.t('friends-login-required'));
            return;
        }

        if (state.error) {
            summary.textContent = state.error;
            this.setSummaryMessage(list, state.error);
            return;
        }

        if (state.loading && (!state.items || !state.items.length) && (!threads || !threads.length)) {
            summary.textContent = this.t('account-profile-loading');
            this.setSummaryMessage(list, this.t('account-profile-loading'));
            return;
        }

        summary.textContent = totalUnreadCount > 0
            ? `${this.t('inbox-unread')}: ${totalUnreadCount}`
            : this.t('inbox-read');

        const items = Array.isArray(state.items) ? state.items : [];
        list.innerHTML = '';
        const renderedThreadIds = new Set();
        const appendSectionTitle = (text) => {
            const title = document.createElement('div');
            title.className = 'section-kicker social-mail-section-kicker';
            title.textContent = text;
            list.appendChild(title);
        };
        const filteredItems = items.filter((item) => item.type !== 'direct_message' && item.type !== 'direct_message_thread_hidden');
        if (threads.length) {
            threads.forEach((thread) => {
                const partner = thread?.player || {};
                const playerId = String(partner?.id || thread?.playerId || thread?.id || '').trim();
                if (!playerId || renderedThreadIds.has(playerId)) return;
                renderedThreadIds.add(playerId);
                
                const card = document.createElement('div');
                card.className = `inbox-card friend-card premium-social-card${Number(thread?.unreadCount || 0) > 0 ? ' is-unread' : ''}`.trim();
                
                const threadRating = this.friendRatingMap?.get(playerId) || 1000;
                const avatar = this.createPremiumAvatar(partner, threadRating);
                card.appendChild(avatar);

                const copy = document.createElement('div');
                copy.className = 'friend-card-copy';
                
                copy.addEventListener('click', () => {
                    void this.openConversationWithPlayer(partner);
                });

                const top = document.createElement('div');
                top.className = 'inbox-card-top';
                const name = document.createElement('strong');
                name.className = 'friend-card-name';
                name.textContent = partner?.displayName || this.t('messages-conversation-title');
                top.appendChild(name);
                
                const preview = document.createElement('div');
                preview.className = 'friend-card-desc';
                const lastText = this.getMessagePreviewText(thread?.lastMessage);
                preview.textContent = lastText || this.t('messages-empty');

                const previewRow = document.createElement('div');
                previewRow.className = 'inbox-card-preview-row';
                previewRow.appendChild(preview);

                copy.appendChild(top);
                copy.appendChild(previewRow);
                card.appendChild(copy);

                const meta = document.createElement('div');
                meta.className = 'friend-card-meta-col';

                const time = document.createElement('span');
                time.className = 'friend-card-time';
                if (thread?.lastMessage?.createdAt) {
                    const msgDate = new Date(thread.lastMessage.createdAt);
                    time.textContent = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                } else {
                    time.textContent = '';
                }
                previewRow.appendChild(time);

                const unreadBadgeCount = Number(thread?.unreadCount || 0);
                if (unreadBadgeCount > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'friend-card-unread-badge';
                    badge.textContent = String(unreadBadgeCount);
                    meta.appendChild(badge);
                }

                const actions = document.createElement('div');
                actions.className = 'friend-card-actions';

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-menu action-icon-btn delete-chat-action';
                deleteBtn.type = 'button';
                deleteBtn.title = this.t('inbox-delete') || 'Delete';
                deleteBtn.setAttribute('aria-label', this.t('inbox-delete') || 'Delete');
                deleteBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M3.5 6h17M9 6V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V6m-5 0h4m-9 0 .6 12.2A2.8 2.8 0 0 0 8.4 21h7.2a2.8 2.8 0 0 0 2.8-2.8L19 6M10 10v6M14 10v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                `;
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    deleteBtn.disabled = true;
                    try {
                        await this.account.deleteMessageThread(playerId);
                        await this.loadInboxPage();
                    } catch (err) {
                        this.renderer.showMessage(err?.message || this.t('messages-load-failed'), 1800);
                    } finally {
                        deleteBtn.disabled = false;
                    }
                });

                actions.appendChild(deleteBtn);
                card.appendChild(actions);
                card.appendChild(meta);
                list.appendChild(card);
            });
        }

        if (filteredItems.length) {
            appendSectionTitle('System mail / rewards / gifts');
        }
        if (!threads.length && !filteredItems.length) {
            this.setSummaryMessage(list, this.t('inbox-empty'));
            return;
        }

        const typeLabelMap = {
            gift_received: this.t('inbox-gift'),
            direct_message: this.t('inbox-message'),
            reward: this.t('inbox-reward'),
            compensation: this.t('inbox-compensation'),
            tournament: this.t('inbox-tournament'),
            daily_bonus: this.t('inbox-reward'),
            system_news: this.t('inbox-system'),
            room_invite: this.t('social-tab-invites'),
            friend_request: this.t('friends-title')
        };

        const statusLabelMap = {
            unread: this.t('inbox-unread'),
            read: this.t('inbox-read'),
            claimed: this.t('inbox-claimed'),
            expired: this.t('inbox-expired'),
            deleted: this.t('inbox-delete')
        };

        filteredItems.forEach((item) => {
            const card = document.createElement('div');
            card.className = `inbox-card friend-card premium-social-card${item.status === 'unread' ? ' is-unread' : ''}`.trim();

            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'premium-avatar-wrapper system-inbox-icon';
            const frame = document.createElement('div');
            frame.className = 'premium-avatar-frame';
            
            let iconText = '🎁';
            if (item.type === 'reward' || item.type === 'daily_bonus') iconText = '💎';
            else if (item.type === 'compensation') iconText = '🪙';
            else if (item.type === 'system_news') iconText = '📢';
            else if (item.type === 'friend_request') iconText = '👥';
            else if (item.type === 'room_invite') iconText = '🀄';
            
            frame.innerHTML = `<span class="system-icon-glyph">${iconText}</span>`;
            iconWrapper.appendChild(frame);
            card.appendChild(iconWrapper);

            const copy = document.createElement('div');
            copy.className = 'friend-card-copy';

            const top = document.createElement('div');
            top.className = 'inbox-card-top';
            const name = document.createElement('strong');
            name.className = 'friend-card-name';
            name.textContent = typeLabelMap[item.type] || String(item.title || item.type || this.t('inbox-system'));
            top.appendChild(name);

            const preview = document.createElement('div');
            preview.className = 'friend-card-desc';
            preview.textContent = String(item.body || item.title || '');

            copy.appendChild(top);
            copy.appendChild(preview);
            card.appendChild(copy);

            const meta = document.createElement('div');
            meta.className = 'friend-card-meta-col';

            const time = document.createElement('span');
            time.className = 'friend-card-time';
            if (item.createdAt) {
                const itemDate = new Date(item.createdAt);
                time.textContent = itemDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            } else {
                time.textContent = '';
            }
            meta.appendChild(time);

            const actions = document.createElement('div');
            actions.className = 'friend-card-actions';

            {
                const readBtn = document.createElement('button');
                readBtn.className = 'btn btn-action btn-strong';
                readBtn.type = 'button';
                if (item.type === 'direct_message') {
                    readBtn.textContent = this.t('inbox-open-message');
                    readBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        readBtn.disabled = true;
                        try {
                            if (item.status === 'unread') {
                                await this.account.markInboxRead(item.id);
                            }
                            const playerId = String(item.relatedPlayerId || item?.payloadJson?.senderPlayerId || '').trim();
                            if (playerId) {
                                await this.openConversationWithPlayer({ id: playerId, playerId });
                            } else {
                                await this.loadInboxPage();
                            }
                        } catch (err) {
                            this.renderer.showMessage(err?.message || this.t('inbox-load-failed'), 1800);
                        } finally {
                            readBtn.disabled = false;
                        }
                    });
                } else {
                    readBtn.textContent = item.status === 'unread' ? this.t('inbox-read') : this.t('inbox-open-message');
                    readBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        readBtn.disabled = true;
                        try {
                            if (item.status === 'unread') {
                                await this.account.markInboxRead(item.id);
                            }
                            await this.loadInboxPage();
                        } catch (err) {
                            this.renderer.showMessage(err?.message || this.t('inbox-load-failed'), 1800);
                        } finally {
                            readBtn.disabled = false;
                        }
                    });
                }
                actions.appendChild(readBtn);
            }

            if (item.isClaimable) {
                const claimBtn = document.createElement('button');
                claimBtn.className = 'btn btn-menu';
                claimBtn.type = 'button';
                claimBtn.textContent = item.type === 'gift_received' ? this.t('inbox-open-gifts') : this.t('inbox-claim');
                claimBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    claimBtn.disabled = true;
                    try {
                        const result = await this.account.claimInboxMessage(item.id);
                        if (result?.ok === false && result?.reason === 'claim_not_available') {
                            this.renderer.showMessage(this.t('inbox-claim-failed'), 1800);
                        } else {
                            await this.loadInboxPage();
                        }
                    } catch (err) {
                        this.renderer.showMessage(err?.message || this.t('inbox-claim-failed'), 1800);
                    } finally {
                        claimBtn.disabled = false;
                    }
                });
                actions.appendChild(claimBtn);
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-menu';
            deleteBtn.type = 'button';
            deleteBtn.textContent = this.t('inbox-delete');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                deleteBtn.disabled = true;
                try {
                    await this.account.deleteInboxMessage(item.id);
                    await this.loadInboxPage();
                } catch (err) {
                    this.renderer.showMessage(err?.message || this.t('inbox-load-failed'), 1800);
                } finally {
                    deleteBtn.disabled = false;
                }
            });
            actions.appendChild(deleteBtn);

            card.appendChild(actions);
            card.appendChild(meta);
            list.appendChild(card);
        });
    }

    async loadMessageThreads() {
        if (!this.hasAuthenticatedAccount()) {
            return [];
        }
        if (!this.account?.getMessageThreads) {
            return Array.isArray(this.accountMessagesState?.threads) ? this.accountMessagesState.threads : [];
        }

        if (this._messageThreadsLoadInFlight) {
            return this._messageThreadsLoadInFlight;
        }

        const currentState = this.accountMessagesState || {};
        const currentThreads = Array.isArray(currentState.threads) ? currentState.threads : [];
        const shouldShowLoading = !currentThreads.length;
        const currentPlayerId = String(this.account?.playerId || this.account?.id || '').trim();

        if (shouldShowLoading) {
            this.accountMessagesState = {
                ...currentState,
                threadsLoading: true,
                error: ''
            };
            this.renderAccountMessagesPanel();

            if (currentPlayerId) {
                this.getCachedThreads(currentPlayerId).then((cached) => {
                    if (cached && cached.length && !this.accountMessagesState?.threads?.length) {
                        this.accountMessagesState = {
                            ...(this.accountMessagesState || {}),
                            threads: cached,
                            threadsLoading: true
                        };
                        this.renderAccountMessagesPanel();
                    }
                }).catch(() => {});
            }
        }

        this._messageThreadsLoadInFlight = (async () => {
            try {
                const items = await this.account.getMessageThreads();
                const threads = Array.isArray(items) ? items : [];
                const currentActiveId = String(this.accountMessagesState?.activePlayerId || '').trim();
                const mergedThreads = this.mergeConversationThreads(currentThreads.length ? currentThreads : (this.accountMessagesState?.threads || []), threads, currentActiveId);
                
                if (currentPlayerId) {
                    void this.saveCachedThreads(currentPlayerId, mergedThreads);
                }

                const activeThread = mergedThreads.find((thread) => String(thread?.player?.id || thread?.playerId || thread?.id || '').trim() === currentActiveId) || null;
                const nextActiveId = currentActiveId 
                    ? currentActiveId 
                    : (this.socialCenterView === 'conversation' && mergedThreads[0]
                        ? String(mergedThreads[0]?.player?.id || mergedThreads[0]?.playerId || mergedThreads[0]?.id || '').trim()
                        : '');
                this.accountMessagesState = {
                    ...(this.accountMessagesState || {}),
                    threads: mergedThreads,
                    threadsLoading: false,
                    error: '',
                    activePlayerId: nextActiveId || currentActiveId
                };
                this.socialInboxState = {
                    ...(this.socialInboxState || {}),
                    threads: mergedThreads
                };
                this.renderAccountMessagesPanel();
                await this.loadSocialSummary();
                this.updateSocialCenterBadge();
                if (this.socialCenterView === 'conversation' && nextActiveId && nextActiveId !== currentActiveId) {
                    await this.loadConversationWithPlayer(nextActiveId);
                }
                return mergedThreads;
            } catch (err) {
                const message = err?.message || this.t('messages-load-failed') || this.t('chats-load-failed');
                this.accountMessagesState = {
                    ...(this.accountMessagesState || {}),
                    threads: this.accountMessagesState?.threads || currentThreads,
                    threadsLoading: false,
                    error: message
                };
                this.renderAccountMessagesPanel();
                await this.loadSocialSummary();
                this.updateSocialCenterBadge();
                return this.accountMessagesState?.threads || currentThreads;
            } finally {
                this._messageThreadsLoadInFlight = null;
            }
        })();

        return this._messageThreadsLoadInFlight;
    }

    findCachedPlayerProfile(playerId) {
        const id = String(playerId || '').trim();
        if (!id) return null;
        const threads = Array.isArray(this.accountMessagesState?.threads) ? this.accountMessagesState.threads : [];
        const thread = threads.find(t => String(t?.player?.id || t?.playerId || t?.id || '').trim() === id);
        if (thread?.player) return thread.player;
        const friends = Array.isArray(this.friendHub?.accepted) ? this.friendHub.accepted : [];
        const friendItem = friends.find(f => String(f?.friend?.id || '').trim() === id);
        if (friendItem?.friend) return friendItem.friend;
        const incoming = Array.isArray(this.friendHub?.incoming) ? this.friendHub.incoming : [];
        const incItem = incoming.find(f => String(f?.friend?.id || '').trim() === id);
        if (incItem?.friend) return incItem.friend;
        const outgoing = Array.isArray(this.friendHub?.outgoing) ? this.friendHub.outgoing : [];
        const outItem = outgoing.find(f => String(f?.friend?.id || '').trim() === id);
        if (outItem?.friend) return outItem.friend;
        return null;
    }

    async loadConversationWithPlayer(playerRef, isBackground = false) {
        const playerId = String(playerRef?.playerId || playerRef?.userId || playerRef?.id || playerRef || '').trim();
        if (!playerId || !this.hasAuthenticatedAccount()) {
            return [];
        }
        const existingLoad = this._conversationLoadInFlightByPlayer.get(playerId);
        if (existingLoad) {
            return existingLoad;
        }

        const currentState = this.accountMessagesState || {};
        const currentActiveId = String(currentState.activePlayerId || '').trim();
        const cachedPeerForNewPlayerId = this.findCachedPlayerProfile(playerId);
        const hasCachedConversation = currentActiveId === playerId && (
            (Array.isArray(currentState.messages) && currentState.messages.length > 0) ||
            Boolean(cachedPeerForNewPlayerId) ||
            currentState.conversationLoading === false
        );
        const shouldShowLoading = !isBackground && !hasCachedConversation;
        this.socialCenterView = 'conversation';
        this.accountMessagesState = {
            ...currentState,
            activePlayerId: playerId,
            activePlayerProfile: cachedPeerForNewPlayerId,
            messages: currentActiveId === playerId ? (Array.isArray(currentState.messages) ? currentState.messages : []) : [],
            conversationLoading: shouldShowLoading,
            error: ''
        };
        this.renderAccountMessagesPanel();

        const currentPlayerId = String(this.account?.playerId || this.account?.id || '').trim();
        if (currentPlayerId && (!this.accountMessagesState?.messages || this.accountMessagesState.messages.length === 0)) {
            this.getCachedMessages(currentPlayerId, playerId).then((cached) => {
                if (cached && cached.length && String(this.accountMessagesState?.activePlayerId || '').trim() === playerId) {
                    this.accountMessagesState = {
                        ...(this.accountMessagesState || {}),
                        messages: cached,
                        conversationLoading: false
                    };
                    this.renderAccountMessagesPanel();
                }
            }).catch(() => {});
        }

        const loadPromise = (async () => {
            try {
                const readPromise = this.markDirectMessageThreadReadWithFallback(playerId).catch(() => {});
                const profilePromise = (currentActiveId === playerId && currentState.activePlayerProfile)
                    ? Promise.resolve(currentState.activePlayerProfile)
                    : this.account.getPlayerProfile(playerId).catch(() => null);

                const currentVisibleMessages = Array.isArray(this.accountMessagesState?.messages)
                    ? this.accountMessagesState.messages
                    : [];
                const mergeBaseMessages = currentVisibleMessages.length
                    ? currentVisibleMessages
                    : (Array.isArray(currentState.messages) ? currentState.messages : []);

                let afterId = '';
                if (mergeBaseMessages.length > 0) {
                    const realMessages = mergeBaseMessages.filter(m => m.id && !String(m.id).startsWith('temp-'));
                    if (realMessages.length > 0) {
                        afterId = realMessages[realMessages.length - 1].id;
                    }
                }

                const messagesPromise = this.account.getDirectMessages(playerId, { after: afterId });

                const [_, profile, messages] = await Promise.all([
                    readPromise,
                    profilePromise,
                    messagesPromise
                ]);

                if (String(this.accountMessagesState?.activePlayerId || '').trim() !== playerId) {
                    return Array.isArray(this.accountMessagesState?.messages) ? this.accountMessagesState.messages : [];
                }

                const freshMessages = Array.isArray(messages) ? messages : [];
                const latestVisibleMessages = Array.isArray(this.accountMessagesState?.messages)
                    ? this.accountMessagesState.messages
                    : [];
                const mergedMessages = this.mergeConversationMessages(latestVisibleMessages, freshMessages);

                if (currentPlayerId) {
                    void this.saveCachedMessages(currentPlayerId, playerId, mergedMessages);
                }

                this._lastDmError = '';
                const profileBelongsToPlayer = (candidate) => {
                    if (!candidate) return false;
                    const candidateId = String(candidate?.playerId || candidate?.id || '').trim();
                    return Boolean(candidateId && candidateId === playerId);
                };
                const resolvedProfile = profileBelongsToPlayer(profile)
                    ? profile
                    : (profileBelongsToPlayer(cachedPeerForNewPlayerId) ? cachedPeerForNewPlayerId : null);
                this.accountMessagesState = {
                    ...(this.accountMessagesState || {}),
                    activePlayerId: playerId,
                    activePlayerProfile: resolvedProfile,
                    messages: mergedMessages,
                    conversationLoading: false,
                    error: ''
                };
                this.renderAccountMessagesPanel();

                // Run subsequent updates asynchronously in the background
                void Promise.all([
                    this.loadMessageThreads().catch(() => {}),
                    this.loadSocialSummary().catch(() => {})
                ]).then(() => {
                    this.updateSocialCenterBadge();
                });

                return mergedMessages;
            } catch (err) {
                const message = err?.message || this.t('messages-load-failed') || this.t('chats-load-failed');
                this._lastDmError = message;
                if (String(this.accountMessagesState?.activePlayerId || '').trim() !== playerId) {
                    return Array.isArray(this.accountMessagesState?.messages) ? this.accountMessagesState.messages : [];
                }
                const hasVisibleMessages = Array.isArray(this.accountMessagesState?.messages) && this.accountMessagesState.messages.length > 0;
                if (hasVisibleMessages) {
                    this.accountMessagesState = {
                        ...(this.accountMessagesState || {}),
                        conversationLoading: false
                    };
                } else {
                    this.accountMessagesState = {
                        ...(this.accountMessagesState || {}),
                        activePlayerId: playerId,
                        conversationLoading: false,
                        error: message
                    };
                }
                this.renderAccountMessagesPanel();
                void this.loadSocialSummary().then(() => this.updateSocialCenterBadge()).catch(() => {});
                return Array.isArray(this.accountMessagesState?.messages) ? this.accountMessagesState.messages : [];
            } finally {
                if (this._conversationLoadInFlightByPlayer.get(playerId) === loadPromise) {
                    this._conversationLoadInFlightByPlayer.delete(playerId);
                }
            }
        })();

        this._conversationLoadInFlightByPlayer.set(playerId, loadPromise);
        return loadPromise;
    }

    syncSocialCenterTabs() {
        const activeTab = this.hasAuthenticatedAccount()
            ? (this.socialCenterTab || 'friends')
            : 'friends';
        const activeView = this.socialCenterView || 'list';
        const isConversation = activeView === 'conversation';

        const hub = document.getElementById('social-center-modal');
        const chat = document.getElementById('social-chats-panel');

        if (hub && chat) {
            if (isConversation) {
                hub.classList.remove('active');
                chat.classList.remove('is-hidden');
            } else {
                if (hub.dataset.opened === 'true') {
                    hub.classList.add('active');
                }
                chat.classList.add('is-hidden');
            }
        }

        const isMailActive = activeTab === 'inbox' || activeTab === 'invites';
        const isFriendsActive = activeTab === 'friends';

        const mailBtn = document.getElementById('social-tab-mail-btn');
        const friendsBtn = document.getElementById('social-tab-friends-btn');
        if (mailBtn) mailBtn.classList.toggle('is-active', isMailActive);
        if (friendsBtn) friendsBtn.classList.toggle('is-active', isFriendsActive);

        const inboxPanel = document.getElementById('social-inbox-panel');
        const invitesPanel = document.getElementById('social-invites-panel');
        const friendsPanel = document.getElementById('social-friends-panel');

        if (inboxPanel) inboxPanel.classList.toggle('is-hidden', !isMailActive || isConversation);
        if (invitesPanel) invitesPanel.classList.toggle('is-hidden', !isMailActive || isConversation);
        if (friendsPanel) friendsPanel.classList.toggle('is-hidden', !isFriendsActive || isConversation);

        const tabs = document.getElementById('social-center-tabs');
        if (tabs) {
            tabs.querySelectorAll('[data-social-tab]').forEach((button) => {
                const isActive = button.dataset.socialTab === activeTab ||
                    (activeTab === 'invites' && button.dataset.socialTab === 'inbox');
                button.classList.toggle('is-active', isActive);
            });
        }
    }

    renderSocialCenter() {
        const modal = document.getElementById('social-center-modal');
        if (!modal) return;

        // Update header currency chips
        const coinsEl = document.getElementById('social-header-coins');
        const ratingEl = document.getElementById('social-header-rating');
        if (coinsEl) {
            const coinsVal = Number(this.coinShopStatus?.wallet?.balance ?? this.accountProfile?.coins ?? 0);
            coinsEl.textContent = coinsVal.toLocaleString();
        }
        if (ratingEl) {
            const ratingVal = Number(this.accountProfile?.rating ?? 1000);
            ratingEl.textContent = ratingVal.toLocaleString();
        }

        // Update tab unread badges
        const mailBadge = document.getElementById('social-mail-unread-badge');
        const friendsBadge = document.getElementById('social-friends-unread-badge');
        
        const actualInboxUnread = (this.socialInboxState?.items || []).filter(item => item.status === 'unread' && item.type !== 'direct_message' && item.type !== 'direct_message_thread_hidden').length;
        const incomingInvitesPending = (this.roomInvitations?.incoming || []).filter(inv => this.isPlayInviteActive(inv)).length;
        const mailUnread = actualInboxUnread + incomingInvitesPending;

        const chatThreadsUnread = (this.socialInboxState?.threads || []).reduce((sum, t) => sum + Math.max(0, Number(t?.unreadCount || 0)), 0);
        const friendsUnread = Math.max(0, Number(this.friendHub?.incoming?.length || 0)) + chatThreadsUnread;

        if (mailBadge) {
            if (mailUnread > 0) {
                mailBadge.textContent = String(mailUnread);
                mailBadge.classList.remove('is-hidden');
            } else {
                mailBadge.textContent = '';
                mailBadge.classList.add('is-hidden');
            }
        }
        if (friendsBadge) {
            if (friendsUnread > 0) {
                friendsBadge.textContent = String(friendsUnread);
                friendsBadge.classList.remove('is-hidden');
            } else {
                friendsBadge.textContent = '';
                friendsBadge.classList.add('is-hidden');
            }
        }

        if (this.socialCenterView === 'conversation') {
            this.renderChatHeaderDetails();
        }

        this.syncSocialCenterTabs();
        this.updateSocialCenterBadge();
    }

    renderChatHeaderDetails() {
        const state = this.accountMessagesState || {};
        const threads = Array.isArray(state.threads) ? state.threads : [];
        const activePlayerId = String(state.activePlayerId || '').trim();
        const activeThread = threads.find((t) => String(t?.player?.id || t?.playerId || t?.id || '').trim() === activePlayerId) || null;
        const activePlayer = state.activePlayerProfile || activeThread?.player || null;

        const avatarEl = document.getElementById('chat-header-avatar');
        const statusEl = document.getElementById('chat-header-status');
        const viewProfileBtn = document.getElementById('account-messages-open-btn');

        if (avatarEl) {
            avatarEl.innerHTML = '';
            if (activePlayer) {
                const partnerRating = this.friendRatingMap?.get(activePlayerId) || 1000;
                const premAvatar = this.createPremiumAvatar(activePlayer, partnerRating);
                avatarEl.appendChild(premAvatar);
            }
        }

        if (statusEl) {
            const resolvedPresenceMap = this.friendPresenceMap instanceof Map ? this.friendPresenceMap : new Map();
            const presenceStatus = activePlayer ? this.getFriendPresenceStatus(activePlayer, resolvedPresenceMap) : 'offline';
            statusEl.className = `chat-header-status${presenceStatus === 'online' ? ' is-online' : presenceStatus === 'in_game' ? ' is-in-game' : ' is-offline'}`;
            statusEl.innerHTML = `<span class="presence-dot"></span>${this.getFriendPresenceLabel(presenceStatus)}`;
        }

        if (viewProfileBtn) {
            viewProfileBtn.textContent = this.t('account-profile');
            viewProfileBtn.onclick = () => {
                if (activePlayer) {
                    void this.openPlayerProfileModal(activePlayer);
                }
            };
        }

        const actionsEl = document.querySelector('#social-chats-panel .chat-header-actions');
        if (actionsEl && activePlayer) {
            const activePlayerId = String(activePlayer.id || activePlayer.playerId || '').trim();
            const blockStatus = String(activePlayer?.blockStatus || activePlayer?.moderation?.blockStatus || 'none').trim() || 'none';
            const isBlockedByMe = blockStatus === 'blocked_by_you' || blockStatus === 'blocked_both';
            const isBlocked = blockStatus !== 'none' && blockStatus !== 'self';
            let reportBtn = document.getElementById('chat-header-report-btn');
            if (!reportBtn) {
                reportBtn = document.createElement('button');
                reportBtn.type = 'button';
                reportBtn.className = 'btn chat-header-action-btn';
                reportBtn.id = 'chat-header-report-btn';
                actionsEl.appendChild(reportBtn);
            }
            let blockBtn = document.getElementById('chat-header-block-btn');
            if (!blockBtn) {
                blockBtn = document.createElement('button');
                blockBtn.type = 'button';
                blockBtn.className = 'btn chat-header-action-btn is-danger';
                blockBtn.id = 'chat-header-block-btn';
                actionsEl.appendChild(blockBtn);
            }
            const reportLabel = this.t('player-profile-report');
            reportBtn.innerHTML = this.buildChatHeaderReportIconMarkup(18);
            reportBtn.title = reportLabel;
            reportBtn.setAttribute('aria-label', reportLabel);
            reportBtn.hidden = !activePlayerId || activePlayerId === this.getCurrentAccountPlayerId();
            reportBtn.onclick = () => {
                if (!activePlayerId || activePlayerId === this.getCurrentAccountPlayerId()) return;
                this.openPlayerReportModal(activePlayer, { category: isBlocked ? 'chat' : 'voice' });
            };

            const blockLabel = isBlockedByMe ? this.t('player-profile-unblock') : this.t('player-profile-block');
            blockBtn.innerHTML = this.buildChatHeaderBlockIconMarkup(18);
            blockBtn.title = blockLabel;
            blockBtn.setAttribute('aria-label', blockLabel);
            blockBtn.hidden = !activePlayerId || activePlayerId === this.getCurrentAccountPlayerId();
            blockBtn.onclick = async () => {
                if (!activePlayerId || activePlayerId === this.getCurrentAccountPlayerId()) return;
                try {
                    const sessionId = this.resolvePlayerSessionId(activePlayer);
                    if (isBlockedByMe) {
                        await this.account.unblockPlayer(activePlayerId);
                        this.renderer.showMessage(this.t('player-profile-unblocked'), 1400);
                        if (sessionId) this.voice?.setPlayerMuted?.(sessionId, false);
                    } else {
                        await this.account.blockPlayer(activePlayerId);
                        this.renderer.showMessage(this.t('player-profile-blocked'), 1400);
                        if (sessionId) this.voice?.setPlayerMuted?.(sessionId, true);
                    }
                    await this.loadConversationWithPlayer(activePlayerId, true);
                    await this.loadSocialSummary().catch(() => {});
                } catch (err) {
                    this.renderer.showMessage(err?.message || this.t('player-profile-block-failed'), 1800);
                }
            };
        }
    }

    async loadSocialInvitesPage(isBackground = false) {
        const incomingList = document.getElementById('social-invites-incoming-list');
        const sentList = document.getElementById('social-invites-sent-list');
        const fallbackList = document.getElementById('social-invites-list');
        const invitesList = fallbackList || incomingList || sentList;
        if (!invitesList) return [];
        if (!this.hasAuthenticatedAccount()) {
            this.setSummaryMessage(invitesList, this.t('friends-login-required'));
            return [];
        }

        if (this._roomInvitationsLoadInFlight) {
            return this._roomInvitationsLoadInFlight;
        }

        const hasVisibleInvites = Boolean((this.roomInvitations?.incoming || []).length || (this.roomInvitations?.sent || []).length);
        if (!isBackground && !hasVisibleInvites) {
            this.roomInvitationsLoading = true;
            this.setSummaryMessage(invitesList, this.t('account-profile-loading'));
            if (incomingList && sentList) {
                this.setSummaryMessage(incomingList, this.t('account-profile-loading'));
                this.setSummaryMessage(sentList, this.t('account-profile-loading'));
            }
        }

        this._roomInvitationsLoadInFlight = (async () => {
            try {
                const [roomInvitationsResult, playInvitationsResult] = await Promise.allSettled([
                    this.account.getRoomInvitations(),
                    this.account.getPlayInvites()
                ]);
                let merged = this.roomInvitations || { incoming: [], sent: [] };
                if (roomInvitationsResult.status === 'fulfilled' && roomInvitationsResult.value) {
                    merged = this.mergeRoomInvitations(merged, roomInvitationsResult.value || { incoming: [], sent: [] });
                }
                if (playInvitationsResult.status === 'fulfilled' && playInvitationsResult.value) {
                    merged = this.mergeRoomInvitations(merged, playInvitationsResult.value || { incoming: [], sent: [] });
                }
                if (roomInvitationsResult.status !== 'fulfilled' && playInvitationsResult.status !== 'fulfilled') {
                    throw roomInvitationsResult.reason || playInvitationsResult.reason || new Error(this.t('friends-load-failed'));
                }
                this.roomInvitations = merged;
                this.roomInvitationsLoading = false;
                this._lastInviteError = '';
                this._roomInvitationsLastLoadedAt = Date.now();
                this._roomInvitationsLastError = '';
                this._lastIncomingInvitesSafe = (Array.isArray(merged?.incoming) ? merged.incoming : [])
                    .map((invite) => this.safeInviteDebugRecord(invite))
                    .slice(0, 5);
                this.restoreGameInviteStateFromInvitations();
                void this.refreshGameInviteState().catch(() => {});
                this.renderRoomInvitationsPanel();
                this.logSocialInvite('incoming loaded count', {
                    incomingInviteCount: Array.isArray(merged?.incoming) ? merged.incoming.length : 0,
                    outgoingInviteCount: Array.isArray(merged?.sent) ? merged.sent.length : 0
                });
                await this.loadSocialSummary();
                this.updateSocialCenterBadge();
                return merged;
            } catch (err) {
                const message = err?.message || this.t('friends-load-failed');
                this._lastInviteError = message;
                this._roomInvitationsLastError = message;
                this.roomInvitationsLoading = false;
                const stillHasInvites = Boolean((this.roomInvitations?.incoming || []).length || (this.roomInvitations?.sent || []).length);
                if (isBackground && stillHasInvites) {
                    this.updateSocialCenterBadge();
                    return this.roomInvitations;
                }
                this.setSummaryMessage(invitesList, message);
                if (incomingList && sentList) {
                    this.setSummaryMessage(incomingList, message);
                    this.setSummaryMessage(sentList, message);
                }
                this.updateSocialCenterBadge();
                return this.roomInvitations || { incoming: [], sent: [] };
            } finally {
                this.roomInvitationsLoading = false;
                this._roomInvitationsLoadInFlight = null;
            }
        })();

        return this._roomInvitationsLoadInFlight;
    }

    renderAccountMessagesPanel() {
        const panel = document.getElementById('account-messages-panel');
        const threadList = document.getElementById('account-messages-thread-list');
        const conversationList = document.getElementById('account-messages-conversation-list');
        const conversationTitle = document.getElementById('account-messages-conversation-title');
        const summary = document.getElementById('account-messages-summary');
        const messageInput = document.getElementById('account-message-input');
        const sendBtn = document.getElementById('account-message-send-btn');
        const backBtn = document.getElementById('account-messages-back-btn');
        const openBtn = document.getElementById('account-messages-open-btn');
        if (!panel || !threadList || !conversationList || !conversationTitle || !summary || !messageInput || !sendBtn || !backBtn || !openBtn) return;

        const isAuthed = this.hasAuthenticatedAccount();
        const state = this.accountMessagesState || {};
        const threads = Array.isArray(state.threads) ? state.threads : [];
        const activePlayerId = String(state.activePlayerId || '').trim();
        const activeThread = threads.find((thread) => String(thread?.player?.id || thread?.playerId || thread?.id || '').trim() === activePlayerId) || null;
        const profileMatchesActive = (profile) => {
            if (!profile || !activePlayerId) return false;
            const profileId = String(profile?.playerId || profile?.id || '').trim();
            return Boolean(profileId && profileId === activePlayerId);
        };
        const activeProfile = profileMatchesActive(state.activePlayerProfile) ? state.activePlayerProfile : null;
        const activeThreadPlayer = profileMatchesActive(activeThread?.player) ? activeThread.player : null;
        const activePlayer = activeProfile || activeThreadPlayer || null;
        this._activeHeaderPlayerId = activePlayer ? String(activePlayer?.playerId || activePlayer?.id || '').trim() : '';
        this._activeHeaderName = activePlayer ? String(activePlayer?.displayName || activePlayer?.name || '').trim() : '';
        this._headerProfileMatchesConversation = !activePlayerId || !this._activeHeaderPlayerId || this._activeHeaderPlayerId === activePlayerId;
        const activeMessages = Array.isArray(state.messages) ? state.messages : [];
        const currentPlayerId = String(this.accountProfile?.playerId || this.accountProfile?.id || '').trim();
        const threadsLoading = Boolean(state.threadsLoading || (state.conversationLoading && !threads.length));

        if (!isAuthed) {
            summary.textContent = this.t('friends-login-required');
            threadList.innerHTML = '';
            conversationList.innerHTML = '';
            conversationTitle.textContent = '';
            messageInput.value = '';
            messageInput.disabled = true;
            sendBtn.disabled = true;
            backBtn.hidden = true;
            openBtn.disabled = true;
            return;
        }

        summary.textContent = state.error
            || (threadsLoading
                ? this.t('account-profile-loading')
                : this.format('messages-thread-count', { count: String(threads.length) }));

        // Render threads list atomically using replaceChildren
        const threadNodes = [];
        if (!threads.length) {
            const empty = document.createElement('div');
            empty.className = 'room-summary';
            empty.textContent = threadsLoading ? this.t('account-profile-loading') : (this.t('messages-empty') || this.t('chats-empty'));
            threadNodes.push(empty);
        } else {
            threads.forEach((thread) => {
                const partner = thread?.player || {};
                const partnerId = String(partner?.id || thread?.playerId || thread?.id || '').trim();
                const isActive = partnerId && partnerId === activePlayerId;
                
                const card = document.createElement('div');
                card.className = `message-thread-card premium-social-card${isActive ? ' is-active' : ''}`;
                
                const rating = this.friendRatingMap?.get(partnerId) || 1000;
                const avatar = this.createPremiumAvatar(partner, rating);
                card.appendChild(avatar);

                const copy = document.createElement('div');
                copy.className = 'friend-card-copy';
                
                copy.addEventListener('click', () => {
                    void this.loadConversationWithPlayer(partnerId);
                });

                const top = document.createElement('div');
                top.className = 'inbox-card-top';
                const name = document.createElement('strong');
                name.className = 'friend-card-name';
                name.textContent = partner?.displayName || this.t('messages-empty');
                top.appendChild(name);
                
                const preview = document.createElement('div');
                preview.className = 'friend-card-desc';
                const lastMessage = thread?.lastMessage || null;
                const isThreadTyping = this._typingPlayers && this._typingPlayers.has(partnerId);
                if (isThreadTyping) {
                    preview.innerHTML = `<span style="color: var(--color-primary, #00C853); font-style: italic;">yazır...</span>`;
                } else {
                    preview.textContent = this.getMessagePreviewText(lastMessage) || this.t('messages-empty');
                }

                copy.appendChild(top);
                copy.appendChild(preview);
                card.appendChild(copy);

                const meta = document.createElement('div');
                meta.className = 'friend-card-meta-col';

                const time = document.createElement('span');
                time.className = 'friend-card-time';
                if (lastMessage?.createdAt) {
                    const msgDate = new Date(lastMessage.createdAt);
                    time.textContent = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                } else {
                    time.textContent = '';
                }
                meta.appendChild(time);

                const unreadCount = Number(thread?.unreadCount || 0);
                if (unreadCount > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'friend-card-unread-badge';
                    badge.textContent = String(unreadCount);
                    meta.appendChild(badge);
                }

                card.appendChild(meta);
                threadNodes.push(card);
            });
        }
        threadList.replaceChildren(...threadNodes);

        const isTyping = this._typingPlayers && this._typingPlayers.has(activePlayerId);
        if (isTyping) {
            conversationTitle.innerHTML = `${activePlayer?.displayName || ''} <span class="chat-header-typing-status" style="font-size: 0.8em; font-weight: normal; color: var(--color-primary, #00C853); margin-left: 8px; font-style: italic;">yazır...</span>`;
        } else {
            conversationTitle.textContent = activePlayer?.displayName
                || (activePlayerId && state.conversationLoading ? this.t('account-profile-loading') : this.t('messages-conversation-title'));
        }

        const currentLastMsg = activeMessages[activeMessages.length - 1];
        const currentLastMsgId = currentLastMsg?.id || currentLastMsg?.createdAt || '';

        const conversationSignature = [
            activePlayerId,
            String(activePlayer?.id || ''),
            state.conversationLoading ? 'loading' : 'ready',
            String(state.error || ''),
            String(activeMessages.length || 0),
            String(currentLastMsgId || '')
        ].join('|');

        if (this._lastConversationRenderSignature !== conversationSignature) {
            this._lastConversationRenderSignature = conversationSignature;
            this._lastConversationPlayerId = activePlayerId;
            this._lastConversationMessagesLength = activeMessages.length;
            this._lastConversationLastMsgId = currentLastMsgId;

            const conversationNodes = [];
            if (state.conversationLoading && !activeMessages.length) {
                const spinner = document.createElement('div');
                spinner.className = 'chat-loading-spinner';
                conversationNodes.push(spinner);
            } else if (!activePlayerId) {
                const empty = document.createElement('div');
                empty.className = 'room-summary';
                empty.textContent = this.t('messages-empty') || this.t('chats-empty');
                conversationNodes.push(empty);
            } else if (!activeMessages.length) {
                const empty = document.createElement('div');
                empty.className = 'room-summary';
                empty.textContent = this.t('messages-empty') || this.t('chats-empty');
                conversationNodes.push(empty);
            } else {
                let lastDateStr = '';
                activeMessages.forEach((message) => {
                    const msgDate = new Date(message.createdAt);
                    const dateOptions = { month: 'long', day: 'numeric' };
                    const dateStr = msgDate.toLocaleDateString(this.currentLang || 'az', dateOptions);
                    
                    if (dateStr !== lastDateStr) {
                        lastDateStr = dateStr;
                        const separator = document.createElement('div');
                        separator.className = 'chat-date-separator';
                        const label = document.createElement('span');
                        label.textContent = dateStr;
                        separator.appendChild(label);
                        conversationNodes.push(separator);
                    }

                    const mine = String(message.senderPlayerId || '') === currentPlayerId;
                    const optimistic = Boolean(message.isOptimistic || message.localStatus === 'sending');
                    const isFailed = message.localStatus === 'failed';
                    const row = document.createElement('div');
                    row.className = `message-row ${mine ? 'is-self' : 'is-other'}${optimistic ? ' is-pending' : ''}${isFailed ? ' is-failed' : ''}`;

                    const bubbleContainer = document.createElement('div');
                    bubbleContainer.className = 'message-bubble-container';

                    if (!mine) {
                        const partnerRating = this.friendRatingMap?.get(String(activePlayerId)) || 1000;
                        const avatar = this.createPremiumAvatar(activePlayer, partnerRating);
                        row.appendChild(avatar);
                    }

                    const bubble = document.createElement('div');
                    bubble.className = `message-bubble${optimistic ? ' is-pending' : ''}${isFailed ? ' is-failed' : ''}`;

                    const msgText = message.text || message.body || '';
                    let isJsonMedia = false;
                    if (msgText.startsWith('{') && msgText.endsWith('}')) {
                        try {
                            const json = JSON.parse(msgText);
                            if (json.type === 'image') {
                                isJsonMedia = true;
                                const imgContainer = document.createElement('div');
                                imgContainer.className = 'chat-image-bubble';
                                imgContainer.style.padding = '4px 0';

                                const img = document.createElement('img');
                                img.src = json.data;
                                img.style.maxWidth = '200px';
                                img.style.maxHeight = '200px';
                                img.style.borderRadius = '8px';
                                img.style.display = 'block';
                                img.style.cursor = 'pointer';
                                img.addEventListener('click', () => {
                                    this.openChatImageModal(json.data);
                                });

                                imgContainer.appendChild(img);
                                bubble.appendChild(imgContainer);
                            } else if (json.type === 'voice') {
                                isJsonMedia = true;
                                const audioContainer = document.createElement('div');
                                audioContainer.className = 'chat-voice-bubble';
                                audioContainer.style.display = 'flex';
                                audioContainer.style.alignItems = 'center';
                                audioContainer.style.gap = '8px';
                                audioContainer.style.padding = '4px 0';

                                const playBtn = document.createElement('button');
                                playBtn.type = 'button';
                                playBtn.style.background = 'none';
                                playBtn.style.border = 'none';
                                playBtn.style.color = 'inherit';
                                playBtn.style.cursor = 'pointer';
                                playBtn.style.fontSize = '1.3em';
                                playBtn.innerHTML = '▶️';

                                const progressBar = document.createElement('input');
                                progressBar.type = 'range';
                                progressBar.className = 'chat-voice-progress';
                                progressBar.min = '0';
                                progressBar.max = '100';
                                progressBar.value = '0';

                                const duration = document.createElement('span');
                                duration.style.fontSize = '0.85em';
                                const durSec = json.duration || 0;
                                duration.textContent = `${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, '0')}`;

                                const audio = document.createElement('audio');
                                audio.src = json.data;
                                audio.preload = 'metadata';

                                playBtn.addEventListener('click', () => {
                                    if (audio.paused) {
                                        audio.play();
                                        playBtn.innerHTML = '⏸️';
                                    } else {
                                        audio.pause();
                                        playBtn.innerHTML = '▶️';
                                    }
                                });

                                audio.addEventListener('timeupdate', () => {
                                    if (audio.duration) {
                                        const pct = (audio.currentTime / audio.duration) * 100;
                                        progressBar.value = pct;
                                        const curSec = Math.floor(audio.currentTime);
                                        const totalSec = Math.floor(audio.duration || durSec);
                                        duration.textContent = `${Math.floor(curSec / 60)}:${(curSec % 60).toString().padStart(2, '0')} / ${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
                                    }
                                });

                                progressBar.addEventListener('input', () => {
                                    if (audio.duration) {
                                        audio.currentTime = (progressBar.value / 100) * audio.duration;
                                    }
                                });

                                audio.addEventListener('ended', () => {
                                    playBtn.innerHTML = '▶️';
                                    progressBar.value = '0';
                                    const totalSec = Math.floor(audio.duration || durSec);
                                    duration.textContent = `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
                                });

                                audioContainer.appendChild(playBtn);
                                audioContainer.appendChild(progressBar);
                                audioContainer.appendChild(duration);
                                audioContainer.appendChild(audio);
                                bubble.appendChild(audioContainer);
                            }
                        } catch (e) {
                            // not json, fallback
                        }
                    }

                    if (!isJsonMedia) {
                        const text = document.createElement('div');
                        text.className = 'message-text';
                        text.textContent = msgText;
                        bubble.appendChild(text);
                    }

                    const footer = document.createElement('div');
                    footer.className = 'message-bubble-footer';
                    const timeEl = document.createElement('span');
                    timeEl.className = 'message-time';
                    const timeStr = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    timeEl.textContent = timeStr;
                    footer.appendChild(timeEl);

                    if (mine) {
                        const checks = document.createElement('span');
                        const status = message.localStatus || (message.readAt ? 'read' : 'sent');
                        
                        if (status === 'sending' || status === 'pending') {
                            checks.className = 'message-checks is-pending';
                            checks.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.5-13v4.793l2.854 2.853a.5.5 0 0 1-.708.708L7.5 8.5V3a.5.5 0 0 1 1 0z"/></svg>`;
                        } else if (status === 'failed') {
                            checks.className = 'message-checks is-failed';
                            checks.style.cursor = 'pointer';
                            checks.title = this.t('retry-sending') || 'Click to retry';
                            checks.innerHTML = `⚠️`;
                            checks.addEventListener('click', async () => {
                                await this.retrySendMessage(message.id);
                            });
                        } else if (status === 'read') {
                            checks.className = 'message-checks is-read';
                            checks.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0zM10.354 3.646a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L3.5 9.293l5.646-5.647a.5.5 0 0 1 .708 0z"/></svg>`;
                        } else {
                            checks.className = 'message-checks is-sent';
                            checks.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg>`;
                        }
                        footer.appendChild(checks);
                    }

                    bubble.appendChild(footer);
                    bubbleContainer.appendChild(bubble);
                    row.appendChild(bubbleContainer);
                    conversationNodes.push(row);
                });
            }
            conversationList.replaceChildren(...conversationNodes);
            const scrollContainer = document.getElementById('chat-messages-container-scroll');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }

        messageInput.disabled = !activePlayerId || state.conversationLoading;
        messageInput.placeholder = activePlayerId ? (this.t('messages-placeholder') || this.t('chats-placeholder')) : (this.t('messages-empty') || this.t('chats-empty'));
        messageInput.value = messageInput.value || '';
        sendBtn.disabled = !activePlayerId || state.conversationLoading || state.sendLoading;
        
        if (state.sendLoading) {
            sendBtn.innerHTML = `<span>...</span>`;
        } else {
            sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
        }
        
        openBtn.hidden = !activePlayerId;
        backBtn.hidden = !activePlayerId;

        const chatGiftBtn = document.getElementById('chat-gift-btn');
        if (chatGiftBtn) {
            chatGiftBtn.hidden = !activePlayerId;
            const newChatGiftBtn = chatGiftBtn.cloneNode(true);
            chatGiftBtn.parentNode.replaceChild(newChatGiftBtn, chatGiftBtn);
            newChatGiftBtn.addEventListener('click', () => {
                const targetId = String(this.accountMessagesState?.activePlayerId || '').trim();
                if (!targetId) return;
                this.selectedGiftRecipientId = targetId;
                this.renderGiftPicker();
                this.toggleGiftPicker(true, { source: 'chat', activePlayerId: targetId });
            });
        }

        if (!backBtn.dataset.bound) {
            backBtn.dataset.bound = '1';
            backBtn.addEventListener('click', () => {
                this.accountMessagesState = {
                    ...(this.accountMessagesState || {}),
                    activePlayerId: '',
                    activePlayerProfile: null,
                    messages: []
                };
                this.socialCenterView = 'list';
                this.socialCenterTab = 'inbox';
                this.renderSocialCenter();
                void this.loadInboxPage();
            });
        }

        if (!openBtn.dataset.bound) {
            openBtn.dataset.bound = '1';
            openBtn.addEventListener('click', async () => {
                if (!activePlayerId) return;
                await this.loadConversationWithPlayer(activePlayerId, true);
            });
        }

        if (!sendBtn.dataset.bound) {
            sendBtn.dataset.bound = '1';
            sendBtn.addEventListener('click', async () => {
                const targetId = String(this.accountMessagesState?.activePlayerId || '').trim();
                const text = String(messageInput.value || '').trim();
                if (!targetId || !text) return;
                if (this._socialSocket && this._socialSocket.connected) {
                    this._socialSocket.emit('typing:stop', { threadPlayerId: targetId });
                }
                const currentPlayerId = this.getCurrentAccountPlayerId();
                const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const tempMessage = {
                    id: tempId,
                    senderPlayerId: currentPlayerId,
                    receiverPlayerId: targetId,
                    text,
                    createdAt: new Date().toISOString(),
                    readAt: null,
                    sender: this.accountProfile ? {
                        id: this.accountProfile.playerId || this.accountProfile.id || currentPlayerId,
                        displayName: this.accountProfile.displayName || this.accountProfile.name || '',
                        avatarSeed: this.accountProfile.avatarSeed || null,
                        avatarUrl: this.accountProfile.avatarUrl || null,
                        isGuest: Boolean(this.accountProfile.isGuest)
                    } : null,
                    receiver: this.accountMessagesState?.activePlayerProfile || null,
                    isOptimistic: true,
                    localStatus: 'sending'
                };
                const messagesBeforeSend = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
                messagesBeforeSend.push(tempMessage);
                this.accountMessagesState = {
                    ...(this.accountMessagesState || {}),
                    messages: messagesBeforeSend,
                    sendLoading: true,
                    error: ''
                };
                this.upsertMessageThreadFromMessage(tempMessage, targetId);
                this.renderAccountMessagesPanel();
                void this.addMessageToOutbox(targetId, text, tempId);
                messageInput.value = '';
                this.syncSendAndVoiceBtnVisibility();
                try {
                    const result = await this.sendDirectMessageWithFallback(targetId, text, tempId);
                    const sentMessage = result?.item || tempMessage;
                    void this.removeMessageFromOutbox(tempId);
                    const messages = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
                    const tempIndex = messages.findIndex((row) => String(row?.id || '').trim() === tempId);
                    const alreadyExists = messages.some((row) => String(row?.id || '').trim() === String(sentMessage?.id || '').trim());
                    if (tempIndex >= 0) {
                        messages[tempIndex] = {
                            ...sentMessage,
                            isOptimistic: false,
                            localStatus: 'sent'
                        };
                    } else if (!alreadyExists) {
                        messages.push({
                            ...sentMessage,
                            isOptimistic: false,
                            localStatus: 'sent'
                        });
                    }
                    this.accountMessagesState = {
                        ...(this.accountMessagesState || {}),
                        messages,
                        sendLoading: false,
                        error: ''
                    };
                    this.applyRealtimeDirectMessage({
                        type: 'message_sent',
                        tempId: tempId,
                        message: sentMessage,
                        threadPlayerId: targetId
                    });
                    this.renderer.showMessage(this.t('messages-sent') || this.t('chats-sent'), 1400);
                } catch (err) {
                    const messages = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
                    const tempIndex = messages.findIndex((row) => String(row?.id || '').trim() === tempId);
                    if (tempIndex >= 0) {
                        messages[tempIndex] = {
                            ...messages[tempIndex],
                            isOptimistic: false,
                            localStatus: 'failed'
                        };
                    }
                    this.accountMessagesState = {
                        ...(this.accountMessagesState || {}),
                        messages,
                        sendLoading: false,
                        error: err?.message || this.t('messages-send-failed') || this.t('chats-send-failed')
                    };
                    this.renderAccountMessagesPanel();
                    this.renderer.showMessage(err?.message || this.t('messages-send-failed') || this.t('chats-send-failed'), 1800);
                } finally {
                    this.accountMessagesState = {
                        ...(this.accountMessagesState || {}),
                        sendLoading: false
                    };
                    this.renderAccountMessagesPanel();
                }
            });
        }

        if (!messageInput.dataset.bound) {
            messageInput.dataset.bound = '1';
            
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendBtn.click();
                }
            });

            let lastTypingSentAt = 0;
            let typingStopTimeout = null;

            messageInput.addEventListener('input', () => {
                this.syncSendAndVoiceBtnVisibility();
                const targetId = String(this.accountMessagesState?.activePlayerId || '').trim();
                if (!targetId || !this._socialSocket || !this._socialSocket.connected) return;

                const now = Date.now();
                if (now - lastTypingSentAt > 3000) {
                    lastTypingSentAt = now;
                    this._socialSocket.emit('typing:start', { threadPlayerId: targetId });
                }

                if (typingStopTimeout) clearTimeout(typingStopTimeout);
                typingStopTimeout = setTimeout(() => {
                    if (this._socialSocket && this._socialSocket.connected) {
                        this._socialSocket.emit('typing:stop', { threadPlayerId: targetId });
                    }
                    typingStopTimeout = null;
                }, 2000);
            });
        }
        this.syncSendAndVoiceBtnVisibility();
    }

    syncSendAndVoiceBtnVisibility() {
        const input = document.getElementById('account-message-input');
        const voiceBtn = document.getElementById('chat-voice-record-btn');
        const sendBtn = document.getElementById('account-message-send-btn');
        if (!input || !voiceBtn || !sendBtn) return;
        const hasText = input.value.trim().length > 0;
        if (hasText) {
            voiceBtn.classList.add('is-hidden');
            sendBtn.classList.remove('is-hidden');
        } else {
            voiceBtn.classList.remove('is-hidden');
            sendBtn.classList.add('is-hidden');
        }
    }

    async openCoinShopModal() {
        if (!this.hasAuthenticatedAccount()) {
            await this.openAccountModal();
            return;
        }
        this.closePlayerProfileModal();
        this.closeStartModals();
        this.closeAccountModal();
        this.ensureCoinShopModalPortal();

        // Track and deactivate current screen
        const startScreen = document.getElementById('start-screen');
        const gameScreen = document.getElementById('game-screen');
        const accountModal = document.getElementById('account-modal');
        if (startScreen && startScreen.classList.contains('active')) {
            this.coinShopPrevScreen = 'start-screen';
            startScreen.classList.remove('active');
        } else if (gameScreen && gameScreen.classList.contains('active')) {
            this.coinShopPrevScreen = 'game-screen';
            gameScreen.classList.remove('active');
        } else if (accountModal && accountModal.classList.contains('active')) {
            this.coinShopPrevScreen = 'account-modal';
            accountModal.classList.remove('active');
        } else if (!this.coinShopPrevScreen) {
            this.coinShopPrevScreen = 'start-screen';
        }

        const modal = document.getElementById('coin-shop-modal');
        if (modal) if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.style.zIndex = '';
        modal.classList.add('active');
        this.ensureShopIconMarkup();
        await this.loadCoinShopStatus();
        this.renderCoinShopModal();
        this.startCoinShopTicker();
    }

    async openCosmeticsShopModal() {
        if (!this.hasAuthenticatedAccount()) {
            await this.openAccountModal();
            return;
        }
        this.closePlayerProfileModal();
        this.closeStartModals();
        this.closeAccountModal();
        this.closeCoinShopModal();
        this.ensureCosmeticsShopModalPortal();

        // Track and deactivate current screen
        const startScreen = document.getElementById('start-screen');
        const gameScreen = document.getElementById('game-screen');
        const accountModal = document.getElementById('account-modal');
        if (startScreen && startScreen.classList.contains('active')) {
            this.cosmeticsShopPrevScreen = 'start-screen';
            startScreen.classList.remove('active');
        } else if (gameScreen && gameScreen.classList.contains('active')) {
            this.cosmeticsShopPrevScreen = 'game-screen';
            gameScreen.classList.remove('active');
        } else if (accountModal && accountModal.classList.contains('active')) {
            this.cosmeticsShopPrevScreen = 'account-modal';
            accountModal.classList.remove('active');
        } else if (!this.cosmeticsShopPrevScreen) {
            this.cosmeticsShopPrevScreen = 'start-screen';
        }

        const modal = document.getElementById('cosmetics-shop-modal');
        if (modal) if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.style.zIndex = '';
        modal.classList.add('active');
        await Promise.all([this.loadCoinShopStatus(), this.loadTableSkinShop()]);
        this.renderCosmeticsShopModal();
    }

    closeAccountModal() {
        const modal = document.getElementById('account-modal');
        if (modal) modal.classList.remove('active');
        this.closeGiftPicker();

        // Restore previous screen
        const prevScreenId = this.profilePrevScreen || 'start-screen';
        const prevScreen = document.getElementById(prevScreenId);
        if (prevScreen) {
            prevScreen.classList.add('active');
        }
        this.profilePrevScreen = null;
    }

    closeCoinShopModal() {
        const modal = document.getElementById('coin-shop-modal');
        if (modal) modal.classList.remove('active');
        this.stopCoinShopTicker();

        const prevScreenId = this.coinShopPrevScreen || 'start-screen';
        const gameActive = document.getElementById('game-screen')?.classList.contains('active');
        if (!gameActive) {
            const prevScreen = document.getElementById(prevScreenId);
            if (prevScreen) {
                prevScreen.classList.add('active');
                if (prevScreenId === 'account-modal') {
                    this.renderAccountModal();
                }
            }
        }
        this.coinShopPrevScreen = null;
    }

    closeCosmeticsShopModal() {
        const modal = document.getElementById('cosmetics-shop-modal');
        if (modal) modal.classList.remove('active');

        const prevScreenId = this.cosmeticsShopPrevScreen || 'start-screen';
        const gameActive = document.getElementById('game-screen')?.classList.contains('active');
        if (!gameActive) {
            const prevScreen = document.getElementById(prevScreenId);
            if (prevScreen) {
                prevScreen.classList.add('active');
                if (prevScreenId === 'account-modal') {
                    this.renderAccountModal();
                }
            }
        }
        this.cosmeticsShopPrevScreen = null;
    }

    closeStartModals() {
        document.getElementById('solo-modal')?.classList.remove('active');
        document.getElementById('online-modal')?.classList.remove('active');
        document.getElementById('open-rooms-modal')?.classList.remove('active');
        this.stopOpenRoomsAutoRefresh();
        this.openRoomsPrevScreen = null;
        this.closeLeaderboardModal();
        this.closeFriendsModal();
        this.closeSocialCenterModal();
        this.closePlayerProfileModal();
        this.closeGiftPicker();
        this.closeCoinShopModal();
        this.closeCosmeticsShopModal();
    }

    setAccountStatus(text) {
        const el = document.getElementById('account-status');
        if (el) el.textContent = text || '';
        const landingStatus = document.getElementById('landing-auth-status');
        if (landingStatus) landingStatus.textContent = text || '';
    }

    async loadCoinShopStatus() {
        if (!this.account?.getCoinShopStatus || this.coinShopLoading) {
            return this.coinShopStatus;
        }
        this.coinShopLoading = true;
        try {
            const status = await this.account.getCoinShopStatus();
            this.coinShopStatus = status || null;
            const wallet = status?.wallet || null;
            if (wallet) {
                this.accountDetails = {
                    ...(this.accountDetails || {}),
                    wallet
                };
                this.accountProfile = {
                    ...(this.accountProfile || {}),
                    coins: wallet.balance,
                    wallet
                };
            }
            return this.coinShopStatus;
        } catch (err) {
            debugLog('Coin shop status load failed:', err);
            this.coinShopStatus = {
                wallet: this.accountProfile?.wallet || null,
                coinShop: {
                    videoReward: { amount: 1000, cooldownMinutes: 30, dailyLimit: 6 },
                    packs: []
                },
                error: err?.message || ''
            };
            return this.coinShopStatus;
        } finally {
            this.coinShopLoading = false;
        }
    }

    getTableSkinCatalogEntries() {
        const remote = Array.isArray(this.tableSkinShop?.tableSkins) ? this.tableSkinShop.tableSkins : [];
        if (remote.length) {
            return remote;
        }
        return DEFAULT_TABLE_SKINS.map((skin) => ({
            ...skin,
            owned: false,
            equipped: this.accountProfile?.tableSkinKey === skin.key,
            price: 200,
            isActive: true
        }));
    }

    getProfileTableSkinEntries() {
        const owned = this.getTableSkinCatalogEntries().filter((skin) => Boolean(skin?.owned));
        const equippedKey = this.accountProfile?.tableSkinKey || this.tableSkinShop?.equippedKey || null;
        const standard = {
            ...DEFAULT_TABLE_SKIN,
            owned: true,
            equipped: !equippedKey,
            isActive: true,
            price: 0
        };
        const entries = [standard, ...owned.filter((skin) => skin.key !== DEFAULT_TABLE_SKIN_KEY)];
        const seen = new Set();
        return entries.filter((skin) => {
            const key = String(skin?.key || '').trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).map((skin) => ({
            ...skin,
            equipped: skin.key === DEFAULT_TABLE_SKIN_KEY ? !equippedKey : equippedKey === skin.key,
            isActive: true
        }));
    }

    getTableSkinEntry(key) {
        const normalizedKey = String(key || '').trim();
        const catalogSkin = this.getTableSkinCatalogEntries().find((skin) => skin.key === normalizedKey);
        if (catalogSkin) return catalogSkin;
        if (normalizedKey === DEFAULT_TABLE_SKIN_KEY) {
            return {
                ...DEFAULT_TABLE_SKIN,
                owned: true,
                equipped: !(this.accountProfile?.tableSkinKey || this.tableSkinShop?.equippedKey || null),
                price: 0,
                isActive: true
            };
        }
        return null;
    }

    applyActiveTableSkin() {
        let selectedKey = this.tableSkinShop?.equippedKey || this.accountProfile?.tableSkinKey || DEFAULT_TABLE_SKIN_KEY;
        if (selectedKey === 'standard' || selectedKey === 'null' || !selectedKey) {
            selectedKey = DEFAULT_TABLE_SKIN_KEY;
        }
        const skin = this.getTableSkinEntry(selectedKey) || DEFAULT_TABLE_SKIN;
        const url = skin.assetUrl || '/assets/cosmetics/table/table_skin_01.webp';
        this.renderer.setTableSkin(url);
    }

    async loadTableSkinShop() {
        if (!this.hasAuthenticatedAccount()) {
            this.tableSkinShop = null;
            return null;
        }
        if (!this.account?.getTableSkinShop || this.tableSkinLoading) {
            return this.tableSkinShop;
        }
        this.tableSkinLoading = true;
        try {
            const data = await this.account.getTableSkinShop();
            this.tableSkinShop = data || null;
            this.applyActiveTableSkin();
            if (document.getElementById('account-modal')?.classList.contains('active')) {
                this.renderAccountModal();
            } else {
                this.renderTableSkinInventory();
            }
            if (document.getElementById('cosmetics-shop-modal')?.classList.contains('active')) {
                this.renderCosmeticsShopModal();
            }
            return this.tableSkinShop;
        } catch (err) {
            debugLog('Table skin shop load failed:', err);
            this.tableSkinShop = {
                equippedKey: this.accountProfile?.tableSkinKey || null,
                tableSkins: DEFAULT_TABLE_SKINS.map((skin) => ({
                    ...skin,
                    price: 200,
                    owned: false,
                    equipped: this.accountProfile?.tableSkinKey === skin.key,
                    isActive: true
                }))
            };
            this.applyActiveTableSkin();
            if (document.getElementById('account-modal')?.classList.contains('active')) {
                this.renderAccountModal();
            } else {
                this.renderTableSkinInventory();
            }
            if (document.getElementById('cosmetics-shop-modal')?.classList.contains('active')) {
                this.renderCosmeticsShopModal();
            }
            return this.tableSkinShop;
        } finally {
            this.tableSkinLoading = false;
        }
    }

    renderCoinShopModal() {
        const balanceValue = document.getElementById('coin-shop-balance-value');
        const statusEl = document.getElementById('coin-shop-status');
        const rewardTitle = document.getElementById('coin-shop-video-title');
        const rewardDesc = document.getElementById('coin-shop-video-desc');
        const rewardMeta = document.getElementById('coin-shop-video-meta');
        const rewardBtn = document.getElementById('coin-shop-video-btn');
        const rewardState = document.getElementById('coin-shop-video-state');
        const packsGrid = document.getElementById('coin-shop-packs-grid');
        const note = document.getElementById('coin-shop-footnote');
        const shop = this.coinShopStatus?.coinShop || {
            videoReward: { amount: 1000, cooldownMinutes: 30, dailyLimit: 6 },
            packs: []
        };
        const wallet = this.coinShopStatus?.wallet || this.accountDetails?.wallet || this.accountProfile?.wallet || null;
        const balance = Number(wallet?.balance ?? this.accountProfile?.coins ?? 0);
        const reward = shop.videoReward || { amount: 1000, cooldownMinutes: 30, dailyLimit: 6 };
        const canClaim = Boolean(this.coinShopStatus?.canClaim);
        const remainingSeconds = Number(this.coinShopStatus?.remainingSeconds || 0);
        const claimsToday = Number(this.coinShopStatus?.claimsToday || 0);
        const dailyLimit = Number(reward.dailyLimit || 6);
        const amount = Number(reward.amount || 1000);
        const minutes = Math.max(0, Math.floor(remainingSeconds / 60));
        const seconds = Math.max(0, remainingSeconds % 60);
        const waitText = remainingSeconds > 0
            ? this.format('coin-shop-video-wait', {
                minutes: String(minutes).padStart(2, '0'),
                seconds: String(seconds).padStart(2, '0')
            })
            : this.t('coin-shop-video-daily');

        if (balanceValue) balanceValue.textContent = String(balance);
        if (statusEl) {
            const errorText = String(this.coinShopStatus?.error || '').trim();
            statusEl.textContent = errorText;
            statusEl.classList.toggle('is-hidden', !errorText);
        }
        if (rewardTitle) {
            rewardTitle.textContent = this.format('coin-shop-video-title', {
                amount: amount.toLocaleString('en-US')
            });
        }
        if (rewardDesc) {
            rewardDesc.textContent = this.t('coin-shop-video-desc');
        }
        if (rewardMeta) {
            rewardMeta.textContent = this.format('coin-shop-video-meta', {
                cooldown: String(Math.max(1, Number(reward.cooldownMinutes || 30))),
                claimsToday: String(claimsToday),
                dailyLimit: String(dailyLimit)
            });
        }
        if (rewardBtn) {
            rewardBtn.disabled = this.coinShopLoading || this.coinShopClaiming || !canClaim;
            rewardBtn.textContent = this.coinShopClaiming
                ? this.t('coin-shop-video-claiming')
                : (canClaim ? this.t('coin-shop-video-btn') : this.t('coin-shop-video-blocked'));
        }
        if (rewardState) {
            rewardState.textContent = canClaim
                ? this.format('coin-shop-video-ready', { amount: amount.toLocaleString('en-US') })
                : waitText;
        }
        if (note) {
            note.textContent = this.t('coin-shop-footnote');
        }
        if (packsGrid) {
            packsGrid.innerHTML = '';
            const packs = Array.isArray(shop.packs) ? shop.packs : [];
            for (const pack of packs) {
                const card = document.createElement('article');
                card.className = `coin-pack-card${pack.isRecommended ? ' is-recommended' : ''}`;
                const badge = document.createElement('div');
                badge.className = 'coin-pack-badge';
                badge.textContent = pack.isRecommended
                    ? this.t('coin-shop-pack-recommended')
                    : this.t('coin-shop-pack-fast');
                const top = document.createElement('div');
                top.className = 'coin-pack-top';
                const icon = document.createElement('span');
                icon.className = 'coin-pack-icon';
                icon.dataset.shopIcon = 'coin';
                const title = document.createElement('div');
                title.className = 'coin-pack-title';
                title.textContent = this.format('coin-shop-pack-title', { coins: Number(pack.coins || 0).toLocaleString('en-US') });
                const price = document.createElement('div');
                price.className = 'coin-pack-price';
                price.textContent = pack.priceLabel || '';
                top.appendChild(icon);
                top.appendChild(title);
                top.appendChild(price);
                const body = document.createElement('div');
                body.className = 'coin-pack-body';
                body.textContent = this.format('coin-shop-pack-bonus', {
                    bonus: Number(pack.bonusCoins || 0).toLocaleString('en-US')
                });
                const action = document.createElement('button');
                action.type = 'button';
                action.className = 'btn btn-menu coin-pack-action';
                action.disabled = true;
                action.textContent = this.t('coin-shop-pack-buy');
                card.appendChild(badge);
                card.appendChild(top);
                card.appendChild(body);
                card.appendChild(action);
                packsGrid.appendChild(card);
            }
        }
        this.ensureShopIconMarkup();
    }

    renderCosmeticsShopModal() {
        const balanceValue = document.getElementById('cosmetics-shop-balance-value');
        const statusEl = document.getElementById('cosmetics-shop-status');
        const skinsGrid = document.getElementById('cosmetics-shop-table-skins-grid');
        const note = document.getElementById('cosmetics-shop-footnote');
        const wallet = this.coinShopStatus?.wallet || this.accountDetails?.wallet || this.accountProfile?.wallet || null;
        const balance = Number(wallet?.balance ?? this.accountProfile?.coins ?? 0);

        if (balanceValue) balanceValue.textContent = String(balance);
        if (statusEl) {
            const errorText = String(this.coinShopStatus?.error || '').trim();
            statusEl.textContent = errorText;
            statusEl.classList.toggle('is-hidden', !errorText);
        }
        if (note) note.textContent = this.t('cosmetics-shop-footnote');
        if (skinsGrid) this.renderTableSkinCards(skinsGrid, 'shop');
        this.ensureShopIconMarkup();
    }

    renderTableSkinInventory() {
        const panel = document.getElementById('account-skins-panel');
        const list = document.getElementById('account-skins-list');
        if (!panel || !list) return;
        if (!this.hasAuthenticatedAccount()) {
            panel.classList.add('is-hidden');
            list.innerHTML = '';
            return;
        }
        if (this.accountProfileTab !== 'skins') {
            panel.classList.add('is-hidden');
            list.innerHTML = '';
            return;
        }
        panel.classList.remove('is-hidden');
        this.renderTableSkinCards(list, 'profile', this.getProfileTableSkinEntries());
    }

    renderTableSkinCards(container, context = 'shop', skins = null) {
        if (!container) return;
        container.innerHTML = '';
        const list = Array.isArray(skins) ? skins : (context === 'profile' ? this.getProfileTableSkinEntries() : this.getTableSkinCatalogEntries());
        const filteredList = context === 'profile'
            ? list.filter((skin) => {
                const key = String(skin?.key || '').trim();
                return key === DEFAULT_TABLE_SKIN_KEY || Boolean(skin?.owned);
            })
            : list;
        for (const skin of filteredList) {
            const card = this.buildTableSkinCard(skin, context);
            if (card) container.appendChild(card);
        }
    }

    buildTableSkinCard(skin, context = 'shop') {
        if (!skin) return null;
        const isProfile = context === 'profile';
        const isDefaultSkin = skin.key === DEFAULT_TABLE_SKIN_KEY;
        if (isProfile && !skin.owned && !isDefaultSkin) {
            return null;
        }
        const card = document.createElement('article');
        card.className = `table-skin-card${skin.equipped ? ' is-selected' : ''}${skin.owned ? ' is-owned' : ''}`;
        const preview = document.createElement('div');
        preview.className = 'table-skin-preview';
        preview.style.backgroundImage = skin.assetUrl ? `url("${skin.assetUrl}")` : '';
        const previewGlow = document.createElement('div');
        previewGlow.className = 'table-skin-preview-glow';
        preview.appendChild(previewGlow);

        const body = document.createElement('div');
        body.className = 'table-skin-body';
        const topRow = document.createElement('div');
        topRow.className = 'table-skin-top';
        const title = document.createElement('div');
        title.className = 'table-skin-title';
        title.textContent = skin.name;
        const badge = document.createElement('span');
        badge.className = `table-skin-badge${skin.equipped ? ' is-equipped' : skin.owned ? ' is-owned' : ''}`;
        badge.textContent = skin.equipped
            ? this.t('coin-shop-skin-equipped')
            : skin.owned
                ? this.t('coin-shop-skin-owned')
                : this.t('coin-shop-skin-price');
        topRow.appendChild(title);
        topRow.appendChild(badge);

        const footer = document.createElement('div');
        footer.className = 'table-skin-footer';
        const price = document.createElement('div');
        price.className = 'table-skin-price';
        price.textContent = skin.equipped
            ? this.t('coin-shop-skin-equipped')
            : skin.owned
                ? this.t('coin-shop-skin-owned')
                : `${Number(skin.price || 200).toLocaleString('en-US')} coins`;
        const action = document.createElement('button');
        action.type = 'button';
        action.className = `btn btn-menu table-skin-action${skin.equipped ? ' is-selected' : ''}`;
        action.disabled = this.tableSkinBusy;
        action.style.touchAction = 'manipulation';
        action.textContent = skin.equipped
            ? this.t('coin-shop-skin-equipped')
            : skin.owned
                ? this.t('coin-shop-skin-use')
                : this.t('coin-shop-skin-buy');
        action.addEventListener('click', async () => {
            if (this.tableSkinBusy || this.tableSkinLoading) return;
            try {
                if (skin.equipped) return;
                if (isProfile && isDefaultSkin) {
                    await this.equipDefaultTableSkin();
                } else if (skin.owned) {
                    await this.equipTableSkin(skin.key);
                } else {
                    if (isProfile) return;
                    await this.buyTableSkin(skin.key);
                }
            } finally {
                this.tableSkinBusy = false;
                this.renderAccountModal();
                if (document.getElementById('cosmetics-shop-modal')?.classList.contains('active')) {
                    this.renderCosmeticsShopModal();
                }
                this.applyActiveTableSkin();
            }
        });

        footer.appendChild(price);
        footer.appendChild(action);
        body.appendChild(topRow);
        body.appendChild(footer);
        card.appendChild(preview);
        card.appendChild(body);
        return card;
    }

    async claimCoinShopVideoReward() {
        if (this.coinShopClaiming) return;
        this.coinShopClaiming = true;
        this.renderCoinShopModal();
        try {
            const result = await this.account.claimCoinShopVideoReward();
            if (result?.wallet) {
                this.accountDetails = {
                    ...(this.accountDetails || {}),
                    wallet: result.wallet
                };
                this.accountProfile = {
                    ...(this.accountProfile || {}),
                    coins: result.wallet.balance,
                    wallet: result.wallet
                };
            }
            this.coinShopStatus = {
                ...(this.coinShopStatus || {}),
                wallet: result?.wallet || this.coinShopStatus?.wallet || null,
                coinShop: this.coinShopStatus?.coinShop || result?.coinShop || {
                    videoReward: { amount: 1000, cooldownMinutes: 30, dailyLimit: 6 },
                    packs: []
                },
                claimsToday: Number(result?.claimsToday || 0),
                nextAvailableAt: result?.nextAvailableAt || null,
                canClaim: false,
                remainingSeconds: Number(result?.cooldownMinutes || 30) * 60
            };
            this.renderAccountModal();
            this.renderCoinShopModal();
            this.startCoinShopTicker();
            this.syncStartAuthButton();
            this.renderer.showMessage(this.t('coin-shop-rewarded'), 1800);
        } catch (err) {
            this.renderer.showMessage(err.message || this.t('coin-shop-claim-failed'), 2000);
        } finally {
            this.coinShopClaiming = false;
            this.renderCoinShopModal();
        }
    }

    async loadDailyBonusStatus() {
        if (!this.hasAuthenticatedAccount()) {
            this.dailyBonusState.status = null;
            this.dailyBonusState.loading = false;
            this.renderDailyBonusCard();
            return;
        }

        this.dailyBonusState.loading = true;
        this.dailyBonusState.error = '';
        this.renderDailyBonusCard();

        try {
            const status = await this.account.getDailyBonusStatus();
            this.dailyBonusState.status = status?.dailyBonus || null;
            if (status?.wallet) {
                const balance = status.wallet.balance;
                this.accountDetails = {
                    ...(this.accountDetails || {}),
                    wallet: status.wallet
                };
                this.accountProfile = {
                    ...(this.accountProfile || {}),
                    coins: balance,
                    wallet: status.wallet
                };
                this.syncStartAuthButton();
                this.renderAccountModal();
            }
            if (this.dailyBonusState.status?.nextClaimAt) {
                this.startDailyBonusTicker();
            } else {
                this.stopDailyBonusTicker();
            }
        } catch (err) {
            this.dailyBonusState.error = err.message || this.t('daily-bonus-error');
        } finally {
            this.dailyBonusState.loading = false;
            this.renderDailyBonusCard();
        }
    }

    getDailyBonusRewardedAdProvider() {
        return window.__dominoRewardedAdProvider
            || window.dominoRewardedAdProvider
            || window.rewardedAdProvider
            || window.rewardedAds
            || null;
    }

    refreshDailyBonusRewardedAdAvailability() {
        const provider = this.getDailyBonusRewardedAdProvider();
        const available = Boolean(provider && (typeof provider.showRewardedAd === 'function' || typeof provider.show === 'function' || typeof provider.present === 'function'));
        this.dailyBonusState.rewardedAdAvailable = available;
        return available;
    }

    async showRewardedAdForDailyBonus() {
        const provider = this.getDailyBonusRewardedAdProvider();
        const hasProvider = Boolean(provider && (typeof provider.showRewardedAd === 'function' || typeof provider.show === 'function' || typeof provider.present === 'function'));
        this.dailyBonusState.rewardedAdAvailable = hasProvider;
        this.dailyBonusState.rewardedAdError = '';
        if (!hasProvider) {
            this.dailyBonusState.rewardedAdCancelledAt = Date.now();
            this.dailyBonusState.rewardedAdError = this.t('daily-bonus-ad-unavailable');
            return { available: false, started: false, completed: false, cancelled: false, error: this.dailyBonusState.rewardedAdError };
        }

        this.dailyBonusState.rewardedAdStartedAt = Date.now();
        this.dailyBonusState.rewardedAdCompletedAt = 0;
        this.dailyBonusState.rewardedAdCancelledAt = 0;
        this.renderDailyBonusCard();

        try {
            const showFn = typeof provider.showRewardedAd === 'function'
                ? provider.showRewardedAd.bind(provider)
                : typeof provider.show === 'function'
                    ? provider.show.bind(provider)
                    : provider.present.bind(provider);
            const result = await Promise.resolve(showFn({
                placement: 'daily_bonus',
                claimMode: 'rewarded_x2'
            }));
            const cancelled = result === false || result?.cancelled === true || result?.dismissed === true || result?.error === 'cancelled';
            if (cancelled) {
                this.dailyBonusState.rewardedAdCancelledAt = Date.now();
                this.dailyBonusState.rewardedAdError = '';
                return { available: true, started: true, completed: false, cancelled: true, error: '' };
            }

            this.dailyBonusState.rewardedAdCompletedAt = Date.now();
            this.dailyBonusState.rewardedAdError = '';
            return { available: true, started: true, completed: true, cancelled: false, error: '' };
        } catch (err) {
            this.dailyBonusState.rewardedAdError = err?.message || this.t('daily-bonus-error');
            return { available: true, started: true, completed: false, cancelled: false, error: this.dailyBonusState.rewardedAdError };
        } finally {
            this.renderDailyBonusCard();
        }
    }

    async claimDailyBonus(claimMode = 'normal') {
        if (this.dailyBonusState.claiming) return;
        const normalizedMode = claimMode === 'rewarded_x2' ? 'rewarded_x2' : 'normal';
        if (normalizedMode === 'rewarded_x2' && !this.refreshDailyBonusRewardedAdAvailability()) {
            this.dailyBonusState.rewardedAdError = this.t('daily-bonus-ad-unavailable');
            this.renderDailyBonusCard();
            return;
        }

        this.dailyBonusState.claiming = true;
        this.dailyBonusState.claimingMode = normalizedMode;
        this.dailyBonusState.error = '';
        this.dailyBonusState.rewardedAdError = '';
        this.renderDailyBonusCard();

        try {
            if (normalizedMode === 'rewarded_x2') {
                const adResult = await this.showRewardedAdForDailyBonus();
                if (!adResult?.completed) {
                    return;
                }
            }

            const result = await this.account.claimDailyBonus({ claimMode: normalizedMode });
            if (result?.ok) {
                this.dailyBonusState.status = result.dailyBonus || null;
                this.dailyBonusState.lastDailyBonusClaimMode = String(result.claimMode || normalizedMode);
                this.dailyBonusState.lastDailyBonusClaimReward = Number(result.reward ?? result.claim?.amount ?? 0) || 0;
                if (result.wallet) {
                    const balance = result.wallet.balance;
                    this.accountDetails = {
                        ...(this.accountDetails || {}),
                        wallet: result.wallet
                    };
                    this.accountProfile = {
                        ...(this.accountProfile || {}),
                        coins: balance,
                        wallet: result.wallet
                    };
                    this.syncStartAuthButton();
                    this.renderAccountModal();
                    this.renderCoinShopModal();
                    this.renderTableSkinInventory();
                }

                if (result.claimed) {
                    const earnedAmount = Number(result.reward ?? result.claim?.amount ?? 0) || 0;
                    this.renderer.showMessage(this.t('daily-bonus-toast').replace('{amount}', earnedAmount), 3000);
                }

                if (this.dailyBonusState.status?.nextClaimAt) {
                    this.startDailyBonusTicker();
                } else {
                    this.stopDailyBonusTicker();
                }
            } else {
                if (result?.reason && result.reason !== 'already_claimed') {
                    this.dailyBonusState.error = result.reason || 'Could not claim daily bonus';
                } else {
                    this.dailyBonusState.error = '';
                    this.dailyBonusState.status = result.dailyBonus || this.dailyBonusState.status;
                }
            }
        } catch (err) {
            this.dailyBonusState.error = err.message || this.t('daily-bonus-error');
        } finally {
            this.dailyBonusState.claiming = false;
            this.dailyBonusState.claimingMode = '';
            this.renderDailyBonusCard();
        }
    }

    renderDailyBonusCard(source = 'renderDailyBonusCard') {
        this._lastDailyBonusRenderAt = Date.now();
        this._lastDailyBonusRenderSource = String(source || 'renderDailyBonusCard');
        const card = document.getElementById('daily-bonus-card');
        if (!card) return;

        const isAuthed = this.hasAuthenticatedAccount();
        if (!isAuthed) {
            card.classList.add('is-hidden');
            this._dailyBonusUiRendered = false;
            this.stopDailyBonusTicker();
            return;
        }

        card.classList.remove('is-hidden');
        this._dailyBonusUiRendered = true;

        const titleEl = card.querySelector('.daily-bonus-title');
        const metaEl = document.getElementById('daily-bonus-meta');
        const amountEl = document.getElementById('daily-bonus-amount');
        const streakEl = document.getElementById('daily-bonus-streak');
        const normalBtn = document.getElementById('daily-bonus-claim-btn');
        const rewardedBtn = document.getElementById('daily-bonus-rewarded-btn');
        const normalAmountEl = document.getElementById('daily-bonus-claim-amount');
        const rewardedAmountEl = document.getElementById('daily-bonus-rewarded-amount');
        const actionsHintEl = document.getElementById('daily-bonus-actions-hint');
        const streakRow = document.getElementById('daily-bonus-streak-row');

        if (titleEl) titleEl.textContent = this.t('daily-bonus-title');

        const status = this.dailyBonusState.status;
        const baseRewardAmount = Number(status?.todayReward?.amount ?? status?.todayAmount ?? 0) || 0;
        const doubledRewardAmount = baseRewardAmount * 2;
        const canClaim = Boolean(status && (status.canClaim ?? status.claimable) && !status.claimedToday && !this.dailyBonusState.error);
        const rewardedAdAvailable = this.refreshDailyBonusRewardedAdAvailability();
        const isClaimingNormal = this.dailyBonusState.claiming && this.dailyBonusState.claimingMode === 'normal';
        const isClaimingRewarded = this.dailyBonusState.claiming && this.dailyBonusState.claimingMode === 'rewarded_x2';
        const rewardedAdInFlight = Boolean(this.dailyBonusState.rewardedAdStartedAt && !this.dailyBonusState.rewardedAdCompletedAt && !this.dailyBonusState.rewardedAdCancelledAt && isClaimingRewarded);

        if (this.dailyBonusState.loading) {
            this.stopDailyBonusTicker();
            if (metaEl) metaEl.textContent = this.t('daily-bonus-loading');
            if (amountEl) amountEl.textContent = '';
            if (streakEl) streakEl.textContent = '';
            if (normalBtn) {
                normalBtn.disabled = true;
                normalBtn.textContent = this.t('daily-bonus-loading');
            }
            if (rewardedBtn) {
                rewardedBtn.disabled = true;
                rewardedBtn.textContent = this.t('daily-bonus-loading');
            }
            if (normalAmountEl) normalAmountEl.textContent = '';
            if (rewardedAmountEl) rewardedAmountEl.textContent = '';
            if (actionsHintEl) actionsHintEl.textContent = '';
            if (this.dailyBonusState.rewardedAdStartedAt || this.dailyBonusState.rewardedAdCompletedAt || this.dailyBonusState.rewardedAdCancelledAt) {
                this.dailyBonusState.rewardedAdStartedAt = 0;
                this.dailyBonusState.rewardedAdCompletedAt = 0;
                this.dailyBonusState.rewardedAdCancelledAt = 0;
            }
            if (streakRow) streakRow.innerHTML = '';
            return;
        }

        if (this.dailyBonusState.error) {
            this.stopDailyBonusTicker();
            if (metaEl) metaEl.textContent = this.dailyBonusState.error;
            if (amountEl) amountEl.textContent = '';
            if (streakEl) streakEl.textContent = '';
            if (normalBtn) {
                normalBtn.disabled = true;
                normalBtn.textContent = this.t('daily-bonus-error');
            }
            if (rewardedBtn) {
                rewardedBtn.disabled = true;
                rewardedBtn.textContent = this.t('daily-bonus-error');
            }
            if (normalAmountEl) normalAmountEl.textContent = '';
            if (rewardedAmountEl) rewardedAmountEl.textContent = '';
            if (actionsHintEl) actionsHintEl.textContent = '';
            if (status && (status.canClaim ?? status.claimable)) {
                if (rewardedBtn) rewardedBtn.textContent = this.t('daily-bonus-claim-rewarded');
            }
            if (streakRow) streakRow.innerHTML = '';
            return;
        }

        if (!status) {
            this.stopDailyBonusTicker();
            if (metaEl) metaEl.textContent = this.t('daily-bonus-error');
            if (amountEl) amountEl.textContent = '';
            if (streakEl) streakEl.textContent = '';
            if (normalBtn) {
                normalBtn.disabled = true;
                normalBtn.textContent = this.t('daily-bonus-error');
            }
            if (rewardedBtn) {
                rewardedBtn.disabled = true;
                rewardedBtn.textContent = this.t('daily-bonus-error');
            }
            if (normalAmountEl) normalAmountEl.textContent = '';
            if (normalAmountEl) normalAmountEl.textContent = '';
            if (actionsHintEl) actionsHintEl.textContent = '';
            if (this.dailyBonusState.rewardedAdError) {
                this.dailyBonusState.rewardedAdError = '';
            }
            if (streakRow) streakRow.innerHTML = '';
            return;
        }

        const doubleAvailable = Boolean(status && status.doubleClaimAvailable);

        if (amountEl) {
            amountEl.textContent = `+${baseRewardAmount}`;
        }

        if (streakEl) {
            streakEl.textContent = `${this.t('daily-bonus-streak')}: ${status.streakDay}/${status.maxStreak}`;
        }

        if (normalAmountEl) {
            if (doubleAvailable) {
                normalAmountEl.textContent = `+${doubledRewardAmount}`;
            } else if (canClaim) {
                normalAmountEl.textContent = `+${baseRewardAmount}`;
            } else {
                normalAmountEl.textContent = '';
            }
        }

        if (normalBtn) {
            const tvIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width: 16px; height: 16px; min-width: 16px; flex-shrink: 0;"><rect x="3.5" y="5.5" width="17" height="13" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="m10 9 4.8 3-4.8 3V9Z" fill="currentColor"/></svg>`;
            if (isClaimingNormal) {
                normalBtn.disabled = true;
                normalBtn.innerHTML = '...';
            } else if (isClaimingRewarded) {
                normalBtn.disabled = true;
                if (rewardedAdInFlight) {
                    normalBtn.innerHTML = this.t('daily-bonus-ad-loading');
                } else {
                    normalBtn.innerHTML = this.t('daily-bonus-claim-loading');
                }
            } else if (doubleAvailable) {
                const template = this.t('daily-bonus-claim-rewarded') || 'Reklam izlə +{amount} qazan';
                const btnText = template.replace('{amount}', doubledRewardAmount);
                normalBtn.innerHTML = `${tvIconSvg}<span>${btnText}</span>`;
                normalBtn.disabled = !rewardedAdAvailable;
            } else if (!canClaim) {
                normalBtn.disabled = true;
                normalBtn.innerHTML = `<span>${this.t('daily-bonus-claimed')}</span>`;
            } else {
                normalBtn.disabled = false;
                normalBtn.innerHTML = `<span>${this.t('daily-bonus-claim-normal')}</span>`;
            }
        }

        if (metaEl) {
            if (!status.nextClaimAt) {
                this.stopDailyBonusTicker();
                metaEl.textContent = this.t('daily-bonus-subtitle');
            } else if (!this.dailyBonusTickerId) {
                this.startDailyBonusTicker();
            }
        }

        if (actionsHintEl) {
            if (doubleAvailable) {
                if (!rewardedAdAvailable) {
                    actionsHintEl.textContent = this.t('daily-bonus-ad-unavailable');
                } else if (this.dailyBonusState.rewardedAdError) {
                    actionsHintEl.textContent = this.dailyBonusState.rewardedAdError;
                } else {
                    actionsHintEl.textContent = '';
                }
            } else if (!canClaim) {
                actionsHintEl.textContent = this.t('daily-bonus-claimed');
            } else {
                actionsHintEl.textContent = '';
            }
        }

        if (streakRow) {
            streakRow.innerHTML = '';
            const rewardSchedule = Array.isArray(status.rewardSchedule) ? status.rewardSchedule : [];
            const rewardByDay = new Map(rewardSchedule.map((reward) => [Number(reward?.day || 0), Number(reward?.amount || 0)]));
            const maxDays = Math.max(1, Number(status.maxStreak || rewardSchedule.length || 7));

            for (let day = 1; day <= maxDays; day++) {
                const box = document.createElement('div');
                box.className = 'daily-bonus-day-box';

                let isClaimed = false;
                let isActive = false;

                if (status.claimedToday) {
                    if (day <= status.streakDay) {
                        isClaimed = true;
                    }
                } else {
                    if (day < status.streakDay) {
                        isClaimed = true;
                    } else if (day === status.streakDay) {
                        isActive = true;
                    }
                }

                if (isClaimed) box.classList.add('is-claimed');
                if (isActive) box.classList.add('is-active');

                const scheduleReward = rewardByDay.get(day);
                const dayReward = Number.isFinite(scheduleReward)
                    ? scheduleReward
                    : Number(status.todayReward?.amount ?? status.todayAmount ?? 0);

                const dayNumSpan = document.createElement('span');
                dayNumSpan.className = 'day-num';
                dayNumSpan.textContent = this.t('daily-bonus-day').replace('{day}', day);

                const dayRewardSpan = document.createElement('span');
                dayRewardSpan.className = 'day-reward';
                dayRewardSpan.textContent = `+${dayReward}`;

                box.appendChild(dayNumSpan);
                box.appendChild(dayRewardSpan);
                streakRow.appendChild(box);
            }
        }
    }

    startDailyBonusTicker() {
        this.stopDailyBonusTicker();
        this.updateDailyBonusTimeRemaining();
        this.dailyBonusTickerId = setInterval(() => {
            this.updateDailyBonusTimeRemaining();
        }, 1000);
    }

    stopDailyBonusTicker() {
        if (this.dailyBonusTickerId) {
            clearInterval(this.dailyBonusTickerId);
            this.dailyBonusTickerId = null;
        }
    }

    updateDailyBonusTimeRemaining() {
        const status = this.dailyBonusState.status;
        if (!status || !status.nextClaimAt) {
            this.stopDailyBonusTicker();
            return;
        }

        const nextClaim = new Date(status.nextClaimAt).getTime();
        const now = Date.now();
        const diff = nextClaim - now;

        if (diff <= 0) {
            this.stopDailyBonusTicker();
            this.loadDailyBonusStatus();
            return;
        }

        const metaEl = document.getElementById('daily-bonus-meta');
        if (metaEl) {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            let timeStr = '';
            if (this.currentLang === 'az') {
                timeStr = `${hours}s ${minutes}d ${seconds}sn`;
            } else if (this.currentLang === 'ru') {
                timeStr = `${hours}ч ${minutes}м ${seconds}с`;
            } else {
                timeStr = `${hours}h ${minutes}m ${seconds}s`;
            }
            
            metaEl.textContent = `${this.t('daily-bonus-next')}: ${timeStr}`;
        }
    }

    async buyTableSkin(key) {
        if (this.tableSkinBusy) return;
        const skinKey = String(key || '').trim();
        if (!skinKey) return;
        this.tableSkinBusy = true;
        try {
            const result = await this.account.purchaseTableSkin(skinKey);
            if (result?.wallet) {
                this.accountDetails = {
                    ...(this.accountDetails || {}),
                    wallet: result.wallet,
                    profile: {
                        ...(this.accountDetails?.profile || {})
                    },
                    player: {
                        ...(this.accountDetails?.player || {})
                    }
                };
                this.accountProfile = {
                    ...(this.accountProfile || {}),
                    coins: result.wallet.balance,
                    wallet: result.wallet
                };
                this.account.setStoredProfile?.(this.accountProfile);
                this.account.setPlatformProfile?.(this.accountProfile);
            }
            await this.loadTableSkinShop();
            this.applyActiveTableSkin();
            this.setAccountProfileTab('skins');
            await this.loadAccountProfile();
            this.renderAccountModal();
            this.syncStartAuthButton();
            if (document.getElementById('cosmetics-shop-modal')?.classList.contains('active')) {
                this.renderCosmeticsShopModal();
            }
            this.renderer.showMessage(
                result?.alreadyOwned ? this.t('coin-shop-skin-applied') : this.t('coin-shop-skin-purchased'),
                1800
            );
        } catch (err) {
            this.renderer.showMessage(err.message || this.t('coin-shop-skin-buy-failed'), 2000);
        } finally {
            this.tableSkinBusy = false;
            this.renderCoinShopModal();
        }
    }

    async equipTableSkin(key) {
        if (this.tableSkinBusy) return;
        const skinKey = String(key || '').trim();
        if (!skinKey) return;
        this.tableSkinBusy = true;
        try {
            const result = await this.account.equipTableSkin(skinKey);
            this.accountProfile = {
                ...(this.accountProfile || {}),
                tableSkinKey: result?.equippedKey || skinKey
            };
            this.account.setStoredProfile?.(this.accountProfile);
            this.account.setPlatformProfile?.(this.accountProfile);
            this.accountDetails = {
                ...(this.accountDetails || {}),
                profile: {
                    ...(this.accountDetails?.profile || {}),
                    tableSkinKey: this.accountProfile.tableSkinKey
                },
                player: {
                    ...(this.accountDetails?.player || {}),
                    tableSkinKey: this.accountProfile.tableSkinKey
                }
            };
            await this.loadTableSkinShop();
            this.applyActiveTableSkin();
            this.renderAccountModal();
            this.syncStartAuthButton();
            if (document.getElementById('cosmetics-shop-modal')?.classList.contains('active')) {
                this.renderCosmeticsShopModal();
            }
            this.renderer.showMessage(this.t('coin-shop-skin-applied'), 1800);
        } catch (err) {
            this.renderer.showMessage(err.message || this.t('coin-shop-skin-equip-failed'), 2000);
        } finally {
            this.tableSkinBusy = false;
            this.renderCoinShopModal();
        }
    }

    async equipDefaultTableSkin() {
        if (this.tableSkinBusy) return;
        this.tableSkinBusy = true;
        try {
            const result = await this.account.equipDefaultTableSkin();
            this.accountProfile = {
                ...(this.accountProfile || {}),
                tableSkinKey: result?.equippedKey || null
            };
            this.account.setStoredProfile?.(this.accountProfile);
            this.account.setPlatformProfile?.(this.accountProfile);
            this.accountDetails = {
                ...(this.accountDetails || {}),
                profile: {
                    ...(this.accountDetails?.profile || {}),
                    tableSkinKey: null
                },
                player: {
                    ...(this.accountDetails?.player || {}),
                    tableSkinKey: null
                }
            };
            await this.loadTableSkinShop();
            this.applyActiveTableSkin();
            this.renderAccountModal();
            this.syncStartAuthButton();
            if (document.getElementById('cosmetics-shop-modal')?.classList.contains('active')) {
                this.renderCosmeticsShopModal();
            }
            this.renderer.showMessage(this.t('coin-shop-skin-applied'), 1800);
        } catch (err) {
            this.renderer.showMessage(err.message || this.t('coin-shop-skin-equip-failed'), 2000);
        } finally {
            this.tableSkinBusy = false;
        }
    }

    syncStartAuthGate() {
        const startScreen = document.getElementById('start-screen');
        if (!startScreen) return;
        if (!this.authResolved) {
            startScreen.classList.add('auth-checking');
            startScreen.classList.remove('auth-required');
            return;
        }
        const isAuthed = this.hasAuthenticatedAccount();
        startScreen.classList.remove('auth-checking');
        startScreen.classList.toggle('auth-required', !isAuthed);
        if (!isAuthed) {
            this.renderDailyBonusCard('syncStartAuthGate:guest');
        }
        if (!isAuthed) {
            this.showStartModal(null);
            this.closeAccountModal();
            this.closeCoinShopModal();
            this.closeCosmeticsShopModal();
        }
    }

    enterAuthenticatedHome(details = null) {
        if (details) {
            this.accountDetails = details;
            this.accountProfile = details.profile || details.user || this.accountProfile || { name: 'Player', provider: 'better-auth' };
        }
        this.accountOnline = true;
        this.accountMode = 'profile';
        this.applyActiveTableSkin();
        this.closeAccountModal();
        this.closeCosmeticsShopModal();
        this.showStartModal(null);
        this.renderAccountModal();
        this.syncStartAuthButton();
        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            startScreen.classList.add('active');
            startScreen.classList.remove('auth-required');
        }
        this.loadDailyBonusStatus();
        startMenuMusic();
    }

    syncAccountUiChrome() {
        const closeButton = document.getElementById('account-modal-close');
        if (closeButton) {
            closeButton.textContent = '\u00d7';
            closeButton.title = this.t('modal-close');
            closeButton.setAttribute('aria-label', this.t('modal-close'));
        }

        const coinShopCloseButton = document.getElementById('coin-shop-modal-close');
        if (coinShopCloseButton) {
            coinShopCloseButton.textContent = '\u00d7';
            coinShopCloseButton.title = this.t('modal-close');
            coinShopCloseButton.setAttribute('aria-label', this.t('modal-close'));
        }

        const cosmeticsShopCloseButton = document.getElementById('cosmetics-shop-modal-close');
        if (cosmeticsShopCloseButton) {
            cosmeticsShopCloseButton.textContent = '\u00d7';
            cosmeticsShopCloseButton.title = this.t('modal-close');
            cosmeticsShopCloseButton.setAttribute('aria-label', this.t('modal-close'));
        }

        const leaderboardCloseButton = document.getElementById('leaderboard-modal-close');
        if (leaderboardCloseButton) {
            leaderboardCloseButton.textContent = '\u00d7';
            leaderboardCloseButton.title = this.t('modal-close');
            leaderboardCloseButton.setAttribute('aria-label', this.t('modal-close'));
        }

        const friendsCloseButton = document.getElementById('friends-modal-close');
        if (friendsCloseButton) {
            friendsCloseButton.textContent = '\u00d7';
            friendsCloseButton.title = this.t('modal-close');
            friendsCloseButton.setAttribute('aria-label', this.t('modal-close'));
        }

        const socialCenterCloseButton = document.getElementById('social-center-modal-close');
        if (socialCenterCloseButton) {
            socialCenterCloseButton.textContent = '\u00d7';
            socialCenterCloseButton.title = this.t('modal-close');
            socialCenterCloseButton.setAttribute('aria-label', this.t('modal-close'));
        }

        const playerProfileCloseButton = document.getElementById('player-profile-modal-close');
        if (playerProfileCloseButton) {
            playerProfileCloseButton.textContent = '\u00d7';
            playerProfileCloseButton.title = this.t('modal-close');
            playerProfileCloseButton.setAttribute('aria-label', this.t('modal-close'));
        }

        const soloModalCloseButton = document.getElementById('solo-modal-close');
        if (soloModalCloseButton) {
            soloModalCloseButton.textContent = '\u00d7';
            soloModalCloseButton.title = this.t('modal-close');
            soloModalCloseButton.setAttribute('aria-label', this.t('modal-close'));
        }

        const placeholders = [
            ['account-name-modal-input', this.t('placeholder-player-name')]
        ];

        placeholders.forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) input.setAttribute('placeholder', value);
        });

    }

    setAccountMode(mode) {
        this.accountMode = mode === 'profile' ? 'profile' : 'login';
        this.renderAccountModal();
    }

    setAccountProfileTab(tab) {
        this.accountProfileTab = tab === 'gifts' ? tab : 'skins';
        this.renderAccountModal();
    }

    syncAccountProfileTabs() {
        const tabs = document.getElementById('account-profile-tabs');
        if (!tabs) return;
        const buttons = Array.from(tabs.querySelectorAll('[data-profile-tab]'));
        const activeTab = this.hasAuthenticatedAccount() ? (this.accountProfileTab || 'skins') : 'skins';
        buttons.forEach((button) => {
            const isActive = button.dataset.profileTab === activeTab;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        const giftsPanel = document.getElementById('account-gifts-panel');
        const skinsPanel = document.getElementById('account-skins-panel');
        if (giftsPanel) giftsPanel.classList.toggle('is-hidden', activeTab !== 'gifts');
        if (skinsPanel) skinsPanel.classList.toggle('is-hidden', activeTab !== 'skins');
    }

    setupMobileAuthResume() {
        if (!window.Capacitor) return;
        const resume = () => {
            void this.resumePendingMobileAuth();
        };
        window.addEventListener('focus', resume);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                resume();
            }
        });
    }

    async resumePendingMobileAuth() {
        if (!this.mobileAuthPending) return;
        try {
            const details = await this.account.bootstrap();
            if (details?.profile) {
                this.mobileAuthPending = false;
                this.enterAuthenticatedHome(details);
                this.renderer.showMessage(this.t('account-login'), 1500);
            }
        } catch (error) {
            debugLog('Mobile auth resume check failed:', error);
        }
    }

    async openExternalAuthUrl(url) {
        const target = String(url || '').trim();
        if (!target) return;
        if (!window.Capacitor) {
            window.location.assign(target);
            return;
        }

        this.mobileAuthPending = true;
        this.setAccountStatus(this.t('account-login-required'));
        try {
            const dominoBrowser = window.Capacitor?.Plugins?.DominoBrowser;
            if (dominoBrowser?.open) {
                await dominoBrowser.open({ url: target });
                return;
            }

            const browser = window.Capacitor?.Plugins?.Browser;
            if (browser?.open) {
                await browser.open({ url: target });
                return;
            }
        } catch (error) {
            debugLog('Capacitor Browser open failed:', error);
        }

        window.location.href = target;
    }

    async startGoogleNativeSignIn() {
        if (!window.Capacitor) {
            return false;
        }
        const plugin = window.Capacitor?.Plugins?.DominoGoogleAuth;
        if (!plugin?.signIn) {
            return false;
        }

        const status = await this.account.getPlatformStatus().catch(() => null);
        const serverClientId = String(status?.googleClientId || '').trim();
        if (!serverClientId) {
            throw new Error('Google sign-in is not configured on the server');
        }

        const result = await plugin.signIn({ serverClientId });
        const idToken = String(result?.idToken || '').trim();
        if (!idToken) {
            throw new Error('Google sign-in did not return an ID token');
        }

        await this.account.platformRequest('/auth/sign-in/social', {
            method: 'POST',
            body: {
                provider: 'google',
                idToken: {
                    token: idToken,
                    accessToken: String(result?.accessToken || '').trim() || undefined
                }
            }
        });

        const details = await this.account.bootstrap();
        if (details?.profile) {
            this.enterAuthenticatedHome(details);
            this.renderer.showMessage(this.t('account-login'), 1500);
            return true;
        }

        throw new Error('Unable to complete Google sign-in');
    }

    startGoogleAccountSignIn() {
        void (async () => {
            try {
                this.setAccountStatus('');
                if (window.Capacitor) {
                    try {
                        const nativeDone = await this.startGoogleNativeSignIn();
                        if (nativeDone) {
                            return;
                        }
                        throw new Error('Google native sign-in plugin is unavailable in this build');
                    } catch (nativeError) {
                        debugLog('Native Google sign-in failed:', nativeError);
                        this.setAccountStatus(nativeError?.message || this.t('login-failed'));
                        return;
                    }
                }
        const callbackURL = this.getAuthCallbackUrl();
        const result = await this.account.startGoogleSignIn(callbackURL);
        if (result?.url) {
            try {
                sessionStorage.setItem('dominoAuthPending', '1');
            } catch (_) {}
            await this.openExternalAuthUrl(result.url);
            return;
        }
                if (result?.redirect === false && result?.token) {
                    this.enterAuthenticatedHome(result);
                    void this.loadAccountProfile();
                    this.renderer.showMessage(this.t('account-login'), 1500);
                    return;
                }
                throw new Error('Google sign-in did not return a redirect URL');
            } catch (err) {
                this.setAccountStatus(err?.message || this.t('login-failed'));
            }
        })();
    }

    startAppleAccountSignIn() {
        const callbackURL = this.getAuthCallbackUrl();
        void (async () => {
            try {
                this.setAccountStatus('');
                const result = await this.account.startAppleSignIn(callbackURL);
                if (result?.url) {
                    await this.openExternalAuthUrl(result.url);
                    return;
                }
                if (result?.redirect === false && result?.token) {
                    this.enterAuthenticatedHome(result);
                    void this.loadAccountProfile();
                    this.renderer.showMessage(this.t('account-login'), 1500);
                    return;
                }
                throw new Error('Apple sign-in is not available right now');
            } catch (err) {
                this.setAccountStatus(err?.message || this.t('login-failed'));
            }
        })();
    }

    getAuthCallbackUrl() {
        const isLocalHost = typeof window !== 'undefined'
            && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        if (window.Capacitor) {
            return `${String(globalThis.DOMINO_ENDPOINTS?.GAME_HTTP_BASE || 'https://gamed.simplesoft.az').replace(/\/$/, '')}/mobile-auth-complete.html`;
        }
        if (isLocalHost) {
            return `${window.location.origin}${window.location.pathname}${window.location.search}`;
        }
        return `${window.location.origin}/`;
    }

    async saveAccountDisplayName() {
        const input = document.getElementById('account-name-modal-input');
        const nextName = this.sanitizeName(input?.value || '', '');
        if (!nextName) {
            this.setAccountStatus(this.t('account-name-required'));
            return;
        }
        try {
            await this.account.updateDisplayName(nextName);
            await this.loadAccountProfile();
            const modalStatus = document.getElementById('account-name-modal-status');
            if (modalStatus) modalStatus.textContent = this.t('account-name-saved');
            this.setAccountStatus(this.t('account-name-saved'));
            this.closeNameEditModal();
        } catch (err) {
            const modalStatus = document.getElementById('account-name-modal-status');
            if (modalStatus) modalStatus.textContent = err?.message || this.t('account-server-unavailable');
            this.setAccountStatus(err?.message || this.t('account-server-unavailable'));
        }
    }

    ensureAuthIconMarkup() {
        const iconTargets = [
            ['account-btn', 'user'],
            ['landing-google-login-btn', 'google'],
            ['landing-apple-login-btn', 'apple'],
            ['google-login-btn', 'google'],
            ['apple-login-btn', 'apple'],
            ['account-edit-name-btn', 'pencil'],
            ['account-edit-avatar-btn', 'camera'],
            ['account-logout-btn', 'logout']
        ];
        iconTargets.forEach(([id, key]) => {
            const target = document.getElementById(id);
            if (!target) return;
            const existing = target.querySelector('[data-auth-icon]');
            if (existing) {
                existing.innerHTML = AUTH_ICON_SVGS[key] || '';
                return;
            }
            const legacyIcon = target.querySelector('.auth-icon');
            if (legacyIcon) {
                legacyIcon.dataset.authIcon = key;
                legacyIcon.innerHTML = AUTH_ICON_SVGS[key] || '';
                return;
            }
            if (target.classList.contains('icon-btn')) {
                target.innerHTML = `<span class="auth-icon auth-icon-${key}" data-auth-icon="${key}" aria-hidden="true">${AUTH_ICON_SVGS[key] || ''}</span>`;
                return;
            }
            const labelNode = target.querySelector('span:last-child');
            const icon = document.createElement('span');
            icon.className = `auth-icon auth-icon-${key}`;
            icon.dataset.authIcon = key;
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = AUTH_ICON_SVGS[key] || '';
            if (labelNode && labelNode.parentNode === target) {
                target.insertBefore(icon, labelNode);
            } else {
                target.insertBefore(icon, target.firstChild || null);
            }
        });
    }

    ensureSocialIconMarkup() {
        const target = document.getElementById('open-social-btn');
        if (!target) return;
        const icon = target.querySelector('[data-social-icon]') || target.querySelector('.start-social-icon');
        const markup = SOCIAL_ICON_SVGS.messages || '';
        if (icon) {
            icon.innerHTML = markup;
            return;
        }
        const existingLabel = target.querySelector('.start-compact-label');
        const existingBadge = target.querySelector('.start-social-badge');
        target.innerHTML = '';
        const iconSpan = document.createElement('span');
        iconSpan.className = 'start-social-icon';
        iconSpan.dataset.socialIcon = 'messages';
        iconSpan.setAttribute('aria-hidden', 'true');
        iconSpan.innerHTML = markup;
        target.appendChild(iconSpan);
        if (existingLabel) {
            target.appendChild(existingLabel);
        } else {
            const label = document.createElement('span');
            label.className = 'start-compact-label';
            label.textContent = this.t('social-open');
            target.appendChild(label);
        }
        if (existingBadge) {
            target.appendChild(existingBadge);
        } else {
            const badge = document.createElement('span');
            badge.className = 'start-social-badge is-hidden';
            badge.setAttribute('aria-hidden', 'true');
            target.appendChild(badge);
        }
    }

    updateGlobalSocialBadge() {
        const button = document.getElementById('open-social-btn');
        const badge = button?.querySelector('.start-social-badge') || null;
        const mailBadge = document.getElementById('social-mail-unread-badge');
        const friendsBadge = document.getElementById('social-friends-unread-badge');
        const toNonNegativeInt = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
        };
        if (!this.hasAuthenticatedAccount()) {
            this._mainSocialBadgeCount = 0;
            this._mainSocialBadgeVisible = false;
            this._socialCenterBadgeCount = 0;
            [badge, mailBadge, friendsBadge].forEach((target) => {
                if (!target) return;
                target.textContent = '';
                target.classList.add('is-hidden');
                target.removeAttribute('title');
            });
            this.renderSocialDebugPanel();
            return;
        }
        const serverCount = toNonNegativeInt(this.socialSummary?.totalUnreadCount || 0);
        const serverChatCount = toNonNegativeInt(this.socialSummary?.chatUnreadCount || 0);
        const serverFriendCount = toNonNegativeInt(this.socialSummary?.friendRequestCount || 0);
        const serverInviteCount = toNonNegativeInt(this.socialSummary?.inviteUnreadCount || 0);
        const unreadInboxItems = Array.isArray(this.socialInboxState?.items)
            ? this.socialInboxState.items.filter((item) => {
                const status = String(item?.status || '').trim().toLowerCase();
                const type = String(item?.type || '').trim().toLowerCase();
                return status === 'unread' && type !== 'direct_message' && type !== 'direct_message_thread_hidden';
            }).length
            : 0;
        const unreadThreads = Array.isArray(this.socialInboxState?.threads)
            ? this.socialInboxState.threads.reduce((sum, thread) => sum + toNonNegativeInt(thread?.unreadCount || 0), 0)
            : 0;
        const incomingFriends = Array.isArray(this.friendHub?.incoming) ? this.friendHub.incoming.length : 0;
        const playInviteCounts = this.getPlayInviteCounts();
        const incomingInvites = toNonNegativeInt(playInviteCounts.incoming);
        const outgoingInvites = toNonNegativeInt(playInviteCounts.outgoing);
        const localUnread = Math.max(0, unreadInboxItems + unreadThreads);
        const pendingInvitesCount = Math.max(0, incomingFriends + incomingInvites + outgoingInvites);
        const count = Math.max(serverCount, localUnread, pendingInvitesCount);
        const centerMailCount = Math.max(serverChatCount + serverInviteCount, unreadInboxItems + unreadThreads + incomingInvites + outgoingInvites);
        const centerFriendsCount = Math.max(serverFriendCount, incomingFriends);
        this._mainSocialBadgeCount = count;
        this._mainSocialBadgeVisible = count > 0;
        this._socialCenterBadgeCount = Math.max(centerMailCount, centerFriendsCount);
        const applyBadge = (target, value, titleKey = 'social-badge-label') => {
            if (!target) return;
            const safeValue = toNonNegativeInt(value);
            if (safeValue > 0) {
                target.textContent = safeValue > 9 ? '9+' : String(safeValue);
                target.classList.remove('is-hidden');
                target.title = `${this.t(titleKey)}: ${safeValue}`;
            } else {
                target.textContent = '';
                target.classList.add('is-hidden');
                target.removeAttribute('title');
            }
        };
        applyBadge(badge, count);
        applyBadge(mailBadge, centerMailCount);
        applyBadge(friendsBadge, centerFriendsCount);
        this.renderSocialDebugPanel();
    }

    updateSocialCenterBadge() {
        this.updateGlobalSocialBadge();
    }

    removeLegacyNameControls() {
        document.getElementById('account-display-name-input')?.closest('.settings-grid')?.remove();
        document.getElementById('account-save-name-btn')?.remove();
    }

    ensureNameEditModal() {
        if (document.getElementById('account-name-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'account-name-modal';
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <section class="modal-card modal-card-small">
                <div class="modal-header">
                    <div>
                        <p class="section-kicker" data-i18n="account-edit-name"></p>
                        <h2 data-i18n="account-change-name-title"></h2>
                        <p class="modal-desc" data-i18n="account-change-name-desc"></p>
                    </div>
                    <button class="btn btn-action modal-close-btn" id="account-name-modal-close" data-i18n="modal-close"></button>
                </div>
                <form id="account-name-form" class="settings-grid compact-grid">
                    <div class="settings-group field-span-2">
                        <label data-i18n="account-name"></label>
                        <input type="text" id="account-name-modal-input" maxlength="24" placeholder="">
                    </div>
                    <div class="settings-group field-span-2">
                        <div id="account-name-modal-status" class="room-summary"></div>
                    </div>
                    <div class="modal-footer modal-footer-split field-span-2">
                        <button class="btn btn-primary btn-large modal-primary-btn" id="account-name-modal-save" type="submit" data-i18n="account-save-name"></button>
                        <button class="btn btn-menu modal-close-btn modal-secondary-btn" id="account-name-modal-cancel" type="button" data-i18n="account-name-cancel"></button>
                    </div>
                </form>
            </section>`;
        document.body.appendChild(modal);
        this.setLanguage(this.currentLang);
        const nameInput = document.getElementById('account-name-modal-input');
        if (nameInput) nameInput.placeholder = this.t('placeholder-player-name');
    }

    openNameEditModal() {
        this.ensureNameEditModal();
        this.removeLegacyNameControls();
        const modal = document.getElementById('account-name-modal');
        if (!modal) return;
        const input = document.getElementById('account-name-modal-input');
        const status = document.getElementById('account-name-modal-status');
        if (input) input.value = this.accountProfile?.name || '';
        if (status) status.textContent = '';
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.style.zIndex = '24000';
        modal.classList.add('active');
        input?.focus?.();
        input?.select?.();
    }

    closeNameEditModal() {
        document.getElementById('account-name-modal')?.classList.remove('active');
    }

    ensureAvatarEditModal() {
        if (document.getElementById('account-avatar-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'account-avatar-modal';
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <section class="modal-card modal-card-small">
                <div class="modal-header">
                    <div>
                        <p class="section-kicker" data-i18n="account-edit-avatar"></p>
                        <h2 data-i18n="account-change-avatar-title"></h2>
                        <p class="modal-desc" data-i18n="account-change-avatar-desc"></p>
                    </div>
                    <button class="btn btn-action modal-close-btn" id="account-avatar-modal-close" data-i18n="modal-close"></button>
                </div>
                <form id="account-avatar-form" class="settings-grid compact-grid">
                    <div class="settings-group field-span-2">
                        <div class="account-avatar-picker">
                            <div class="account-avatar account-avatar-preview" id="account-avatar-modal-preview"></div>
                            <div class="account-avatar-picker-copy">
                                <strong data-i18n="account-change-avatar-current"></strong>
                                <span id="account-avatar-modal-status" class="modal-desc"></span>
                            </div>
                        </div>
                    </div>
                    <div class="settings-group field-span-2">
                        <input type="file" id="account-avatar-modal-input" accept="image/*" class="is-hidden">
                        <button class="btn btn-menu" id="account-avatar-modal-pick" type="button" data-i18n="account-avatar-pick"></button>
                    </div>
                    <div class="modal-footer modal-footer-split field-span-2">
                        <button class="btn btn-primary btn-large modal-primary-btn" id="account-avatar-modal-save" type="button" data-i18n="account-avatar-save"></button>
                        <button class="btn btn-menu modal-close-btn modal-secondary-btn" id="account-avatar-modal-cancel" type="button" data-i18n="account-name-cancel"></button>
                    </div>
                </form>
            </section>`;
        document.body.appendChild(modal);
        this.setLanguage(this.currentLang);
        document.getElementById('account-avatar-modal-pick')?.addEventListener('click', () => {
            document.getElementById('account-avatar-modal-input')?.click();
        });
        document.getElementById('account-avatar-modal-save')?.addEventListener('click', () => {
            void this.saveAccountAvatar();
        });
        document.getElementById('account-avatar-modal-input')?.addEventListener('change', async (event) => {
            const input = event.currentTarget;
            const file = input?.files?.[0];
            if (!file) return;
            try {
                const dataUrl = await this.createAvatarDataUrl(file);
                this.pendingAvatarMode = 'custom';
                this.pendingAvatarDataUrl = dataUrl;
                this.syncAvatarModalPreview();
                this.setAccountStatus('');
            } catch (err) {
                this.pendingAvatarMode = 'keep';
                this.pendingAvatarDataUrl = null;
                this.setAccountStatus(err?.message || this.t('account-server-unavailable'));
            } finally {
                if (input) input.value = '';
            }
        });
    }

    syncAvatarModalPreview() {
        const preview = document.getElementById('account-avatar-modal-preview');
        const status = document.getElementById('account-avatar-modal-status');
        const profile = this.accountProfile || {};
        const avatarUrl = this.pendingAvatarMode === 'custom'
            ? this.pendingAvatarDataUrl
            : this.pendingAvatarMode === 'clear'
                ? profile?.providerImage || null
                : profile?.image || profile?.providerImage || null;
        if (preview) {
            preview.classList.toggle('has-image', Boolean(avatarUrl));
            preview.innerHTML = '';
            if (avatarUrl) {
                const img = document.createElement('img');
                img.className = 'account-avatar-image';
                img.alt = profile?.name || 'Player avatar';
                img.src = avatarUrl;
                img.referrerPolicy = 'no-referrer';
                img.onerror = () => {
                    img.onerror = null;
                    preview.classList.remove('has-image');
                    preview.innerHTML = '';
                    const initial = document.createElement('span');
                    initial.className = 'account-avatar-initial';
                    initial.textContent = this.getTurnAvatarText?.(profile?.name || profile?.displayName || 'P') || 'P';
                    preview.appendChild(initial);
                };
                preview.appendChild(img);
            } else {
                const initial = document.createElement('span');
                initial.className = 'account-avatar-initial';
                initial.textContent = (profile?.name || 'D').slice(0, 1).toUpperCase();
                preview.appendChild(initial);
            }
        }
        if (status) {
            const sourceKey = this.pendingAvatarMode === 'custom'
                ? 'account-avatar-source-custom'
                : this.pendingAvatarMode === 'clear'
                    ? profile?.providerImage
                        ? 'account-avatar-source-google'
                        : 'account-avatar-source-empty'
                    : profile?.avatarUrl
                        ? 'account-avatar-source-custom'
                        : profile?.providerImage
                            ? 'account-avatar-source-google'
                            : 'account-avatar-source-empty';
            status.textContent = this.t(sourceKey);
        }
    }

    async createAvatarDataUrl(file) {
        if (!file) throw new Error(this.t('account-avatar-invalid'));
        if (!String(file.type || '').startsWith('image/')) {
            throw new Error(this.t('account-avatar-invalid'));
        }

        const sourceUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error(this.t('account-avatar-invalid')));
            reader.readAsDataURL(file);
        });

        const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(this.t('account-avatar-invalid')));
            img.src = sourceUrl;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error(this.t('account-avatar-invalid'));

        const renderAvatar = (size, quality) => {
            canvas.width = size;
            canvas.height = size;
            ctx.clearRect(0, 0, size, size);
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, 0, size, size);

            const scale = Math.max(size / image.width, size / image.height);
            const drawWidth = image.width * scale;
            const drawHeight = image.height * scale;
            const offsetX = (size - drawWidth) / 2;
            const offsetY = (size - drawHeight) / 2;
            ctx.save();
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
            ctx.restore();
            return canvas.toDataURL('image/jpeg', quality);
        };

        const sizeSteps = [1024, 768, 512, 384, 256];
        const qualitySteps = [0.92, 0.84, 0.76, 0.68];
        let lastCandidate = '';
        for (const size of sizeSteps) {
            for (const quality of qualitySteps) {
                const candidate = renderAvatar(size, quality);
                lastCandidate = candidate;
                if (candidate.length <= 100000) {
                    return candidate;
                }
            }
        }

        return lastCandidate;
    }

    async saveAccountAvatar() {
        try {
            if (this.pendingAvatarMode === 'keep') {
                this.closeAvatarEditModal();
                return;
            }
            const avatarUrl = this.pendingAvatarMode === 'custom' ? this.pendingAvatarDataUrl : null;
            const result = await this.account.updateAvatar(avatarUrl);
            const normalized = result?.profile ? result : this.account.getStoredProfile() || null;
            if (normalized) {
                this.accountProfile = normalized.profile || this.accountProfile;
                this.accountDetails = normalized;
                this.accountOnline = this.hasAuthenticatedAccount(this.accountProfile);
                this.renderAccountModal();
                this.syncStartAuthButton();
            } else {
                await this.loadAccountProfile();
            }
            this.setAccountStatus(this.t('account-avatar-saved'));
            this.closeAvatarEditModal();
        } catch (err) {
            const modalStatus = document.getElementById('account-avatar-modal-status');
            if (modalStatus) modalStatus.textContent = err?.message || this.t('account-server-unavailable');
            this.setAccountStatus(err?.message || this.t('account-server-unavailable'));
        }
    }

    openAvatarEditModal() {
        this.ensureAvatarEditModal();
        const modal = document.getElementById('account-avatar-modal');
        if (!modal) return;
        this.pendingAvatarMode = this.accountProfile?.avatarUrl ? 'custom' : 'keep';
        this.pendingAvatarDataUrl = this.accountProfile?.avatarUrl || null;
        this.pendingAvatarProfile = this.accountProfile || null;
        this.syncAvatarModalPreview();
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.style.zIndex = '24000';
        modal.classList.add('active');
        document.getElementById('account-avatar-modal-pick')?.focus?.();
    }

    closeAvatarEditModal() {
        document.getElementById('account-avatar-modal')?.classList.remove('active');
    }

    getModeLabel(mode = this.getSelectedGameMode()) {
        const normalizedMode = mode === 'classic101' ? 'classic101' : 'telefon';
        return this.t(normalizedMode === 'classic101' ? 'leaderboard-mode-101' : 'leaderboard-mode-telefon');
    }

    getProfileModeStats(profile, mode = 'telefon') {
        const normalizedMode = mode === 'classic101' ? 'classic101' : 'telefon';
        const bucket = profile?.ratings?.[normalizedMode]
            || (normalizedMode === 'telefon' ? profile?.stats : null)
            || {};
        return {
            rating: Number(bucket.rating ?? 1000),
            points: Number(bucket.points ?? 0),
            wins: Number(bucket.wins ?? 0),
            losses: Number(bucket.losses ?? 0),
            draws: Number(bucket.draws ?? 0),
            matchesPlayed: Number(bucket.matchesPlayed ?? 0),
            currentStreak: Number(bucket.currentStreak ?? 0),
            bestStreak: Number(bucket.bestStreak ?? 0),
            titleCode: String(bucket.titleCode || 'rookie').trim() || 'rookie'
        };
    }

    syncLeaderboardModeUI(mode = this.leaderboardGameMode || this.getSelectedGameMode()) {
        const modal = document.getElementById('leaderboard-modal');
        if (!modal) return;
        const titleButton = document.getElementById('open-leaderboard-btn');
        if (titleButton) {
            const label = this.t('leaderboard-title');
            titleButton.textContent = label;
            titleButton.setAttribute('aria-label', label);
            titleButton.title = label;
        }
    }

    ensureAccountModeStats() {
        const profilePanel = document.getElementById('account-profile-panel');
        const statsGrid = document.getElementById('account-stats-grid');
        if (!profilePanel || !statsGrid) return null;
        let container = document.getElementById('account-mode-stats');
        if (!container) {
            container = document.createElement('div');
            container.className = 'account-mode-stats';
            container.id = 'account-mode-stats';
            profilePanel.insertBefore(container, statsGrid.nextElementSibling || null);
        }
        return container;
    }

    syncAccountModeStats(profile = this.accountProfile) {
        const container = this.ensureAccountModeStats();
        if (!container) return;
        const modeItems = [
            { mode: 'telefon', labelKey: 'leaderboard-mode-telefon' },
            { mode: 'classic101', labelKey: 'leaderboard-mode-101' }
        ];
        container.innerHTML = '';
        modeItems.forEach(({ mode, labelKey }) => {
            const stats = this.getProfileModeStats(profile, mode);
            const card = document.createElement('div');
            card.className = 'account-stat-card account-mode-stat-card';
            const label = document.createElement('span');
            label.textContent = this.t(labelKey);
            const rating = document.createElement('strong');
            rating.textContent = String(stats.rating ?? 1000);
            const meta = document.createElement('div');
            meta.className = 'account-mode-stat-meta';
            meta.textContent = `${this.t('leaderboard-games')}: ${String(stats.matchesPlayed ?? 0)} · ${this.t('leaderboard-wins')}: ${String(stats.wins ?? 0)} · ${this.t('leaderboard-losses')}: ${String(stats.losses ?? 0)}`;
            card.appendChild(label);
            card.appendChild(rating);
            card.appendChild(meta);
            container.appendChild(card);
        });
    }

    async loadLeaderboard(scope = this.leaderboardScope || 'overall', gameMode = this.leaderboardGameMode || this.getSelectedGameMode()) {
        const list = document.getElementById('leaderboard-list');
        const tabs = document.getElementById('leaderboard-tabs');
        if (!list) return;
        this.leaderboardScope = scope === 'weekly' || scope === 'friends' ? scope : 'overall';
        this.leaderboardGameMode = gameMode === 'classic101' ? 'classic101' : 'telefon';
        this.syncLeaderboardModeUI(this.leaderboardGameMode);
        if (tabs) {
            tabs.querySelectorAll('[data-leaderboard-scope]').forEach((button) => {
                const isActive = button.dataset.leaderboardScope === this.leaderboardScope;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
        }
        this.setSummaryMessage(list, this.t('account-profile-loading'));
        try {
            if (this.leaderboardScope === 'friends' && !this.hasAuthenticatedAccount()) {
                this.setSummaryMessage(list, this.t('friends-login-required'));
                return;
            }
            const rows = await this.account.getLeaderboard(20, this.leaderboardScope, this.leaderboardGameMode);
            this.accountOnline = true;
            if (!rows.length) {
                this.setSummaryMessage(list, this.t('leaderboard-empty'));
                return;
            }
            list.innerHTML = '';
            rows.forEach((row) => {
                const item = document.createElement('div');
                item.className = 'leaderboard-card';
                if (row.isSelf) item.classList.add('is-self');
                const top = document.createElement('div');
                top.className = 'leaderboard-card-top';
                const rank = document.createElement('div');
                rank.className = 'leaderboard-rank';
                rank.textContent = `#${row.rank}`;
                const copy = document.createElement('div');
                copy.className = 'leaderboard-card-copy';
                const nameBtn = document.createElement('button');
                nameBtn.type = 'button';
                nameBtn.className = 'leaderboard-name-btn';
                nameBtn.textContent = row.displayName || row.name || 'Player';
                if (row.id) {
                    nameBtn.addEventListener('click', () => this.openPlayerProfileModal({ id: row.id, displayName: row.displayName }));
                } else {
                    nameBtn.disabled = true;
                }
                const meta = document.createElement('div');
                meta.className = 'leaderboard-card-meta';
                const rating = document.createElement('span');
                rating.className = 'leaderboard-card-rating';
                rating.textContent = `${this.t('leaderboard-rating')}: ${String(row.rating ?? 1000)}`;
                if (this.leaderboardScope === 'weekly' && Number(row.weeklyRatingDelta || 0)) {
                    const week = document.createElement('span');
                    week.className = 'leaderboard-card-week';
                    const delta = Number(row.weeklyRatingDelta || 0);
                    week.textContent = `${delta >= 0 ? '+' : ''}${delta} ${this.t('leaderboard-week-delta')}`;
                    meta.appendChild(week);
                }
                copy.appendChild(nameBtn);
                const games = document.createElement('span');
                games.textContent = `${this.t('leaderboard-games')}: ${String(row.matchesPlayed ?? 0)}`;
                const wins = document.createElement('span');
                wins.textContent = `${this.t('leaderboard-wins')}: ${String(row.wins ?? 0)}`;
                meta.appendChild(games);
                meta.appendChild(document.createTextNode(' · '));
                meta.appendChild(wins);
                if (row.isSelf) {
                    const selfTag = document.createElement('span');
                    selfTag.className = 'leaderboard-self-tag';
                    selfTag.textContent = this.t('leaderboard-self');
                    meta.appendChild(document.createTextNode(' · '));
                    meta.appendChild(selfTag);
                }
                top.appendChild(rank);
                top.appendChild(copy);
                top.appendChild(rating);
                item.appendChild(top);
                list.appendChild(item);
            });
        } catch (err) {
            this.accountOnline = false;
            this.setSummaryMessage(list, err?.message || this.t('leaderboard-load-failed'));
        }
    }

    scheduleFriendsSearch() {
        if (this._friendsSearchTimer) {
            clearTimeout(this._friendsSearchTimer);
            this._friendsSearchTimer = null;
        }
        this._friendsSearchTimer = window.setTimeout(() => {
            this._friendsSearchTimer = null;
            void this.searchFriendsPage();
        }, 300);
    }

    normalizePresenceKey(value) {
        return String(value || '').trim().toLowerCase();
    }

    getPresenceKeysForPlayer(player = {}) {
        const displayName = String(player?.displayName || '').trim();
        const displayNameParts = displayName ? displayName.split(/\s+/).filter(Boolean) : [];
        const shortDisplayName = displayNameParts[0] || '';
        return [
            this.normalizePresenceKey(player?.playerId),
            this.normalizePresenceKey(player?.userId),
            this.normalizePresenceKey(player?.sessionId),
            this.normalizePresenceKey(player?.id),
            this.normalizePresenceKey(displayName),
            this.normalizePresenceKey(shortDisplayName)
        ].filter(Boolean);
    }

    isFriendOnline(friend, presenceMap = this.friendPresenceMap) {
        return this.getFriendPresenceStatus(friend, presenceMap) !== 'offline';
    }

    getFriendPresenceEntry(friend, presenceMap = this.friendPresenceMap) {
        const map = presenceMap instanceof Map ? presenceMap : this.friendPresenceMap;
        if (!map?.size) return null;
        for (const key of this.getPresenceKeysForPlayer(friend)) {
            if (!key || !map.has(key)) continue;
            const entry = map.get(key);
            if (entry) return entry;
        }
        return null;
    }

    getFriendPresenceStatus(friend, presenceMap = this.friendPresenceMap) {
        const entry = this.getFriendPresenceEntry(friend, presenceMap);
        if (!entry) return 'offline';
        const rawStatus = String(entry?.status || '').trim().toLowerCase();
        if (rawStatus === 'online' || rawStatus === 'in_game' || rawStatus === 'offline') {
            return rawStatus;
        }
        if (entry?.roomCode) return 'in_game';
        if (entry?.isConnected === false) return 'offline';
        if (entry?.isConnected === true) return 'online';
        return 'offline';
    }

    getFriendPresenceLabel(status) {
        const normalized = String(status || '').trim().toLowerCase();
        if (normalized === 'in_game') return this.t('friend-in-game');
        if (normalized === 'online') return this.t('friend-online');
        return this.t('friend-offline');
    }

    createFriendStatusBadge(statusOrOnline) {
        const status = typeof statusOrOnline === 'string'
            ? String(statusOrOnline).trim().toLowerCase()
            : (statusOrOnline ? 'online' : 'offline');
        const badge = document.createElement('span');
        badge.className = `friend-status-badge${status === 'online' ? ' is-online' : status === 'in_game' ? ' is-in-game' : ''}`;
        badge.textContent = this.getFriendPresenceLabel(status);
        return badge;
    }

    async loadFriendPresenceMap() {
        if (!this.account?.getRealtimeSummary) {
            return this.friendPresenceMap;
        }
        try {
            const summary = await this.account.getRealtimeSummary();
            const players = Array.isArray(summary?.players) ? summary.players : [];
            const map = new Map(this.friendPresenceMap instanceof Map ? this.friendPresenceMap : new Map());
            players.forEach((player) => {
                if (!player) return;
                const normalizedStatus = String(player?.status || '').trim().toLowerCase();
                const nextStatus = normalizedStatus === 'in_game'
                    ? 'in_game'
                    : (player.isConnected === false ? 'offline' : 'online');
                const nextEntry = {
                    ...player,
                    status: nextStatus,
                    isConnected: nextStatus !== 'offline'
                };
                this.getPresenceKeysForPlayer(player).forEach((key) => {
                    if (!key) return;
                    const existing = map.get(key);
                    const existingStatus = String(existing?.status || '').trim().toLowerCase();
                    if (existingStatus === 'in_game' && nextStatus === 'online') return;
                    map.set(key, nextEntry);
                });
            });
            this.friendPresenceMap = map;
            return map;
        } catch {
            return this.friendPresenceMap;
        }
    }

    startOpenRoomsAutoRefresh() {
        this.stopOpenRoomsAutoRefresh();
        this._openRoomsRefreshId = window.setInterval(() => {
            const modal = document.getElementById('open-rooms-modal');
            if (!modal?.classList.contains('active')) return;
            void this.loadOpenRooms();
        }, 12000);
    }

    stopOpenRoomsAutoRefresh() {
        if (this._openRoomsRefreshId) {
            clearInterval(this._openRoomsRefreshId);
            this._openRoomsRefreshId = null;
        }
    }

    getFriendsUiElements() {
        const socialRoot = document.querySelector('#social-center-modal #social-friends-panel');
        const legacyRoot = document.querySelector('#friends-modal .friends-page');
        const socialCenterActive = document.getElementById('social-center-modal')?.classList.contains('active');
        const root = socialCenterActive ? (socialRoot || legacyRoot || document) : (legacyRoot || socialRoot || document);
        const query = (selector) => root?.querySelector(selector) || document.querySelector(selector);
        return {
            root,
            friendsList: query('#friends-list'),
            requestsList: query('#friends-requests-list'),
            searchResults: query('#friends-search-results'),
            searchInput: query('#friends-search-input'),
            incomingInvitesList: document.querySelector('#social-center-modal #social-invites-incoming-list')
                || document.querySelector('#social-invites-incoming-list'),
            sentInvitesList: document.querySelector('#social-center-modal #social-invites-sent-list')
                || document.querySelector('#social-invites-sent-list'),
            legacyInvitesList: query('#social-invites-list')
        };
    }

    async loadFriendsPage(isBackground = false) {
        const {
            friendsList,
            requestsList,
            searchResults,
            searchInput
        } = this.getFriendsUiElements();
        if (!friendsList || !requestsList || !searchResults || !searchInput) return;

        const loggedIn = this.hasAuthenticatedAccount();
        const loading = this.t('account-profile-loading');
        if (!loggedIn) {
            this.setSummaryMessage(friendsList, this.t('friends-login-required'));
            this.setSummaryMessage(requestsList, this.t('friends-login-required'));
            this.setSummaryMessage(searchResults, this.t('friends-login-required'));
            searchInput.disabled = true;
            return;
        }

        if (this._friendsLoadInFlight) {
            return this._friendsLoadInFlight;
        }

        searchInput.disabled = false;
        if (!isBackground) {
            if (!friendsList.children.length) this.setSummaryMessage(friendsList, loading);
            if (!requestsList.children.length) this.setSummaryMessage(requestsList, loading);
            if (!searchResults.children.length) this.setSummaryMessage(searchResults, loading);
        }

        this._friendsLoadInFlight = (async () => {
            try {
                const [friends, leaderboardRows, presenceMap] = await Promise.all([
                    this.account.getFriends(),
                    this.account.getLeaderboard(100).catch(() => []),
                    this.loadFriendPresenceMap().catch(() => new Map())
                ]);
            this.friendHub = friends || { accepted: [], incoming: [], outgoing: [], items: [] };
            this.friendRatingMap = new Map((Array.isArray(leaderboardRows) ? leaderboardRows : []).map((row) => [String(row.id || ''), Number(row.rating ?? 0)]));
            if (presenceMap instanceof Map) {
                this.friendPresenceMap = presenceMap;
            }
            const resolvedPresenceMap = this.friendPresenceMap instanceof Map ? this.friendPresenceMap : new Map();

            // Update friends count header kicker
            const countTitle = document.getElementById('friends-count-title');
            if (countTitle) {
                countTitle.textContent = `${this.t('friends-list-title').toUpperCase()} (${this.friendHub.accepted.length})`;
            }

            friendsList.innerHTML = '';
            if (!this.friendHub.accepted.length) {
                this.setSummaryMessage(friendsList, this.t('friends-empty'));
            } else {
                this.friendHub.accepted.forEach((item) => {
                    const card = document.createElement('div');
                    card.className = 'friend-card premium-social-card';
                    
                    const rating = this.friendRatingMap.get(String(item.friend.id || '')) || 1000;
                    const avatar = this.createPremiumAvatar(item.friend, rating);
                    card.appendChild(avatar);

                    const copy = document.createElement('div');
                    copy.className = 'friend-card-copy';
                    
                    // Clicking on name/info block opens conversation
                    copy.addEventListener('click', () => {
                        void this.openConversationWithPlayer(item.friend);
                    });

                    const name = document.createElement('strong');
                    name.className = 'friend-card-name';
                    name.textContent = item.friend.displayName || 'Player';

                    const presenceStatus = this.getFriendPresenceStatus(item.friend, resolvedPresenceMap);
                    const status = document.createElement('div');
                    status.className = `friend-card-status${presenceStatus === 'online' ? ' is-online' : presenceStatus === 'in_game' ? ' is-in-game' : ' is-offline'}`;
                    status.innerHTML = `<span class="presence-dot"></span>${this.getFriendPresenceLabel(presenceStatus)}`;

                    copy.appendChild(name);
                    copy.appendChild(status);
                    card.appendChild(copy);

                    const action = document.createElement('div');
                    action.className = 'friend-card-actions';

                    const messageBtn = document.createElement('button');
                    messageBtn.className = 'btn btn-menu action-icon-btn message-action-btn';
                    messageBtn.type = 'button';
                    messageBtn.title = this.t('messages-open') || 'Message';
                    messageBtn.setAttribute('aria-label', this.t('messages-open') || 'Message');
                    messageBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4.6 3.8c-.7.6-1.4 0-1.4-.8V17H4a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 4 5.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                        </svg>
                    `;
                    messageBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await this.openConversationWithPlayer(item.friend);
                    });

                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'btn btn-menu action-icon-btn remove-action-btn';
                    removeBtn.type = 'button';
                    removeBtn.title = this.t('friend-remove') || 'Remove';
                    removeBtn.setAttribute('aria-label', this.t('friend-remove') || 'Remove');
                    removeBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M3.5 6h17M9 6V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V6m-5 0h4m-9 0 .6 12.2A2.8 2.8 0 0 0 8.4 21h7.2a2.8 2.8 0 0 0 2.8-2.8L19 6M10 10v6M14 10v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    `;
                    removeBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        removeBtn.disabled = true;
                        try {
                            await this.account.removeFriend(item.id);
                            await this.loadFriendsPage();
                            this.renderer.showMessage(this.t('friends-removed'), 1400);
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('friends-load-failed'), 1800);
                        } finally {
                            removeBtn.disabled = false;
                        }
                    });

                    action.appendChild(messageBtn);
                    action.appendChild(removeBtn);
                    card.appendChild(action);
                    friendsList.appendChild(card);
                });
            }

            requestsList.innerHTML = '';
            const incomingRequests = Array.isArray(this.friendHub.incoming) ? this.friendHub.incoming : [];
            const outgoingRequests = Array.isArray(this.friendHub.outgoing) ? this.friendHub.outgoing : [];
            
            const requestsSection = document.getElementById('social-requests-section');
            const hasRequests = incomingRequests.length > 0 || outgoingRequests.length > 0;
            if (requestsSection) {
                requestsSection.classList.toggle('is-hidden', !hasRequests);
            }

            if (!hasRequests) {
                this.setSummaryMessage(requestsList, this.t('no-friend-requests'));
            } else {
                const renderRequest = (item, label, acceptable) => {
                    const card = document.createElement('div');
                    card.className = 'friend-card premium-social-card request-card';
                    
                    const rating = this.friendRatingMap.get(String(item.friend.id || '')) || 1000;
                    const avatar = this.createPremiumAvatar(item.friend, rating);
                    card.appendChild(avatar);

                    const copy = document.createElement('div');
                    copy.className = 'friend-card-copy';
                    
                    const name = document.createElement('strong');
                    name.className = 'friend-card-name';
                    name.textContent = item.friend.displayName || 'Player';

                    const desc = document.createElement('span');
                    desc.className = 'friend-card-desc';
                    desc.textContent = label || 'Request';

                    copy.appendChild(name);
                    copy.appendChild(desc);
                    card.appendChild(copy);

                    const action = document.createElement('div');
                    action.className = 'friend-card-actions';

                    if (acceptable) {
                        const acceptBtn = document.createElement('button');
                        acceptBtn.className = 'btn btn-action btn-strong accept-btn';
                        acceptBtn.textContent = this.t('friend-accept');
                        acceptBtn.addEventListener('click', async () => {
                            acceptBtn.disabled = true;
                            try {
                                await this.account.acceptFriendRequest(item.id);
                                await this.loadFriendsPage();
                                this.renderer.showMessage(this.t('friends-request-accepted'), 1400);
                            } catch (err) {
                                this.renderer.showMessage(err.message || this.t('friends-load-failed'), 1800);
                            } finally {
                                acceptBtn.disabled = false;
                            }
                        });

                        const declineBtn = document.createElement('button');
                        declineBtn.className = 'btn btn-menu decline-btn';
                        declineBtn.textContent = this.t('friend-decline');
                        declineBtn.addEventListener('click', async () => {
                            declineBtn.disabled = true;
                            try {
                                await this.account.declineFriendRequest(item.id);
                                await this.loadFriendsPage();
                                this.renderer.showMessage(this.t('friends-request-declined'), 1400);
                            } catch (err) {
                                this.renderer.showMessage(err.message || this.t('friends-load-failed'), 1800);
                            } finally {
                                declineBtn.disabled = false;
                            }
                        });

                        action.appendChild(acceptBtn);
                        action.appendChild(declineBtn);
                    } else {
                        const cancelBtn = document.createElement('button');
                        cancelBtn.className = 'btn btn-menu cancel-btn';
                        cancelBtn.textContent = 'Cancel';
                        cancelBtn.addEventListener('click', async () => {
                            cancelBtn.disabled = true;
                            try {
                                await this.account.cancelFriendRequest(item.id);
                                await this.loadFriendsPage();
                                this.renderer.showMessage(this.t('friends-request-cancelled') || 'Request cancelled', 1400);
                            } catch (err) {
                                this.renderer.showMessage(err.message || this.t('friends-load-failed'), 1800);
                            } finally {
                                cancelBtn.disabled = false;
                            }
                        });
                        action.appendChild(cancelBtn);
                    }

                    card.appendChild(action);
                    requestsList.appendChild(card);
                };

                incomingRequests.forEach((item) => renderRequest(item, this.t('friend-incoming') || 'Incoming request', true));
                outgoingRequests.forEach((item) => renderRequest(item, this.t('friend-outgoing') || 'Outgoing request', false));
            }

            await this.searchFriendsPage(true);
        } catch (err) {
            this.setSummaryMessage(friendsList, err.message || this.t('friends-load-failed'));
            this.setSummaryMessage(requestsList, err.message || this.t('friends-load-failed'));
            this.setSummaryMessage(searchResults, err.message || this.t('friends-load-failed'));
        } finally {
            this._friendsLoadInFlight = null;
        }
        await this.loadSocialSummary();
        this.updateSocialCenterBadge();
        })();

        return this._friendsLoadInFlight;
    }

    getRoomInvitationStatusKey(invite) {
        const status = String(invite?.status || '').trim().toLowerCase();
        if (!status) return 'invite-status-pending';
        if (status === 'accepted' && !String(invite?.roomCode || '').trim()) return 'invite-waiting-room';
        if (status === 'declined') return 'invite-status-declined';
        if (status === 'expired') return 'invite-status-expired';
        if (status === 'cancelled' || status === 'revoked') return 'invite-status-cancelled';
        return `invite-status-${status}`;
    }

    getRoomInvitationStatusLabel(invite) {
        const key = this.getRoomInvitationStatusKey(invite);
        return this.t(key) || String(invite?.status || '').trim() || this.t('invite-status-pending');
    }

    isRoomInvitationPending(invite) {
        const status = String(invite?.status || '').trim().toLowerCase();
        return status === 'pending';
    }

    isRoomInvitationActive(invite) {
        const status = String(invite?.status || '').trim().toLowerCase();
        if (!status) return false;
        const expiresAtStr = invite?.expiresAt ? String(invite.expiresAt).trim() : '';
        const isExpired = expiresAtStr && new Date(expiresAtStr).getTime() <= Date.now();
        if (isExpired) return false;
        if (this.isRoomInvitationPending(invite)) return true;
        if (status === 'accepted' && !this.isValidRoomCode(invite?.roomCode)) return true;
        return false;
    }

    isValidRoomCode(code) {
        const clean = String(code || '').trim().toUpperCase();
        if (!clean || clean.length < 4 || clean.length > 12) return false;
        if (clean === 'NULL' || clean === 'UNDEFINED') return false;
        return /^[A-Z0-9]{4,12}$/.test(clean);
    }

    getActiveRoomInvitations(invitations = {}) {
        const incoming = Array.isArray(invitations?.incoming) ? invitations.incoming : [];
        const sent = Array.isArray(invitations?.sent) ? invitations.sent : [];
        return {
            incoming: incoming.filter((invite) => this.isRoomInvitationActive(invite) || this.isPlayInviteActive(invite)),
            sent: sent.filter((invite) => this.isRoomInvitationActive(invite) || this.isPlayInviteActive(invite))
        };
    }

    createRoomInvitationCard(invite, kind = 'incoming') {
        const card = document.createElement('div');
        card.className = 'friend-card premium-social-card invite-card';
        const isPlayInvite = this.isPlayInviteRecord(invite);
        const status = String(invite?.status || '').trim().toLowerCase();
        const inviteId = String(invite?.id || invite?.invitationId || invite?.roomInvitationId || '').trim();
        const pending = isPlayInvite ? status === 'pending' : this.isRoomInvitationPending(invite);
        const isAcceptedWaiting = isPlayInvite
            ? status === 'accepted' && !this.isPlayInviteRoomBound(invite)
            : status === 'accepted' && !String(invite?.roomCode || '').trim();
        const isRoomReady = isPlayInvite && status === 'room_created';
        const isJoined = isPlayInvite && status === 'joined';
        const isFailedJoin = isPlayInvite && status === 'failed_to_join';

        const otherParty = kind === 'incoming' ? invite?.inviter : invite?.invitee;
        const rating = this.friendRatingMap?.get(String(otherParty?.id || '')) || 1000;
        const avatar = this.createPremiumAvatar(otherParty, rating);
        card.appendChild(avatar);

        const copy = document.createElement('div');
        copy.className = 'friend-card-copy';
        const name = document.createElement('strong');
        name.className = 'friend-card-name';
        name.textContent = otherParty?.displayName || this.t('no-room-invites');
        const meta = document.createElement('span');
        meta.className = 'friend-card-desc';
        const metaParts = [];
        if (isPlayInvite) {
            if (String(invite?.roomCode || '').trim()) {
                metaParts.push(String(invite.roomCode).trim());
            } else {
                metaParts.push(this.currentLang === 'az' ? 'Oyun dəvəti' : 'Play invite');
            }
        } else {
            if (String(invite?.roomCode || '').trim()) metaParts.push(String(invite.roomCode).trim());
            if (invite?.roomMode) metaParts.push(String(invite.roomMode).trim());
        }
        meta.textContent = metaParts.filter(Boolean).join(' · ').trim();
        copy.appendChild(name);
        copy.appendChild(meta);

        const statusLabel = document.createElement('span');
        statusLabel.className = 'room-summary invite-status-label';
        statusLabel.textContent = isPlayInvite ? this.getPlayInviteStatusLabel(invite) : this.getRoomInvitationStatusLabel(invite);
        const showStatusLabel = kind === 'sent' || !pending || isRoomReady || isJoined || isFailedJoin;
        if (showStatusLabel) {
            copy.appendChild(statusLabel);
        }
        card.appendChild(copy);

        const action = document.createElement('div');
        action.className = 'friend-card-actions';

        if (isPlayInvite) {
            if (kind === 'incoming') {
                if (pending) {
                    const acceptBtn = document.createElement('button');
                    acceptBtn.className = 'btn btn-action btn-strong accept-invite-btn';
                    acceptBtn.textContent = this.currentLang === 'az' ? 'Qəbul et' : 'Accept';
                    acceptBtn.disabled = this.acceptingInviteIds.has(inviteId) || this.decliningInviteIds.has(inviteId);
                    acceptBtn.addEventListener('click', async () => {
                        if (!inviteId || acceptBtn.disabled) return;
                        this.acceptingInviteIds.add(inviteId);
                        this.decliningInviteIds.delete(inviteId);
                        acceptBtn.disabled = true;
                        const originalText = acceptBtn.textContent;
                        acceptBtn.textContent = this.currentLang === 'az' ? 'Qəbul edilir...' : 'Accepting...';
                        try {
                            const accepted = await this.acceptPlayInviteWithFallback(inviteId);
                            if (accepted?.ok === false) {
                                if (accepted?.reason === 'insufficient_coins') {
                                    this.showInsufficientCoinsModal(
                                        Number(accepted?.requiredStake || accepted?.stakeAmount || 0) || 0,
                                        Number(accepted?.balance ?? accepted?.wallet?.balance ?? this.getCurrentWalletBalance()) || 0,
                                        { inviteId }
                                    );
                                }
                                throw new Error(accepted?.error || accepted?.reason || this.t('friends-load-failed'));
                            }
                            const acceptedInvite = accepted?.item || accepted?.invite || invite;
                            this._lastPlayInviteAcceptedAt = Date.now();
                            this._lastPlayInviteAcceptedPayloadSafe = this.buildInviteDebugPayloadSafe(acceptedInvite || invite);
                            const acceptedRoomBound = this.isPlayInviteRoomBound(acceptedInvite || invite);
                            this._lastPlayInviteAcceptedFlowType = acceptedRoomBound ? 'room-bound' : 'reservation';
                            this._lastPlayInviteAcceptedHadRoomId = Boolean(String(acceptedInvite?.roomId || invite?.roomId || '').trim());
                            this._lastAcceptedInviteWasRoomBound = acceptedRoomBound;
                            if (acceptedRoomBound) {
                                this._lastPlayInviteAcceptedWaitingSuppressedForRoomBound = true;
                                this.acceptedWaitingInviteIds.delete(inviteId);
                                await this.joinPlayInviteRoom(acceptedInvite || invite, { manual: true }).catch(() => {});
                            } else {
                                this._lastPlayInviteAcceptedWaitingSuppressedForRoomBound = false;
                                this.acceptedWaitingInviteIds.add(inviteId);
                                this.renderer.showMessage(
                                    this.currentLang === 'az'
                                        ? 'Otaq gözlənilir'
                                        : 'Waiting for room',
                                    1800
                                );
                            }
                            await this.loadSocialInvitesPage();
                        } catch (err) {
                            this._lastPlayInviteError = String(err?.message || err || '').trim();
                            this.renderer.showMessage(this._lastPlayInviteError || this.t('friends-load-failed'), 1800);
                        } finally {
                            this.acceptingInviteIds.delete(inviteId);
                            acceptBtn.disabled = false;
                            acceptBtn.textContent = originalText;
                        }
                    });

                    const declineBtn = document.createElement('button');
                    declineBtn.className = 'btn btn-menu decline-invite-btn';
                    declineBtn.textContent = this.currentLang === 'az' ? 'Rədd et' : 'Decline';
                    declineBtn.disabled = this.acceptingInviteIds.has(inviteId) || this.decliningInviteIds.has(inviteId);
                    declineBtn.addEventListener('click', async () => {
                        if (!inviteId || declineBtn.disabled) return;
                        this.decliningInviteIds.add(inviteId);
                        this.acceptingInviteIds.delete(inviteId);
                        declineBtn.disabled = true;
                        const originalText = declineBtn.textContent;
                        declineBtn.textContent = this.currentLang === 'az' ? 'Rədd edilir...' : 'Declining...';
                        try {
                            this.recordPlayInviteCancelAttempt({ inviteId, source: 'invitee-decline-button' }, 'invitee-decline-button');
                            const declined = await this.declinePlayInviteWithFallback(inviteId);
                            if (declined?.ok === false) {
                                throw new Error(declined?.error || declined?.reason || this.t('friends-load-failed'));
                            }
                            this.recordPlayInviteCancelResult({
                                ok: true,
                                item: declined?.item || declined?.invite || invite,
                                live: Boolean(declined?.live)
                            });
                            await this.loadSocialInvitesPage();
                        } catch (err) {
                            this._lastPlayInviteError = String(err?.message || err || '').trim();
                            this.recordPlayInviteCancelError(err, { inviteId, source: 'invitee-decline-button' }, 'invitee-decline-button');
                            this.renderer.showMessage(this._lastPlayInviteError || this.t('friends-load-failed'), 1800);
                        } finally {
                            this.decliningInviteIds.delete(inviteId);
                            declineBtn.disabled = false;
                            declineBtn.textContent = originalText;
                        }
                    });
                    action.appendChild(acceptBtn);
                    action.appendChild(declineBtn);
                } else if (isAcceptedWaiting) {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn btn-menu cancel-invite-btn';
                    cancelBtn.textContent = this.currentLang === 'az' ? 'Ləğv et' : 'Cancel';
                    cancelBtn.addEventListener('click', async () => {
                        if (!inviteId || cancelBtn.disabled) return;
                        cancelBtn.disabled = true;
                        const originalText = cancelBtn.textContent;
                        cancelBtn.textContent = this.currentLang === 'az' ? 'Ləğv edilir...' : 'Canceling...';
                        try {
                            const cancelled = await this.cancelPlayInviteWithFallback(inviteId, 'invitee-leave-waiting-button');
                            if (cancelled?.ok === false) {
                                throw new Error(cancelled?.error || cancelled?.reason || this.t('friends-load-failed'));
                            }
                            await this.loadSocialInvitesPage();
                            this.renderer.showMessage(
                                this.currentLang === 'az'
                                    ? 'Dəvət ləğv edildi'
                                    : 'Invite cancelled',
                                1400
                            );
                        } catch (err) {
                            this._lastPlayInviteError = String(err?.message || err || '').trim();
                            this.renderer.showMessage(this._lastPlayInviteError || this.t('friends-load-failed'), 1800);
                        } finally {
                            cancelBtn.disabled = false;
                            cancelBtn.textContent = originalText;
                        }
                    });
                    action.appendChild(cancelBtn);
                } else if (isRoomReady) {
                    const joining = this.playInviteJoiningIds.has(inviteId);
                    const joinBtn = document.createElement('button');
                    joinBtn.className = 'btn btn-action btn-strong';
                    joinBtn.disabled = joining || !this.isValidRoomCode(invite?.roomCode || invite?.roomId || '');
                    joinBtn.textContent = joining
                        ? (this.currentLang === 'az' ? 'Qoşulursunuz...' : 'Joining...')
                        : (this.currentLang === 'az' ? 'Qoşul' : 'Join room');
                    joinBtn.addEventListener('click', async () => {
                        if (!inviteId || joinBtn.disabled) return;
                        await this.joinPlayInviteRoom(invite, { manual: true });
                    });
                    action.appendChild(joinBtn);
                } else if (isJoined) {
                    const joinedBtn = document.createElement('button');
                    joinedBtn.className = 'btn btn-menu';
                    joinedBtn.disabled = true;
                    joinedBtn.textContent = this.currentLang === 'az' ? 'Qoşuldunuz' : 'Joined';
                    action.appendChild(joinedBtn);
                } else if (isFailedJoin) {
                    const failedBtn = document.createElement('button');
                    failedBtn.className = 'btn btn-menu';
                    failedBtn.disabled = true;
                    failedBtn.textContent = this.currentLang === 'az' ? 'Qoşulma alınmadı' : 'Failed to join';
                    action.appendChild(failedBtn);
                } else {
                    const statusBtn = document.createElement('button');
                    statusBtn.className = 'btn btn-menu';
                    statusBtn.disabled = true;
                    statusBtn.textContent = this.getPlayInviteStatusLabel(invite);
                    action.appendChild(statusBtn);
                }
            } else {
                if (pending) {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn btn-menu cancel-invite-btn';
                    cancelBtn.textContent = this.t('invite-cancel');
                    cancelBtn.addEventListener('click', async () => {
                        cancelBtn.disabled = true;
                        const originalText = cancelBtn.textContent;
                        cancelBtn.textContent = '...';
                        try {
                            await this.cancelPlayInviteWithFallback(inviteId, 'inviter-cancel-button');
                            await this.loadSocialInvitesPage();
                            this.renderer.showMessage(this.t('invite-cancelled'), 1400);
                        } catch (err) {
                            this._lastPlayInviteError = String(err?.message || err || '').trim();
                            this.renderer.showMessage(this._lastPlayInviteError || this.t('friends-load-failed'), 1800);
                        } finally {
                            cancelBtn.disabled = false;
                            cancelBtn.textContent = originalText;
                        }
                    });
                    action.appendChild(cancelBtn);
                } else if (isAcceptedWaiting) {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn btn-menu cancel-invite-btn';
                    cancelBtn.textContent = this.currentLang === 'az' ? 'Ləğv et' : 'Cancel';
                    cancelBtn.addEventListener('click', async () => {
                        if (!inviteId || cancelBtn.disabled) return;
                        cancelBtn.disabled = true;
                        const originalText = cancelBtn.textContent;
                        cancelBtn.textContent = this.currentLang === 'az' ? 'Ləğv edilir...' : 'Canceling...';
                        try {
                            const cancelled = await this.cancelPlayInviteWithFallback(inviteId, 'inviter-cancel-button');
                            if (cancelled?.ok === false) {
                                throw new Error(cancelled?.error || cancelled?.reason || this.t('friends-load-failed'));
                            }
                            await this.loadSocialInvitesPage();
                            this.renderer.showMessage(
                                this.currentLang === 'az'
                                    ? 'Dəvət ləğv edildi'
                                    : 'Invite cancelled',
                                1400
                            );
                        } catch (err) {
                            this._lastPlayInviteError = String(err?.message || err || '').trim();
                            this.renderer.showMessage(this._lastPlayInviteError || this.t('friends-load-failed'), 1800);
                        } finally {
                            cancelBtn.disabled = false;
                            cancelBtn.textContent = originalText;
                        }
                    });
                    action.appendChild(cancelBtn);
                } else if (isRoomReady || isJoined || isFailedJoin) {
                    const statusBtn = document.createElement('button');
                    statusBtn.className = 'btn btn-menu';
                    statusBtn.disabled = true;
                    statusBtn.textContent = this.getPlayInviteStatusLabel(invite);
                    action.appendChild(statusBtn);
                } else {
                    const statusBtn = document.createElement('button');
                    statusBtn.className = 'btn btn-menu';
                    statusBtn.disabled = true;
                    statusBtn.textContent = this.getPlayInviteStatusLabel(invite);
                    action.appendChild(statusBtn);
                }
            }

            card.appendChild(action);
            return card;
        }

        if (kind === 'incoming') {
            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'btn btn-action btn-strong accept-invite-btn';
            const isAcceptedWaiting = String(invite?.status || '').trim() === 'accepted' && !String(invite?.roomCode || '').trim();
            acceptBtn.textContent = isAcceptedWaiting
                ? this.t('invite-waiting-room')
                : this.t('invites-accept');
            acceptBtn.disabled = isAcceptedWaiting || !pending;
                acceptBtn.addEventListener('click', async () => {
                if (isAcceptedWaiting || !pending) return;
                acceptBtn.disabled = true;
                const originalText = acceptBtn.textContent;
                acceptBtn.textContent = '...';
                try {
                    const accepted = await this.acceptRoomInviteWithFallback(invite.id);
                    if (String(accepted?.reason || '').trim() === 'insufficient_coins') {
                        this.showInsufficientCoinsModal(
                            Number(accepted?.requiredStake || accepted?.stakeAmount || 0) || 0,
                            Number(accepted?.balance ?? accepted?.wallet?.balance ?? this.getCurrentWalletBalance()) || 0,
                            { inviteId: invite.id }
                        );
                    } else if (accepted?.ok === false || String(accepted?.reason || '').trim() === 'room_not_available') {
                        this.renderer.showMessage(this.t('invite-status-expired') || 'Invite expired or room unavailable', 1800);
                    } else {
                        const joinRoomCode = String(accepted?.join?.roomCode || '').trim();
                        if (this.isValidRoomCode(joinRoomCode)) {
                            await this.joinOnlineRoom(accepted?.join || accepted?.item || invite);
                        } else {
                            const row = accepted?.item || invite;
                            this.gameInviteState = {
                                inviteId: String(row.id || invite.id || '').trim(),
                                inviteePlayerId: String(row.invitee?.id || this.accountProfile?.playerId || this.accountProfile?.id || '').trim(),
                                inviteeDisplayName: String(row.invitee?.displayName || this.accountProfile?.displayName || '').trim(),
                                sessionId: String(row.roomId || invite.roomId || '').trim(),
                                role: 'invitee',
                                roomLinked: false,
                                createPromptShown: false,
                                waitingPromptShown: true,
                                createdAt: Date.now()
                            };
                            this.startGameInviteRefresh();
                            this.renderer.showMessage(this.t('invite-waiting-room'), 1800);
                            await this.loadSocialInvitesPage();
                        }
                    }
                } catch (err) {
                    this.renderer.showMessage(err?.message || this.t('friends-load-failed'), 1800);
                } finally {
                    acceptBtn.textContent = originalText;
                    acceptBtn.disabled = false;
                }
            });

            const declineBtn = document.createElement('button');
            declineBtn.className = 'btn btn-menu decline-invite-btn';
            declineBtn.textContent = this.t('invites-decline');
            declineBtn.disabled = !pending;
            declineBtn.addEventListener('click', async () => {
                if (!pending) return;
                declineBtn.disabled = true;
                const originalText = declineBtn.textContent;
                declineBtn.textContent = '...';
                const inviteId = String(invite?.id || invite?.invitationId || invite?.roomInvitationId || '').trim();
                if (!inviteId) {
                    declineBtn.disabled = false;
                    declineBtn.textContent = originalText;
                    return;
                }
                try {
                    await this.declineRoomInviteWithFallback(inviteId);
                    await this.loadSocialInvitesPage();
                } catch (err) {
                    const msg = String(err?.message || '').toLowerCase();
                    if (msg.includes('already responded') || msg.includes('expired') || msg.includes('not found')) {
                        await this.loadSocialInvitesPage().catch(() => {});
                    } else {
                        this.renderer.showMessage(err?.message || this.t('friends-load-failed'), 1800);
                    }
                } finally {
                    declineBtn.disabled = false;
                    declineBtn.textContent = originalText;
                }
            });
            action.appendChild(acceptBtn);
            action.appendChild(declineBtn);
        } else {
            const statusOnly = !pending && String(invite?.status || '').trim() !== 'accepted';
            const isAcceptedWaiting = String(invite?.status || '').trim() === 'accepted' && !String(invite?.roomCode || '').trim();
            if (pending) {
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'btn btn-menu cancel-invite-btn';
                cancelBtn.textContent = this.t('invite-cancel');
                cancelBtn.addEventListener('click', async () => {
                    cancelBtn.disabled = true;
                    const originalText = cancelBtn.textContent;
                    cancelBtn.textContent = '...';
                    const inviteId = String(invite?.id || invite?.invitationId || invite?.roomInvitationId || '').trim();
                    if (!inviteId) {
                        cancelBtn.disabled = false;
                        cancelBtn.textContent = originalText;
                        return;
                    }
                    try {
                        await this.cancelRoomInviteWithFallback(inviteId);
                        await this.loadSocialInvitesPage();
                        this.renderer.showMessage(this.t('invite-cancelled'), 1400);
                    } catch (err) {
                        const msg = String(err?.message || '').toLowerCase();
                        if (msg.includes('already responded') || msg.includes('expired') || msg.includes('not found')) {
                            await this.loadSocialInvitesPage().catch(() => {});
                        } else {
                            this.renderer.showMessage(err?.message || this.t('friends-load-failed'), 1800);
                        }
                    } finally {
                        cancelBtn.disabled = false;
                        cancelBtn.textContent = originalText;
                    }
                });
                action.appendChild(cancelBtn);
            } else if (isAcceptedWaiting) {
                const waitingBtn = document.createElement('button');
                waitingBtn.className = 'btn btn-menu';
                waitingBtn.disabled = true;
                waitingBtn.textContent = this.t('invite-waiting-room');
                action.appendChild(waitingBtn);
            } else if (statusOnly) {
                const statusBtn = document.createElement('button');
                statusBtn.className = 'btn btn-menu';
                statusBtn.disabled = true;
                statusBtn.textContent = this.getRoomInvitationStatusLabel(invite);
                action.appendChild(statusBtn);
            } else {
                const statusBtn = document.createElement('button');
                statusBtn.className = 'btn btn-menu';
                statusBtn.disabled = true;
                statusBtn.textContent = this.getRoomInvitationStatusLabel(invite);
                action.appendChild(statusBtn);
            }
        }

        card.appendChild(copy);
        card.appendChild(action);
        return card;
    }

    async searchFriendsPage(skipLoading = false) {
        const { searchInput, searchResults: resultsList } = this.getFriendsUiElements();
        if (!searchInput || !resultsList) return;

        const query = String(searchInput.value || '').trim();
        const searchSection = document.getElementById('social-search-results-section');
        if (query.length < 2) {
            resultsList.innerHTML = '';
            if (searchSection) searchSection.classList.add('is-hidden');
            return;
        }
        if (searchSection) searchSection.classList.remove('is-hidden');

        if (!skipLoading) {
            this.setSummaryMessage(resultsList, this.t('account-profile-loading'));
        }
        try {
            const items = await this.account.searchPlayers(query);
            const presenceMap = this.friendPresenceMap instanceof Map ? this.friendPresenceMap : await this.loadFriendPresenceMap().catch(() => new Map());

            this.friendSearchResults = Array.isArray(items) ? items : [];
            resultsList.innerHTML = '';
            if (!this.friendSearchResults.length) {
                this.setSummaryMessage(resultsList, this.t('friends-search-empty'));
                return;
            }
            this.friendSearchResults.forEach((player) => {
                const card = document.createElement('div');
                card.className = 'friend-card premium-social-card';
                
                const rating = this.friendRatingMap?.get?.(String(player.id || '')) || 1000;
                const avatar = this.createPremiumAvatar(player, rating);
                card.appendChild(avatar);

                const copy = document.createElement('div');
                copy.className = 'friend-card-copy';
                const name = document.createElement('strong');
                name.className = 'friend-card-name';
                name.textContent = player.displayName || 'Player';
                const status = document.createElement('div');
                const presenceStatus = this.getFriendPresenceStatus(player, presenceMap);
                status.className = `friend-card-status${presenceStatus === 'online' ? ' is-online' : presenceStatus === 'in_game' ? ' is-in-game' : ' is-offline'}`;
                status.innerHTML = `<span class="presence-dot"></span>${this.getFriendPresenceLabel(presenceStatus)}`;
                
                copy.appendChild(name);
                copy.appendChild(status);
                card.appendChild(copy);

                const action = document.createElement('div');
                action.className = 'friend-card-actions';
                const playerId = String(player.id || '');
                const statusKey = String(player.friendshipStatus || (playerId && this.friendHub?.accepted?.some((item) => String(item.friend?.id || '') === playerId) ? 'accepted' : '') || 'none').trim();
                if (statusKey === 'self') {
                    const selfBtn = document.createElement('button');
                    selfBtn.className = 'btn btn-menu';
                    selfBtn.disabled = true;
                    selfBtn.textContent = this.t('player-profile-self') || 'You';
                    action.appendChild(selfBtn);
                } else if (statusKey === 'accepted') {
                    const messageBtn = document.createElement('button');
                    messageBtn.className = 'btn btn-menu action-icon-btn message-btn';
                    messageBtn.type = 'button';
                    messageBtn.title = this.t('messages-open') || 'Message';
                    messageBtn.setAttribute('aria-label', this.t('messages-open') || 'Message');
                    messageBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4.6 3.8c-.7.6-1.4 0-1.4-.8V17H4a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 4 5.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                        </svg>
                    `;
                    messageBtn.addEventListener('click', async () => {
                        await this.openConversationWithPlayer(player);
                    });

                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'btn btn-menu action-icon-btn remove-action-btn';
                    removeBtn.type = 'button';
                    removeBtn.title = this.t('friend-remove') || 'Remove';
                    removeBtn.setAttribute('aria-label', this.t('friend-remove') || 'Remove');
                    removeBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M3.5 6h17M9 6V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V6m-5 0h4m-9 0 .6 12.2A2.8 2.8 0 0 0 8.4 21h7.2a2.8 2.8 0 0 0 2.8-2.8L19 6M10 10v6M14 10v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    `;
                    removeBtn.addEventListener('click', async () => {
                        removeBtn.disabled = true;
                        try {
                            await this.account.removeFriend(player.friendshipId);
                            await this.loadFriendsPage();
                            this.renderer.showMessage(this.t('friends-removed'), 1400);
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('friends-load-failed'), 1800);
                        } finally {
                            removeBtn.disabled = false;
                        }
                    });

                    action.appendChild(messageBtn);
                    action.appendChild(removeBtn);
                } else if (statusKey === 'pending_outgoing') {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn btn-menu pending-btn';
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.addEventListener('click', async () => {
                        cancelBtn.disabled = true;
                        try {
                            const friendshipId = String(player.friendshipId || '').trim();
                            if (!friendshipId) throw new Error(this.t('friends-load-failed'));
                            await this.account.cancelFriendRequest(friendshipId);
                            await this.searchFriendsPage(true);
                            this.renderer.showMessage(this.t('friends-request-cancelled') || 'Request cancelled', 1400);
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('friends-load-failed'), 1800);
                        } finally {
                            cancelBtn.disabled = false;
                        }
                    });
                    action.appendChild(cancelBtn);
                } else if (statusKey === 'pending_incoming') {
                    const acceptBtn = document.createElement('button');
                    acceptBtn.className = 'btn btn-action btn-strong';
                    acceptBtn.textContent = this.t('friend-accept');
                    acceptBtn.addEventListener('click', async () => {
                        acceptBtn.disabled = true;
                        try {
                            const friendshipId = String(player.friendshipId || '').trim();
                            if (!friendshipId) throw new Error(this.t('friends-load-failed'));
                            await this.account.acceptFriendRequest(friendshipId);
                            await this.searchFriendsPage(true);
                            this.renderer.showMessage(this.t('friends-request-accepted'), 1400);
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('friends-load-failed'), 1800);
                        } finally {
                            acceptBtn.disabled = false;
                        }
                    });

                    const declineBtn = document.createElement('button');
                    declineBtn.className = 'btn btn-menu';
                    declineBtn.textContent = this.t('friend-decline');
                    declineBtn.addEventListener('click', async () => {
                        declineBtn.disabled = true;
                        try {
                            const friendshipId = String(player.friendshipId || '').trim();
                            if (!friendshipId) throw new Error(this.t('friends-load-failed'));
                            await this.account.declineFriendRequest(friendshipId);
                            await this.searchFriendsPage(true);
                            this.renderer.showMessage(this.t('friends-request-declined'), 1400);
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('friends-load-failed'), 1800);
                        } finally {
                            declineBtn.disabled = false;
                        }
                    });
                    action.appendChild(acceptBtn);
                    action.appendChild(declineBtn);
                } else {
                    const addBtn = document.createElement('button');
                    addBtn.className = 'btn btn-action btn-strong add-btn';
                    addBtn.textContent = this.t('friends-add');
                    addBtn.addEventListener('click', async () => {
                        addBtn.disabled = true;
                        try {
                            await this.account.sendFriendRequest(player.id);
                            await this.loadFriendsPage();
                            this.renderer.showMessage(this.t('friends-request-sent'), 1400);
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('friends-load-failed'), 1800);
                        } finally {
                            addBtn.disabled = false;
                        }
                    });
                    action.appendChild(addBtn);
                }
                card.appendChild(action);
                resultsList.appendChild(card);
            });
        } catch (err) {
            this.setSummaryMessage(resultsList, err.message || this.t('friends-load-failed'));
        }
    }

    renderPlayerProfileModal() {
        const modal = document.getElementById('player-profile-modal');
        if (!modal) return;
        const avatar = document.getElementById('player-profile-avatar');
        const name = document.getElementById('player-profile-name');
        const status = document.getElementById('player-profile-status');
        const stats = document.getElementById('player-profile-stats');
        const friendBtn = document.getElementById('player-profile-friend-btn');
        const inviteBtn = document.getElementById('player-profile-invite-btn');
        const messageBtn = document.getElementById('player-profile-message-btn');
        const blockBtn = document.getElementById('player-profile-block-btn');
        const reportBtn = document.getElementById('player-profile-report-btn');
        const profile = this.playerProfileState?.profile || null;
        const isAuthed = this.hasAuthenticatedAccount();
        const isSelf = profile?.friendshipStatus === 'self';
        const blockStatus = String(profile?.blockStatus || profile?.moderation?.blockStatus || 'none').trim() || 'none';
        const isBlocked = blockStatus !== 'none' && blockStatus !== 'self';
        const loading = Boolean(this.playerProfileState?.loading);
        const canInvite = Boolean(isAuthed && !isSelf && profile?.id && !isBlocked);

        if (name) name.textContent = profile?.displayName || this.playerProfileState?.error || this.t('account-profile-loading');
        if (status) {
            const blockLabel = blockStatus === 'blocked_by_you'
                ? this.t('player-profile-blocked-by-you')
                : blockStatus === 'blocked_you'
                    ? this.t('player-profile-blocked-you')
                    : blockStatus === 'blocked_both'
                        ? this.t('player-profile-blocked-both')
                        : '';
            status.textContent = this.playerProfileState?.error
                || blockLabel
                || (loading ? this.t('account-profile-loading') : this.t('player-profile-status-ready'));
        }

        if (avatar) {
            avatar.innerHTML = '';
            const avatarUrl = profile?.avatarUrl || null;
            if (avatarUrl) {
                const img = document.createElement('img');
                img.alt = profile?.displayName || 'Player avatar';
                img.src = avatarUrl;
                img.referrerPolicy = 'no-referrer';
                img.onerror = () => {
                    img.onerror = null;
                    const fallback = document.createElement('span');
                    fallback.className = 'player-profile-avatar-fallback';
                    fallback.textContent = this.getTurnAvatarText?.(profile?.displayName || 'P') || 'P';
                    img.replaceWith(fallback);
                };
                avatar.appendChild(img);
            } else {
                const fallback = document.createElement('span');
                fallback.className = 'player-profile-avatar-fallback';
                fallback.textContent = this.getTurnAvatarText?.(profile?.displayName || 'P') || 'P';
                avatar.appendChild(fallback);
            }
        }

        if (stats) {
            stats.innerHTML = '';
            const fields = [
                [this.t('leaderboard-rating'), profile?.stats?.rating ?? 1000],
                [this.t('leaderboard-games'), profile?.stats?.matchesPlayed ?? 0],
                [this.t('leaderboard-wins'), profile?.stats?.wins ?? 0],
                [this.t('leaderboard-losses') || this.t('leaderboard-wins'), profile?.stats?.losses ?? 0]
            ];
            fields.forEach(([label, value]) => {
                const chip = document.createElement('div');
                chip.className = 'player-profile-stat';
                const key = document.createElement('span');
                key.className = 'player-profile-stat-key';
                key.textContent = String(label);
                const val = document.createElement('strong');
                val.textContent = String(value);
                chip.appendChild(key);
                chip.appendChild(val);
                stats.appendChild(chip);
            });
        }

        const canMessage = isAuthed && !isSelf && Boolean(profile?.id);
        if (friendBtn) {
            const statusKey = profile?.friendshipStatus || 'none';
            const labels = {
                self: this.t('player-profile-self'),
                none: this.t('friend-add'),
                pending_incoming: this.t('friend-accept'),
                pending_outgoing: `${this.t('player-profile-request-outgoing') || 'Request sent'} - ${this.t('player-profile-request-cancel') || 'Cancel'}`,
                accepted: this.t('friends-request-accepted')
            };
            const label = labels[statusKey] || this.t('friend-add');
            friendBtn.textContent = label;
            friendBtn.title = label;
            friendBtn.setAttribute('aria-label', label);
            const allowAction = isAuthed && !isSelf && !isBlocked && (statusKey === 'none' || statusKey === 'pending_incoming' || statusKey === 'pending_outgoing');
            friendBtn.hidden = isSelf || !isAuthed || isBlocked || statusKey === 'accepted';
            friendBtn.disabled = !allowAction;
            friendBtn.onclick = async () => {
                if (!allowAction || !profile?.id) return;
                friendBtn.disabled = true;
                try {
                    if (statusKey === 'pending_incoming') {
                        const friendshipId = String(profile?.friendshipId || '').trim();
                        if (!friendshipId) throw new Error(this.t('friends-load-failed'));
                        await this.account.acceptFriendRequest(friendshipId);
                    } else if (statusKey === 'pending_outgoing') {
                        const friendshipId = String(profile?.friendshipId || '').trim();
                        if (!friendshipId) throw new Error(this.t('friends-load-failed'));
                        await this.account.cancelFriendRequest(friendshipId);
                    } else {
                        await this.account.sendFriendRequest(profile.id);
                    }
                    await this.openPlayerProfileModal(profile.id);
                    await this.loadFriendsPage().catch(() => {});
                    this.renderer.showMessage(
                        statusKey === 'pending_incoming'
                            ? (this.t('friends-request-accepted') || 'Accepted')
                            : statusKey === 'pending_outgoing'
                                ? (this.t('friends-request-cancelled') || 'Request cancelled')
                                : (this.t('friends-request-sent') || 'Request sent'),
                        1400
                    );
                } catch (err) {
                    this.renderer.showMessage(err?.message || this.t('friends-load-failed'), 1800);
                } finally {
                    friendBtn.disabled = false;
                }
            };
        }

        if (inviteBtn) {
            const profileId = String(profile?.id || '').trim();
            const outgoingInvite = this.findOutgoingPlayInviteForPlayer(profileId);
            inviteBtn.hidden = true;
            inviteBtn.disabled = true;
            inviteBtn.title = this.t('friend-invite');
            inviteBtn.textContent = this.t('friend-invite');
        }

        if (messageBtn) {
            messageBtn.hidden = !canMessage || isBlocked;
            messageBtn.disabled = !canMessage || loading || isBlocked;
            messageBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4.6 3.8c-.7.6-1.4 0-1.4-.8V17H4a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 4 5.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            </svg>`;
            const label = this.t('player-profile-message');
            messageBtn.title = label;
            messageBtn.setAttribute('aria-label', label);
            messageBtn.onclick = async () => {
                if (!canMessage || !profile?.id) return;
                await this.openConversationWithPlayer(profile.id);
            };
        }

        if (blockBtn) {
            const isBlockedByMe = blockStatus === 'blocked_by_you' || blockStatus === 'blocked_both';
            const label = isBlockedByMe ? this.t('player-profile-unblock') : this.t('player-profile-block');
            blockBtn.hidden = !isAuthed || isSelf;
            blockBtn.disabled = !isAuthed || isSelf || loading;
            blockBtn.innerHTML = this.buildChatHeaderBlockIconMarkup(18);
            blockBtn.title = label;
            blockBtn.setAttribute('aria-label', label);
            blockBtn.onclick = async () => {
                if (!profile?.id || isSelf) return;
                blockBtn.disabled = true;
                try {
                    const sessionId = this.resolvePlayerSessionId(profile);
                    if (isBlockedByMe) {
                        await this.account.unblockPlayer(profile.id);
                        this.renderer.showMessage(this.t('player-profile-unblocked'), 1400);
                        if (sessionId) this.voice?.setPlayerMuted?.(sessionId, false);
                    } else {
                        await this.account.blockPlayer(profile.id);
                        this.renderer.showMessage(this.t('player-profile-blocked'), 1400);
                        if (sessionId) this.voice?.setPlayerMuted?.(sessionId, true);
                    }
                    await this.openPlayerProfileModal(profile.id);
                    await this.loadFriendsPage().catch(() => {});
                    await this.loadSocialSummary().catch(() => {});
                } catch (err) {
                    this.renderer.showMessage(err?.message || this.t('player-profile-block-failed'), 1800);
                } finally {
                    blockBtn.disabled = false;
                }
            };
        }

        if (reportBtn) {
            const label = this.t('player-profile-report');
            reportBtn.hidden = !isAuthed || isSelf;
            reportBtn.disabled = !isAuthed || isSelf || loading;
            reportBtn.innerHTML = this.buildChatHeaderReportIconMarkup(18);
            reportBtn.title = label;
            reportBtn.setAttribute('aria-label', label);
            reportBtn.onclick = () => {
                if (!profile?.id || isSelf) return;
                this.openPlayerReportModal(profile, { category: blockStatus === 'blocked_you' ? 'voice' : 'chat' });
            };
        }
    }

    renderAccountModal() {
        const profile = this.accountProfile;
        const details = this.accountDetails;
        const profilePanel = document.getElementById('account-profile-panel');
        const authPanel = document.getElementById('account-auth-panel');
        const title = document.getElementById('account-modal-title');
        const historyPanel = document.getElementById('account-history-panel');
        const avatar = document.getElementById('account-avatar');
        const avatarEditButton = document.getElementById('account-edit-avatar-btn');
        const profileName = document.getElementById('account-profile-name');
        const profileMeta = document.getElementById('account-profile-meta');
        const profileCopy = document.querySelector('#account-profile-panel .account-profile-copy');
        const ratingValue = document.getElementById('account-rating-value');
        const winsValue = document.getElementById('account-wins-value');
        const matchesValue = document.getElementById('account-matches-value');
        const coinsValue = document.getElementById('account-coins-value');
        const historyList = document.getElementById('account-history-list');
        const refreshButton = document.getElementById('account-refresh-btn');
        const logoutButton = document.getElementById('account-logout-btn');
        const closeButton = document.getElementById('account-modal-close');
        this.syncAccountUiChrome();
        this.ensureAuthIconMarkup();
        this.removeLegacyNameControls();
        const profileTabs = document.getElementById('account-profile-tabs');
        if (profileCopy && !profileTabs) {
            const tabs = document.createElement('div');
            tabs.className = 'account-profile-tabs';
            tabs.id = 'account-profile-tabs';
            tabs.innerHTML = `
                <button type="button" class="account-profile-tab" data-profile-tab="skins" data-i18n="account-skins-vault"></button>
                <button type="button" class="account-profile-tab" data-profile-tab="gifts" data-i18n="account-gift-vault"></button>
            `;
            const profilePanel = document.getElementById('account-profile-panel');
            const statsGrid = document.getElementById('account-stats-grid');
            if (profilePanel) {
                profilePanel.insertBefore(tabs, statsGrid || null);
            } else {
                profileCopy.parentElement?.appendChild(tabs);
            }
            tabs.querySelectorAll('[data-i18n]').forEach((button) => {
                const key = button.dataset.i18n;
                const label = this.t(key || '');
                button.textContent = label;
                button.title = label;
                button.setAttribute('aria-label', label);
            });
        } else if (profileTabs) {
            profileTabs.querySelectorAll('[data-i18n]').forEach((button) => {
                const key = button.dataset.i18n;
                const label = this.t(key || '');
                button.textContent = label;
                button.title = label;
                button.setAttribute('aria-label', label);
            });
        }
        if (profileTabs) {
            profileTabs.querySelectorAll('[data-profile-tab]').forEach((button) => {
                if (button.dataset.bound === '1') return;
                button.dataset.bound = '1';
                button.addEventListener('click', () => this.setAccountProfileTab(button.dataset.profileTab || 'skins'));
            });
        }
        if (profileCopy && profileName && !document.getElementById('account-edit-name-btn')) {
            const nameRow = document.createElement('div');
            nameRow.className = 'account-profile-name-row';
            nameRow.id = 'account-profile-name-row';
            profileCopy.insertBefore(nameRow, profileName);
            nameRow.appendChild(profileName);
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'icon-btn';
            editBtn.id = 'account-edit-name-btn';
            editBtn.setAttribute('aria-label', 'Edit name');
            editBtn.innerHTML = `<span class="auth-icon auth-icon-pencil" data-auth-icon="pencil" aria-hidden="true"></span>`;
            nameRow.appendChild(editBtn);
            editBtn.addEventListener('click', () => this.openNameEditModal());
        }
        if (profileCopy && profileName && !document.getElementById('account-logout-btn')) {
            const nameRow = document.getElementById('account-profile-name-row') || document.createElement('div');
            if (!nameRow.id) {
                nameRow.className = 'account-profile-name-row';
                nameRow.id = 'account-profile-name-row';
                profileCopy.insertBefore(nameRow, profileName);
                nameRow.appendChild(profileName);
                const editBtn = document.getElementById('account-edit-name-btn');
                if (editBtn) nameRow.appendChild(editBtn);
            }
            const logoutBtn = document.createElement('button');
            logoutBtn.type = 'button';
            logoutBtn.className = 'icon-btn account-profile-logout-btn';
            logoutBtn.id = 'account-logout-btn';
            const logoutLabel = this.t('account-logout');
            logoutBtn.setAttribute('aria-label', logoutLabel);
            logoutBtn.title = logoutLabel;
            logoutBtn.innerHTML = `<span class="auth-icon auth-icon-logout" data-auth-icon="logout" aria-hidden="true">${AUTH_ICON_SVGS.logout || ''}</span>`;
            logoutBtn.addEventListener('click', async () => {
                this.closeSocialRealtime();
                await this.account.logout();
                this.accountProfile = null;
                this.accountDetails = null;
                this.accountOnline = false;
                this.resetSocialCenterState();
                this.setAccountMode('login');
                this.setAccountStatus('');
                this.renderAccountModal();
                this.syncStartAuthButton();
                this.syncStartAuthGate();
                this.updateSocialCenterBadge();
            });
            nameRow.appendChild(logoutBtn);
        }
        const editNameButton = document.getElementById('account-edit-name-btn');
        if (editNameButton) {
            const label = this.t('account-edit-name');
            editNameButton.setAttribute('aria-label', label);
            editNameButton.title = label;
        }
        const inlineLogoutButton = document.getElementById('account-logout-btn');
        if (inlineLogoutButton) {
            const label = this.t('account-logout');
            inlineLogoutButton.setAttribute('aria-label', label);
            inlineLogoutButton.title = label;
        }
        if (avatarEditButton) {
            const label = this.t('account-edit-avatar');
            avatarEditButton.setAttribute('aria-label', label);
            avatarEditButton.title = label;
        }
        if (profileMeta) {
            profileMeta.classList.toggle('is-hidden', this.hasAuthenticatedAccount(profile));
        }
        const isAuthenticated = this.hasAuthenticatedAccount(profile);
        if (profilePanel) profilePanel.classList.toggle('is-hidden', !isAuthenticated);
        if (authPanel) authPanel.classList.toggle('is-hidden', isAuthenticated);
        if (historyPanel) historyPanel.classList.add('is-hidden');
        const canRefresh = this.hasAuthenticatedAccount(profile);
        const canLogout = this.hasAuthenticatedAccount(profile);
        if (refreshButton) refreshButton.disabled = !canRefresh;
        if (logoutButton) logoutButton.disabled = !canLogout;
        if (closeButton) closeButton.disabled = !isAuthenticated;
        if (avatar) {
            const avatarUrl = profile?.image || profile?.avatarUrl || profile?.providerImage || '';
            avatar.classList.toggle('has-image', Boolean(avatarUrl));
            avatar.innerHTML = '';
            if (avatarUrl) {
                const img = document.createElement('img');
                img.className = 'account-avatar-image';
                img.alt = profile?.name || 'Player avatar';
                img.src = avatarUrl;
                img.referrerPolicy = 'no-referrer';
                img.onerror = () => {
                    img.onerror = null;
                    avatar.classList.remove('has-image');
                    avatar.innerHTML = '';
                    const initial = document.createElement('span');
                    initial.className = 'account-avatar-initial';
                    initial.textContent = this.getTurnAvatarText?.(profile?.name || profile?.displayName || 'P') || 'P';
                    avatar.appendChild(initial);
                };
                avatar.appendChild(img);
            } else {
                const initial = document.createElement('span');
                initial.className = 'account-avatar-initial';
                initial.textContent = (profile?.name || 'D').slice(0, 1).toUpperCase();
                avatar.appendChild(initial);
            }
        }
        if (profileName) profileName.textContent = profile?.name || 'Domino Player';
        if (profileMeta) profileMeta.textContent = profile
            ? this.t('account-guest-profile')
            : this.t('account-guest-profile');
        if (title) title.textContent = this.t('account-profile-title');
        const activeMode = this.getSelectedGameMode();
        const activeStats = this.getProfileModeStats(profile, activeMode);
        if (ratingValue) ratingValue.textContent = String(activeStats.rating ?? profile?.rating ?? 1000);
        if (winsValue) winsValue.textContent = String(activeStats.wins ?? profile?.wins ?? 0);
        if (matchesValue) matchesValue.textContent = String(activeStats.matchesPlayed ?? profile?.matchesPlayed ?? 0);
        if (coinsValue) coinsValue.textContent = String(details?.wallet?.balance ?? profile?.coins ?? profile?.wallet?.balance ?? 0);
        const titleCard = document.getElementById('account-title-value')?.closest?.('.account-stat-card');
        if (titleCard) titleCard.classList.add('is-hidden');
        this.syncAccountModeStats(profile);
        if (!profile) {
            document.getElementById('account-mode-stats')?.classList.add('is-hidden');
            if (historyList) this.setSummaryMessage(historyList, this.t('account-history-empty'));
            return;
        }
        document.getElementById('account-mode-stats')?.classList.remove('is-hidden');
        if (historyList) {
            const recentMatches = Array.isArray(details?.recentMatches) ? details.recentMatches : [];
            if (!recentMatches.length) {
                this.setSummaryMessage(historyList, this.t('account-history-empty'));
            } else {
                historyList.innerHTML = '';
                recentMatches.forEach((match) => {
                    const item = document.createElement('div');
                    item.className = 'room-player-chip account-history-chip';
                    const delta = Number(match.ratingDelta || 0);
                    const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
                    const resultKey = match.result === 'win'
                        ? 'account-history-win'
                        : match.result === 'loss'
                            ? 'account-history-loss'
                            : 'account-history-draw';
                    const matchMode = match.gameMode || match.mode || this.getSelectedGameMode();

                    const badge = document.createElement('span');
                    badge.className = 'room-badge account-history-mode-badge';
                    badge.textContent = this.getModeLabel(matchMode);

                    const body = document.createElement('div');
                    body.className = 'room-player-chip-body';
                    const titleRow = document.createElement('div');
                    titleRow.className = 'room-player-chip-title-row';
                    const label = document.createElement('span');
                    label.className = 'room-player-chip-title';
                    label.textContent = this.t(resultKey);
                    titleRow.appendChild(label);
                    body.appendChild(titleRow);

                    const value = document.createElement('strong');
                    value.className = 'account-history-delta';
                    value.textContent = deltaLabel;

                    item.appendChild(badge);
                    item.appendChild(body);
                    item.appendChild(value);
                    historyList.appendChild(item);
                });
            }
        }
        this.renderGiftInventory();
        this.renderTableSkinInventory();
        this.syncAccountProfileTabs();
        this.updateSocialCenterBadge();
        this.syncStartAuthButton();
    }

    syncStartAuthButton() {
        const button = document.getElementById('account-btn');
        if (!button) return;
        const hasSession = this.hasAuthenticatedAccount();
        const labelKey = hasSession ? 'account-profile' : 'account-login';
        const label = this.t(labelKey);
        button.classList.add('icon-btn');
        button.innerHTML = `<span class="auth-icon auth-icon-user" data-auth-icon="user" aria-hidden="true">${AUTH_ICON_SVGS.user || ''}</span>`;
        button.setAttribute('aria-label', label);
        button.title = label;
        button.classList.toggle('is-authenticated', hasSession);
        const friendsButton = document.getElementById('open-friends-btn');
        if (friendsButton) {
            const friendsLabel = this.t('friends-open-button');
            friendsButton.style.display = hasSession ? '' : 'none';
            friendsButton.setAttribute('aria-label', friendsLabel);
            friendsButton.title = friendsLabel;
            const text = friendsButton.querySelector('.start-compact-label');
            if (text) text.textContent = friendsLabel;
        }
        const socialButton = document.getElementById('open-social-btn');
        if (socialButton) {
            const socialLabel = this.t('social-open');
            socialButton.style.display = hasSession ? '' : 'none';
            socialButton.setAttribute('aria-label', socialLabel);
            socialButton.title = socialLabel;
            const text = socialButton.querySelector('.start-compact-label');
            if (text) text.textContent = socialLabel;
        }
        this.syncStartShopButtons();
        this.updateSocialCenterBadge();
    }

    syncStartShopButtons() {
        const shopButtons = [
            { id: 'start-coin-shop-btn', labelKey: 'start-coin-shop' },
            { id: 'start-cosmetics-shop-btn', labelKey: 'start-skin-shop' }
        ];
        for (const { id, labelKey } of shopButtons) {
            const button = document.getElementById(id);
            if (!button) continue;
            const label = this.t(labelKey);
            button.title = label;
            button.setAttribute('aria-label', label);
            const labelNode = button.querySelector('.start-top-shop-label');
            if (labelNode) {
                labelNode.textContent = label;
            }
        }
    }

    syncStartLanguageSelect() {
        const select = document.getElementById('start-lang-select');
        if (!select) return;
        if (select.value !== this.currentLang) {
            select.value = this.currentLang;
        }
        select.title = 'Language';
        select.setAttribute('aria-label', 'Language');
    }

    hasGuestSession() {
        return false;
    }

    getActivePresenceSessionId() {
        if (this.network.isMultiplayer) {
            return String(this.network?.room?.sessionId || "").trim();
        }
        return String(this.currentMatchSessionId || "").trim();
    }

    async syncLocalPresence(force = false) {
        if (this.network.isMultiplayer) return;
        const localSessionId = this.getActivePresenceSessionId()
            || this.account?.getOrCreateLocalGameSessionId?.()
            || this.accountProfile?.sessionId
            || "";
        if (!this.gameActive && !this.roundOver && !this.matchOver) {
            if (!this.localPresenceClearQueued) {
                this.localPresenceClearQueued = true;
                await this.account.sendLocalGameHeartbeat({
                    sessionId: localSessionId,
                    displayName: this.getOnlineDisplayName?.() || this.playerName || "Player",
                    provider: this.accountProfile?.provider || "platform",
                    gameMode: this.isTeamMode ? "team" : "solo",
                    isPlaying: false,
                    isConnected: false,
                    roomId: null,
                    roomCode: null
                });
            }
            return;
        }

        const now = Date.now();
        if (!force && now - this.localPresenceLastSentAt < 5000) return;
        this.localPresenceLastSentAt = now;
        this.localPresenceClearQueued = false;
        await this.account.sendLocalGameHeartbeat({
            sessionId: localSessionId,
            displayName: this.getOnlineDisplayName?.() || this.playerName || "Player",
            provider: this.accountProfile?.provider || "platform",
            gameMode: this.isTeamMode ? "team" : "solo",
            isPlaying: true,
            isConnected: true,
            roomId: `local:${localSessionId || "guest"}`,
            roomCode: null
        });
    }

    async clearLocalPresence() {
        this.localPresenceLastSentAt = 0;
        this.localPresenceClearQueued = false;
        if (this.network.isMultiplayer) return;
        const localSessionId = this.getActivePresenceSessionId()
            || this.account?.getOrCreateLocalGameSessionId?.()
            || this.accountProfile?.sessionId
            || "";
        await this.account.sendLocalGameHeartbeat({
            sessionId: localSessionId,
            displayName: this.getOnlineDisplayName?.() || this.playerName || "Player",
            provider: this.accountProfile?.provider || "platform",
            gameMode: this.isTeamMode ? "team" : "solo",
            isPlaying: false,
            isConnected: false,
            roomId: null,
            roomCode: null
        });
    }

    createResumeId(prefix = 'match') {
        if (window.crypto?.randomUUID) {
            return `${prefix}-${window.crypto.randomUUID()}`;
        }
        const bytes = window.crypto?.getRandomValues ? window.crypto.getRandomValues(new Uint8Array(16)) : null;
        if (bytes) {
            const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
            return `${prefix}-${hex}`;
        }
        return `${prefix}-${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36)}`;
    }

    clearTurnTimers() {
        clearTimeout(this._firstTurnTimeout);
        clearTimeout(this._aiTurnTimeout);
        clearTimeout(this._turnAdvanceTimeout);
        clearTimeout(this._dealEndTimeout);
        clearTimeout(this._lastMoveRevealTimeout);
        clearTimeout(this._turnTimeoutId);
        clearInterval(this._turnTimerTickId);
        this._firstTurnTimeout = null;
        this._aiTurnTimeout = null;
        this._turnAdvanceTimeout = null;
        this._dealEndTimeout = null;
        this._lastMoveRevealTimeout = null;
        this._turnTimeoutId = null;
        this._turnTimerTickId = null;
        this.activeTurnDeadlineAt = 0;
        this.activeTurnVersionForTimer = 0;
        this.activeTurnPlayerIndexForTimer = -1;
        this.postMoveWindowActive = false;
        this.postMoveWindowEndsAt = 0;
        this.turnDeadlineAt = 0;
        this.updateTurnTimerHud();
    }

    syncServerClock(serverNow) {
        const value = Number(serverNow || 0);
        if (!(value > 0)) return;
        const offset = value - Date.now();
        if (!this.lastServerTimeSyncAt) {
            this.serverTimeOffsetMs = offset;
        } else {
            this.serverTimeOffsetMs = Math.round((this.serverTimeOffsetMs * 0.85) + (offset * 0.15));
        }
        this.lastServerTimeSyncAt = Date.now();
    }

    getSyncedNow() {
        return Date.now() + Number(this.serverTimeOffsetMs || 0);
    }

    getCurrentAccountPlayerId() {
        return String(this.accountProfile?.playerId || this.accountProfile?.id || '').trim();
    }

    clearSocialSoftRefreshTimer() {
        if (this._socialSoftRefreshTimer) {
            clearTimeout(this._socialSoftRefreshTimer);
            this._socialSoftRefreshTimer = null;
        }
    }

    clearSocialRefreshTimers(kind = null) {
        const timers = this._socialRefreshTimers instanceof Map ? this._socialRefreshTimers : new Map();
        if (kind) {
            const key = String(kind || '').trim().toLowerCase();
            const timer = timers.get(key);
            if (timer) clearTimeout(timer);
            timers.delete(key);
            this._socialRefreshInFlight?.delete?.(key);
            this._socialRefreshQueued?.delete?.(key);
            return;
        }
        for (const timer of timers.values()) {
            clearTimeout(timer);
        }
        timers.clear();
        this._socialRefreshInFlight?.clear?.();
        this._socialRefreshQueued?.clear?.();
    }

    getSocialRefreshDelay(kind = 'summary') {
        const key = String(kind || 'summary').trim().toLowerCase();
        const delays = {
            summary: 1200,
            messages: 1400,
            conversation: 1200,
            friends: 1500,
            invites: 1200,
            presence: 1200
        };
        return delays[key] || 1400;
    }

    scheduleSocialRefresh(kind = 'summary', options = {}) {
        if (!this.hasAuthenticatedAccount()) return null;
        const key = String(kind || 'summary').trim().toLowerCase();
        const delay = Math.max(
            0,
            Math.min(15000, Number.isFinite(Number(options?.delayMs)) ? Number(options.delayMs) : this.getSocialRefreshDelay(key))
        );

        this.clearSocialRefreshTimers(key);
        const timer = setTimeout(() => {
            const timers = this._socialRefreshTimers instanceof Map ? this._socialRefreshTimers : new Map();
            timers.delete(key);
            void this.runSocialRefresh(key, options);
        }, delay);
        this._socialRefreshTimers.set(key, timer);
        if (window.DOMINO_DEBUG_SOCIAL === true && options?.reason) {
            debugLog('[SocialRefresh] scheduled', { kind: key, delay, reason: options.reason });
        }
        return timer;
    }

    async runSocialRefresh(kind = 'summary', options = {}) {
        if (!this.hasAuthenticatedAccount()) return false;
        const key = String(kind || 'summary').trim().toLowerCase();
        if (this._socialRefreshInFlight.has(key)) {
            this._socialRefreshQueued.add(key);
            return false;
        }

        this._socialRefreshInFlight.add(key);
        try {
            if (key === 'summary') {
                await this.loadSocialSummary();
            } else if (key === 'messages') {
                await this.loadMessageThreads();
                await this.loadSocialSummary();
                this.updateSocialCenterBadge();
            } else if (key === 'conversation') {
                const activePlayerId = String(options?.playerId || this.accountMessagesState?.activePlayerId || '').trim();
                if (activePlayerId) {
                    await this.loadConversationWithPlayer(activePlayerId, true);
                } else {
                    await this.loadMessageThreads();
                }
            } else if (key === 'friends') {
                await this.loadFriendsPage(true);
                await this.loadSocialSummary();
                this.updateSocialCenterBadge();
            } else if (key === 'invites') {
                await this.loadSocialInvitesPage(true);
                this.updateSocialCenterBadge();
            } else if (key === 'presence') {
                await this.refreshSocialPresenceUi();
                this.updateSocialCenterBadge();
            }
        } catch (error) {
            if (window.DOMINO_DEBUG_SOCIAL === true) {
                debugLog('[SocialRefresh] failed', {
                    kind: key,
                    error: String(error?.message || error || 'refresh_failed')
                });
            }
            if (key !== 'summary') {
                this.updateSocialCenterBadge();
            }
        } finally {
            this._socialRefreshInFlight.delete(key);
            if (this._socialRefreshQueued.has(key)) {
                this._socialRefreshQueued.delete(key);
                this.scheduleSocialRefresh(key, {
                    delayMs: this.getSocialRefreshDelay(key),
                    reason: `queued:${key}`
                });
            }
        }

        return true;
    }

    scheduleSocialSoftRefresh(reason = 'social', delayMs = 6500) {
        if (!this.hasAuthenticatedAccount()) return;
        this.clearSocialSoftRefreshTimer();
        const delay = Math.max(1200, Math.min(15000, Number(delayMs) || 6500));
        this._socialSoftRefreshTimer = setTimeout(() => {
            this._socialSoftRefreshTimer = null;
            if (!this.hasAuthenticatedAccount()) return;
            this.scheduleSocialRefresh('messages', { delayMs: 0, reason });
        }, delay);
    }

    upsertMessageThreadFromMessage(message, threadPlayerId) {
        const payload = message && typeof message === 'object' ? message : null;
        if (!payload) return null;
        const currentPlayerId = this.getCurrentAccountPlayerId();
        const partnerId = String(
            threadPlayerId ||
            payload.threadPlayerId ||
            (String(payload.senderPlayerId || '') === currentPlayerId ? payload.receiverPlayerId : payload.senderPlayerId) ||
            ''
        ).trim();
        if (!partnerId) return null;

        const normalizedMessage = {
            ...payload,
            senderPlayerId: String(payload.senderPlayerId || '').trim(),
            receiverPlayerId: String(payload.receiverPlayerId || '').trim(),
            createdAt: String(payload.createdAt || new Date().toISOString()),
            readAt: payload.readAt || null,
            isOptimistic: Boolean(payload.isOptimistic),
            localStatus: payload.localStatus || payload.status || '',
            tempId: payload.tempId || ''
        };

        const state = this.accountMessagesState || {};
        const threads = Array.isArray(state.threads) ? [...state.threads] : [];
        const activePlayerId = String(state.activePlayerId || '').trim();
        const threadIndex = threads.findIndex((thread) => String(thread?.player?.id || thread?.playerId || thread?.id || '').trim() === partnerId);
        const existingThread = threadIndex >= 0 ? threads[threadIndex] : null;
        const incoming = normalizedMessage.senderPlayerId !== currentPlayerId;
        const activeConversation = this.socialCenterView === 'conversation' && activePlayerId === partnerId;
        const nextThread = existingThread ? { ...existingThread } : {
            id: partnerId,
            playerId: partnerId,
            player: payload.senderPlayerId === partnerId ? payload.sender || payload.player || null : payload.receiver || payload.player || null,
            lastMessage: null,
            unreadCount: 0,
            messageCount: 0
        };

        if (!nextThread.player) {
            const activeProfile = this.accountMessagesState?.activePlayerProfile || null;
            if (String(activeProfile?.id || '').trim() === partnerId) {
                nextThread.player = activeProfile;
            } else if (String(payload.sender?.id || '').trim() === partnerId) {
                nextThread.player = payload.sender;
            } else if (String(payload.receiver?.id || '').trim() === partnerId) {
                nextThread.player = payload.receiver;
            }
        }

        const lastMessageAt = new Date(existingThread?.lastMessage?.createdAt || 0).getTime();
        const messageAt = new Date(normalizedMessage.createdAt || Date.now()).getTime();
        if (!existingThread || !existingThread.lastMessage || messageAt >= lastMessageAt) {
            nextThread.lastMessage = normalizedMessage;
        }
        nextThread.messageCount = Math.max(0, Number(existingThread?.messageCount || 0)) + (existingThread ? 0 : 1);
        if (incoming) {
            nextThread.unreadCount = activeConversation ? 0 : Math.max(0, Number(existingThread?.unreadCount || 0)) + 1;
        } else {
            nextThread.unreadCount = Math.max(0, Number(existingThread?.unreadCount || 0));
        }

        if (threadIndex >= 0) {
            threads[threadIndex] = nextThread;
        } else {
            threads.unshift(nextThread);
        }
        threads.sort((left, right) => new Date(right?.lastMessage?.createdAt || 0).getTime() - new Date(left?.lastMessage?.createdAt || 0).getTime());

        this.accountMessagesState = {
            ...(this.accountMessagesState || {}),
            threads
        };
        this.socialInboxState = {
            ...(this.socialInboxState || {}),
            threads
        };

        if (activeConversation) {
            const existingMessages = Array.isArray(state.messages) ? [...state.messages] : [];
            const existingIndex = existingMessages.findIndex((row) => String(row?.id || '').trim() === String(normalizedMessage.id || '').trim());
            const optimisticIndex = existingMessages.findIndex((row) => {
                if (!row?.isOptimistic) return false;
                if (normalizedMessage.tempId && String(row?.id || '').trim() === String(normalizedMessage.tempId).trim()) {
                    return true;
                }
                const sameSender = String(row?.senderPlayerId || '').trim() === String(normalizedMessage.senderPlayerId || '').trim();
                const sameReceiver = String(row?.receiverPlayerId || '').trim() === String(normalizedMessage.receiverPlayerId || '').trim();
                const sameText = String(row?.text || row?.body || '').trim() === String(normalizedMessage.text || normalizedMessage.body || '').trim();
                return sameSender && sameReceiver && sameText;
            });
            if (existingIndex >= 0) {
                existingMessages[existingIndex] = { ...existingMessages[existingIndex], ...normalizedMessage };
            } else if (optimisticIndex >= 0) {
                existingMessages[optimisticIndex] = {
                    ...existingMessages[optimisticIndex],
                    ...normalizedMessage,
                    isOptimistic: false,
                    localStatus: 'sent'
                };
            } else {
                existingMessages.push(normalizedMessage);
            }
            existingMessages.sort((left, right) => new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime());
            this.accountMessagesState = {
                ...(this.accountMessagesState || {}),
                messages: existingMessages
            };
            this.renderAccountMessagesPanel();
        }

        return normalizedMessage;
    }

    applyRealtimeDirectMessage(payload) {
        this._lastDmEventAt = Date.now();
        const eventType = String(payload?.type || '').trim();
        const message = payload?.message && typeof payload.message === 'object'
            ? payload.message
            : (payload?.senderPlayerId || payload?.text ? {
                senderPlayerId: payload.senderPlayerId,
                receiverPlayerId: payload.receiverPlayerId,
                text: payload.text,
                createdAt: payload.createdAt || new Date().toISOString(),
                sender: payload.sender || null,
                receiver: payload.receiver || null
            } : null);
        if (!message) return null;
        const threadPlayerId = String(
            payload?.threadPlayerId ||
            message.threadPlayerId ||
            (String(message.senderPlayerId || '') === this.getCurrentAccountPlayerId() ? message.receiverPlayerId : message.senderPlayerId) ||
            ''
        ).trim();
        const normalized = this.upsertMessageThreadFromMessage({
            ...message,
            tempId: payload?.tempId || message.tempId || '',
            type: eventType,
            isOptimistic: false
        }, threadPlayerId);
        if (!normalized) return null;

        const state = this.accountMessagesState || {};
        const activePlayerId = String(state.activePlayerId || '').trim();
        const currentPlayerId = this.getCurrentAccountPlayerId();
        const isMine = String(normalized.senderPlayerId || '') === currentPlayerId;
        const isActiveConversation = this.socialCenterView === 'conversation' && activePlayerId === threadPlayerId;
        if (isActiveConversation) {
            const messages = Array.isArray(state.messages) ? [...state.messages] : [];
            const existingIndex = messages.findIndex((row) => String(row?.id || '').trim() === String(normalized.id || '').trim());
            if (existingIndex >= 0) {
                messages[existingIndex] = { ...messages[existingIndex], ...normalized, isOptimistic: false, localStatus: 'sent' };
            } else if (!isMine || eventType === 'message_sent') {
                messages.push({ ...normalized, isOptimistic: false, localStatus: 'sent' });
            }
            messages.sort((left, right) => new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime());
            this.accountMessagesState = {
                ...(this.accountMessagesState || {}),
                messages
            };
            this.renderAccountMessagesPanel();
        }
        this._lastDmError = '';
        this.updateSocialCenterBadge();
        return normalized;
    }

    applyRealtimeRoomInvitation(payload) {
        this._lastInviteEventAt = Date.now();
        const invite = payload?.invite && typeof payload.invite === 'object' ? payload.invite : null;
        if (!invite) return null;
        const currentPlayerId = this.getCurrentAccountPlayerId();
        const normalizedInvite = { ...invite };
        const inviteStatus = String(normalizedInvite.status || '').trim().toLowerCase();
        const eventName = String(payload?.__eventName || payload?.type || '').trim().toLowerCase();
        const eventType = String(payload?.type || '').trim().toLowerCase();
        const isPlayEvent = eventName.startsWith('play-invite')
            || eventName.startsWith('play_invite')
            || eventType.startsWith('play_invite');
        if (isPlayEvent) {
            this._lastPlayInviteEventAt = Date.now();
        }
        const safePayload = this.buildInviteDebugPayloadSafe({
            ...normalizedInvite,
            type: eventType || eventName || inviteStatus
        });
        if (eventName === 'invite:new' || eventName === 'invite_created' || eventName === 'play-invite:new' || eventName === 'play_invite_created' || inviteStatus === 'pending') {
            this._lastInviteReceivedAt = Date.now();
            this._lastInviteReceivedPayloadSafe = safePayload;
            this.logSocialInvite('invite:new received', safePayload);
        }
        this._lastInviteUpdateAt = Date.now();
        this._lastInviteUpdatePayloadSafe = safePayload;
        if (eventName === 'play-invite:new' || eventName === 'play_invite_created' || eventType === 'play_invite_created') {
            this._lastPlayInviteReceivedAt = Date.now();
            this._lastPlayInviteReceivedPayloadSafe = safePayload;
            this.logSocialInvite('play-invite:new received', safePayload);
        }
        this._lastPlayInviteUpdateAt = Date.now();
        this._lastPlayInviteUpdatePayloadSafe = safePayload;
        this.roomInvitations = this.mergeRoomInvitations(this.roomInvitations || { incoming: [], sent: [] }, {
            incoming: String(normalizedInvite.invitee?.id || '').trim() === currentPlayerId ? [normalizedInvite] : [],
            sent: String(normalizedInvite.inviter?.id || '').trim() === currentPlayerId ? [normalizedInvite] : []
        }, currentPlayerId);
        this.roomInvitationsLoading = false;
        this._lastInviteError = '';
        if (isPlayEvent && (eventName === 'play-invite:accepted' || eventName === 'play_invite_accepted' || eventType === 'play_invite_accepted' || inviteStatus === 'accepted')) {
            this._lastPlayInviteAcceptedAt = Date.now();
            this._lastPlayInviteAcceptedPayloadSafe = safePayload;
            const acceptedInviteId = String(normalizedInvite.id || '').trim();
            const acceptedRoomBound = this.isPlayInviteRoomBound(normalizedInvite);
            this._lastPlayInviteAcceptedFlowType = acceptedRoomBound ? 'room-bound' : 'reservation';
            this._lastPlayInviteAcceptedHadRoomId = Boolean(String(normalizedInvite.roomId || '').trim());
            this._lastAcceptedInviteWasRoomBound = acceptedRoomBound;
            this._lastPlayInviteAcceptedWaitingSuppressedForRoomBound = acceptedRoomBound;
            const inviterPlayerId = String(normalizedInvite.inviter?.id || '').trim();
            const inviteePlayerId = String(normalizedInvite.invitee?.id || '').trim();
            if (inviterPlayerId === currentPlayerId) {
                const inviteeName = String(normalizedInvite.invitee?.displayName || 'Player').trim();
                const message = this.currentLang === 'az'
                    ? (acceptedRoomBound
                        ? `${inviteeName} dəvəti qəbul etdi`
                        : `${inviteeName} dəvəti qəbul etdi və gözləyir`)
                    : (acceptedRoomBound
                        ? `${inviteeName} accepted your invite`
                        : `${inviteeName} accepted your invite and is waiting.`);
                this.renderer.showMessage(message, 1800);
                if (!acceptedRoomBound && acceptedInviteId) {
                    this.acceptedWaitingInviteIds.add(acceptedInviteId);
                }
                void this.loadFriendsHub().catch(() => {});
            }
            if (inviteePlayerId === currentPlayerId) {
                if (!acceptedRoomBound) {
                    if (acceptedInviteId) {
                        this.acceptedWaitingInviteIds.add(acceptedInviteId);
                    }
                    this.gameInviteState = {
                        ...(this.gameInviteState || {}),
                        inviteId: acceptedInviteId || this.gameInviteState?.inviteId || '',
                        inviteePlayerId: currentPlayerId,
                        inviteeDisplayName: String(normalizedInvite.invitee?.displayName || this.accountProfile?.displayName || '').trim(),
                        sessionId: String(normalizedInvite.id || normalizedInvite.roomId || this.gameInviteState?.sessionId || '').trim(),
                        role: 'invitee',
                        roomLinked: Boolean(String(normalizedInvite.roomId || '').trim()),
                        createPromptShown: Boolean(this.gameInviteState?.createPromptShown),
                        waitingPromptShown: true,
                        createdAt: this.gameInviteState?.createdAt || Date.now()
                    };
                    this.startGameInviteRefresh();
                    this.renderer.showMessage(
                        this.currentLang === 'az'
                            ? 'Otaq gözlənilir'
                            : 'Waiting for room',
                        1800
                    );
                } else {
                    this._lastPlayInviteAcceptedWaitingSuppressedForRoomBound = true;
                    this.acceptedWaitingInviteIds.delete(acceptedInviteId);
                    this.gameInviteState = null;
                    void this.joinPlayInviteRoom(normalizedInvite, { manual: true }).catch(() => {});
                }
            }
        }
        if (isPlayEvent && (eventName === 'play-invite:room-ready' || eventName === 'play_invite_room_ready' || eventType === 'play_invite_room_ready' || inviteStatus === 'room_created')) {
            this._lastPlayInviteRoomReadyAt = Date.now();
            this._lastPlayInviteRoomReadyPayloadSafe = safePayload;
            const inviteId = String(normalizedInvite.id || '').trim();
            if (inviteId) {
                this.playInviteRoomReadyIds.add(inviteId);
            }
            const inviteePlayerId = String(normalizedInvite.invitee?.id || '').trim();
            const inviterPlayerId = String(normalizedInvite.inviter?.id || '').trim();
            if (inviteePlayerId === currentPlayerId) {
                this.gameInviteState = {
                    ...(this.gameInviteState || {}),
                    inviteId: inviteId || this.gameInviteState?.inviteId || '',
                    inviteePlayerId: currentPlayerId,
                    inviteeDisplayName: String(normalizedInvite.invitee?.displayName || this.accountProfile?.displayName || '').trim(),
                    sessionId: String(normalizedInvite.roomId || normalizedInvite.id || this.gameInviteState?.sessionId || '').trim(),
                    role: 'invitee',
                    roomLinked: Boolean(String(normalizedInvite.roomId || '').trim()),
                    createPromptShown: Boolean(this.gameInviteState?.createPromptShown),
                    waitingPromptShown: true,
                    createdAt: this.gameInviteState?.createdAt || Date.now()
                };
                this.startGameInviteRefresh();
                void this.joinPlayInviteRoom(normalizedInvite, { manual: false }).catch(() => {});
            }
            if (inviterPlayerId === currentPlayerId) {
                const inviteeName = String(normalizedInvite.invitee?.displayName || 'Player').trim();
                const message = this.currentLang === 'az'
                    ? `${inviteeName} üçün otaq hazırdır`
                    : `${inviteeName}'s room is ready`;
                this.renderer.showMessage(message, 1800);
                void this.loadFriendsHub().catch(() => {});
            }
        }
        if (isPlayEvent && (eventName === 'play-invite:joined' || eventName === 'play_invite_joined' || eventType === 'play_invite_joined' || inviteStatus === 'joined')) {
            const inviteId = String(normalizedInvite.id || '').trim();
            if (inviteId) {
                this.playInviteRoomReadyIds.delete(inviteId);
                this.playInviteJoiningIds.delete(inviteId);
                this.acceptedWaitingInviteIds.delete(inviteId);
            }
            this._lastPlayInviteUpdatePayloadSafe = safePayload;
            if (String(normalizedInvite.invitee?.id || '').trim() === currentPlayerId) {
                this.stopGameInviteRefresh();
                this.gameInviteState = null;
                this.renderer.showMessage(
                    this.currentLang === 'az'
                        ? 'Qoşuldunuz.'
                        : 'Joined.',
                    1400
                );
            }
            if (String(normalizedInvite.inviter?.id || '').trim() === currentPlayerId) {
                this.renderer.showMessage(
                    this.currentLang === 'az'
                        ? `${String(normalizedInvite.invitee?.displayName || 'Oyunçu').trim()} otağa qoşuldu`
                        : `${String(normalizedInvite.invitee?.displayName || 'Player').trim()} joined the room`,
                    1400
                );
                this.stopGameInviteRefresh();
                this.gameInviteState = null;
            }
        }
        if (inviteStatus === 'pending' && String(normalizedInvite.invitee?.id || '').trim() === currentPlayerId) {
            this.gameInviteState = {
                ...(this.gameInviteState || {}),
                inviteId: String(normalizedInvite.id || this.gameInviteState?.inviteId || '').trim(),
                inviteePlayerId: currentPlayerId,
                inviteeDisplayName: String(normalizedInvite.invitee?.displayName || this.accountProfile?.displayName || '').trim(),
                sessionId: String(normalizedInvite.id || normalizedInvite.roomId || this.gameInviteState?.sessionId || '').trim(),
                role: 'invitee',
                roomLinked: Boolean(String(normalizedInvite.roomId || '').trim()),
                createPromptShown: Boolean(this.gameInviteState?.createPromptShown),
                waitingPromptShown: Boolean(this.gameInviteState?.waitingPromptShown),
                createdAt: this.gameInviteState?.createdAt || Date.now()
            };
            this.startGameInviteRefresh();
            const inviteSignature = `${String(normalizedInvite.id || '').trim()}:${inviteStatus}:${String(normalizedInvite.updatedAt || normalizedInvite.createdAt || '').trim()}`;
            if (inviteSignature && inviteSignature !== this._lastIncomingInviteSignature) {
                this._lastIncomingInviteSignature = inviteSignature;
                const inviterName = String(normalizedInvite.inviter?.displayName || '').trim();
                const message = this.currentLang === 'ru'
                    ? (inviterName ? `Новое приглашение от ${inviterName}` : 'Новое приглашение в игру')
                    : this.currentLang === 'az'
                        ? (inviterName ? `${inviterName} tərəfindən yeni dəvət` : 'Yeni oyun dəvəti')
                        : (inviterName ? `New invite from ${inviterName}` : 'New game invite');
                this.renderer.showMessage(message, 1800);
            }
        }
        if (this.gameInviteState?.inviteId && String(this.gameInviteState.inviteId).trim() === String(normalizedInvite.id || '').trim()) {
            this.gameInviteState = {
                ...(this.gameInviteState || {}),
                inviteePlayerId: String(normalizedInvite.invitee?.id || this.gameInviteState.inviteePlayerId || '').trim(),
                inviteeDisplayName: String(normalizedInvite.invitee?.displayName || this.gameInviteState.inviteeDisplayName || '').trim(),
                sessionId: String(normalizedInvite.id || normalizedInvite.roomId || this.gameInviteState.sessionId || '').trim(),
                roomLinked: Boolean(String(normalizedInvite.roomId || '').trim()),
                createdAt: this.gameInviteState.createdAt || Date.now()
            };
        }
        if (inviteStatus === 'accepted' || inviteStatus === 'declined' || inviteStatus === 'expired' || inviteStatus === 'cancelled') {
            const inviteId = String(normalizedInvite.id || '').trim();
            if (inviteStatus === 'declined' || inviteStatus === 'expired' || inviteStatus === 'cancelled') {
                if (inviteId) {
                    this.acceptedWaitingInviteIds.delete(inviteId);
                    this.playInviteRoomReadyIds.delete(inviteId);
                    this.playInviteJoiningIds.delete(inviteId);
                    this.playInviteAutoJoinAttemptedIds.delete(inviteId);
                }
                if (String(normalizedInvite.invitee?.id || '').trim() === currentPlayerId || String(normalizedInvite.inviter?.id || '').trim() === currentPlayerId) {
                    this.gameInviteState = null;
                    this.stopGameInviteRefresh();
                }
            }
            this._lastInviteError = '';
        }
        this._lastIncomingInvitesSafe = (Array.isArray(this.roomInvitations?.incoming) ? this.roomInvitations.incoming : [])
            .map((item) => this.safeInviteDebugRecord(item))
            .slice(0, 5);
        this.renderRoomInvitationsPanel();
        this.updateSocialCenterBadge();
        return normalizedInvite;
    }

    clearSocialSseReconnectTimer() {
        if (this._socialSseReconnectTimer) {
            clearTimeout(this._socialSseReconnectTimer);
            this._socialSseReconnectTimer = null;
        }
    }

    closeSocialSse() {
        this.clearSocialSseReconnectTimer();
        this.clearSocialSoftRefreshTimer();
        this._socialSseRetryCount = 0;
        if (this._socialSse) {
            try {
                this._socialSse.close();
            } catch (err) {
                debugLog("[SocialSSE] close failed", err);
            }
            this._socialSse = null;
        }
    }

    scheduleSocialSseReconnect() {
        if (!this.hasAuthenticatedAccount()) return;
        if (this._socialSseReconnectTimer) return;
        const delays = [2000, 5000, 10000, 30000];
        const delay = delays[Math.min(this._socialSseRetryCount, delays.length - 1)];
        this._socialSseRetryCount += 1;
        this._socialSseReconnectTimer = setTimeout(() => {
            this._socialSseReconnectTimer = null;
            if (!this.hasAuthenticatedAccount()) return;
            this.initSocialSse();
        }, delay);
    }

    clearNextDealAdvanceTimeout() {
        clearTimeout(this._nextDealAdvanceTimeout);
        this._nextDealAdvanceTimeout = null;
    }

    scheduleNextDealAdvance(delay = 900) {
        this.clearNextDealAdvanceTimeout();
        if (this.matchOver) return;
        this._nextDealAdvanceTimeout = setTimeout(() => {
            this._nextDealAdvanceTimeout = null;
            if (this.matchOver) return;
            void this.startDeal();
        }, delay);
    }

    delayLastMoveSettlement(callback, delay = LAST_MOVE_REVEAL_DELAY_MS, finalInfo = null) {
        clearTimeout(this._lastMoveRevealTimeout);
        this._lastMoveRevealTimeout = null;
        this.lastMoveRevealPending = true;
        this.turnInProgress = true;
        this.renderState();
        
        const runPreResultAndCallback = async () => {
            if (finalInfo) {
                await this.showPreResultStage(finalInfo);
            }
            try {
                callback?.();
            } finally {
                this.lastMoveRevealPending = false;
                this.turnInProgress = false;
                this.renderState();
            }
        };

        this._lastMoveRevealTimeout = setTimeout(() => {
            this._lastMoveRevealTimeout = null;
            void runPreResultAndCallback();
        }, Math.max(0, Number(delay || 0) || 0));
    }

    scheduleTurnAdvance(delay = this.postMoveAdvanceMs, turnCycleId = this._turnCycleId) {
        clearTimeout(this._turnAdvanceTimeout);
        if (delay <= 0) {
            this.postMoveWindowActive = false;
            this.postMoveWindowEndsAt = 0;
            this.turnInProgress = false;
            this.advanceTurn();
            return;
        }
        this.postMoveWindowActive = true;
        this.postMoveWindowEndsAt = Date.now() + delay;
        this._turnAdvanceTimeout = setTimeout(() => {
            if (turnCycleId !== this._turnCycleId) return;
            this.postMoveWindowActive = false;
            this.postMoveWindowEndsAt = 0;
            this.turnInProgress = false;
            this.advanceTurn();
        }, delay);
    }

    shouldOpenGoshaChainWindow(pi) {
        if (this.mode === 'classic101') return false;
        if (this.ais.some((ai) => ai.index === pi)) return false;
        const hand = this.hands[pi];
        if (!Array.isArray(hand) || hand.length === 0) return false;
        const nextCombo = this.board.getGoshaCombo(hand);
        return Boolean(nextCombo);
    }

    setSummaryMessage(container, message) {
        if (!container) return;
        const node = document.createElement('div');
        node.className = 'room-summary';
        node.textContent = String(message ?? '');
        container.replaceChildren(node);
    }

    makeGameInviteSessionId() {
        const base = String(this.accountProfile?.playerId || this.accountProfile?.id || this.accountProfile?.userId || 'invite').trim();
        const token = Math.random().toString(36).slice(2, 8);
        return `game_invite_${Date.now()}_${base.slice(0, 8)}_${token}`;
    }

    startSocialHubAutoRefresh() {
        this.stopSocialHubAutoRefresh();
        this._socialHubRefreshInterval = window.setInterval(async () => {
            if (!this.hasAuthenticatedAccount()) return;
            const modal = document.getElementById('social-center-modal');
            const chat = document.getElementById('social-chats-panel');
            const isOpen = modal?.classList.contains('active') || (chat && !chat.classList.contains('is-hidden'));
            if (!isOpen) {
                this.stopSocialHubAutoRefresh();
                return;
            }
            try {
                if (this.socialCenterView === 'conversation') {
                    const activeId = String(this.accountMessagesState?.activePlayerId || '').trim();
                    if (activeId) {
                        this.scheduleSocialRefresh('conversation', {
                            delayMs: 0,
                            reason: 'hub-refresh-conversation',
                            playerId: activeId
                        });
                    }
                } else {
                    if (this.socialCenterTab === 'inbox') {
                        this.scheduleSocialRefresh('messages', {
                            delayMs: 0,
                            reason: 'hub-refresh-messages'
                        });
                        this.scheduleSocialRefresh('invites', {
                            delayMs: 0,
                            reason: 'hub-refresh-invites'
                        });
                    } else if (this.socialCenterTab === 'invites') {
                        this.scheduleSocialRefresh('invites', {
                            delayMs: 0,
                            reason: 'hub-refresh-invites-only'
                        });
                    } else if (this.socialCenterTab === 'friends') {
                        this.scheduleSocialRefresh('friends', {
                            delayMs: 0,
                            reason: 'hub-refresh-friends'
                        });
                    }
                }
            } catch (e) {
                console.error("Social hub refresh error:", e);
            }
        }, 30000);
    }

    stopSocialHubAutoRefresh() {
        if (this._socialHubRefreshInterval) {
            clearInterval(this._socialHubRefreshInterval);
            this._socialHubRefreshInterval = null;
        }
    }

    startGameInviteRefresh({ intervalMs = 4500, durationMs = 120000 } = {}) {
        if (!this.hasAuthenticatedAccount()) return;
        const now = Date.now();
        const nextUntil = now + Math.max(30000, Number(durationMs || 0) || 120000);
        this._gameInviteRefreshUntil = Math.max(Number(this._gameInviteRefreshUntil || 0), nextUntil);
        if (this._gameInviteRefreshId) return;

        const tick = async () => {
            if (!this.hasAuthenticatedAccount()) {
                this.stopGameInviteRefresh();
                return;
            }
            if (!this.gameInviteState && this._gameInviteRefreshUntil && Date.now() > this._gameInviteRefreshUntil) {
                this.stopGameInviteRefresh();
                return;
            }
            try {
                const invitations = await this.account.getPlayInvites();
                if (!invitations) return;
                const incoming = Array.isArray(invitations.incoming) ? invitations.incoming : [];
                const activeIncoming = incoming.filter((invite) => this.isPlayInviteActive(invite));
                const activePendingIncoming = activeIncoming.filter((invite) => String(invite?.status || '').trim().toLowerCase() === 'pending');
                const incomingSignature = activePendingIncoming
                    .map((invite) => `${String(invite.id || '').trim()}:${String(invite.status || '').trim()}:${String(invite.updatedAt || invite.createdAt || '').trim()}`)
                    .join('|');
                const signatureChanged = incomingSignature !== this._lastIncomingInviteSignature;
                this._lastIncomingInviteSignature = incomingSignature;
                this.roomInvitations = this.mergeRoomInvitations(this.roomInvitations || { incoming: [], sent: [] }, invitations || { incoming: [], sent: [] });

                const hasModalOpen = Boolean(document.getElementById('social-center-modal')?.classList.contains('active'));
                const hasPendingInvite = activePendingIncoming.length > 0;
                if (hasPendingInvite && (!this.gameInviteState?.sessionId || this.gameInviteState.role !== 'invitee')) {
                    const firstInvite = activePendingIncoming[0];
                    this.gameInviteState = {
                        inviteId: String(firstInvite.id || '').trim(),
                        inviteePlayerId: String(firstInvite.invitee?.id || this.getCurrentAccountPlayerId() || '').trim(),
                        inviteeDisplayName: String(firstInvite.invitee?.displayName || this.accountProfile?.displayName || '').trim(),
                        sessionId: String(firstInvite.id || firstInvite.roomId || '').trim(),
                        role: 'invitee',
                        roomLinked: Boolean(String(firstInvite.roomId || '').trim()),
                        createPromptShown: false,
                        waitingPromptShown: false,
                        createdAt: Date.now()
                    };
                }

                this.restoreGameInviteStateFromInvitations();
                void this.refreshGameInviteState().catch(() => {});

                if (signatureChanged && hasPendingInvite && !hasModalOpen) {
                    const inviterName = String(activePendingIncoming[0]?.inviter?.displayName || '').trim();
                    const message = this.currentLang === 'ru'
                        ? (inviterName ? `Новое приглашение от ${inviterName}` : 'Новое приглашение в игру')
                        : this.currentLang === 'az'
                            ? (inviterName ? `${inviterName} tərəfindən yeni dəvət` : 'Yeni oyun dəvəti')
                            : (inviterName ? `New invite from ${inviterName}` : 'New game invite');
                    this.renderer.showMessage(message, 1800);
                }

                if (hasModalOpen && (this.socialCenterTab === 'inbox' || this.socialCenterTab === 'invites')) {
                    await this.loadSocialInvitesPage(true).catch(() => {});
                }
                this.updateSocialCenterBadge();
            } catch (err) {
                debugLog("[GameInviteRefresh] poll failed", err);
            }
        };

        void tick();
        this._gameInviteRefreshId = window.setInterval(() => {
            void tick();
        }, Math.max(3000, Number(intervalMs || 0) || 4500));
    }

    stopGameInviteRefresh() {
        if (this._gameInviteRefreshId) {
            clearInterval(this._gameInviteRefreshId);
            this._gameInviteRefreshId = null;
        }
        this._gameInviteRefreshUntil = 0;
        this._lastIncomingInviteSignature = '';
    }

    async sendGameInviteToPlayer(playerRef, context = {}) {
        const inviteePlayerId = this.getFriendPlayerId(playerRef);
        const roomInviteContext = context?.roomInviteContext && typeof context.roomInviteContext === 'object' && !Array.isArray(context.roomInviteContext)
            ? context.roomInviteContext
            : this.getCurrentRoomInviteContext(context);
        const clickedFriendSafe = {
            playerId: inviteePlayerId || null,
            displayName: String(playerRef?.displayName || playerRef?.friend?.displayName || playerRef?.name || '').trim() || null,
            source: String(context?.source || 'social').trim() || 'social'
        };
        this._socialInviteTrace = {
            clickedAt: Date.now(),
            clickedFriendSafe,
            selectedFriendPlayerId: inviteePlayerId || null,
            activeRoomContext: this.getActiveInviteRoomContext(),
            chosenTransport: this._socialSocket?.connected ? 'socket' : 'rest',
            payload: null,
            beforeSocketStatus: this.getSocialRealtimeStatus?.() || null,
            beforeIncomingCount: Array.isArray(this.roomInvitations?.incoming) ? this.roomInvitations.incoming.length : 0
        };
        this.renderSocialDebugPanel();
        if (!inviteePlayerId) {
            const error = new Error(this.t('friends-load-failed'));
            this.recordPlayInviteSendError(error, {
                source: String(context?.source || 'social').trim() || 'social',
                inviteePlayerId: null
            });
            throw error;
        }
        const normalizedRoomInviteContext = roomInviteContext
            ? {
                roomId: String(roomInviteContext.roomId || '').trim() || null,
                roomCode: String(roomInviteContext.roomCode || '').trim() || null,
                roomMode: String(roomInviteContext.roomMode || (this.isTeamMode ? 'team' : 'ffa')).trim() || null,
                roomVisibility: String(roomInviteContext.roomVisibility || this.onlineRoomVisibility || '').trim() || null,
                stakeKey: String(roomInviteContext.stakeKey || this.onlineStakeKey || '').trim() || null,
                stakeAmount: Number.isFinite(Number(roomInviteContext.stakeAmount)) ? Math.max(0, Number(roomInviteContext.stakeAmount)) : 0,
                humanSeats: Number.isFinite(Number(roomInviteContext.humanSeats)) ? Number(roomInviteContext.humanSeats) : null,
                totalPlayers: Number.isFinite(Number(roomInviteContext.totalPlayers)) ? Number(roomInviteContext.totalPlayers) : null,
                targetSlotIndex: Number.isInteger(Number(roomInviteContext.targetSlotIndex)) ? Number(roomInviteContext.targetSlotIndex) : null,
                openSeatPickerOnJoin: typeof roomInviteContext.openSeatPickerOnJoin === 'boolean' ? roomInviteContext.openSeatPickerOnJoin : null,
                inviterPlayerId: String(roomInviteContext.inviterPlayerId || this.getCurrentAccountPlayerId?.() || '').trim() || null,
                inviteePlayerId,
                source: String(roomInviteContext.source || context?.source || 'social').trim() || 'social'
            }
            : null;
        const payload = {
            inviteePlayerId,
            note: String(context.note || context.source || 'play-invite').trim() || 'play-invite',
            payloadJson: {
                source: String(context.source || 'social').trim() || 'social',
                inviteeDisplayName: String(playerRef?.displayName || '').trim() || null,
                ...(normalizedRoomInviteContext ? {
                    roomContext: normalizedRoomInviteContext,
                    roomId: normalizedRoomInviteContext.roomId,
                    roomCode: normalizedRoomInviteContext.roomCode,
                    roomMode: normalizedRoomInviteContext.roomMode,
                    roomVisibility: normalizedRoomInviteContext.roomVisibility,
                    stakeKey: normalizedRoomInviteContext.stakeKey,
                    stakeAmount: normalizedRoomInviteContext.stakeAmount,
                    humanSeats: normalizedRoomInviteContext.humanSeats,
                    totalPlayers: normalizedRoomInviteContext.totalPlayers,
                    targetSlotIndex: normalizedRoomInviteContext.targetSlotIndex,
                    openSeatPickerOnJoin: normalizedRoomInviteContext.openSeatPickerOnJoin,
                    inviterPlayerId: normalizedRoomInviteContext.inviterPlayerId,
                    inviteePlayerId
                } : {})
            }
        };
        this._lastContextualInvitePayloadSafe = this.buildInviteDebugPayloadSafe(payload);
        this._lastContextualInviteFlowType = normalizedRoomInviteContext?.roomId ? 'room-bound' : 'reservation';
        this._lastContextualInviteRoomIdPersisted = Boolean(normalizedRoomInviteContext?.roomId);
        this._lastContextualInviteRoomCodePersisted = Boolean(normalizedRoomInviteContext?.roomCode);
        this._socialInviteTrace = {
            ...(this._socialInviteTrace || {}),
            chosenTransport: this._socialSocket?.connected ? 'socket' : 'rest',
            payload: this.buildInviteDebugPayloadSafe(payload)
        };
        this.renderSocialDebugPanel();
        const result = await this.sendPlayInviteWithFallback(payload);
        const item = result?.item || null;
        const inviteId = String(item?.id || '').trim();
        this._lastContextualInviteResultSafe = this.buildInviteDebugPayloadSafe(item || result || {});
        if (String(item?.roomId || '').trim() || String(item?.roomCode || '').trim()) {
            this._lastContextualInviteFlowType = 'room-bound';
        }
        this._lastContextualInviteRoomIdPersisted = this._lastContextualInviteRoomIdPersisted || Boolean(String(item?.roomId || '').trim());
        this._lastContextualInviteRoomCodePersisted = this._lastContextualInviteRoomCodePersisted || Boolean(String(item?.roomCode || '').trim());
        this.gameInviteState = {
            inviteId,
            inviteePlayerId,
            inviteeDisplayName: String(playerRef?.displayName || '').trim(),
            sessionId: inviteId,
            role: 'inviter',
            roomLinked: false,
            createPromptShown: false,
            waitingPromptShown: false,
            createdAt: Date.now()
        };
        this.startGameInviteRefresh();
        await this.loadSocialSummary().catch(() => {});
        return item;
    }

    async attachGameInviteRoom(roomCode) {
        const room = this.getCurrentRoomSnapshot();
        const roomId = String(roomCode || room?.roomId || this.network?.room?.id || '').trim();
        const rawRoomCode = String(room?.roomCode || roomCode || '').trim().toUpperCase();
        let currentAcceptedWaiting = this.getAcceptedWaitingPlayInvites();
        if (!currentAcceptedWaiting.length) {
            const invitations = await this.account.getPlayInvites().catch(() => null);
            if (invitations) {
                this.roomInvitations = this.mergeRoomInvitations(this.roomInvitations || { incoming: [], sent: [] }, invitations || { incoming: [], sent: [] });
                currentAcceptedWaiting = this.getAcceptedWaitingPlayInvites();
            }
        }
        if (!roomId || !currentAcceptedWaiting.length) {
            return null;
        }
        const candidateRoomCode = /^[A-Z0-9]{4,12}$/.test(rawRoomCode)
            ? rawRoomCode
            : String(await this.network.resolveRoomCode(roomId).catch(() => '')).trim().toUpperCase();
        const resolvedRoomCode = candidateRoomCode || '';
        if (!roomId) return null;

        this._duplicateLegacyInviteSuppressedCount += currentAcceptedWaiting.length;
        const payload = {
            roomId,
            roomCode: resolvedRoomCode || null,
            inviteIds: currentAcceptedWaiting.map((item) => String(item?.id || '').trim()).filter(Boolean),
            roomSettings: {
                roomMode: String(room?.roomMode || (this.isTeamMode ? 'team' : 'ffa')).trim(),
                stakeKey: String(room?.stakeKey || this.onlineStakeKey || 'stake_200').trim(),
                stakeAmount: Number(room?.stakeAmount || this.onlineRoundBankAmount || 0),
                humanSeats: Number(room?.humanSeats || this.onlinePlayerCount || 0),
                totalPlayers: Number(room?.totalPlayers || this.onlinePlayerCount || 0),
                maxPlayers: Number(room?.totalPlayers || this.onlinePlayerCount || 0),
                isTeamMode: Boolean(room?.isTeamMode ?? this.isTeamMode)
            }
        };
        const result = await this.attachPlayInviteRoomWithFallback(payload);
        if (this.gameInviteState) {
            this.gameInviteState.roomLinked = true;
            this.gameInviteState.inviteId = String(result?.item?.id || this.gameInviteState.inviteId || '').trim();
        }
        await this.loadSocialSummary().catch(() => {});
        return result?.item || null;
    }

    async refreshGameInviteState({ forceRerender = false } = {}) {
        const state = this.gameInviteState || null;
        if (!state || !this.hasAuthenticatedAccount()) {
            this.stopGameInviteRefresh();
            return null;
        }

        const invitations = await this.account.getPlayInvites().catch(() => null);
        if (!invitations) return null;
        const mergedInvitations = this.mergeRoomInvitations(this.roomInvitations || { incoming: [], sent: [] }, invitations || { incoming: [], sent: [] });
        this.roomInvitations = mergedInvitations;
        this._lastInviteError = '';
        this.renderRoomInvitationsPanel();

        const allItems = Array.isArray(mergedInvitations?.items) ? mergedInvitations.items : [
            ...(Array.isArray(mergedInvitations?.incoming) ? mergedInvitations.incoming : []),
            ...(Array.isArray(mergedInvitations?.sent) ? mergedInvitations.sent : [])
        ];
        const target = allItems.find((item) => {
            const itemId = String(item?.id || '').trim();
            const itemRoomId = String(item?.roomId || '').trim();
            const itemInviteeId = String(item?.invitee?.id || '').trim();
            const itemInviterId = String(item?.inviter?.id || '').trim();
            return Boolean(
                (state.inviteId && itemId === String(state.inviteId).trim()) ||
                (state.sessionId && itemRoomId === String(state.sessionId).trim() && (
                    (state.role === 'inviter' && itemInviteeId === String(state.inviteePlayerId).trim()) ||
                    (state.role === 'invitee' && itemInviterId)
                ))
            );
        }) || null;

        if (!target) {
            const ageMs = Date.now() - (state.createdAt || 0);
            if (ageMs < 40000) {
                return null;
            }
            this.stopGameInviteRefresh();
            this.gameInviteState = null;
            return null;
        }

        const expiresAtStr = target.expiresAt ? String(target.expiresAt).trim() : '';
        const isExpired = expiresAtStr && new Date(expiresAtStr).getTime() <= Date.now();
        const status = (isExpired ? 'expired' : String(target.status || '').trim()).toLowerCase();

        if (state.role === 'invitee') {
            if (status === 'accepted') {
                if (!state.waitingPromptShown) {
                    this.renderer.showMessage(this.t('invite-waiting-room'), 1800);
                    state.waitingPromptShown = true;
                }
                if (forceRerender) {
                    void this.loadSocialInvitesPage().catch(() => {});
                }
                return target;
            }
            if (status === 'room_created') {
                if (targetInviteId) {
                    this.playInviteRoomReadyIds.add(targetInviteId);
                }
                if (!state.waitingPromptShown) {
                    this.renderer.showMessage(
                        this.currentLang === 'az'
                            ? 'Otaq hazırdır'
                            : 'Room ready',
                        1800
                    );
                    state.waitingPromptShown = true;
                }
                if (forceRerender) {
                    void this.loadSocialInvitesPage().catch(() => {});
                }
                void this.joinPlayInviteRoom(target, { manual: false }).catch(() => {});
                return target;
            }
            if (status === 'joined') {
                if (targetInviteId) {
                    this.playInviteRoomReadyIds.delete(targetInviteId);
                    this.playInviteJoiningIds.delete(targetInviteId);
                    this.acceptedWaitingInviteIds.delete(targetInviteId);
                    this.playInviteAutoJoinAttemptedIds.delete(targetInviteId);
                }
                this.stopGameInviteRefresh();
                this.gameInviteState = null;
                if (forceRerender) {
                    void this.loadSocialInvitesPage().catch(() => {});
                }
                return target;
            }
            if (status === 'declined' || status === 'expired' || status === 'cancelled') {
                this.stopGameInviteRefresh();
                this.gameInviteState = null;
                this.renderer.showMessage(this.t('friends-load-failed'), 1800);
                return target;
            }
            return target;
        }

        if (state.role === 'inviter') {
            if (status === 'accepted') {
                const inviteeName = state.inviteeDisplayName || target.invitee?.displayName || 'Player';
                let statusMsg = this.t('invitee-accepted-waiting') || '{name} is waiting';
                if (statusMsg.includes('{name}')) {
                    statusMsg = statusMsg.replace('{name}', inviteeName);
                }
                if (!state.waitingPromptShown) {
                    this.renderer.showMessage(statusMsg, 1800);
                    state.waitingPromptShown = true;
                }
                const banner = document.getElementById('online-invite-status-banner');
                if (banner) {
                    banner.textContent = statusMsg;
                    banner.classList.remove('is-hidden');
                }
                if (forceRerender) {
                    void this.loadFriendsHub().catch(() => {});
                }
                return target;
            }
            if (status === 'room_created') {
                const inviteeName = state.inviteeDisplayName || target.invitee?.displayName || 'Player';
                const statusMsg = this.currentLang === 'az'
                    ? `${inviteeName} üçün otaq hazırdır`
                    : `${inviteeName} is ready`;
                if (!state.createPromptShown) {
                    this.closePlayerProfileModal();
                    this.closeSocialCenterModal();
                    this.showStartModal('online');
                    this.showOnlineCreateFlow('closed');
                    this.prefillOnlineNameIfPossible();
                    this.setHostStatus(statusMsg);
                    state.createPromptShown = true;
                }
                const banner = document.getElementById('online-invite-status-banner');
                if (banner) {
                    banner.textContent = statusMsg;
                    banner.classList.remove('is-hidden');
                }
                if (targetInviteId) {
                    this.playInviteRoomReadyIds.delete(targetInviteId);
                    this.acceptedWaitingInviteIds.delete(targetInviteId);
                }
                if (forceRerender) {
                    void this.loadFriendsHub().catch(() => {});
                }
                return target;
            }
            if (status === 'joined') {
                const inviteeName = state.inviteeDisplayName || target.invitee?.displayName || 'Player';
                const statusMsg = this.currentLang === 'az'
                    ? `${inviteeName} otağa qoşuldu`
                    : `${inviteeName} joined the room`;
                const banner = document.getElementById('online-invite-status-banner');
                if (banner) {
                    banner.textContent = statusMsg;
                    banner.classList.remove('is-hidden');
                }
                if (targetInviteId) {
                    this.playInviteRoomReadyIds.delete(targetInviteId);
                    this.playInviteJoiningIds.delete(targetInviteId);
                    this.acceptedWaitingInviteIds.delete(targetInviteId);
                    this.playInviteAutoJoinAttemptedIds.delete(targetInviteId);
                }
                this.stopGameInviteRefresh();
                this.gameInviteState = null;
                if (forceRerender) {
                    void this.loadFriendsHub().catch(() => {});
                }
                return target;
            }
            if (false && status === 'accepted' && cleanRoomCode) {
                this.stopGameInviteRefresh();
                this.gameInviteState = null;
                document.getElementById('online-invite-status-banner')?.classList.add('is-hidden');
                return target;
            }
            if (false && status === 'accepted' && !cleanRoomCode) {
                const inviteeName = state.inviteeDisplayName || target.invitee?.displayName || 'Игрок';
                let statusMsg = this.t('invitee-accepted-waiting') || '{name} qəbul etdi, otaq gözləyir';
                if (statusMsg.includes('{name}')) {
                    statusMsg = statusMsg.replace('{name}', inviteeName);
                } else {
                    const lang = this.currentLang || 'ru';
                    if (lang === 'ru') {
                        statusMsg = `${inviteeName} принял приглашение и ожидает создания комнаты`;
                    } else if (lang === 'az') {
                        statusMsg = `${inviteeName} dəvəti qəbul etdi və otaq qurulmasını gözləyir`;
                    } else {
                        statusMsg = `${inviteeName} accepted the invite and is waiting for room creation`;
                    }
                }

                if (!state.createPromptShown) {
                    this.closePlayerProfileModal();
                    this.closeSocialCenterModal();
                    this.showStartModal('online');
                    this.showOnlineCreateFlow('closed');
                    this.prefillOnlineNameIfPossible();
                    this.setHostStatus(statusMsg);
                    state.createPromptShown = true;
                }

                const banner = document.getElementById('online-invite-status-banner');
                if (banner) {
                    banner.textContent = statusMsg;
                    banner.classList.remove('is-hidden');
                }

                if (forceRerender) {
                    void this.loadFriendsHub().catch(() => {});
                }
                return target;
            }
            if (status === 'declined' || status === 'expired' || status === 'cancelled') {
                const msg = status === 'declined'
                    ? (this.t('invite-status-declined') || 'Declined')
                    : (this.t('invite-status-expired') || 'Expired');
                this.renderer.showMessage(msg, 1800);
                this.gameInviteState = null;
                return target;
            }
        }

        return target;
    }

    restoreGameInviteStateFromInvitations() {
        if (this.gameInviteState?.sessionId) return this.gameInviteState;
        const invitations = this.roomInvitations || { incoming: [], sent: [] };
        const sent = (Array.isArray(invitations.sent) ? invitations.sent : [])
            .filter((item) => {
                const status = String(item?.status || '').trim().toLowerCase();
                return (status === 'accepted' && !String(item?.roomCode || '').trim()) || status === 'room_created';
            })
            .sort((a, b) => new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime())[0] || null;
        if (sent) {
            this.gameInviteState = {
                inviteId: String(sent.id || '').trim(),
                inviteePlayerId: String(sent.invitee?.id || '').trim(),
                inviteeDisplayName: String(sent.invitee?.displayName || '').trim(),
                sessionId: String(sent.roomId || sent.id || '').trim(),
                role: 'inviter',
                roomLinked: false,
                createPromptShown: false,
                waitingPromptShown: false,
                createdAt: Date.now()
            };
            this.startGameInviteRefresh();
            return this.gameInviteState;
        }

        const incoming = (Array.isArray(invitations.incoming) ? invitations.incoming : [])
            .filter((item) => {
                const status = String(item?.status || '').trim().toLowerCase();
                return (status === 'accepted' && !String(item?.roomCode || '').trim()) || status === 'room_created';
            })
            .sort((a, b) => new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime())[0] || null;
        if (incoming) {
            this.gameInviteState = {
                inviteId: String(incoming.id || '').trim(),
                inviteePlayerId: String(incoming.invitee?.id || '').trim(),
                inviteeDisplayName: String(incoming.invitee?.displayName || '').trim(),
                sessionId: String(incoming.roomId || incoming.id || '').trim(),
                role: 'invitee',
                roomLinked: false,
                createPromptShown: false,
                waitingPromptShown: false,
                createdAt: Date.now()
            };
            this.startGameInviteRefresh();
        }
        return this.gameInviteState;
    }

    createPlayerNameButton(label, playerRef, className = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `player-name-btn ${className}`.trim();
        button.textContent = String(label || 'Player');
        const playerId = this.resolvePlayerProfileId(playerRef);
        if (playerId && !playerRef?.isBot) {
            button.addEventListener('click', (event) => {
                if (this.isMoveHintSelectionActive()) {
                    event.preventDefault();
                    event.stopPropagation();
                    this._lastProfileClickBlockedAt = Date.now();
                    this._lastProfileClickBlockedReason = 'move-hint-selection-active';
                    return;
                }
                void this.openPlayerProfileModal(playerRef);
            });
        } else {
            button.disabled = true;
            button.classList.add('is-static');
        }
        return button;
    }

    resolvePlayerProfileId(playerRef) {
        if (typeof playerRef === 'string') {
            const directText = String(playerRef || '').trim();
            if (directText) return directText;
        }

        const directId = String(playerRef?.playerId || playerRef?.id || '').trim();
        if (directId) return directId;
        const roomPlayers = Array.isArray(this.currentRoomState?.players) ? this.currentRoomState.players : [];
        const name = String(playerRef?.displayName || playerRef?.name || '').trim().toLowerCase();
        const playerOrder = Array.isArray(this.currentRoomState?.players) ? this.currentRoomState.players : [];
        const match = roomPlayers.find((player, index) => {
            const sessionId = String(player?.sessionId || '').trim();
            const playerId = String(player?.playerId || '').trim();
            const userId = String(player?.userId || '').trim();
            const displayName = String(player?.displayName || player?.name || '').trim().toLowerCase();
            const candidate = String(playerRef?.sessionId || playerRef?.playerId || playerRef?.id || '').trim().toLowerCase();
            if (candidate && (candidate === sessionId.toLowerCase() || candidate === playerId.toLowerCase() || candidate === userId.toLowerCase())) {
                return true;
            }
            if (playerRef && typeof playerRef === 'object') {
                const refSessionId = String(playerRef?.sessionId || '').trim().toLowerCase();
                if (refSessionId && refSessionId === sessionId.toLowerCase()) return true;
                const refDisplayName = String(playerRef?.displayName || playerRef?.name || '').trim().toLowerCase();
                if (refDisplayName && refDisplayName === displayName) return true;
                if (Number.isInteger(Number(playerRef?.index)) && Number(playerRef.index) === index) return true;
            }
            if (!playerRef || typeof playerRef === 'string') {
                return Boolean(name && name === displayName);
            }
            return false;
        });
        return String(match?.playerId || match?.userId || match?.sessionId || match?.id || '').trim();
    }

    resolvePlayerSessionId(playerRef) {
        if (!playerRef || typeof playerRef === 'string') return '';
        const directSessionId = String(playerRef?.sessionId || '').trim();
        if (directSessionId) return directSessionId;
        const playerId = this.resolvePlayerProfileId(playerRef);
        if (!playerId) return '';
        const roomPlayers = Array.isArray(this.currentRoomState?.players) ? this.currentRoomState.players : [];
        const match = roomPlayers.find((player) => {
            const candidate = String(player?.playerId || player?.userId || player?.id || '').trim();
            return candidate && candidate === playerId;
        });
        return String(match?.sessionId || '').trim();
    }

    ensureStartScreenEnhancements() {
        const startShell = document.querySelector('.start-shell');
        const startActions = document.querySelector('.start-actions');
        if (startShell && startActions && !document.getElementById('resume-session-banner')) {
            const banner = document.createElement('div');
            banner.id = 'resume-session-banner';
            banner.className = 'resume-session-banner is-hidden';
            const resumeBtn = document.createElement('button');
            resumeBtn.className = 'btn btn-primary resume-session-btn-solo';
            resumeBtn.id = 'resume-session-btn';
            resumeBtn.type = 'button';
            resumeBtn.dataset.i18n = 'resume-session-return';
            resumeBtn.textContent = this.t('resume-session-return');
            banner.appendChild(resumeBtn);
            startActions.insertAdjacentElement('afterend', banner);
        }

        const stakeGroup = document.getElementById('solo-stake-wrapper');
        if (!stakeGroup) {
            const soloGridRoot = document.querySelector('#solo-modal .settings-grid');
            const nameGroup = document.querySelector('#solo-modal #player-name')?.closest('.settings-group');
            const stakeWrapper = document.createElement('div');
            stakeWrapper.className = 'settings-group field-span-2';
            stakeWrapper.id = 'solo-stake-wrapper';
            const label = document.createElement('label');
            label.dataset.i18n = 'label-stake-table';
            label.textContent = this.t('label-stake-table');
            const group = document.createElement('div');
            group.className = 'btn-group';
            group.id = 'solo-stake-group';
            for (const stakeKey of ['stake_50', 'stake_100', 'stake_200']) {
                const button = document.createElement('button');
                button.className = 'btn btn-option';
                button.type = 'button';
                button.dataset.value = stakeKey;
                button.textContent = stakeKey.replace(/^stake_/i, '');
                group.appendChild(button);
            }
            stakeWrapper.appendChild(label);
            stakeWrapper.appendChild(group);
            if (nameGroup) {
                nameGroup.insertAdjacentElement('beforebegin', stakeWrapper);
            } else if (soloGridRoot) {
                soloGridRoot.appendChild(stakeWrapper);
            }
        }

    }

    createPremiumAvatar(player, ratingValue) {
        const wrapper = document.createElement('div');
        wrapper.className = 'premium-avatar-wrapper';

        const frame = document.createElement('div');
        frame.className = 'premium-avatar-frame';

        if (player?.avatarUrl) {
            const img = document.createElement('img');
            img.src = player.avatarUrl;
            img.alt = player.displayName || 'Avatar';
            img.referrerPolicy = 'no-referrer';
            img.onerror = () => {
                img.onerror = null;
                const fallback = document.createElement('span');
                fallback.textContent = this.getTurnAvatarText?.(player?.displayName || 'P') || 'P';
                img.replaceWith(fallback);
            };
            frame.appendChild(img);
        } else {
            const fallback = document.createElement('span');
            fallback.textContent = this.getTurnAvatarText?.(player?.displayName || 'P') || 'P';
            frame.appendChild(fallback);
        }

        wrapper.appendChild(frame);

        const playerId = String(player?.id || player?.playerId || '').trim();
        if (playerId && this.friendPresenceMap instanceof Map) {
            const presence = this.friendPresenceMap.get(playerId);
            if (presence) {
                const statusDot = document.createElement('div');
                statusDot.className = `premium-avatar-presence-dot is-${presence.status}`;
                statusDot.title = presence.status === 'in_game' ? (this.t('presence-in-game') || 'In game') : (presence.status === 'online' ? (this.t('presence-online') || 'Online') : (this.t('presence-offline') || 'Offline'));
                wrapper.appendChild(statusDot);
            }
        }

        return wrapper;
    }

    ensureSocialCenterUi() {
        if (document.getElementById('social-center-modal')) return;
        if (typeof document === 'undefined' || !document.body) return;

        // Social Hub Screen
        const hub = document.createElement('div');
        hub.id = 'social-center-modal';
        hub.className = 'social-hub-screen';
        hub.innerHTML = `
            <header class="social-hub-header">
                <div class="social-hub-header-left">
                    <h1 id="social-center-modal-title" data-i18n="social-title">Mesajlar</h1>
                </div>
                <div class="social-hub-header-right">
                    <div class="header-currency-chip coins-chip">
                        <span class="currency-icon coin-icon"></span>
                        <span class="currency-value" id="social-header-coins">0</span>
                        <span class="currency-plus">+</span>
                    </div>
                    <div class="header-currency-chip rating-chip">
                        <span class="currency-icon rating-icon"></span>
                        <span class="currency-value" id="social-header-rating">1,000</span>
                    </div>
                    <button type="button" class="btn btn-action social-feedback-trigger" id="social-feedback-btn">
                        <span class="feedback-icon" aria-hidden="true"></span>
                        <span class="social-feedback-label" data-i18n="feedback-button">Feedback</span>
                    </button>
                    <button class="social-close-btn" id="social-center-modal-close" type="button" aria-label="Close">×</button>
                </div>
            </header>
            
            <div class="social-hub-tabs-container">
                <div class="social-hub-tabs" id="social-center-tabs">
                    <button type="button" class="social-hub-tab social-center-tab is-active" data-social-tab="friends" id="social-tab-friends-btn">
                        <span class="tab-icon friends-icon"></span>
                        <span class="tab-label" data-i18n="social-tab-friends">Dostlar</span>
                        <span class="tab-badge" id="social-friends-unread-badge"></span>
                    </button>
                    <button type="button" class="social-hub-tab social-center-tab" data-social-tab="inbox" id="social-tab-mail-btn">
                        <span class="tab-icon mail-icon"></span>
                        <span class="tab-label" data-i18n="social-tab-mail">Poçt</span>
                        <span class="tab-badge" id="social-mail-unread-badge"></span>
                    </button>
                </div>
            </div>

            <div class="social-hub-content">
                <div id="social-mail-wrapper" class="social-hub-panel-group">
                    <section class="social-center-panel" id="social-invites-panel">
                        <div class="friends-page social-invites-page">
                            <section class="friends-section" id="social-invites-incoming-section">
                                <div class="section-kicker" data-i18n="invites-incoming-title">Incoming invites</div>
                                <div id="social-invites-incoming-list" class="friends-list"></div>
                            </section>
                            <section class="friends-section" id="social-invites-sent-section">
                                <div class="section-kicker" data-i18n="invites-sent-title">Sent invites</div>
                                <div id="social-invites-sent-list" class="friends-list"></div>
                            </section>
                        </div>
                    </section>
                    
                    <section class="social-center-panel" id="social-inbox-panel">
                        <div class="social-inbox-head">
                            <div class="section-kicker" data-i18n="inbox-title">Inbox</div>
                            <div class="room-summary social-inbox-summary is-hidden" id="social-inbox-summary" data-i18n="inbox-empty">No inbox items yet.</div>
                        </div>
                        <div class="social-inbox-list" id="social-inbox-list"></div>
                    </section>
                </div>

                <section class="social-center-panel is-hidden" id="social-friends-panel">
                    <div class="friends-page">
                        <div class="friends-search-row">
                            <div class="search-input-wrapper">
                                <span class="search-icon"></span>
                                <input type="search" id="friends-search-input" data-i18n="friends-search-placeholder" placeholder="Oyunçu axtar" minlength="2">
                            </div>
                        </div>

                        <div class="friends-sort-row">
                            <span class="friends-count-kicker" id="friends-count-title">DOSTLAR (0)</span>
                            <div class="friends-sort-selector">
                                <span data-i18n="sort-recent">Sıralama: Son aktivlik</span>
                                <span class="sort-chevron">▼</span>
                            </div>
                        </div>

                        <section class="friends-section is-hidden" id="social-search-results-section">
                            <div id="friends-search-results" class="friends-list"></div>
                        </section>

                        <section class="friends-section" id="social-requests-section">
                            <div class="section-kicker" data-i18n="friend-requests-title">Sorğular</div>
                            <div id="friends-requests-list" class="friends-list"></div>
                        </section>

                        <section class="friends-section is-hidden" id="social-chats-section">
                            <div class="chats-section-header">
                                <div class="section-kicker" data-i18n="social-tab-chats">Söhbətlər</div>
                                <span class="chats-section-summary" id="account-messages-summary"></span>
                            </div>
                            <div id="account-messages-thread-list" class="friends-list"></div>
                        </section>

                        <section class="friends-section" id="social-friends-list-section">
                            <div class="section-kicker is-hidden" data-i18n="friends-list-title">Dostlar</div>
                            <div id="friends-list" class="friends-list"></div>
                        </section>
                    </div>
                </section>
            </div>
        `;

        // Chat Screen
        const chat = document.createElement('div');
        chat.id = 'social-chats-panel';
        chat.className = 'chat-screen is-hidden';
        chat.innerHTML = `
            <div class="chat-screen-layout" id="account-messages-panel">
                <header class="chat-header">
                    <button type="button" class="chat-back-btn" id="account-messages-back-btn" aria-label="Back"></button>
                    <div class="chat-header-profile" id="chat-header-profile-btn">
                        <div id="chat-header-avatar"></div>
                        <div class="chat-header-info">
                            <strong class="chat-header-name" id="account-messages-conversation-title"></strong>
                            <span class="chat-header-status" id="chat-header-status"></span>
                        </div>
                    </div>
                    <div class="chat-header-actions">
                        <button type="button" class="chat-action-btn gift-action" id="chat-gift-btn" aria-label="Gift">🎁</button>
                        <button type="button" class="btn btn-action chat-header-profile-action" id="account-messages-open-btn" data-i18n="account-profile">Profil</button>
                    </div>
                </header>

                <div class="chat-messages-container" id="chat-messages-container-scroll">
                    <div class="chat-messages-list" id="account-messages-conversation-list"></div>
                </div>

                <div class="chat-compose-area">
                    <button type="button" class="composer-attach-btn" aria-label="Attach">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    </button>
                    <div class="chat-compose-input-wrapper">
                        <input type="text" id="account-message-input" class="chat-message-input" maxlength="500" data-i18n="messages-placeholder" placeholder="Write a message">
                        <button type="button" class="composer-emoji-btn" aria-label="Emoji">😊</button>
                        <div id="chat-voice-recording-status" class="chat-voice-recording-status is-hidden" style="display: flex; align-items: center; gap: 8px; color: #ff3b30; width: 100%;">
                            <span class="voice-record-dot" style="width: 8px; height: 8px; background: #ff3b30; border-radius: 50%; animation: pulse-voice 0.8s infinite alternate;"></span>
                            <span id="voice-record-timer" style="font-size: 0.9em; font-weight: bold;">0:00</span>
                            <button type="button" class="voice-record-cancel" style="background: none; border: none; color: var(--text-dim, #8f9cae); margin-left: auto; font-size: 0.85em; cursor: pointer; font-weight: bold;">Cancel</button>
                        </div>
                    </div>
                    <div class="chat-compose-right-btn-group" style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <button type="button" class="composer-voice-btn" id="chat-voice-record-btn" aria-label="Voice">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                        </button>
                        <button type="button" class="chat-send-btn is-hidden" id="account-message-send-btn">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;

        const anchor = document.getElementById('friends-modal');
        if (anchor?.parentNode) {
            anchor.parentNode.insertBefore(hub, anchor);
            anchor.parentNode.insertBefore(chat, anchor);
        } else {
            document.body.appendChild(hub);
            document.body.appendChild(chat);
        }

        this.attachSocialUiEventListeners();
        this.ensureFeedbackModal();
    }

    attachSocialUiEventListeners() {
        const attachBtn = document.querySelector('#social-chats-panel .composer-attach-btn');
        const voiceBtn = document.querySelector('#social-chats-panel #chat-voice-record-btn');
        const cancelBtn = document.querySelector('#social-chats-panel .voice-record-cancel');
        const emojiBtn = document.querySelector('#social-chats-panel .composer-emoji-btn');
        const coinsChip = document.querySelector('#social-center-modal .coins-chip');

        if (attachBtn) {
            attachBtn.addEventListener('click', () => {
                debugLog('[Chat Debug] Photo upload attachment clicked.');
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.onchange = async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                        debugLog('[Chat Debug] No file selected.');
                        return;
                    }
                    const targetId = String(this.accountMessagesState?.activePlayerId || '').trim();
                    debugLog('[Chat Debug] File selected:', {
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        targetId
                    });
                    if (!targetId) {
                        debugLog('[Chat Debug] No active player conversation to send to.');
                        return;
                    }
                    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    try {
                        this.renderer.showMessage(this.t('sending-attachment') || 'Photo sending...', 1200);
                        debugLog('[Chat Debug] Compressing image...', file.name);
                        const compressedBase64 = await this.compressImage(file);
                        debugLog('[Chat Debug] Image compressed. Base64 length:', compressedBase64?.length);
                        const msgBody = JSON.stringify({ type: 'image', data: compressedBase64 });

                        const currentPlayerId = this.getCurrentAccountPlayerId();
                        const tempMessage = {
                            id: tempId,
                            senderPlayerId: currentPlayerId,
                            receiverPlayerId: targetId,
                            text: msgBody,
                            createdAt: new Date().toISOString(),
                            readAt: null,
                            sender: this.accountProfile ? {
                                id: this.accountProfile.playerId || this.accountProfile.id || currentPlayerId,
                                displayName: this.accountProfile.displayName || this.accountProfile.name || '',
                                avatarSeed: this.accountProfile.avatarSeed || null,
                                avatarUrl: this.accountProfile.avatarUrl || null,
                                isGuest: Boolean(this.accountProfile.isGuest)
                            } : null,
                            receiver: this.accountMessagesState?.activePlayerProfile || null,
                            isOptimistic: true,
                            localStatus: 'sending'
                        };
                        const messagesBeforeSend = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
                        messagesBeforeSend.push(tempMessage);
                        this.accountMessagesState = {
                            ...(this.accountMessagesState || {}),
                            messages: messagesBeforeSend,
                            sendLoading: true,
                            error: ''
                        };
                        this.upsertMessageThreadFromMessage(tempMessage, targetId);
                        this.renderAccountMessagesPanel();

                        debugLog('[Chat Debug] Sending compressed image payload...', { tempId, payloadLength: msgBody.length });
                        const result = await this.sendDirectMessageWithFallback(targetId, msgBody, tempId);
                        debugLog('[Chat Debug] Image message sent successfully.', result);

                        const sentMessage = result?.item || tempMessage;
                        const messages = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
                        const tempIndex = messages.findIndex((row) => String(row?.id || '').trim() === tempId);
                        const alreadyExists = messages.some((row) => String(row?.id || '').trim() === String(sentMessage?.id || '').trim());
                        if (tempIndex >= 0) {
                            messages[tempIndex] = {
                                ...sentMessage,
                                isOptimistic: false,
                                localStatus: 'sent'
                            };
                        } else if (!alreadyExists) {
                            messages.push({
                                ...sentMessage,
                                isOptimistic: false,
                                localStatus: 'sent'
                            });
                        }
                        this.accountMessagesState = {
                            ...(this.accountMessagesState || {}),
                            messages,
                            sendLoading: false,
                            error: ''
                        };
                        this.applyRealtimeDirectMessage({
                            type: 'message_sent',
                            tempId: tempId,
                            message: sentMessage,
                            threadPlayerId: targetId
                        });
                        await this.loadConversationWithPlayer(targetId);
                        await this.loadMessageThreads();
                    } catch (err) {
                        debugLog('[Chat Debug] Image send failed:', err);
                        this.renderer.showMessage(err.message, 1800);
                        const messages = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
                        const tempIndex = messages.findIndex((row) => String(row?.id || '').trim() === tempId);
                        if (tempIndex >= 0) {
                            messages[tempIndex] = {
                                ...messages[tempIndex],
                                localStatus: 'failed'
                            };
                            this.accountMessagesState = {
                                ...(this.accountMessagesState || {}),
                                messages,
                                sendLoading: false
                            };
                            this.renderAccountMessagesPanel();
                        }
                    }
                };
                fileInput.click();
            });
        }

        if (voiceBtn) {
            voiceBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.toggleVoiceRecording();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.stopVoiceRecording(true);
            });
        }

        if (emojiBtn) {
            emojiBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                let picker = document.querySelector('#social-chats-panel .chat-emoji-picker');
                if (picker) {
                    picker.classList.toggle('is-hidden');
                    return;
                }
                picker = document.createElement('div');
                picker.className = 'chat-emoji-picker';
                const emojis = ['😊', '😂', '👍', '🔥', '🏆', '🎉', '❤️', '👏', '🎲', '💬', '😜', '😎', '😮', '😢', '😡', '🤝'];
                emojis.forEach(emoji => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'emoji-picker-item';
                    btn.textContent = emoji;
                    btn.addEventListener('click', (evt) => {
                        evt.stopPropagation();
                        const input = document.getElementById('account-message-input');
                        if (input) {
                            input.value += emoji;
                            input.focus();
                        }
                        picker.classList.add('is-hidden');
                    });
                    picker.appendChild(btn);
                });
                document.querySelector('#social-chats-panel .chat-compose-input-wrapper')?.appendChild(picker);
            });
        }

        if (coinsChip) {
            coinsChip.addEventListener('click', () => {
                void this.openCoinShopModal();
            });
        }

        document.addEventListener('click', () => {
            const picker = document.querySelector('#social-chats-panel .chat-emoji-picker');
            if (picker) {
                picker.classList.add('is-hidden');
            }
        });
    }

    async toggleVoiceRecording() {
        debugLog('[Chat Debug] toggleVoiceRecording. Current state:', { isRecording: this._isRecordingVoice });
        if (this._isRecordingVoice) {
            await this.stopVoiceRecording(false);
        } else {
            await this.startVoiceRecording();
        }
    }

    async startVoiceRecording() {
        debugLog('[Chat Debug] startVoiceRecording requested.');
        if (this._isRecordingVoice) {
            debugLog('[Chat Debug] startVoiceRecording: already recording, aborting.');
            return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const errMsg = 'Microphone access is only available on secure connections (HTTPS) or localhost.';
            debugLog('[Chat Debug] Microphone access not supported by browser/protocol', {
                hasMediaDevices: !!navigator.mediaDevices,
                protocol: window.location.protocol
            });
            this.renderer.showMessage(errMsg, 3000);
            return;
        }

        try {
            debugLog('[Chat Debug] Requesting microphone access...');
            this._voiceRecordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            debugLog('[Chat Debug] Microphone access granted.');
        } catch (err) {
            debugLog('[Chat Debug] Microphone access denied or failed:', err);
            this.renderer.showMessage(this.t('voice-record-denied') || 'Microphone access denied', 1800);
            return;
        }

        this._audioChunks = [];
        try {
            this._mediaRecorder = new MediaRecorder(this._voiceRecordStream);
            debugLog('[Chat Debug] MediaRecorder created successfully. mimeType:', this._mediaRecorder.mimeType);
        } catch (err) {
            debugLog('[Chat Debug] Failed to create MediaRecorder:', err);
            this.renderer.showMessage('Audio recorder initialization failed', 1800);
            this.cleanupVoiceRecord();
            return;
        }

        this._mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                this._audioChunks.push(e.data);
                debugLog('[Chat Debug] Voice recording chunk received. Size:', e.data.size);
            }
        };

        this._mediaRecorder.onstop = async () => {
            debugLog('[Chat Debug] MediaRecorder stopped. Chunks:', this._audioChunks.length, 'Cancelled:', this._voiceRecordCancelled);
            if (this._voiceRecordCancelled) {
                this.cleanupVoiceRecord();
                return;
            }
            const recordedType = this._mediaRecorder?.mimeType || 'audio/webm';
            const blob = new Blob(this._audioChunks, { type: recordedType });
            debugLog('[Chat Debug] Voice recording blob created. Size:', blob.size, 'Type:', recordedType);
            this.cleanupVoiceRecord();

            if (blob.size < 100) {
                debugLog('[Chat Debug] Voice recording blob size too small, skipping.');
                return;
            }

            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = async () => {
                const base64 = reader.result;
                const duration = Math.round((Date.now() - this._voiceRecordStartTime) / 1000);
                const targetId = String(this.accountMessagesState?.activePlayerId || '').trim();
                debugLog('[Chat Debug] Voice recording base64 ready. Length:', base64?.length, 'Duration:', duration, 'Recipient:', targetId);
                if (!targetId || !base64) return;

                const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                try {
                    const messageBody = JSON.stringify({ type: 'voice', data: base64, duration });

                    const currentPlayerId = this.getCurrentAccountPlayerId();
                    const tempMessage = {
                        id: tempId,
                        senderPlayerId: currentPlayerId,
                        receiverPlayerId: targetId,
                        text: messageBody,
                        createdAt: new Date().toISOString(),
                        readAt: null,
                        sender: this.accountProfile ? {
                            id: this.accountProfile.playerId || this.accountProfile.id || currentPlayerId,
                            displayName: this.accountProfile.displayName || this.accountProfile.name || '',
                            avatarSeed: this.accountProfile.avatarSeed || null,
                            avatarUrl: this.accountProfile.avatarUrl || null,
                            isGuest: Boolean(this.accountProfile.isGuest)
                        } : null,
                        receiver: this.accountMessagesState?.activePlayerProfile || null,
                        isOptimistic: true,
                        localStatus: 'sending'
                    };
                    const messagesBeforeSend = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
                    messagesBeforeSend.push(tempMessage);
                    this.accountMessagesState = {
                        ...(this.accountMessagesState || {}),
                        messages: messagesBeforeSend,
                        sendLoading: true,
                        error: ''
                    };
                    this.upsertMessageThreadFromMessage(tempMessage, targetId);
                    this.renderAccountMessagesPanel();

                    debugLog('[Chat Debug] Sending voice message. Payload length:', messageBody.length);
                    const result = await this.sendDirectMessageWithFallback(targetId, messageBody, tempId);
                    debugLog('[Chat Debug] Voice message sent successfully.', result);

                    const sentMessage = result?.item || tempMessage;
                    const messages = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
                    const tempIndex = messages.findIndex((row) => String(row?.id || '').trim() === tempId);
                    const alreadyExists = messages.some((row) => String(row?.id || '').trim() === String(sentMessage?.id || '').trim());
                    if (tempIndex >= 0) {
                        messages[tempIndex] = {
                            ...sentMessage,
                            isOptimistic: false,
                            localStatus: 'sent'
                        };
                    } else if (!alreadyExists) {
                        messages.push({
                            ...sentMessage,
                            isOptimistic: false,
                            localStatus: 'sent'
                        });
                    }
                    this.accountMessagesState = {
                        ...(this.accountMessagesState || {}),
                        messages,
                        sendLoading: false,
                        error: ''
                    };
                    this.applyRealtimeDirectMessage({
                        type: 'message_sent',
                        tempId: tempId,
                        message: sentMessage,
                        threadPlayerId: targetId
                    });
                    await this.loadConversationWithPlayer(targetId);
                    await this.loadMessageThreads();
                } catch (err) {
                    debugLog('[Chat Debug] Voice message send error:', err);
                    this.renderer.showMessage(err.message, 1800);
                    const messages = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
                    const tempIndex = messages.findIndex((row) => String(row?.id || '').trim() === tempId);
                    if (tempIndex >= 0) {
                        messages[tempIndex] = {
                            ...messages[tempIndex],
                            localStatus: 'failed'
                        };
                        this.accountMessagesState = {
                            ...(this.accountMessagesState || {}),
                            messages,
                            sendLoading: false
                        };
                        this.renderAccountMessagesPanel();
                    }
                }
            };
        };

        this._voiceRecordStartTime = Date.now();
        this._voiceRecordCancelled = false;
        this._isRecordingVoice = true;
        
        try {
            this._mediaRecorder.start();
            debugLog('[Chat Debug] MediaRecorder started recording.');
        } catch (err) {
            debugLog('[Chat Debug] Failed to start MediaRecorder:', err);
            this.renderer.showMessage('Failed to start recording', 1800);
            this.cleanupVoiceRecord();
            this._isRecordingVoice = false;
            return;
        }

        // UI Updates
        const composeArea = document.querySelector('#social-chats-panel .chat-compose-area');
        const voiceBtn = document.querySelector('#social-chats-panel #chat-voice-record-btn');
        const inputField = document.getElementById('account-message-input');
        const emojiBtn = document.querySelector('#social-chats-panel .composer-emoji-btn');
        const statusOverlay = document.getElementById('chat-voice-recording-status');

        if (composeArea) composeArea.classList.add('is-recording');
        if (voiceBtn) voiceBtn.classList.add('is-recording');
        if (inputField) inputField.classList.add('is-hidden');
        if (emojiBtn) emojiBtn.classList.add('is-hidden');
        if (statusOverlay) {
            statusOverlay.classList.remove('is-hidden');
            const timerEl = document.getElementById('voice-record-timer');
            if (timerEl) timerEl.textContent = '0:00';
        }

        // Start timer
        this._voiceTimerInterval = setInterval(() => {
            const timerEl = document.getElementById('voice-record-timer');
            if (timerEl) {
                const elapsed = Math.round((Date.now() - this._voiceRecordStartTime) / 1000);
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

                if (elapsed >= 60) {
                    debugLog('[Chat Debug] Auto-stopping recording (max limit 60s reached).');
                    void this.stopVoiceRecording(false);
                }
            }
        }, 1000);
    }

    async stopVoiceRecording(cancelled = false) {
        debugLog('[Chat Debug] stopVoiceRecording requested. Cancelled:', cancelled);
        if (!this._isRecordingVoice) {
            debugLog('[Chat Debug] stopVoiceRecording: Not currently recording, aborting.');
            return;
        }
        this._voiceRecordCancelled = cancelled;
        this._isRecordingVoice = false;

        if (this._voiceTimerInterval) {
            clearInterval(this._voiceTimerInterval);
            this._voiceTimerInterval = null;
        }

        if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
            try {
                this._mediaRecorder.stop();
                debugLog('[Chat Debug] MediaRecorder.stop() called.');
            } catch (err) {
                debugLog('[Chat Debug] Error calling MediaRecorder.stop():', err);
            }
        }

        // UI Reset
        const composeArea = document.querySelector('#social-chats-panel .chat-compose-area');
        const voiceBtn = document.querySelector('#social-chats-panel #chat-voice-record-btn');
        const inputField = document.getElementById('account-message-input');
        const emojiBtn = document.querySelector('#social-chats-panel .composer-emoji-btn');
        const statusOverlay = document.getElementById('chat-voice-recording-status');

        if (composeArea) composeArea.classList.remove('is-recording');
        if (voiceBtn) voiceBtn.classList.remove('is-recording');
        if (inputField) {
            inputField.classList.remove('is-hidden');
            inputField.focus();
        }
        if (emojiBtn) emojiBtn.classList.remove('is-hidden');
        if (statusOverlay) statusOverlay.classList.add('is-hidden');
    }

    cleanupVoiceRecord() {
        if (this._voiceRecordStream) {
            try {
                this._voiceRecordStream.getTracks().forEach((track) => track.stop());
            } catch (e) {}
            this._voiceRecordStream = null;
        }
        this._mediaRecorder = null;
    }

    compressImage(file) {
        return new Promise((resolve, reject) => {
            debugLog('[Chat Debug] compressImage: Reading file as Data URL...');
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                debugLog('[Chat Debug] compressImage: File read completed. Creating Image object...');
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    debugLog('[Chat Debug] compressImage: Image loaded. Original dimensions:', img.width, 'x', img.height);
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 800;

                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    debugLog('[Chat Debug] compressImage: Target dimensions:', width, 'x', height);
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    debugLog('[Chat Debug] compressImage: Canvas conversion to JPEG (quality 0.7) complete. Result URL size:', dataUrl.length);
                    resolve(dataUrl);
                };
                img.onerror = (err) => {
                    debugLog('[Chat Debug] compressImage: Image load failed:', err);
                    reject(err);
                };
            };
            reader.onerror = (err) => {
                debugLog('[Chat Debug] compressImage: FileReader failed:', err);
                reject(err);
            };
        });
    }

    getMessagePreviewText(message) {
        const text = String(message?.text || message?.body || '').trim();
        if (!text) return '';
        if (text.startsWith('{') && text.endsWith('}')) {
            try {
                const json = JSON.parse(text);
                if (json.type === 'image') {
                    return '📷 Foto';
                }
                if (json.type === 'voice') {
                    return '🎤 Səsli mesaj';
                }
            } catch (e) {}
        }
        return text;
    }

    openChatImageModal(src) {
        let modal = document.getElementById('chat-image-zoom-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'chat-image-zoom-modal';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0,0,0,0.85)';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '99999';
            modal.style.cursor = 'zoom-out';

            const img = document.createElement('img');
            img.id = 'chat-image-zoom-img';
            img.style.maxWidth = '90%';
            img.style.maxHeight = '90%';
            img.style.borderRadius = '8px';
            img.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';

            modal.appendChild(img);
            document.body.appendChild(modal);

            modal.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
        const zoomImg = document.getElementById('chat-image-zoom-img');
        if (zoomImg) zoomImg.src = src;
        modal.style.display = 'flex';
    }

    ensureOnlineSocialUi() {
        const onlineModal = document.getElementById('online-modal');
        const onlineFlow = document.getElementById('online-flow-ui');
        if (!onlineModal || !onlineFlow) return;
        if (document.getElementById('online-social-ui')) return;

        const social = document.createElement('div');
        social.id = 'online-social-ui';
        social.className = 'online-social-ui';
        const panel = document.createElement('div');
        panel.className = 'online-social-panel';
        const head = document.createElement('div');
        head.className = 'online-social-head';
        const headCopy = document.createElement('div');
        const headTitle = document.createElement('div');
        headTitle.className = 'section-kicker';
        headTitle.dataset.i18n = 'friends-title';
        headTitle.textContent = this.t('friends-title');
        const headNote = document.createElement('div');
        headNote.className = 'section-note';
        headNote.dataset.i18n = 'friends-note';
        headNote.textContent = this.t('friends-note');
        headCopy.appendChild(headTitle);
        headCopy.appendChild(headNote);
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'btn btn-menu online-social-refresh';
        refreshBtn.id = 'online-social-refresh-btn';
        refreshBtn.type = 'button';
        refreshBtn.textContent = this.t('account-refresh');
        head.appendChild(headCopy);
        head.appendChild(refreshBtn);
        const filters = document.createElement('div');
        filters.className = 'online-social-filters';
        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.id = 'friend-search-input';
        searchInput.placeholder = this.t('search-name-hint');
        filters.appendChild(searchInput);
        const sections = [
            [this.t('friend-search-results-title'), 'friend-search-results'],
            [this.t('friend-requests-title'), 'friend-requests-list'],
            [this.t('friends-list-title'), 'friend-list'],
            [this.t('room-invites-title'), 'room-invites-list']
        ];
        panel.appendChild(head);
        panel.appendChild(filters);
        for (const [titleText, id] of sections) {
            const section = document.createElement('div');
            section.className = 'social-section';
            const kicker = document.createElement('div');
            kicker.className = 'section-kicker';
            kicker.textContent = titleText;
            const list = document.createElement('div');
            list.id = id;
            list.className = 'room-player-list';
            section.appendChild(kicker);
            section.appendChild(list);
            panel.appendChild(section);
        }
        social.appendChild(panel);
        onlineFlow.insertAdjacentElement('beforebegin', social);
    }

    ensureSeatSelectionUi() {
        if (document.getElementById('seat-selection-overlay')) {
            this.seatSelectionUi = this.seatSelectionUi || {
                overlay: document.getElementById('seat-selection-overlay'),
                table: document.getElementById('seat-selection-table'),
                status: document.getElementById('seat-selection-status'),
                title: document.getElementById('seat-selection-overlay')?.querySelector('.seat-selection-title'),
                desc: document.getElementById('seat-selection-overlay')?.querySelector('.seat-selection-desc'),
                footerText: document.getElementById('seat-selection-overlay')?.querySelector('.seat-selection-footer-text'),
                footerActions: document.getElementById('seat-selection-overlay')?.querySelector('.seat-selection-footer-actions'),
                inviteBtn: document.getElementById('seat-selection-overlay')?.querySelector('.seat-selection-invite-btn'),
                closeBtn: document.getElementById('seat-selection-overlay')?.querySelector('.seat-selection-close-btn'),
                centerTitle: document.getElementById('seat-selection-overlay')?.querySelector('.seat-selection-center-title'),
                centerNote: document.getElementById('seat-selection-overlay')?.querySelector('.seat-selection-center-note')
            };
            return;
        }

        if (typeof document === 'undefined' || !document.body) return;

        const overlay = document.createElement('div');
        overlay.id = 'seat-selection-overlay';
        overlay.className = 'seat-selection-overlay is-hidden';
        overlay.setAttribute('aria-hidden', 'true');

        const panel = document.createElement('div');
        panel.className = 'seat-selection-panel';

        const head = document.createElement('div');
        head.className = 'seat-selection-head';
        const headTop = document.createElement('div');
        headTop.className = 'seat-selection-head-top';
        const headCopy = document.createElement('div');
        headCopy.className = 'seat-selection-head-copy';
        const kicker = document.createElement('div');
        kicker.className = 'section-kicker';
        kicker.dataset.i18n = 'seat-selection-title';
        kicker.textContent = this.t('seat-selection-title');
        const title = document.createElement('div');
        title.className = 'seat-selection-title';
        title.id = 'seat-selection-title';
        title.textContent = this.t('seat-selection-title');
        const desc = document.createElement('div');
        desc.className = 'seat-selection-desc';
        desc.id = 'seat-selection-desc';
        desc.textContent = this.t('seat-selection-desc');
        const status = document.createElement('div');
        status.className = 'seat-selection-status';
        status.id = 'seat-selection-status';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'social-close-btn seat-selection-close-btn';
        closeBtn.setAttribute('aria-label', this.t('modal-close'));
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            setTimeout(() => {
                void this.handleSeatSelectionClose('seat-picker-close');
            }, 0);
        });
        headCopy.appendChild(kicker);
        headCopy.appendChild(title);
        headCopy.appendChild(desc);
        headTop.appendChild(headCopy);
        headTop.appendChild(closeBtn);
        head.appendChild(headTop);
        head.appendChild(status);

        const tableWrap = document.createElement('div');
        tableWrap.className = 'seat-selection-table-wrap';
        const table = document.createElement('div');
        table.id = 'seat-selection-table';
        table.className = 'seat-selection-table';
        const center = document.createElement('div');
        center.className = 'seat-selection-center';
        const centerTitle = document.createElement('div');
        centerTitle.className = 'seat-selection-center-title';
        centerTitle.textContent = this.t('seat-selection-title');
        const centerNote = document.createElement('div');
        centerNote.className = 'seat-selection-center-note';
        centerNote.textContent = this.t('seat-selection-desc');
        center.appendChild(centerTitle);
        center.appendChild(centerNote);
        table.appendChild(center);
        tableWrap.appendChild(table);

        const footer = document.createElement('div');
        footer.className = 'seat-selection-footer';
        const footerText = document.createElement('div');
        footerText.className = 'seat-selection-footer-text';
        footerText.textContent = this.t('seat-selection-required');
        const footerActions = document.createElement('div');
        footerActions.className = 'seat-selection-footer-actions';
        const inviteBtn = document.createElement('button');
        inviteBtn.type = 'button';
        inviteBtn.className = 'btn btn-action btn-strong seat-selection-invite-btn';
        inviteBtn.textContent = this.t('friend-invite');
        inviteBtn.addEventListener('click', async () => {
            await this.openContextualRoomInvitePicker({
                source: 'seat-picker',
                openSeatPickerOnJoin: true
            });
        });
        footerActions.appendChild(inviteBtn);
        footer.appendChild(footerText);
        footer.appendChild(footerActions);

        panel.appendChild(head);
        panel.appendChild(tableWrap);
        panel.appendChild(footer);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.seatSelectionUi = { overlay, table, status, title, desc, footerText, footerActions, inviteBtn, closeBtn, centerTitle, centerNote };
    }

    hideSeatSelectionUi() {
        const overlay = document.getElementById('seat-selection-overlay');
        if (overlay) {
            overlay.classList.add('is-hidden');
            overlay.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.remove('seat-selection-active');
    }

    async handleSeatSelectionClose(action = 'seat-picker-close') {
        this._lastSeatPickerCloseAttemptAt = Date.now();
        this._lastSeatPickerCloseAction = String(action || '').trim() || 'seat-picker-close';
        this._lastSeatPickerCloseStartedGame = false;
        this._lastSeatPickerCloseError = '';
        this._lastCloseAttemptAt = this._lastSeatPickerCloseAttemptAt;
        this._lastCloseAction = this._lastSeatPickerCloseAction;
        this._lastCloseStartedGame = false;
        this._lastCloseCalledStartGame = false;
        this._lastCloseCalledSelectSeat = false;
        this._lastCloseCalledReady = false;
        this._lastCloseError = '';
        try {
            this.hideSeatSelectionUi();
            if (this.network?.room) {
                await this.returnToMainMenu({ settleForfeit: false });
            }
            this.renderSocialDebugPanel();
        } catch (error) {
            this._lastSeatPickerCloseError = String(error?.message || error || 'seat-picker-close-failed');
            this._lastCloseError = this._lastSeatPickerCloseError;
            throw error;
        }
    }

    isSeatSelectionUiVisible() {
        const overlay = document.getElementById('seat-selection-overlay');
        return Boolean(
            (overlay && !overlay.classList.contains('is-hidden'))
            || document.body?.classList.contains('seat-selection-active')
        );
    }

    getSeatPickerDecision(roomSettings = {}, roomState = {}, { includeOpenCheck = true } = {}) {
        const state = roomState || {};
        const settings = roomSettings || {};
        const roomVisibility = String(settings.roomVisibility || state.roomVisibility || this.onlineRoomVisibility || '').trim().toLowerCase();
        const roomMode = String(settings.roomMode || state.roomMode || '').trim().toLowerCase();
        const isTeamMode = Boolean(settings.isTeamMode ?? state.isTeamMode ?? this.isTeamMode);
        const totalPlayers = Number(
            settings.totalPlayers
            || state.totalPlayers
            || settings.humanSeats
            || state.humanSeats
            || this.onlinePlayerCount
            || this.playerCount
            || 0
        );
        const requiresSeatPicker = Boolean(
            (state.seatSelectionRequired ?? (totalPlayers > 2))
            && (isTeamMode || roomMode === 'team' || roomMode === 'partnership')
        );
        const roomReady = Boolean(state && !state.gameActive && !state.gameOverReason && !state.matchOver);
        const seatPickerOpen = includeOpenCheck ? this.isSeatSelectionUiVisible() : false;
        let skippedReason = '';
        if (!this.network?.isMultiplayer) {
            skippedReason = 'not-multiplayer';
        } else if (!state || (!state.roomId && !state.roomCode && !settings.roomId && !settings.roomCode)) {
            skippedReason = 'missing-room-state';
        } else if (!roomReady) {
            skippedReason = 'room-not-ready';
        } else if (!requiresSeatPicker) {
            skippedReason = 'not-2v2';
        } else if (includeOpenCheck && seatPickerOpen) {
            skippedReason = 'already-open';
        }
        return {
            roomVisibility,
            roomMode: roomMode || (isTeamMode ? 'team' : 'ffa'),
            requiresSeatPicker,
            roomReady,
            seatPickerOpen,
            shouldOpen: Boolean(this.network?.isMultiplayer && roomReady && requiresSeatPicker && (!includeOpenCheck || !seatPickerOpen)),
            skippedReason
        };
    }

    shouldOpenSeatPickerAfterRoomCreate(roomSettings = {}, roomState = {}) {
        const decision = this.getSeatPickerDecision(roomSettings, roomState, { includeOpenCheck: true });
        this._lastRoomCreateVisibility = decision.roomVisibility || null;
        this._lastRoomCreateMode = decision.roomMode || null;
        this._lastRoomCreateRequiresSeatPicker = Boolean(decision.requiresSeatPicker);
        this._lastSeatPickerOpenAttemptAt = Date.now();
        this._lastSeatPickerOpenSource = 'room-create';
        this._lastSeatPickerOpenSkippedReason = decision.shouldOpen ? '' : decision.skippedReason;
        return decision.shouldOpen;
    }

    roomRequiresSeatPicker(roomSettings = {}, roomState = {}) {
        return this.getSeatPickerDecision(roomSettings, roomState, { includeOpenCheck: false }).requiresSeatPicker;
    }

    getSeatOppositeNumber(seatNumber, totalSeats) {
        const normalizedSeat = Number(seatNumber);
        const normalizedTotal = Number(totalSeats || 0);
        if (!Number.isInteger(normalizedSeat) || normalizedSeat < 1) return 0;
        if (normalizedTotal < 4) return 0;
        return normalizedSeat === 1 ? 3
            : normalizedSeat === 2 ? 4
                : normalizedSeat === 3 ? 1
                    : normalizedSeat === 4 ? 2
                        : 0;
    }

    getSeatRelationText(roomState, seatNumber, occupant, mySessionId, hostName = '') {
        const totalSeats = Number(roomState?.totalPlayers || roomState?.humanSeats || 0);
        const isTeamMode = Boolean(roomState?.isTeamMode);
        const seat = Number(seatNumber);
        if (!occupant) {
            if (isTeamMode && totalSeats >= 4 && seat === 3) {
                return this.t('seat-partner-host');
            }
            if (seat === 1) {
                return this.t('seat-host');
            }
            if (isTeamMode && totalSeats >= 4 && (seat === 2 || seat === 4)) {
                return this.t('seat-opponent');
            }
            const opposite = this.getSeatOppositeNumber(seat, totalSeats);
            return opposite
                ? this.format('seat-opposite-seat', { seat: opposite })
                : this.t('seat-opponent');
        }
        if (occupant?.sessionId === mySessionId) {
            return this.t('seat-your-seat');
        }
        if (seat === 1) {
            return this.t('seat-host');
        }
        if (isTeamMode && totalSeats >= 4) {
            if (seat === 3) {
                return hostName
                    ? this.format('seat-partner', { player: hostName })
                    : this.t('seat-partner-host');
            }
            return this.t('seat-opponent');
        }
        const opposite = this.getSeatOppositeNumber(seat, totalSeats);
        if (opposite) {
            return this.format('seat-opposite-seat', { seat: opposite });
        }
        return this.t('seat-opponent');
    }

    renderSeatSelectionUi(roomState = this.currentRoomState) {
        this.ensureSeatSelectionUi();
        const overlay = document.getElementById('seat-selection-overlay');
        const table = document.getElementById('seat-selection-table');
        const status = document.getElementById('seat-selection-status');
        const footerText = this.seatSelectionUi?.footerText || overlay?.querySelector('.seat-selection-footer-text');
        const footerActions = this.seatSelectionUi?.footerActions || overlay?.querySelector('.seat-selection-footer-actions');
        const inviteBtn = this.seatSelectionUi?.inviteBtn || overlay?.querySelector('.seat-selection-invite-btn');
        const closeBtn = this.seatSelectionUi?.closeBtn || overlay?.querySelector('.seat-selection-close-btn');
        if (!overlay || !table || !status) return;

        const totalSeats = Number(roomState?.totalPlayers || roomState?.humanSeats || 0);
        const roomMode = String(roomState?.roomMode || (roomState?.isTeamMode ? 'team' : 'ffa')).trim().toLowerCase();
        const roomIsActive = Boolean(roomState?.gameActive || this.gameActive);
        const shouldShow = Boolean(this.network?.isMultiplayer && !roomIsActive && totalSeats > 2 && roomState?.seatSelectionRequired !== false);
        const seatPickerRoomInviteContext = (() => {
            const snapshot = this.getCurrentRoomSnapshot?.() || null;
            const activeRoomId = String(roomState?.roomId || snapshot?.roomId || this.currentRoomState?.roomId || '').trim() || null;
            const activeRoomCode = String(roomState?.roomCode || snapshot?.roomCode || this.currentRoomState?.roomCode || '').trim() || null;
            const activeRoomMode = String(roomMode || roomState?.roomMode || snapshot?.roomMode || (roomState?.isTeamMode ? 'team' : 'ffa') || '').trim().toLowerCase();
            const activeRoomVisibility = String(roomState?.roomVisibility || snapshot?.roomVisibility || this.onlineRoomVisibility || '').trim() || null;
            const canInvite = Boolean(activeRoomId && activeRoomCode);
            return {
                roomId: activeRoomId,
                roomCode: activeRoomCode,
                roomMode: activeRoomMode === 'team' || activeRoomMode === '2v2' ? 'team' : activeRoomMode || 'team',
                roomVisibility: activeRoomVisibility,
                targetSlotIndex: null,
                openSeatPickerOnJoin: true,
                source: 'seat-picker',
                canInvite
            };
        })();
        debugLog("[CLIENT_DEBUG] renderSeatSelectionUi", {
            roomId: roomState?.roomId,
            roomCode: roomState?.roomCode,
            roomMode,
            totalSeats,
            shouldShow,
            gameActive: roomState?.gameActive,
            seatSelectionRequired: roomState?.seatSelectionRequired,
            seatPickerRoomInviteContext
        });
        if (!shouldShow) {
            this.hideSeatSelectionUi();
            return;
        }

        const mySessionId = this.network?.room?.sessionId || '';
        const players = Array.isArray(roomState?.players) ? roomState.players : [];
        const seatMap = new Map();
        players.forEach((player) => {
            const seatIndex = Number(player?.seatIndex);
            if (Number.isInteger(seatIndex) && seatIndex >= 0) {
                seatMap.set(seatIndex, player);
            }
        });
        const seatedCount = seatMap.size;
        const seatOrder = totalSeats === 3 ? [2, 1, 0] : totalSeats >= 4 ? [2, 1, 3, 0] : Array.from({ length: totalSeats }, (_, i) => i);

        overlay.classList.remove('is-hidden');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('seat-selection-active');
        status.textContent = this.format('seat-selection-status', {
            seated: seatedCount,
            total: Math.max(totalSeats, 0)
        });
        if (footerText) {
            footerText.textContent = roomState?.seatSelectionRequired === false
                ? this.t('seat-selection-title')
                : this.t('seat-selection-required');
        }
        if (footerActions) {
            footerActions.classList.remove('is-hidden');
        }
        const inviteCandidates = this.getContextualRoomInviteCandidates(seatPickerRoomInviteContext || {});
        const inviteButtonDisabledReason = !seatPickerRoomInviteContext?.canInvite
            ? 'missing-room-context'
            : !inviteCandidates.friends.length
            ? 'no-eligible-friends'
            : '';
        if (inviteBtn) {
            this._lastSeatPickerInviteButtonRendered = true;
            this._lastSeatPickerInviteButtonDisabledReason = inviteButtonDisabledReason;
            this._lastSeatPickerInviteContextSafe = this.buildInviteDebugPayloadSafe(seatPickerRoomInviteContext);
            inviteBtn.hidden = false;
            inviteBtn.disabled = Boolean(inviteButtonDisabledReason);
            inviteBtn.textContent = this.t('friend-invite');
        } else {
            this._lastSeatPickerInviteButtonRendered = false;
            this._lastSeatPickerInviteButtonDisabledReason = 'missing-button';
            this._lastSeatPickerInviteContextSafe = this.buildInviteDebugPayloadSafe(seatPickerRoomInviteContext);
        }
        this._lastSeatPickerOpenedAfterRoomBoundInvite = Boolean(this._lastAcceptedInviteWasRoomBound);
        if (closeBtn) {
            closeBtn.disabled = false;
        }
        table.innerHTML = '';
        table.dataset.totalSeats = String(totalSeats || 0);
        table.dataset.teamMode = roomState?.isTeamMode ? 'true' : 'false';
        const center = document.createElement('div');
        center.className = 'seat-selection-center';
        table.appendChild(center);
        const centerTitle = document.createElement('div');
        centerTitle.className = 'seat-selection-center-title';
        centerTitle.textContent = '';
        const centerNote = document.createElement('div');
        centerNote.className = 'seat-selection-center-note';
        centerNote.textContent = roomState?.isTeamMode && totalSeats >= 4
            ? `${this.t('seat-prefix')} 1 + ${this.t('seat-prefix')} 3 · ${this.t('seat-team-a')} | ${this.t('seat-prefix')} 2 + ${this.t('seat-prefix')} 4 · ${this.t('seat-team-b')}`
            : this.t('seat-selection-desc');
        center.appendChild(centerTitle);
        center.appendChild(centerNote);

        for (const seatIndex of seatOrder) {
            const seatNumber = seatIndex + 1;
            const occupant = seatMap.get(seatIndex) || null;
            const isMine = occupant?.sessionId === mySessionId;
            const isOccupied = Boolean(occupant);
            const slot = document.createElement('div');
            slot.className = `seat-selection-seat seat-selection-seat-${seatNumber}`;
            if (seatNumber === 1) slot.classList.add('seat-bottom');
            if (seatNumber === 2) slot.classList.add('seat-left');
            if (seatNumber === 3) slot.classList.add('seat-top');
            if (seatNumber === 4) slot.classList.add('seat-right');
            if (isMine) slot.classList.add('is-mine');
            if (isOccupied) slot.classList.add('is-occupied');

            const seatLabel = document.createElement('div');
            seatLabel.className = 'seat-selection-seat-label';
            seatLabel.textContent = `${this.t('seat-prefix')} ${seatNumber}`;

            const relation = document.createElement('div');
            relation.className = 'seat-selection-seat-relation';
            relation.textContent = this.getSeatRelationText(roomState, seatNumber, occupant, mySessionId, roomState?.hostName || '');

            const occupantLine = document.createElement('div');
            occupantLine.className = 'seat-selection-seat-name';
            if (occupant) {
                occupantLine.textContent = isMine ? `${occupant.name || this.t('seat-your-seat')} (${this.t('online-you')})` : (occupant.name || this.t('seat-taken'));
            } else {
                occupantLine.textContent = this.t('seat-free');
            }

            const meta = document.createElement('div');
            meta.className = 'seat-selection-seat-meta';
            if (roomState?.isTeamMode && totalSeats >= 4) {
                meta.textContent = seatNumber % 2 === 1 ? this.t('seat-team-a') : this.t('seat-team-b');
            } else {
                meta.textContent = occupant ? relation.textContent : this.t('seat-free');
            }

            const action = document.createElement('button');
            action.className = 'btn btn-action seat-selection-seat-btn';
            action.type = 'button';
            action.textContent = isMine ? this.t('seat-your-seat') : (isOccupied ? this.t('seat-taken') : this.t('seat-choose'));
            action.disabled = isOccupied || this.network?.reconnectInProgress === true;
            if (!isOccupied) {
                action.addEventListener('click', () => {
                    if (action.disabled) return;
                    debugLog("[CLIENT_DEBUG] seat-selection action", {
                        roomId: roomState?.roomId,
                        roomCode: roomState?.roomCode,
                        seatIndex
                    });
                    this.network?.sendChooseSeat?.(seatIndex);
                });
            }

            slot.appendChild(seatLabel);
            slot.appendChild(relation);
            slot.appendChild(occupantLine);
            slot.appendChild(meta);
            slot.appendChild(action);
            table.appendChild(slot);
        }
    }

    ensureGameHudEnhancements() {
        const gameInfo = document.querySelector('.game-info');
        if (gameInfo && !document.getElementById('stake-info')) {
            const stakeInfo = document.createElement('span');
            stakeInfo.id = 'stake-info';
            gameInfo.insertBefore(stakeInfo, document.getElementById('boneyard-info'));
        }

        const actionBar = document.querySelector('.action-bar');
        if (actionBar && !document.getElementById('turn-timer-slot')) {
            const slot = document.createElement('div');
            slot.id = 'turn-timer-slot';
            slot.className = 'turn-timer-slot';
            slot.innerHTML = `
                <div class="turn-timer-ring" id="turn-timer-ring" style="--turn-angle: 0deg;">
                    <div class="turn-timer-avatar" id="turn-timer-avatar">?</div>
                </div>
                <div class="turn-timer-caption" id="turn-timer-caption"></div>
            `;
            const drawBtn = document.getElementById('draw-btn');
            if (drawBtn) actionBar.insertBefore(slot, drawBtn);
            else actionBar.appendChild(slot);
        }

        if (actionBar && !document.getElementById('voice-slot')) {
            const slot = document.createElement('div');
            slot.id = 'voice-slot';
            slot.className = 'voice-slot is-hidden';
            slot.innerHTML = `
                <button class="reaction-fab voice-fab" id="voice-btn" type="button" aria-label="Voice" title="Voice">
                    ${this.buildVoiceButtonMarkup(22)}
                </button>
                <button class="voice-unlock-btn is-hidden" id="voice-unlock-btn" type="button" data-i18n="voice-enable-sound">Enable sound</button>
                <div class="voice-status" id="voice-status"></div>
            `;
            const reactionSlot = document.querySelector('.reaction-slot');
            if (reactionSlot) actionBar.insertBefore(slot, reactionSlot);
            else actionBar.appendChild(slot);
        }
        if (actionBar && !document.getElementById('voice-roster-toggle')) {
            const rosterBtn = document.createElement('button');
            rosterBtn.id = 'voice-roster-toggle';
            rosterBtn.type = 'button';
            rosterBtn.className = 'reaction-fab voice-roster-toggle';
            rosterBtn.hidden = true;
            rosterBtn.setAttribute('aria-label', this.t('voice-roster-toggle') || 'Players');
            rosterBtn.setAttribute('title', this.t('voice-roster-toggle') || 'Players');
            rosterBtn.setAttribute('aria-expanded', 'false');
            rosterBtn.innerHTML = this.buildVoiceRosterToggleMarkup(22);
            const reactionSlot = document.querySelector('.reaction-slot');
            if (reactionSlot) actionBar.insertBefore(rosterBtn, reactionSlot);
            else actionBar.appendChild(rosterBtn);
        }
        if (!document.getElementById('voice-roster-panel')) {
            const rosterPanel = document.createElement('div');
            rosterPanel.id = 'voice-roster-panel';
            rosterPanel.className = 'gift-picker voice-roster-panel';
            rosterPanel.hidden = true;
            rosterPanel.setAttribute('aria-hidden', 'true');
            rosterPanel.innerHTML = `
                <div class="voice-roster-header gift-picker-header">
                    <div class="voice-roster-title-wrap">
                        <div class="gift-picker-title voice-roster-title" id="voice-roster-title">${this.t('voice-roster-toggle') || 'Players'}</div>
                        <div class="voice-roster-count" id="voice-roster-count">0</div>
                    </div>
                    <button class="btn btn-action modal-close-btn voice-roster-close-btn" id="voice-roster-close-btn" type="button" aria-label="${this.t('modal-close') || 'Close'}" title="${this.t('modal-close') || 'Close'}">×</button>
                </div>
                <div id="voice-speakers" class="voice-speakers"></div>
            `;
            document.body.appendChild(rosterPanel);
        }
    }

    buildVoiceButtonMarkup(size = 22) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6.5a3.5 3.5 0 1 0-7 0V12a3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M7.5 11.5v.5a4.5 4.5 0 0 0 9 0v-.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M12 16.5V20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`;
    }

    buildVoiceRosterToggleMarkup(size = 22) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M17 20v-1.2a3.8 3.8 0 0 0-3.8-3.8h-2.4A3.8 3.8 0 0 0 7 18.8V20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <circle cx="12" cy="8" r="3.1" stroke="currentColor" stroke-width="1.8"/>
            <path d="M20 20v-1a3.2 3.2 0 0 0-2.4-3.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M4 20v-1a3.2 3.2 0 0 1 2.4-3.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <span class="voice-roster-toggle-badge" aria-hidden="true">0</span>`;
    }

    buildChatHeaderReportIconMarkup(size = 18) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 4h10l4 4v12H6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M10 8v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <circle cx="10" cy="17" r="1" fill="currentColor"/>
        </svg>`;
    }

    buildChatHeaderBlockIconMarkup(size = 18) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/>
            <path d="M8.5 8.5l7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`;
    }

    getTurnAvatarText(name) {
        const clean = String(name || '').trim();
        if (!clean) return '?';
        if (/^(player|domino player|игрок)(\s*\d+)?$/i.test(clean)) return '?';
        if (/^p\d+$/i.test(clean)) return '?';
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
        return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
    }

    getResolvedAvatarUrl(playerIndex = -1) {
        const idx = Number(playerIndex);
        const playerOrder = Array.isArray(this.currentRoomState?.players)
            ? this.currentRoomState.players.map((player) => player.sessionId)
            : Array.isArray(this.roomPlayerRefs)
                ? this.roomPlayerRefs.map((player) => player.sessionId)
                : [];
        const sessionId = playerOrder[idx];
        const cachedAvatarUrl = sessionId && this.roomAvatarBySessionId instanceof Map
            ? this.roomAvatarBySessionId.get(sessionId)
            : '';
        const roomPlayer = Array.isArray(this.currentRoomState?.players)
            ? (this.currentRoomState.players[idx]
                || this.currentRoomState.players.find((player) => player?.sessionId === sessionId)
                || this.currentRoomState.players.find((player) => Number(player?.index) === idx))
            : null;
        const selfProfile = this.accountProfile || {};

        return String(
            cachedAvatarUrl
            || roomPlayer?.avatarUrl
            || (idx === this.humanPlayerIndex ? (selfProfile.avatarUrl || selfProfile.image || selfProfile.providerImage || '') : '')
            || ''
        ).trim();
    }

    startTurnTimer(deadlineAt = null, turnVersion = null, currentPlayerIndex = null) {
        const endAt = Number(deadlineAt || (this.getSyncedNow() + this.turnTimeoutMs));
        const nextTurnVersion = Number(turnVersion ?? this.turnVersion ?? 0);
        const nextPlayerIndex = Number.isInteger(Number(currentPlayerIndex))
            ? Number(currentPlayerIndex)
            : Number(this.currentPlayer ?? 0);
        const deadlineDelta = Math.abs(Number(this.activeTurnDeadlineAt || 0) - endAt);
        const sameDeadline = Number(this.activeTurnDeadlineAt || 0) > 0 && deadlineDelta <= 250;
        const sameVersion = Number(this.activeTurnVersionForTimer || 0) === nextTurnVersion;
        const samePlayer = Number(this.activeTurnPlayerIndexForTimer ?? -1) === nextPlayerIndex;
        this.turnDurationMs = Number(this.turnTimeoutMs || TURN_TIMEOUT_MS);
        if (sameDeadline && sameVersion && samePlayer) {
            this.turnDeadlineAt = endAt;
            this.updateTurnTimerHud();
            this.persistGameResumeSnapshot();
            return;
        }
        this.turnDeadlineAt = endAt;
        this.activeTurnDeadlineAt = endAt;
        this.activeTurnVersionForTimer = nextTurnVersion;
        this.activeTurnPlayerIndexForTimer = nextPlayerIndex;
        clearTimeout(this._turnTimeoutId);
        clearInterval(this._turnTimerTickId);
        this._turnTimerTickId = setInterval(() => this.updateTurnTimerHud(), 200);
        const delay = Math.max(0, endAt - this.getSyncedNow());
        this._turnTimeoutId = setTimeout(() => {
            this._turnTimeoutId = null;
            if (this.network.isMultiplayer) {
                clearInterval(this._turnTimerTickId);
                this._turnTimerTickId = null;
                this.updateTurnTimerHud();
                return;
            }
            this.handleTurnTimeout();
        }, delay);
        this.updateTurnTimerHud();
        this.persistGameResumeSnapshot();
    }

    handleTurnTimeout() {
        if (!this.gameActive || this.roundOver || this.matchOver) return;
        if (this.network.isMultiplayer) return;
        const timeoutIndex = this.currentPlayer;
        const winnerIndex = this.findTimeoutWinner(timeoutIndex);
        const actorName = this.playerNames[timeoutIndex] || this.t('online-you');
        this.renderer.showMessage(this.format('turn-timeout', { player: actorName }), 2200);
        this.endRound(winnerIndex, false);
    }

    findTimeoutWinner(timeoutIndex) {
        if (this.isTeamMode) {
            const timeoutTeam = timeoutIndex % 2;
            const winningTeam = timeoutTeam === 0 ? 1 : 0;
            const members = this.getTeamMembers(winningTeam);
            let best = members[0] ?? 0;
            let minPoints = Infinity;
            for (const idx of members) {
                const points = this.ruleset.handPoints(this.hands[idx] || []);
                if (points < minPoints) {
                    minPoints = points;
                    best = idx;
                }
            }
            return best;
        }

        let best = timeoutIndex === 0 ? 1 : 0;
        let minPoints = Infinity;
        for (let i = 0; i < this.playerCount; i++) {
            if (i === timeoutIndex) continue;
            const points = this.ruleset.handPoints(this.hands[i] || []);
            if (points < minPoints) {
                minPoints = points;
                best = i;
            }
        }
        return best;
    }

    updateTurnTimerHud() {
        const slot = document.getElementById('turn-timer-slot');
        const ring = document.getElementById('turn-timer-ring');
        const avatar = document.getElementById('turn-timer-avatar');
        const caption = document.getElementById('turn-timer-caption');
        if (!slot || !ring || !avatar) return;

        const shouldShow = this.gameActive && !this.roundOver && !this.matchOver && (this.turnDeadlineAt > 0 || this.network.isMultiplayer);
        slot.classList.toggle('is-hidden', !shouldShow);
        if (!shouldShow) {
            ring.style.setProperty('--turn-angle', '0deg');
            avatar.removeAttribute('data-avatar-src');
            avatar.textContent = '?';
            if (caption) caption.textContent = '';
            return;
        }

        const currentName = this.playerNames[this.currentPlayer] || this.playerName || '';
        const avatarUrl = this.getResolvedAvatarUrl(this.currentPlayer);
        if (avatarUrl) {
            if (avatar.dataset.avatarSrc !== avatarUrl) {
                avatar.dataset.avatarSrc = avatarUrl;
                avatar.replaceChildren();
                const img = document.createElement('img');
                img.alt = currentName || 'Player avatar';
                img.src = avatarUrl;
                img.referrerPolicy = 'no-referrer';
                avatar.appendChild(img);
            }
        } else {
            avatar.removeAttribute('data-avatar-src');
            avatar.textContent = this.getTurnAvatarText(currentName);
        }
        const remaining = Math.max(0, this.turnDeadlineAt - this.getSyncedNow());
        const duration = Math.max(1, Number(this.turnDurationMs || this.turnTimeoutMs || TURN_TIMEOUT_MS));
        const progress = Math.min(1, Math.max(0, 1 - (remaining / duration)));
        const angle = Math.max(0, Math.min(360, progress * 360));
        ring.style.setProperty('--turn-angle', `${angle}deg`);
        ring.classList.toggle('is-urgent', remaining <= 10000);
        const postMoveActive = this.postMoveWindowActive && this.postMoveWindowEndsAt > Date.now();
        slot.classList.toggle('is-postmove', postMoveActive);
        if (caption) {
            if (postMoveActive) {
                const seconds = Math.max(1, Math.ceil((this.postMoveWindowEndsAt - Date.now()) / 1000));
                caption.textContent = this.format('turn-postmove-capture', { seconds });
            } else {
                caption.textContent = '';
            }
        }
    }

    ensureMenuEnhancements() {
        document.getElementById('menu-newgame')?.remove();
        this.ensureShopIconMarkup();
    }

    ensureAccountModalPortal() {
        const accountModal = document.getElementById('account-modal');
        if (!accountModal) return;
        if (accountModal.parentElement === document.body) return;
        document.body.appendChild(accountModal);
    }

    ensureCoinShopModalPortal() {
        const coinShopModal = document.getElementById('coin-shop-modal');
        if (!coinShopModal) return;
        if (coinShopModal.parentElement === document.body) return;
        document.body.appendChild(coinShopModal);
    }

    ensureCosmeticsShopModalPortal() {
        const cosmeticsShopModal = document.getElementById('cosmetics-shop-modal');
        if (!cosmeticsShopModal) return;
        if (cosmeticsShopModal.parentElement === document.body) return;
        document.body.appendChild(cosmeticsShopModal);
    }

    startCoinShopTicker() {
        this.stopCoinShopTicker();
        if (!(Number(this.coinShopStatus?.remainingSeconds || 0) > 0) && this.coinShopStatus?.canClaim !== false) {
            return;
        }
        this._coinShopTickId = window.setInterval(() => {
            const modal = document.getElementById('coin-shop-modal');
            if (!modal || !modal.classList.contains('active')) {
                this.stopCoinShopTicker();
                return;
            }
            if (this.coinShopStatus?.remainingSeconds > 0) {
                this.coinShopStatus.remainingSeconds = Math.max(0, Number(this.coinShopStatus.remainingSeconds || 0) - 1);
                if (this.coinShopStatus.remainingSeconds === 0) {
                    this.coinShopStatus.canClaim = true;
                }
                this.renderCoinShopModal();
            }
        }, 1000);
    }

    stopCoinShopTicker() {
        if (this._coinShopTickId) {
            clearInterval(this._coinShopTickId);
            this._coinShopTickId = null;
        }
    }

    ensureShopIconMarkup() {
        document.querySelectorAll('[data-shop-icon]').forEach((target) => {
            const key = target.getAttribute('data-shop-icon');
            if (!key) return;
            target.innerHTML = SHOP_ICON_SVGS[key] || '';
        });
    }

    syncSoloOptions() {
        const stakeWrapper = document.getElementById('solo-stake-wrapper');
        const stakeButtons = document.querySelectorAll('#solo-stake-group .btn-option');
        if (!this.soloStakeKey || this.soloStakeKey === 'free') {
            this.soloStakeKey = 'stake_50';
        }
        this.soloEconomyMode = 'coins';

        if (stakeWrapper) {
            stakeWrapper.classList.remove('is-hidden');
        }

        stakeButtons.forEach((button) => {
            const shouldBeActive = button.dataset.value === this.soloStakeKey;
            button.classList.toggle('active', shouldBeActive);
            button.disabled = false;
        });
    }

    syncGameScreenUiState() {
        const gameScreen = document.getElementById('game-screen');
        if (!gameScreen) return;
        const isSoloGame = Boolean(this.gameActive && !this.network?.isMultiplayer);
        gameScreen.classList.toggle('is-solo-game', isSoloGame);
        document.body?.classList.toggle?.('is-solo-game', isSoloGame);
        if (isSoloGame) {
            if (this.voiceRosterPanel && !this.voiceRosterPanel.hidden) {
                this.toggleVoiceRoster(false);
            }
            this.closeGiftPicker();
            this.closeReactionPicker();
        }
    }

    readSoloEconomySelectionFromUi() {
        const selectedStakeButton = document.querySelector('#solo-stake-group .btn-option.active');
        const stakeKey = selectedStakeButton?.dataset.value || this.soloStakeKey || 'stake_50';
        return { mode: 'coins', stakeKey };
    }

    getStakeLabelByKey(stakeKey) {
        const labels = {
            stake_50: 50,
            stake_100: 100,
            stake_200: 200,
            stake_500: 500,
            stake_1000: 1000,
            stake_5000: 5000
        };

        return this.format('gift-coins', { value: Number(labels[stakeKey] ?? 50).toLocaleString('en-US') });
    }

    getStakeAmountByKey(stakeKey) {
        const amounts = {
            stake_50: 50,
            stake_100: 100,
            stake_200: 200,
            stake_500: 500,
            stake_1000: 1000,
            stake_5000: 5000
        };

        return amounts[stakeKey] || 0;
    }

    getTopRightHudState() {
        const onlineActive = this.network.isMultiplayer && (Boolean(this.currentRoomState?.gameActive) || this.gameActive);
        const stakeKey = this.network.isMultiplayer ? this.onlineStakeKey : (this.gameActive ? this.currentRoundStakeKey : this.soloStakeKey);
        const resolvedStakeKey = !stakeKey
            ? (this.network.isMultiplayer ? 'stake_200' : 'stake_50')
            : stakeKey;
        const stakeAmount = this.getStakeAmountByKey(resolvedStakeKey);

        if (onlineActive) {
            const bankAmount = Math.max(0, Number(this.currentRoomState?.bankAmount || 0));
            return {
                sourceField: 'room_state.bankAmount',
                labelKey: 'label-bank-short',
                value: bankAmount
            };
        }

        const bankAmount = this.gameActive
            ? (this.currentRoundBankAmount > 0 ? this.currentRoundBankAmount : stakeAmount * 2)
            : 0;
        return {
            sourceField: 'currentRoundBankAmount',
            labelKey: 'label-stake-short',
            value: Math.max(0, Number(bankAmount || 0))
        };
    }

    getCurrentStakeLabel() {
        const hud = this.getTopRightHudState();
        return hud.value > 0 ? this.format(hud.labelKey === 'label-bank-short' ? 'gift-coins' : 'gift-coins', { value: Number(hud.value).toLocaleString('en-US') }) : '';
    }

    resetOnlineCoinSummary() {
        this.onlineCoinSummary = { spent: 0, won: 0 };
    }

    buildGameResumeSnapshot() {
        const isOnline = this.network.isMultiplayer;
        const boardState = this.board ? this.board.toJSON() : null;
        const hands = Array.isArray(this.hands)
            ? this.hands.map((hand) => Array.isArray(hand) ? hand.map((tile) => tile ? { a: tile.a, b: tile.b } : null).filter(Boolean) : [])
            : [];
        const boneyard = Array.isArray(this.boneyard)
            ? this.boneyard.map((tile) => tile ? { a: tile.a, b: tile.b } : null).filter(Boolean)
            : [];

        return {
            kind: isOnline ? 'online' : 'solo',
            sessionId: isOnline ? (this.network.room?.sessionId || '') : (this.currentMatchSessionId || ''),
            roomId: isOnline ? (this.network.room?.roomId || this.network.room?.id || '') : null,
            roomCode: isOnline ? (this.currentRoomState?.roomCode || document.getElementById('room-code-display')?.textContent?.trim() || null) : null,
            reconnectionToken: isOnline ? (this.network.room?.reconnectionToken || this.network.getStoredReconnectionToken?.() || '') : '',
            playerName: this.playerName || '',
            playerCount: this.playerCount,
            onlinePlayerCount: this.onlinePlayerCount,
            onlineAiCount: this.onlineAiCount,
            onlineEconomyMode: this.onlineEconomyMode,
            onlineStakeKey: this.onlineStakeKey,
            soloEconomyMode: this.soloEconomyMode,
            soloStakeKey: this.soloStakeKey,
            difficulty: this.difficulty,
            gameMode: isOnline
                ? String(this.currentRoomState?.gameMode || this.currentRoomState?.mode || this.mode || 'telefon').trim() || 'telefon'
                : this.mode,
            mode: this.mode,
            isTeamMode: this.isTeamMode,
            humanPlayerIndex: this.humanPlayerIndex,
            playerNames: this.playerNames,
            scores: this.scores,
            roundWins: this.roundWins,
            teamScores: this.teamScores,
            teamRoundWins: this.teamRoundWins,
            currentPlayer: this.currentPlayer,
            matchRound: this.matchRound,
            deal: this.deal,
            selectedTileIndex: this.selectedTileIndex,
            gameActive: this.gameActive,
            roundOver: this.roundOver,
            matchOver: this.matchOver,
            lastDealWinner: this.lastDealWinner,
            turnDeadlineAt: this.turnDeadlineAt || 0,
            dlossThreshold: this.dlossThreshold,
            instantWinEnabled: this.instantWinEnabled,
            board: boardState,
            hands,
            boneyard,
            matchRuleState: this.cloneMatchRuleState(this.matchRuleState),
            createdAt: this.currentMatchStartedAt || new Date().toISOString()
        };
    }

    isResumeSnapshotEligible(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return false;
        const sessionId = String(snapshot.sessionId || '').trim();
        if (!sessionId) return false;
        if (snapshot.kind === 'online') {
            const roomId = String(snapshot.roomId || '').trim();
            const token = String(snapshot.reconnectionToken || '').trim();
            return Boolean(roomId || token);
        }
        return true;
    }

    persistGameResumeSnapshot() {
        try {
            const snapshot = this.buildGameResumeSnapshot();
            if (!this.isResumeSnapshotEligible(snapshot)) {
                this.clearGameResumeSnapshot();
                return null;
            }
            this.account?.setStoredGameResumeState?.(snapshot);
            this.refreshResumeBanner(snapshot);
            return snapshot;
        } catch (error) {
            console.warn('[Resume] Failed to persist snapshot', error);
            return null;
        }
    }

    clearGameResumeSnapshot() {
        this.account?.clearStoredGameResumeState?.();
        this.network?.setStoredReconnectionToken?.('');
        this.refreshResumeBanner(null);
    }

    refreshResumeBanner(snapshot = undefined) {
        const state = snapshot === undefined
            ? this.account?.getStoredGameResumeState?.()
            : snapshot;
        const banner = document.getElementById('resume-session-banner');
        const button = document.getElementById('resume-session-btn');
        if (!banner) return;

        const hasState = Boolean(state);
        banner.classList.toggle('is-hidden', !hasState);
        if (!hasState) return;

        if (button) {
            button.textContent = this.t('resume-session-return');
        }
    }

    isValidResumeSnapshotShape(snapshot = null) {
        if (!snapshot || typeof snapshot !== 'object') return false;
        const playerCount = Number(snapshot.playerCount ?? snapshot.onlinePlayerCount ?? snapshot.totalPlayers ?? 0);
        const aiCount = Number(snapshot.onlineAiCount ?? snapshot.aiCount ?? 0);
        if (!Number.isFinite(playerCount) || playerCount < 2 || playerCount > 4) return false;
        if (!Number.isFinite(aiCount) || aiCount < 0 || aiCount > Math.max(0, playerCount - 1)) return false;
        return true;
    }

    async validateStoredResumeSnapshot() {
        const snapshot = this.account?.getStoredGameResumeState?.();
        if (!snapshot) {
            this.refreshResumeBanner(null);
            return null;
        }

        const sessionId = String(snapshot.sessionId || '').trim();
        if (!sessionId) {
            this.clearGameResumeSnapshot();
            return null;
        }
        const isOnlineSnapshot = snapshot.kind === 'online'
            || Boolean(String(snapshot.reconnectionToken || '').trim() || String(snapshot.roomId || '').trim());
        const createdAtTs = Date.parse(String(snapshot.createdAt || ""));
        const snapshotAgeMs = Number.isFinite(createdAtTs) ? Date.now() - createdAtTs : Infinity;
        const maxSoloSnapshotAgeMs = 12 * 60 * 60 * 1000;

        if (!this.isValidResumeSnapshotShape(snapshot)) {
            this.clearGameResumeSnapshot();
            return null;
        }

        if (!isOnlineSnapshot) {
            if (!Number.isFinite(createdAtTs) || snapshotAgeMs > maxSoloSnapshotAgeMs) {
                this.clearGameResumeSnapshot();
                return null;
            }
            this.refreshResumeBanner(snapshot);
            return snapshot;
        }

        try {
            const session = await this.account?.getGameSession?.(sessionId);
            if (!session) {
                this.clearGameResumeSnapshot();
                return null;
            }

            const sessionRoomId = String(session.roomId || '').trim();
            const sessionRoomCode = String(session.roomCode || '').trim().toUpperCase();
            const snapshotRoomId = String(snapshot.roomId || '').trim();
            const snapshotRoomCode = String(snapshot.roomCode || '').trim().toUpperCase();
            if (!sessionRoomId) {
                this.clearGameResumeSnapshot();
                return null;
            }
            if (snapshotRoomId && sessionRoomId !== snapshotRoomId) {
                this.clearGameResumeSnapshot();
                return null;
            }
            if (snapshotRoomCode && sessionRoomCode && snapshotRoomCode !== sessionRoomCode) {
                this.clearGameResumeSnapshot();
                return null;
            }

            this.refreshResumeBanner(snapshot);
            return snapshot;
        } catch (error) {
            console.warn('[Resume] Snapshot validation failed, keeping local state', error);
            this.refreshResumeBanner(snapshot);
            return snapshot;
        }
    }

    async resumeSavedSession() {
        const snapshot = this.account?.getStoredGameResumeState?.();
        if (!snapshot) return false;
        this.resumeLastAttemptAt = Date.now();
        this.resumeLastError = '';

        const isValid = await this.validateStoredResumeSnapshot();
        if (!isValid) {
            this.resumeLastError = 'session-not-found';
            this.renderer.showMessage(this.t('session-not-found'), 1800);
            return false;
        }
        const isOnlineSnapshot = snapshot.kind === 'online'
            || Boolean(String(snapshot.reconnectionToken || '').trim() || String(snapshot.roomId || '').trim());

        if (isOnlineSnapshot) {
            const token = String(snapshot.reconnectionToken || this.network?.getStoredReconnectionToken?.() || '').trim();
            if (!token) {
                this.clearGameResumeSnapshot();
                this.resumeLastError = 'session-not-found';
                this.renderer.showMessage(this.t('session-not-found'), 1800);
                return false;
            }
            try {
                this.playerName = snapshot.playerName || this.playerName;
                this.onlineEconomyMode = snapshot.onlineEconomyMode || this.onlineEconomyMode;
                this.onlineStakeKey = snapshot.onlineStakeKey || this.onlineStakeKey;
                this.isTeamMode = !!snapshot.isTeamMode;
                this.onlinePlayerCount = snapshot.onlinePlayerCount || this.onlinePlayerCount;
                this.onlineAiCount = snapshot.onlineAiCount || this.onlineAiCount;
                this.currentMatchStartedAt = snapshot.createdAt || this.currentMatchStartedAt;
                await this.network.resumeRoom(token, snapshot);
                this.currentMatchSessionId = snapshot.sessionId || this.currentMatchSessionId;
                this.showStartModal(null);
                document.getElementById('start-screen')?.classList.remove('active');
                document.getElementById('game-screen')?.classList.add('active');
                startGameMusic();
                this.syncMultiplayerOptions();
                this.refreshResumeBanner(snapshot);
                this.resumeLastSuccess = Date.now();
                this.resumeLastError = '';
                return true;
            } catch (error) {
                console.warn('[Resume] Online session restore failed', error);
                this.clearGameResumeSnapshot();
                this.refreshResumeBanner(null);
                this.resumeLastError = String(error?.message || error || 'resume-failed');
                this.renderer.showMessage(this.t('session-restore-failed'), 2200);
                return false;
            }
        }

        return this.restoreSoloSnapshot(snapshot);
    }

    restoreSoloSnapshot(snapshot) {
        try {
            this.network.leaveRoom?.();
            this.currentMatchSessionId = snapshot.sessionId || this.createResumeId('solo');
            this.currentMatchStartedAt = snapshot.createdAt || new Date().toISOString();
            this.activeMatchEconomyMode = snapshot.soloEconomyMode || this.activeMatchEconomyMode;
            this.activeMatchStakeKey = snapshot.soloStakeKey || this.activeMatchStakeKey;
            this.mode = String(snapshot.gameMode || snapshot.mode || this.mode || 'telefon').trim() || 'telefon';
            this.ruleset = getRuleset(this.mode);
            this.preferredStartMode = this.mode === 'classic101' ? 'classic101' : 'telefon';
            this.lastClassic101RoundResult = null;
            this.playerName = snapshot.playerName || this.playerName;
            this.playerCount = snapshot.playerCount || this.playerCount;
            this.onlinePlayerCount = snapshot.onlinePlayerCount || this.onlinePlayerCount;
            this.onlineAiCount = snapshot.onlineAiCount || this.onlineAiCount;
            this.onlineEconomyMode = snapshot.onlineEconomyMode || this.onlineEconomyMode;
            this.onlineStakeKey = snapshot.onlineStakeKey || this.onlineStakeKey;
            this.soloEconomyMode = 'coins';
            this.soloStakeKey = snapshot.soloStakeKey && snapshot.soloStakeKey !== 'free' ? snapshot.soloStakeKey : 'stake_50';
            this.difficulty = snapshot.difficulty || this.difficulty;
            this.isTeamMode = !!snapshot.isTeamMode;
            this.humanPlayerIndex = Math.max(0, snapshot.humanPlayerIndex || 0);
            this.playerNames = Array.isArray(snapshot.playerNames) ? snapshot.playerNames.slice() : this.playerNames;
            this.scores = Array.isArray(snapshot.scores) ? snapshot.scores.slice() : [];
            this.roundWins = Array.isArray(snapshot.roundWins) ? snapshot.roundWins.slice() : [];
            this.teamScores = Array.isArray(snapshot.teamScores) ? snapshot.teamScores.slice() : [0, 0];
            this.teamRoundWins = Array.isArray(snapshot.teamRoundWins) ? snapshot.teamRoundWins.slice() : [0, 0];
            this.currentPlayer = Number(snapshot.currentPlayer ?? 0);
            this.matchRound = Number(snapshot.matchRound ?? 1);
            this.deal = Number(snapshot.deal ?? 1);
            this.selectedTileIndex = Number(snapshot.selectedTileIndex ?? -1);
            this.gameActive = !!snapshot.gameActive;
            this.roundOver = !!snapshot.roundOver;
            this.matchOver = !!snapshot.matchOver;
            this.lastDealWinner = snapshot.lastDealWinner ?? null;
            this.turnDeadlineAt = Number(snapshot.turnDeadlineAt || 0);
            this.dlossThreshold = Number(snapshot.dlossThreshold ?? this.dlossThreshold);
            this.instantWinEnabled = snapshot.instantWinEnabled !== false;
            this.board = snapshot.board ? reconstructBoard(snapshot.board) : (() => { const b = new Board(); b.startAxis = getBoardStartAxis(); return b; })();
            this.configureBoardForCurrentMode(this.board);
            this.hands = Array.isArray(snapshot.hands)
                ? snapshot.hands.map((hand) => (Array.isArray(hand) ? hand.map((tile) => new Tile(tile.a, tile.b)) : []))
                : [];
            this.boneyard = Array.isArray(snapshot.boneyard)
                ? snapshot.boneyard.map((tile) => new Tile(tile.a, tile.b))
                : [];
            this.matchRuleState = this.mode === 'classic101'
                ? (this.ruleset.normalizeMatchState?.(snapshot.matchRuleState, this.playerCount, this.isTeamMode) || this.ruleset.createMatchState?.(this.playerCount, this.isTeamMode) || null)
                : null;
            this.syncClassic101ScoreState(this.matchRuleState);
            this.ais = [];
            for (let i = 1; i < this.playerCount; i++) {
                this.ais.push(new AIPlayer(i, this.difficulty));
            }
            this.myHand = this.hands[this.humanPlayerIndex] || null;
            document.getElementById('start-screen')?.classList.remove('active');
            document.getElementById('game-screen')?.classList.add('active');
            this.syncGameScreenUiState();
            startGameMusic();
            this.syncSoloOptions();
            this.renderState();
            if (this.gameActive && this.turnDeadlineAt > 0) {
                this.startTurnTimer(this.turnDeadlineAt);
            } else {
                this.clearTurnTimers();
            }
            if (this.gameActive && this.currentPlayer !== this.humanPlayerIndex) {
                this.queueAITurnIfNeeded(BOT_THINK_DELAY_MS);
            }
            this.refreshResumeBanner(snapshot);
            this.syncStartModeUI();
            this.resumeLastSuccess = Date.now();
            this.resumeLastError = '';
            return true;
        } catch (error) {
            console.warn('[Resume] Solo session restore failed', error);
            this.clearGameResumeSnapshot();
            this.resumeLastError = String(error?.message || error || 'resume-failed');
            return false;
        }
    }

    requirePlayerName(preferred = 'any') {
        const name = this.readPlayerName(preferred);
        if (name) return name;
        this.renderer.showMessage(this.t('placeholder-player-name'), 1800);
        const primary = document.getElementById('player-name');
        const online = document.getElementById('player-name-online');
        (preferred === 'online' ? online : preferred === 'solo' ? primary : (primary || online))?.focus?.();
        return null;
    }

    prefillOnlineNameIfPossible() {
        const fallbackName = this.readPlayerName('any')
            || this.accountProfile?.gameDisplayName
            || this.account.getStoredProfile?.()?.gameDisplayName
            || this.account.getStoredProfile?.()?.name
            || '';
        if (!fallbackName) return '';

        const nextName = this.sanitizeName(fallbackName, '');
        const primary = document.getElementById('player-name');
        const online = document.getElementById('player-name-online');
        if (online && !String(online.value || '').trim()) online.value = nextName;
        if (primary && !String(primary.value || '').trim()) primary.value = nextName;
        return nextName;
    }

    onInviteCodeResolved(code) {
        const nextCode = String(code || '').trim();
        if (!nextCode) return;
        document.getElementById('room-code-display').textContent = nextCode;
        this.setHostStatus(this.t('online-room-status-waiting'));
        this.persistGameResumeSnapshot();
    }

    syncMultiplayerOptions() {
        const onlineButtons = document.querySelectorAll('#online-player-count-group .btn-option');
        onlineButtons.forEach((button) => {
            const value = parseInt(button.dataset.value, 10);
            const locked = this.isTeamMode && value !== 4;
            button.disabled = locked;
            button.classList.toggle('active', value === this.onlinePlayerCount);
        });

        document.querySelectorAll('#multi-mode-group .btn-option').forEach((button) => {
            const isTeamButton = button.dataset.value === 'team';
            button.classList.toggle('active', this.isTeamMode === isTeamButton);
        });

        if (!this.onlineStakeKey) {
            this.onlineStakeKey = 'stake_200';
        }

        const stakeWrapper = document.getElementById('online-stake-wrapper');
        if (stakeWrapper) {
            stakeWrapper.classList.remove('is-hidden');
        }

        document.querySelectorAll('#online-stake-group .btn-option').forEach((button) => {
            const shouldBeActive = button.dataset.value === this.onlineStakeKey;
            button.classList.toggle('active', shouldBeActive);
        });

        const aiInput = document.getElementById('online-ai-count');
        if (aiInput) {
            const maxAi = this.isTeamMode ? 2 : Math.max(0, this.onlinePlayerCount - 1);
            aiInput.max = String(maxAi);
            aiInput.value = String(Math.min(this.onlineAiCount, maxAi));
            this.onlineAiCount = parseInt(aiInput.value, 10) || 0;
            const summary = document.getElementById('online-player-summary');
            if (summary) {
                const humans = Math.max(1, this.onlinePlayerCount - this.onlineAiCount);
                const stakeLabel = (Array.from(document.querySelectorAll('#online-stake-group .btn-option')).find((button) => button.dataset.value === this.onlineStakeKey)?.textContent || '200').trim();
            summary.textContent = `${this.format('online-room-summary', { humans, bots: this.onlineAiCount, total: this.onlinePlayerCount })} ? ${stakeLabel}`;
            }
        }
    }

    showMultiplayerPanel(panelName) {
        document.getElementById('multi-host-ui').classList.toggle('active', panelName === 'host');
        document.getElementById('multi-join-ui').classList.toggle('active', panelName === 'join');
    }

    getOnlineBackButton() {
        const button = document.getElementById('online-modal-close');
        if (button) {
            button.textContent = '\u00d7';
            button.title = this.t('modal-close');
            button.setAttribute('aria-label', this.t('modal-close'));
        }
        return button;
    }

    placeOnlineBackButton(target, hidden = false) {
        void target;
        void hidden;
        this.getOnlineBackButton();
    }

    showOnlineLanding() {
        this.onlineRoomSource = 'closed';
        this.onlineRoomVisibility = 'closed';
        document.getElementById('online-entry-ui')?.classList.remove('is-hidden');
        document.getElementById('online-flow-ui')?.classList.add('is-hidden');
        document.getElementById('online-entry-ui')?.classList.add('online-landing-actions');
        document.getElementById('online-flow-ui')?.classList.remove('online-create-flow', 'online-join-flow');
        document.querySelector('#online-flow-ui .multiplayer-actions')?.classList.remove('online-create-actions');
        document.getElementById('host-game-btn')?.classList.remove('is-hidden');
        document.getElementById('join-game-btn')?.classList.remove('is-hidden');
        document.getElementById('host-game-btn')?.classList.remove('online-create-btn');
        this.showMultiplayerPanel(null);
        this.setHostStatus(this.t('online-room-create-hint'));
        this.setJoinStatus(this.t('online-room-join-hint'));
        this.syncOnlineModalTitle('landing');
        void this.loadFriendsHub();
        document.getElementById('online-invite-status-banner')?.classList.add('is-hidden');
    }

    showOpenRoomsModal() {
        const modal = document.getElementById('open-rooms-modal');
        if (!modal) return;
        this.closeStartModals();
        this.closePlayerProfileModal();
        this.closeAccountModal();
        this.closeCoinShopModal();
        this.closeCosmeticsShopModal();
        const startScreen = document.getElementById('start-screen');
        const gameScreen = document.getElementById('game-screen');
        if (startScreen && startScreen.classList.contains('active')) {
            this.openRoomsPrevScreen = 'start-screen';
            startScreen.classList.remove('active');
        } else if (gameScreen && gameScreen.classList.contains('active')) {
            this.openRoomsPrevScreen = 'game-screen';
            gameScreen.classList.remove('active');
        } else if (!this.openRoomsPrevScreen) {
            this.openRoomsPrevScreen = 'start-screen';
        }
        this.prefillOnlineNameIfPossible();
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.style.zIndex = '';
        modal.classList.add('active');
        this.resetOpenRoomsModalState();
        void this.loadOpenRooms();
        this.startOpenRoomsAutoRefresh();
    }

    showOpenRoomsMenu() {
        this.showOpenRoomsModal();
    }

    showOpenRoomsList() {
        this.showOpenRoomsModal();
    }

    closeOnlineModalToSource() {
        if (this.network?.room) {
            this.showStartModal(null);
            this.resetMultiplayerPanels(true);
            return;
        }
        const onlineModal = document.getElementById('online-modal');
        const flowVisible = Boolean(onlineModal?.classList.contains('active') && !document.getElementById('online-flow-ui')?.classList.contains('is-hidden'));
        if (this.onlineRoomSource === 'open' && flowVisible) {
            this.showStartModal(null);
            this.showOpenRoomsMenu();
            return;
        }
        if (flowVisible) {
            this.showOnlineLanding();
            return;
        }
        this.showStartModal(null);
    }

    hideOpenRoomsModal({ restorePreviousScreen = false } = {}) {
        document.getElementById('open-rooms-modal')?.classList.remove('active');
        this.stopOpenRoomsAutoRefresh();
        if (restorePreviousScreen) {
            const prevScreenId = this.openRoomsPrevScreen || 'start-screen';
            const gameActive = document.getElementById('game-screen')?.classList.contains('active');
            if (!gameActive) {
                document.getElementById(prevScreenId)?.classList.add('active');
            }
            this.openRoomsPrevScreen = null;
        }
    }

    closeOpenRoomsModal() {
        this.hideOpenRoomsModal({ restorePreviousScreen: true });
    }

    resetOpenRoomsModalState() {
        const search = document.getElementById('open-room-search-input');
        if (search) search.value = this.onlineRoomFilters.search || '';
        this.syncOpenRoomFilterControls();
    }

    syncOnlineModalTitle(mode = null) {
        const title = document.querySelector('#online-modal .account-modal-title-wrap h2');
        if (!title) return;
        const key = mode === 'create-open'
            ? 'online-create-title-open'
            : mode === 'create-closed'
                ? 'online-create-title-closed'
                : 'online-modal-title';
        title.dataset.i18n = key;
        title.textContent = this.t(key);
    }

    showOnlineCreateFlow(visibility = 'closed') {
        this.onlineRoomSource = visibility === 'open' ? 'open' : 'closed';
        this.onlineRoomVisibility = visibility === 'open' ? 'open' : 'closed';
        document.getElementById('online-entry-ui')?.classList.add('is-hidden');
        document.getElementById('online-flow-ui')?.classList.remove('is-hidden');
        document.getElementById('online-flow-ui')?.classList.add('online-create-flow');
        document.getElementById('online-flow-ui')?.classList.remove('online-join-flow');
        document.querySelector('#online-flow-ui .settings-grid')?.classList.remove('is-hidden');
        document.querySelector('#online-flow-ui .multiplayer-actions')?.classList.remove('is-hidden');
        document.querySelector('#online-flow-ui .multiplayer-actions')?.classList.add('online-create-actions');
        document.getElementById('host-game-btn')?.classList.remove('is-hidden');
        document.getElementById('host-game-btn')?.classList.add('online-create-btn');
        document.getElementById('join-game-btn')?.classList.add('is-hidden');
        this.showMultiplayerPanel(null);
        this.syncOnlineModalTitle(this.onlineRoomVisibility === 'open' ? 'create-open' : 'create-closed');
        this.setHostStatus(this.t('online-room-create-hint'));
        this.setJoinStatus(this.t('online-room-join-hint'));

        if (this.gameInviteState && this.gameInviteState.role === 'inviter' && this.gameInviteState.createPromptShown) {
            const banner = document.getElementById('online-invite-status-banner');
            if (banner) {
                const inviteeName = this.gameInviteState.inviteeDisplayName || 'Игрок';
                const lang = this.currentLang || 'ru';
                let statusMsg = '';
                if (lang === 'ru') {
                    statusMsg = `${inviteeName} принял приглашение и ожидает создания комнаты`;
                } else if (lang === 'az') {
                    statusMsg = `${inviteeName} dəvəti qəbul etdi və otaq qurulmasını gözləyir`;
                } else {
                    statusMsg = `${inviteeName} accepted the invite and is waiting for room creation`;
                }
                banner.textContent = statusMsg;
                banner.classList.remove('is-hidden');
            }
        } else {
            document.getElementById('online-invite-status-banner')?.classList.add('is-hidden');
        }
    }

    showOnlineJoinFlow() {
        this.onlineRoomSource = 'closed';
        this.onlineRoomVisibility = 'closed';
        document.getElementById('online-entry-ui')?.classList.add('is-hidden');
        document.getElementById('online-flow-ui')?.classList.remove('is-hidden');
        document.getElementById('online-flow-ui')?.classList.remove('online-create-flow');
        document.getElementById('online-flow-ui')?.classList.add('online-join-flow');
        document.querySelector('#online-flow-ui .multiplayer-actions')?.classList.remove('online-create-actions');
        document.getElementById('host-game-btn')?.classList.remove('online-create-btn');
        document.querySelector('#online-flow-ui .settings-grid')?.classList.add('is-hidden');
        document.querySelector('#online-flow-ui .multiplayer-actions')?.classList.add('is-hidden');
        document.getElementById('host-game-btn')?.classList.add('is-hidden');
        document.getElementById('join-game-btn')?.classList.add('is-hidden');
        this.showMultiplayerPanel('join');
        this.syncOnlineModalTitle('landing');
        const joinInput = document.getElementById('join-code-input');
        if (joinInput && this.pendingSharedRoomCode && !String(joinInput.value || '').trim()) {
            joinInput.value = this.pendingSharedRoomCode;
        }
        this.setJoinStatus(this.t('online-room-join-hint'));
    }

    showOnlineSocialPanel(panelName = 'rooms') {
        this.onlineSocialPanel = panelName === 'friends' ? 'friends' : 'rooms';
        document.getElementById('online-social-rooms-btn')?.classList.toggle('active', this.onlineSocialPanel === 'rooms');
        document.getElementById('online-social-friends-btn')?.classList.toggle('active', this.onlineSocialPanel === 'friends');
        document.getElementById('online-open-rooms-panel')?.classList.toggle('is-hidden', this.onlineSocialPanel !== 'rooms');
        document.getElementById('online-friends-panel')?.classList.toggle('is-hidden', this.onlineSocialPanel !== 'friends');
        if (this.onlineSocialPanel === 'rooms') {
            void this.loadOpenRooms();
        } else {
            void this.loadFriendsHub();
        }
    }

    async refreshOnlineSocialPanels() {
        if (this.onlineSocialPanel === 'friends') {
            await this.loadFriendsHub();
            return;
        }
        await this.loadOpenRooms();
    }

    getCurrentRoomSnapshot() {
        const roomState = this.currentRoomState || {};
        const room = this.network?.room;
        const roomCode = String(roomState.roomCode || document.getElementById('room-code-display')?.textContent?.trim() || room?.roomCode || room?.id || '').trim();
        const roomId = String(roomState.roomId || room?.roomId || room?.id || '').trim();
        if (!roomCode && !roomId) return null;

        return {
            roomId,
            roomCode: roomCode || null,
            roomVisibility: String(roomState.roomVisibility || room?.roomVisibility || 'closed').trim(),
            gameMode: String(roomState.gameMode || roomState.mode || room?.gameMode || room?.state?.gameMode || room?.state?.mode || this.getSelectedGameMode() || 'telefon').trim() || 'telefon',
            roomMode: String(roomState.roomMode || (roomState.isTeamMode ? 'team' : 'ffa') || (this.isTeamMode ? 'team' : 'ffa')).trim(),
            stakeKey: String(roomState.stakeKey || this.onlineStakeKey || 'stake_200').trim(),
            stakeAmount: Number(roomState.stakeAmount || this.onlineRoundBankAmount || 0),
            humanSeats: Number(roomState.humanSeats || this.onlinePlayerCount || 0),
            totalPlayers: Number(roomState.totalPlayers || this.onlinePlayerCount || 0),
            isTeamMode: Boolean(roomState.isTeamMode ?? this.isTeamMode),
            gameActive: Boolean(roomState.gameActive),
            hostName: String(roomState.hostName || '').trim()
        };
    }

    isWaitingInOpenRoom(roomState = this.currentRoomState) {
        if (!this.network?.isMultiplayer) return false;
        const state = roomState || {};
        const visibility = String(state?.roomVisibility || this.onlineRoomVisibility || '').trim().toLowerCase();
        const roomPhase = String(state?.roomPhase || '').trim().toLowerCase();
        const stagePhase = String(this.roundStage?.phase || '').trim().toLowerCase();
        return Boolean(
            visibility === 'open'
            && (state?.roomId || state?.roomCode || this.network?.room)
            && !this.onlineResultActive
            && !Boolean(state?.gameActive)
            && !Boolean(this.gameActive)
            && !Boolean(state?.roundOver)
            && !Boolean(this.roundOver)
            && !Boolean(state?.matchOver)
            && !Boolean(this.matchOver)
            && !Boolean(state?.lastMoveRevealPending)
            && !Boolean(this.lastMoveRevealPending)
            && stagePhase !== 'final-move'
            && stagePhase !== 'counting'
            && !this.isResultScreenActive()
            && (!roomPhase || roomPhase === 'lobby' || roomPhase === 'waiting')
            && !String(state?.gameOverReason || '').trim()
            && roomPhase !== 'timeout_result'
        );
    }

    isResultScreenActive() {
        return Boolean(
            document.getElementById('round-end-screen')?.classList.contains('active')
            || document.getElementById('game-over-screen')?.classList.contains('active')
        );
    }

    isResultFlowActive(roomState = this.currentRoomState) {
        const state = roomState || {};
        const roomPhase = String(state?.roomPhase || '').trim().toLowerCase();
        const stagePhase = String(this.roundStage?.phase || '').trim().toLowerCase();
        return Boolean(
            this.onlineResultActive
            || Boolean(state?.roundOver)
            || Boolean(this.roundOver)
            || Boolean(state?.matchOver)
            || Boolean(this.matchOver)
            || Boolean(state?.lastMoveRevealPending)
            || Boolean(this.lastMoveRevealPending)
            || stagePhase === 'final-move'
            || stagePhase === 'counting'
            || roomPhase === 'last_move_reveal'
            || roomPhase === 'result'
            || roomPhase === 'timeout_result'
            || roomPhase === 'match_end'
            || this.isResultScreenActive()
        );
    }

    resetOnlineResultFlowState() {
        this.onlineResultActive = false;
        this.cancelOnlineResultPresentation();
    }

    syncOpenRoomWaitingBanner(roomState = this.currentRoomState) {
        const banner = document.getElementById('open-room-waiting-banner');
        const title = document.getElementById('open-room-waiting-title');
        const count = document.getElementById('open-room-waiting-count');
        if (!banner || !title || !count) return;
        if (this.isResultScreenActive() || this.isResultFlowActive(roomState)) {
            banner.classList.add('is-hidden');
            return;
        }
        const shouldShow = this.isWaitingInOpenRoom(roomState);
        banner.classList.toggle('is-hidden', !shouldShow);
        if (!shouldShow) return;
        const joined = Math.max(0, Number(roomState?.humanPlayers || roomState?.currentPlayers || 0));
        const seats = Math.max(0, Number(roomState?.humanSeats || roomState?.totalPlayers || this.onlinePlayerCount || 0));
        title.textContent = this.t('open-room-waiting-title');
        count.textContent = `${joined}/${seats}`;
    }

    async loadOpenRooms() {
        const list = document.getElementById('open-rooms-list');
        const modal = document.getElementById('open-rooms-modal');
        if (!list || !modal?.classList.contains('active')) return;
        this.setSummaryMessage(list, this.t('account-profile-loading'));
        try {
            const rooms = await this.account.getOpenRooms({
                search: this.onlineRoomFilters.search,
                roomVisibility: 'open',
                joinableOnly: true,
                gameMode: this.onlineRoomFilters.gameMode || this.getSelectedGameMode(),
                limit: 24
            });
            if (!modal?.classList.contains('active')) return;
            this.openRooms = Array.isArray(rooms) ? rooms : [];
            this.renderOpenRooms();
        } catch (err) {
            this.setSummaryMessage(list, err.message || this.t('account-server-unavailable'));
        }
    }

    renderOpenRooms() {
        const list = document.getElementById('open-rooms-list');
        if (!list) return;
        const rooms = this.getFilteredOpenRooms();
        if (!rooms.length) {
            this.setSummaryMessage(list, this.t('no-open-rooms'));
            return;
        }

        list.innerHTML = '';
        rooms.forEach((room) => {
            const card = document.createElement('div');
            card.className = 'open-room-card';
            const roomGameMode = String(room?.gameMode || room?.mode || 'telefon').trim().toLowerCase() || 'telefon';

            const infoContainer = document.createElement('div');
            infoContainer.className = 'open-room-card-info';

            const topRow = document.createElement('div');
            topRow.className = 'open-room-card-top';

            const ownerSpan = document.createElement('span');
            ownerSpan.className = 'open-room-owner';
            ownerSpan.textContent = room.hostName || room.roomId || this.t('room-open');
            topRow.appendChild(ownerSpan);

            if (room.roomCode) {
                const codeSpan = document.createElement('span');
                codeSpan.className = 'open-room-code';
                codeSpan.textContent = room.roomCode;
                topRow.appendChild(codeSpan);
            }

            const modeLabel = room.roomMode === 'team'
                ? this.t('mode-team')
                : this.t('mode-ffa');
            const modeSpan = document.createElement('span');
            modeSpan.className = 'open-room-mode';
            modeSpan.textContent = modeLabel;
            topRow.appendChild(modeSpan);

            const modeBadgeRow = document.createElement('div');
            modeBadgeRow.className = 'open-room-badges';
            const gameModeBadge = this.createRoomBadge('mode', this.getModeLabel(roomGameMode));
            gameModeBadge.classList.add('open-room-mode-badge', `open-room-mode-badge-${roomGameMode}`);
            modeBadgeRow.appendChild(gameModeBadge);

            const bottomRow = document.createElement('div');
            bottomRow.className = 'open-room-card-bottom';

            const seatCount = `${room.connectedPlayers || 0}/${room.humanSeats || room.totalPlayers || 0}`;
            const playersSpan = document.createElement('span');
            playersSpan.className = 'open-room-players';
            
            const playersIcon = document.createElement('span');
            playersIcon.className = 'open-room-icon';
            playersIcon.innerHTML = this.createRoomConditionIcon('players');
            
            const playersText = document.createElement('span');
            playersText.textContent = seatCount;
            
            playersSpan.appendChild(playersIcon);
            playersSpan.appendChild(playersText);
            bottomRow.appendChild(playersSpan);

            const stakeVal = room.stakeKey
                ? room.stakeKey.replace(/^stake_/i, '')
                : '200';
            const stakeSpan = document.createElement('span');
            stakeSpan.className = 'open-room-stake';
            
            const stakeIcon = document.createElement('span');
            stakeIcon.className = 'open-room-icon';
            stakeIcon.innerHTML = this.createRoomConditionIcon('stake');
            
            const stakeText = document.createElement('span');
            stakeText.textContent = stakeVal;
            
            stakeSpan.appendChild(stakeIcon);
            stakeSpan.appendChild(stakeText);
            bottomRow.appendChild(stakeSpan);

            infoContainer.appendChild(topRow);
            infoContainer.appendChild(modeBadgeRow);
            infoContainer.appendChild(bottomRow);

            const joinBtn = document.createElement('button');
            joinBtn.className = 'btn btn-action btn-strong open-room-join-btn';
            joinBtn.textContent = this.t('room-join');
            joinBtn.addEventListener('click', async () => {
                const joined = await this.joinOnlineRoom(room);
                if (joined) this.hideOpenRoomsModal();
            });

            card.appendChild(infoContainer);
            card.appendChild(joinBtn);
            list.appendChild(card);
        });
    }

    getFilteredOpenRooms() {
        const search = String(this.onlineRoomFilters.search || '').trim().toLowerCase();
        const selectedGameMode = String(this.onlineRoomFilters.gameMode || this.getSelectedGameMode() || 'telefon').trim().toLowerCase();
        const selectedModes = Array.isArray(this.onlineRoomFilters.roomModes) && this.onlineRoomFilters.roomModes.length
            ? new Set(this.onlineRoomFilters.roomModes)
            : new Set(['ffa', 'team']);
        const selectedStakes = Array.isArray(this.onlineRoomFilters.stakeKeys) && this.onlineRoomFilters.stakeKeys.length
            ? new Set(this.onlineRoomFilters.stakeKeys)
            : new Set(['stake_200', 'stake_500', 'stake_1000', 'stake_5000']);
        return (Array.isArray(this.openRooms) ? this.openRooms : []).filter((room) => {
            const roomGameMode = String(room?.gameMode || room?.mode || 'telefon').trim().toLowerCase() || 'telefon';
            const roomMode = String(room?.roomMode || '').trim().toLowerCase();
            const stakeKey = String(room?.stakeKey || '').trim();
            if (roomGameMode && selectedGameMode && selectedGameMode !== 'all' && roomGameMode !== selectedGameMode) return false;
            if (roomMode && !selectedModes.has(roomMode)) return false;
            if (stakeKey && !selectedStakes.has(stakeKey)) return false;
            if (!search) return true;
            const haystack = [
                room?.roomCode,
                room?.roomId,
                room?.hostName,
                ...(Array.isArray(room?.players) ? room.players.map((player) => player?.displayName) : [])
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(search);
        });
    }

    syncOpenRoomFilterControls() {
        const activeModes = new Set(this.onlineRoomFilters.roomModes || []);
        const activeStakes = new Set(this.onlineRoomFilters.stakeKeys || []);
        document.querySelectorAll('.open-room-mode-toggle').forEach((button) => {
            const isActive = activeModes.has(button.dataset.roomMode || '');
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        document.querySelectorAll('.open-room-stake-toggle').forEach((button) => {
            const isActive = activeStakes.has(button.dataset.stakeKey || '');
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    toggleOpenRoomModeFilter(roomMode) {
        const validModes = ['ffa', 'team'];
        if (!validModes.includes(roomMode)) return;
        const activeModes = Array.isArray(this.onlineRoomFilters.roomModes)
            ? this.onlineRoomFilters.roomModes.filter((mode) => validModes.includes(mode))
            : validModes.slice();
        const hasMode = activeModes.includes(roomMode);
        let nextModes = hasMode
            ? activeModes.filter((mode) => mode !== roomMode)
            : activeModes.concat(roomMode);
        if (!nextModes.length) nextModes = validModes.slice();
        this.onlineRoomFilters.roomModes = validModes.filter((mode) => nextModes.includes(mode));
        this.syncOpenRoomFilterControls();
    }

    toggleOpenRoomStakeFilter(stakeKey) {
        const validStakeKeys = ['stake_200', 'stake_500', 'stake_1000', 'stake_5000'];
        if (!validStakeKeys.includes(stakeKey)) return;
        const activeStakeKeys = Array.isArray(this.onlineRoomFilters.stakeKeys)
            ? this.onlineRoomFilters.stakeKeys.filter((key) => validStakeKeys.includes(key))
            : validStakeKeys.slice();
        const hasStakeKey = activeStakeKeys.includes(stakeKey);
        let nextStakeKeys = hasStakeKey
            ? activeStakeKeys.filter((key) => key !== stakeKey)
            : activeStakeKeys.concat(stakeKey);
        if (!nextStakeKeys.length) nextStakeKeys = validStakeKeys.slice();
        this.onlineRoomFilters.stakeKeys = validStakeKeys.filter((key) => nextStakeKeys.includes(key));
        this.syncOpenRoomFilterControls();
    }

    createRoomConditionIcon(kind) {
        const icons = {
            mode: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
            players: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a3 3 0 1 0-.01 0Z"/><path d="M17 12a2 2 0 1 0-.01 0Z"/><path d="M4 19c0-2.8 2.3-5 5-5s5 2.2 5 5"/><path d="M13 19c.3-2 1.8-3.6 4-4"/></svg>',
            stake: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M9 10c0-1.5 1.3-2.5 3-2.5S15 8.2 15 9.5c0 1.2-1 1.9-3 2.5s-3 1.3-3 2.5c0 1.5 1.3 2.5 3 2.5S15 16.8 15 15.5"/><path d="M12 6.5v11"/></svg>',
            open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-6 8 6"/><path d="M6 10v8h12v-8"/><path d="M10 18v-4h4v4"/></svg>'
        };
        return icons[kind] || icons.open;
    }

    createRoomBadge(kind, text) {
        const badge = document.createElement('span');
        badge.className = `room-badge room-badge-${kind}`;
        const icon = document.createElement('span');
        icon.className = 'room-badge-icon';
        icon.innerHTML = this.createRoomConditionIcon(kind);
        const label = document.createElement('span');
        label.className = 'room-badge-text';
        label.textContent = text;
        badge.appendChild(icon);
        badge.appendChild(label);
        return badge;
    }

    async searchFriends() {
        const searchInput = document.getElementById('friend-search-input');
        const query = String(searchInput?.value || '').trim();
        const resultsList = document.getElementById('friend-search-results');
        if (!resultsList) return;
        if (!query) {
            this.setSummaryMessage(resultsList, this.t('search-name-hint'));
            return;
        }
        this.setSummaryMessage(resultsList, this.t('account-profile-loading'));
        try {
            const presenceMap = this.friendPresenceMap instanceof Map ? this.friendPresenceMap : await this.loadFriendPresenceMap().catch(() => new Map());
            const items = await this.account.searchPlayers(query);
            this.friendSearchResults = Array.isArray(items) ? items : [];
            if (!this.friendSearchResults.length) {
                this.setSummaryMessage(resultsList, this.t('search-no-results'));
                return;
            }
            resultsList.innerHTML = '';
            this.friendSearchResults.forEach((player) => {
                const card = document.createElement('div');
                card.className = 'friend-card';
                const copy = document.createElement('div');
                copy.className = 'friend-card-copy';
                const name = this.createPlayerNameButton(player.displayName, player, 'friend-card-name');
                const status = this.createFriendStatusBadge(this.getFriendPresenceStatus(player, presenceMap));
                const id = document.createElement('span');
                id.textContent = player.id;
                copy.appendChild(name);
                copy.appendChild(status);
                copy.appendChild(id);
                const action = document.createElement('div');
                action.className = 'friend-card-actions';
                const statusKey = String(player.friendshipStatus || 'none').trim();
                if (statusKey === 'self') {
                    const selfBtn = document.createElement('button');
                    selfBtn.className = 'btn btn-menu';
                    selfBtn.disabled = true;
                    selfBtn.textContent = this.t('player-profile-self') || 'You';
                    action.appendChild(selfBtn);
                } else if (statusKey === 'accepted') {
                    const messageBtn = document.createElement('button');
                    messageBtn.className = 'btn btn-menu';
                    messageBtn.textContent = 'Message';
                    messageBtn.addEventListener('click', async () => {
                        await this.openConversationWithPlayer(player);
                    });
                    action.appendChild(messageBtn);
                } else if (statusKey === 'pending_outgoing') {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn btn-menu';
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.addEventListener('click', async () => {
                        cancelBtn.disabled = true;
                        try {
                            await this.account.cancelFriendRequest(player.friendshipId);
                            await this.searchFriends();
                            this.renderer.showMessage(this.t('friends-request-cancelled') || 'Request cancelled', 1400);
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
                        } finally {
                            cancelBtn.disabled = false;
                        }
                    });
                    action.appendChild(cancelBtn);
                } else if (statusKey === 'pending_incoming') {
                    const acceptBtn = document.createElement('button');
                    acceptBtn.className = 'btn btn-action';
                    acceptBtn.textContent = this.t('friend-accept');
                    acceptBtn.addEventListener('click', async () => {
                        acceptBtn.disabled = true;
                        try {
                            await this.account.acceptFriendRequest(player.friendshipId);
                            await this.searchFriends();
                            this.renderer.showMessage(this.t('friends-request-accepted'), 1400);
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
                        } finally {
                            acceptBtn.disabled = false;
                        }
                    });
                    action.appendChild(acceptBtn);
                } else {
                    const addBtn = document.createElement('button');
                    addBtn.className = 'btn btn-action';
                    addBtn.textContent = this.t('friend-add');
                    addBtn.addEventListener('click', async () => {
                        addBtn.disabled = true;
                        try {
                            await this.account.sendFriendRequest(player.id);
                            await this.loadFriendsHub();
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
                        } finally {
                            addBtn.disabled = false;
                        }
                    });
                    action.appendChild(addBtn);
                }
                card.appendChild(copy);
                card.appendChild(action);
                resultsList.appendChild(card);
            });
        } catch (err) {
            this.setSummaryMessage(resultsList, err.message || this.t('account-server-unavailable'));
        }
    }

    async loadFriendsHub() {
        const {
            friendsList,
            requestsList,
            incomingInvitesList,
            sentInvitesList,
            legacyInvitesList,
            searchResults
        } = this.getFriendsUiElements();
        const loggedIn = this.hasAuthenticatedAccount();
        const emptyText = this.t('friends-sign-in');
        const invitesTargets = [incomingInvitesList, sentInvitesList, legacyInvitesList].filter(Boolean);
        const setInvitesMessage = (message) => {
            if (!invitesTargets.length) return;
            invitesTargets.forEach((target, index) => {
                if (!target) return;
                if (index === 0) {
                    this.setSummaryMessage(target, message);
                } else {
                    target.innerHTML = '';
                }
            });
        };

        if (!friendsList || !requestsList || !searchResults || !invitesTargets.length) return;
        if (!loggedIn) {
            this.setSummaryMessage(friendsList, emptyText);
            this.setSummaryMessage(requestsList, emptyText);
            setInvitesMessage(emptyText);
            this.setSummaryMessage(searchResults, emptyText);
            return;
        }

        if (!friendsList.children.length) {
            this.setSummaryMessage(friendsList, this.t('account-profile-loading'));
        }
        if (!requestsList.children.length) {
            this.setSummaryMessage(requestsList, this.t('account-profile-loading'));
        }
        if (!invitesTargets.some(t => t.children.length)) {
            setInvitesMessage(this.t('account-profile-loading'));
        }
        try {
            const [friendsResult, roomInvitationsResult, playInvitationsResult, presenceResult] = await Promise.allSettled([
                this.account.getFriends(),
                this.account.getRoomInvitations(),
                this.account.getPlayInvites(),
                this.loadFriendPresenceMap()
            ]);
            const friends = friendsResult.status === 'fulfilled' ? friendsResult.value : null;
            const roomInvitations = roomInvitationsResult.status === 'fulfilled' ? roomInvitationsResult.value : null;
            const playInvitations = playInvitationsResult.status === 'fulfilled' ? playInvitationsResult.value : null;
            if (presenceResult.status === 'fulfilled' && presenceResult.value instanceof Map) {
                this.friendPresenceMap = presenceResult.value;
            }
            this.friendHub = friends || { accepted: [], incoming: [], outgoing: [], items: [] };
            let mergedInvitations = this.roomInvitations || { incoming: [], sent: [] };
            if (roomInvitations) {
                mergedInvitations = this.mergeRoomInvitations(mergedInvitations, roomInvitations || { incoming: [], sent: [] });
            }
            if (playInvitations) {
                mergedInvitations = this.mergeRoomInvitations(mergedInvitations, playInvitations || { incoming: [], sent: [] });
            }
            this.roomInvitations = mergedInvitations;
            this._lastInviteError = '';
            this.restoreGameInviteStateFromInvitations();
            void this.refreshGameInviteState().catch(() => {});
            const presenceMap = this.friendPresenceMap instanceof Map ? this.friendPresenceMap : new Map();

            friendsList.innerHTML = '';
            if (friendsResult.status !== 'fulfilled') {
                this.setSummaryMessage(friendsList, friendsResult.reason?.message || this.t('friends-load-failed'));
            } else if (!this.friendHub.accepted.length) {
                this.setSummaryMessage(friendsList, this.t('no-friends-yet'));
            } else {
                this.friendHub.accepted.forEach((item) => {
                    const card = document.createElement('div');
                    card.className = 'friend-card';
                    const copy = document.createElement('div');
                    copy.className = 'friend-card-copy';
                    const name = this.createPlayerNameButton(item.friend.displayName, item.friend, 'friend-card-name');
                    const status = this.createFriendStatusBadge(this.getFriendPresenceStatus(item.friend, presenceMap));
                    const id = document.createElement('span');
                    id.textContent = item.friend.id;
                    copy.appendChild(name);
                    copy.appendChild(status);
                    copy.appendChild(id);
                    const action = document.createElement('div');
                    action.className = 'friend-card-actions';

                    const messageBtn = document.createElement('button');
                    messageBtn.className = 'btn btn-menu message-action-btn';
                    messageBtn.textContent = 'Message';
                    messageBtn.addEventListener('click', () => {
                        void this.openConversationWithPlayer(item.friend);
                    });
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'btn btn-menu';
                    removeBtn.textContent = this.t('friend-remove');
                    const giftBtn = document.createElement('button');
                    giftBtn.className = 'btn btn-action';
                    giftBtn.textContent = this.t('gift-button');
                    giftBtn.addEventListener('click', () => {
                        this.selectedGiftRecipientId = item.friend.id;
                        this.renderGiftPicker();
                        this.toggleGiftPicker(true, { source: 'social', activePlayerId: item.friend.id });
                    });
                    removeBtn.addEventListener('click', async () => {
                        removeBtn.disabled = true;
                        try {
                            await this.account.removeFriend(item.id);
                            await this.loadFriendsHub();
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
                        } finally {
                            removeBtn.disabled = false;
                        }
                    });
                    action.appendChild(messageBtn);
                    action.appendChild(removeBtn);
                    action.appendChild(giftBtn);
                    card.appendChild(copy);
                    card.appendChild(action);
                    friendsList.appendChild(card);
                });
            }

            requestsList.innerHTML = '';
            if (friendsResult.status !== 'fulfilled') {
                this.setSummaryMessage(requestsList, friendsResult.reason?.message || this.t('friends-load-failed'));
            } else if (!this.friendHub.incoming.length && !this.friendHub.outgoing.length) {
                this.setSummaryMessage(requestsList, this.t('no-friend-requests'));
            } else {
                const renderRequest = (item, label, acceptable) => {
                    const card = document.createElement('div');
                    card.className = 'friend-card';
                    const copy = document.createElement('div');
                    copy.className = 'friend-card-copy';
                    const name = this.createPlayerNameButton(item.friend.displayName, item.friend, 'friend-card-name');
                    const status = this.createFriendStatusBadge(this.getFriendPresenceStatus(item.friend, presenceMap));
                    const labelEl = document.createElement('span');
                    labelEl.textContent = label;
                    copy.appendChild(name);
                    copy.appendChild(status);
                    copy.appendChild(labelEl);
                    const action = document.createElement('div');
                    action.className = 'friend-card-actions';
                    if (acceptable) {
                        const acceptBtn = document.createElement('button');
                        acceptBtn.className = 'btn btn-action btn-strong';
                        acceptBtn.textContent = this.t('friend-accept');
                        acceptBtn.addEventListener('click', async () => {
                            acceptBtn.disabled = true;
                            try {
                                await this.account.acceptFriendRequest(item.id);
                                await this.loadFriendsHub();
                            } catch (err) {
                                this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
                            } finally {
                                acceptBtn.disabled = false;
                            }
                        });
                        action.appendChild(acceptBtn);
                    }
                    if (acceptable) {
                        const declineBtn = document.createElement('button');
                        declineBtn.className = 'btn btn-menu';
                        declineBtn.textContent = this.t('friend-decline');
                        declineBtn.addEventListener('click', async () => {
                            declineBtn.disabled = true;
                            try {
                                await this.account.declineFriendRequest(item.id);
                                await this.loadFriendsHub();
                            } catch (err) {
                                this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
                            } finally {
                                declineBtn.disabled = false;
                            }
                        });
                        action.appendChild(declineBtn);
                    } else {
                        const cancelBtn = document.createElement('button');
                        cancelBtn.className = 'btn btn-menu';
                        cancelBtn.textContent = 'Cancel';
                        cancelBtn.addEventListener('click', async () => {
                            cancelBtn.disabled = true;
                            try {
                                await this.account.cancelFriendRequest(item.id);
                                await this.loadFriendsHub();
                            } catch (err) {
                                this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
                            } finally {
                                cancelBtn.disabled = false;
                            }
                        });
                        action.appendChild(cancelBtn);
                    }
                    card.appendChild(copy);
                    card.appendChild(action);
                    requestsList.appendChild(card);
                };
            this.friendHub.incoming.forEach((item) => renderRequest(item, this.t('friend-incoming'), true));
                this.friendHub.outgoing.forEach((item) => renderRequest(item, this.t('friend-outgoing'), false));
            }

            try {
                invitesTargets.forEach((target) => {
                    target.innerHTML = '';
                });
                const roomInviteError = roomInvitationsResult.status !== 'fulfilled' ? roomInvitationsResult.reason?.message || this.t('friends-load-failed') : '';
                const playInviteError = playInvitationsResult.status !== 'fulfilled' ? playInvitationsResult.reason?.message || this.t('friends-load-failed') : '';
                if (!roomInvitations && !playInvitations) {
                    setInvitesMessage(roomInviteError || playInviteError || this.t('friends-load-failed'));
                } else {
                    const { incoming: incomingInvites, sent: sentInvites } = this.getActiveRoomInvitations(this.roomInvitations);
                    if (!incomingInvites.length && !sentInvites.length) {
                        setInvitesMessage(this.t('no-room-invites'));
                    } else {
                        const appendInviteSection = (target, titleKey, items, direction) => {
                            if (!target || !items.length) return;
                            const title = document.createElement('div');
                            title.className = 'section-kicker';
                            title.textContent = this.t(titleKey);
                            target.appendChild(title);
                            items.forEach((invite) => {
                                target.appendChild(this.createRoomInvitationCard(invite, direction));
                            });
                        };
                        if (incomingInvites.length) {
                            appendInviteSection(incomingInvitesList || legacyInvitesList, 'invites-incoming-title', incomingInvites, 'incoming');
                        }
                        if (sentInvites.length) {
                            appendInviteSection(sentInvitesList || legacyInvitesList, 'invites-sent-title', sentInvites, 'sent');
                        }
                    }
                }
            } catch (invitesErr) {
                setInvitesMessage(invitesErr?.message || this.t('friends-load-failed'));
            }
        } catch (err) {
            this.setSummaryMessage(friendsList, err.message || this.t('account-server-unavailable'));
            this.setSummaryMessage(requestsList, err.message || this.t('account-server-unavailable'));
            setInvitesMessage(err.message || this.t('account-server-unavailable'));
        }
        await this.loadSocialSummary();
        this.renderGiftPicker();
    }

    ensureContextualRoomInvitePickerUi() {
        if (document.getElementById('contextual-room-invite-overlay')) {
            this.contextualRoomInviteUi = this.contextualRoomInviteUi || {
                overlay: document.getElementById('contextual-room-invite-overlay'),
                list: document.getElementById('contextual-room-invite-list'),
                searchInput: document.getElementById('contextual-room-invite-search'),
                status: document.getElementById('contextual-room-invite-status'),
                title: document.getElementById('contextual-room-invite-title'),
                subtitle: document.getElementById('contextual-room-invite-subtitle'),
                closeBtn: document.getElementById('contextual-room-invite-close')
            };
            return;
        }

        if (typeof document === 'undefined' || !document.body) return;

        const overlay = document.createElement('div');
        overlay.id = 'contextual-room-invite-overlay';
        overlay.className = 'modal-backdrop contextual-room-invite-overlay';
        overlay.setAttribute('aria-hidden', 'true');

        const card = document.createElement('div');
        card.className = 'modal-card modal-card-wide contextual-room-invite-card';

        const header = document.createElement('div');
        header.className = 'modal-header contextual-room-invite-header';
        const titleWrap = document.createElement('div');
        const title = document.createElement('h2');
        title.id = 'contextual-room-invite-title';
        title.textContent = this.t('friend-invite');
        const subtitle = document.createElement('div');
        subtitle.id = 'contextual-room-invite-subtitle';
        subtitle.className = 'modal-desc';
        subtitle.textContent = this.t('invite-sent');
        titleWrap.appendChild(title);
        titleWrap.appendChild(subtitle);
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.id = 'contextual-room-invite-close';
        closeBtn.className = 'social-close-btn contextual-room-invite-close';
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', this.t('modal-close'));
        closeBtn.addEventListener('click', () => this.hideContextualRoomInvitePicker());
        header.appendChild(titleWrap);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'contextual-room-invite-body';
        const search = document.createElement('input');
        search.type = 'search';
        search.id = 'contextual-room-invite-search';
        search.className = 'contextual-room-invite-search';
        search.placeholder = this.t('search-name-hint');
        search.addEventListener('input', () => this.renderContextualRoomInvitePicker());
        const status = document.createElement('div');
        status.id = 'contextual-room-invite-status';
        status.className = 'contextual-room-invite-status';
        const list = document.createElement('div');
        list.id = 'contextual-room-invite-list';
        list.className = 'room-player-list contextual-room-invite-list';
        body.appendChild(search);
        body.appendChild(status);
        body.appendChild(list);

        card.appendChild(header);
        card.appendChild(body);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        this.contextualRoomInviteUi = { overlay, list, searchInput: search, status, title, subtitle, closeBtn };
    }

    hideContextualRoomInvitePicker() {
        const overlay = document.getElementById('contextual-room-invite-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
        }
        this.friendPickerOpen = false;
        this.friendPickerSource = '';
        this.contextualRoomInviteState = null;
        document.body.classList.remove('contextual-room-invite-active');
    }

    async openContextualRoomInvitePicker(options = {}) {
        const context = this.getCurrentRoomInviteContext(options) || null;
        if (!context) {
            this.renderer.showMessage(this.t('online-room-status-error') || 'Room is not ready', 1400);
            return null;
        }
        this.ensureContextualRoomInvitePickerUi();
        this.contextualRoomInviteState = {
            ...(context || {}),
            source: String(options?.source || context?.source || 'room-context').trim() || 'room-context'
        };
        this.friendPickerOpen = true;
        this.friendPickerSource = String(this.contextualRoomInviteState.source || '').trim() || 'room-context';
        this._lastContextualInviteOpenSource = this.friendPickerSource;
        this._lastContextualInviteRoomId = String(context.roomId || '').trim();
        this._lastContextualInviteRoomCode = String(context.roomCode || '').trim();
        this._lastContextualInviteRoomMode = String(context.roomMode || '').trim();
        this._lastContextualInviteTargetSlotIndex = Number.isInteger(Number(context.targetSlotIndex)) ? Number(context.targetSlotIndex) : null;
        this._lastContextualInviteSelectedFriendId = '';
        this._lastContextualInviteSendAt = 0;
        this._lastContextualInviteSendResultSafe = null;
        this._lastContextualInviteSendError = '';
        const overlay = document.getElementById('contextual-room-invite-overlay');
        overlay?.classList.add('active');
        overlay?.setAttribute('aria-hidden', 'false');
        document.body.classList.add('contextual-room-invite-active');
        const searchInput = document.getElementById('contextual-room-invite-search');
        if (searchInput) {
            searchInput.value = '';
        }
        await this.loadFriendHubDataForInvitePicker().catch(() => {});
        this.renderContextualRoomInvitePicker();
        return this.contextualRoomInviteState;
    }

    async loadFriendHubDataForInvitePicker() {
        const [friendsResult, presenceResult] = await Promise.allSettled([
            this.account.getFriends(),
            this.loadFriendPresenceMap()
        ]);
        if (friendsResult.status === 'fulfilled' && friendsResult.value) {
            this.friendHub = friendsResult.value || { accepted: [], incoming: [], outgoing: [], items: [] };
        }
        if (presenceResult.status === 'fulfilled' && presenceResult.value instanceof Map) {
            this.friendPresenceMap = presenceResult.value;
        }
        return this.friendHub;
    }

    async sendContextualRoomInvite(friendRef, context = {}) {
        const inviteePlayerId = this.getFriendPlayerId(friendRef);
        const roomContext = this.getCurrentRoomInviteContext({
            source: context.source || this.contextualRoomInviteState?.source || 'room-context',
            targetSlotIndex: context.targetSlotIndex ?? this.contextualRoomInviteState?.targetSlotIndex ?? null,
            openSeatPickerOnJoin: context.openSeatPickerOnJoin ?? this.contextualRoomInviteState?.openSeatPickerOnJoin ?? null
        });
        if (!inviteePlayerId || !roomContext?.roomId) {
            throw new Error(this.t('friends-load-failed'));
        }
        const payload = {
            inviteePlayerId,
            note: String(context.note || 'play-invite').trim() || 'play-invite',
            payloadJson: {
                source: String(context.source || roomContext.source || 'room-context').trim() || 'room-context',
                inviteeDisplayName: String(friendRef?.displayName || '').trim() || null,
                roomContext: {
                    ...roomContext,
                    inviteePlayerId
                },
                roomId: roomContext.roomId,
                roomCode: roomContext.roomCode,
                roomMode: roomContext.roomMode,
                targetSlotIndex: roomContext.targetSlotIndex,
                openSeatPickerOnJoin: roomContext.openSeatPickerOnJoin,
                inviterPlayerId: roomContext.inviterPlayerId,
                inviteePlayerId
            }
        };
        this._lastContextualInvitePayloadSafe = this.buildInviteDebugPayloadSafe(payload);
        this._lastContextualInviteFlowType = roomContext?.roomId ? 'room-bound' : 'reservation';
        this._lastContextualInviteRoomIdPersisted = Boolean(roomContext?.roomId);
        this._lastContextualInviteRoomCodePersisted = Boolean(roomContext?.roomCode);
        this._lastContextualInviteSelectedFriendId = inviteePlayerId;
        this._lastContextualInviteSendAt = Date.now();
        this._lastContextualInviteSendResultSafe = null;
        this._lastContextualInviteSendError = '';
        const result = await this.sendPlayInviteWithFallback(payload);
        this._lastContextualInviteSendResultSafe = this.buildInviteDebugPayloadSafe(result?.item || result || {});
        if (String(result?.item?.roomId || '').trim() || String(result?.item?.roomCode || '').trim()) {
            this._lastContextualInviteFlowType = 'room-bound';
        }
        this._lastContextualInviteRoomIdPersisted = this._lastContextualInviteRoomIdPersisted || Boolean(String(result?.item?.roomId || '').trim());
        this._lastContextualInviteRoomCodePersisted = this._lastContextualInviteRoomCodePersisted || Boolean(String(result?.item?.roomCode || '').trim());
        return result;
    }

    renderContextualRoomInvitePicker() {
        const overlay = document.getElementById('contextual-room-invite-overlay');
        const list = document.getElementById('contextual-room-invite-list');
        const status = document.getElementById('contextual-room-invite-status');
        const searchInput = document.getElementById('contextual-room-invite-search');
        if (!overlay || !list || !status) return;
        const state = this.contextualRoomInviteState || this.getCurrentRoomInviteContext() || null;
        const query = String(searchInput?.value || '').trim().toLowerCase();
        const data = this.getContextualRoomInviteCandidates(state || {});
        this.friendPickerOpen = overlay.classList.contains('active');
        this.friendPickerSource = String(state?.source || '').trim() || 'room-context';
        this.friendPickerOnlineCount = data.onlineCount;
        this.friendPickerOfflineCount = data.offlineCount;
        this.friendPickerExcludedAlreadyInRoomCount = data.excludedAlreadyInRoomCount;
        this._lastContextualInviteOpenSource = this.friendPickerSource;
        this._lastContextualInviteRoomId = String(state?.roomId || '').trim();
        this._lastContextualInviteRoomCode = String(state?.roomCode || '').trim();
        this._lastContextualInviteRoomMode = String(state?.roomMode || '').trim();
        this._lastContextualInviteTargetSlotIndex = Number.isInteger(Number(state?.targetSlotIndex)) ? Number(state.targetSlotIndex) : null;
        const friends = data.friends.filter((friend) => {
            if (!query) return true;
            const name = String(friend?.displayName || friend?.name || '').toLowerCase();
            return name.includes(query);
        });
        list.innerHTML = '';
        if (!friends.length) {
            this.setSummaryMessage(list, this.t('search-no-results'));
        } else {
            friends.forEach((friend) => {
                const card = document.createElement('div');
                card.className = 'friend-card contextual-room-invite-card-row';
                const copy = document.createElement('div');
                copy.className = 'friend-card-copy';
                const name = this.createPlayerNameButton(friend.displayName, friend, 'friend-card-name');
                const statusBadge = this.createFriendStatusBadge(this.getFriendPresenceStatus(friend, this.friendPresenceMap));
                const meta = document.createElement('span');
                meta.className = 'friend-card-desc';
                const pendingInvite = this.findOutgoingPlayInviteForRoomContext(friend.id, state || null);
                meta.textContent = pendingInvite
                    ? (this.t('invite-status-invited') || 'Invited')
                    : (state?.roomMode === 'team' ? this.t('seat-selection-title') : this.t('friend-invite'));
                copy.appendChild(name);
                copy.appendChild(statusBadge);
                copy.appendChild(meta);
                const action = document.createElement('div');
                action.className = 'friend-card-actions';
                const inviteBtn = document.createElement('button');
                inviteBtn.className = 'btn btn-action btn-strong invite-action-btn contextual-room-invite-btn';
                inviteBtn.textContent = pendingInvite
                    ? (this.t('invite-status-invited') || 'Invited')
                    : this.t('friend-invite');
                inviteBtn.disabled = Boolean(pendingInvite);
                inviteBtn.addEventListener('click', async () => {
                    inviteBtn.disabled = true;
                    const originalText = inviteBtn.textContent;
                    inviteBtn.textContent = '...';
                    try {
                        await this.sendContextualRoomInvite(friend, state || {});
                        this.renderer.showMessage(this.t('invite-sent'), 1400);
                        this.hideContextualRoomInvitePicker();
                        await this.loadFriendsHub().catch(() => {});
                        this.renderSeatSelectionUi(this.currentRoomState || state || undefined);
                    } catch (error) {
                        this._lastContextualInviteSendError = String(error?.message || error || '').trim();
                        this.renderer.showMessage(error.message || this.t('account-server-unavailable'), 1800);
                        inviteBtn.textContent = originalText;
                        inviteBtn.disabled = false;
                    }
                });
                action.appendChild(inviteBtn);
                card.appendChild(copy);
                card.appendChild(action);
                list.appendChild(card);
            });
        }
        status.textContent = this.format('seat-selection-status', {
            seated: friends.length,
            total: Math.max(friends.length, 0)
        });
    }

    async joinOnlineRoom(codeOrContext) {
        const context = typeof codeOrContext === 'object' && codeOrContext !== null
            ? codeOrContext
            : { roomCode: codeOrContext };
        const nextCode = String(context?.roomCode || context?.roomId || codeOrContext || '').trim().toUpperCase();
        if (!nextCode) return false;
        this.resetOnlineResultFlowState();
        const selectedGameMode = this.getSelectedGameMode();
        const matchingOpenRoom = Array.isArray(this.openRooms)
            ? this.openRooms.find((room) => String(room?.roomCode || '').trim().toUpperCase() === nextCode) || null
            : null;
        let roomMeta = matchingOpenRoom;
        if (!roomMeta) {
            const openRooms = await this.account.getOpenRooms({
                search: nextCode,
                roomVisibility: 'open',
                joinableOnly: true,
                limit: 24,
                gameMode: 'all'
            }).catch(() => []);
            roomMeta = Array.isArray(openRooms)
                ? openRooms.find((room) => String(room?.roomCode || '').trim().toUpperCase() === nextCode) || null
                : null;
        }
        if (roomMeta && String(roomMeta.gameMode || 'telefon').trim().toLowerCase() !== selectedGameMode) {
            this.setJoinStatus(this.t('online-room-game-mode-mismatch'));
            return false;
        }
        if (!this.canJoinRoomWithWalletGate(context, roomMeta, { roomId: String(context?.roomId || '').trim(), inviteId: String(context?.inviteId || '').trim() })) {
            return false;
        }
        this.showStartModal('online');
        this.showOnlineJoinFlow();
        this.prefillOnlineNameIfPossible();
        document.getElementById('join-code-input').value = nextCode;
        const name = this.requirePlayerName('online');
        if (!name) return false;
        const profile = await this.requireRegisteredAccount('account-registration-required-online');
        if (!profile) {
            this.setJoinStatus(this.t('account-registration-required-online'));
            return false;
        }
        this.playerName = name;

        const btn = document.getElementById('connect-btn');
        if (btn) btn.disabled = true;
        this.setJoinStatus(this.t('online-room-status-connecting'));
        try {
            await new Promise((resolve, reject) => {
                this.network.joinGame(nextCode, () => {
                    this.sendSocialPresenceUpdate('in_game', { roomCode: nextCode }).catch(() => {});
                    this.setJoinStatus(this.t('online-room-status-joined'));
                    resolve(true);
                }, (err) => {
                    reject(new Error(err));
                });
            });
            return true;
        } catch (err) {
            this.setJoinStatus(`${this.t('online-room-status-error')}: ${err.message || err}`);
            if (btn) btn.disabled = false;
            return false;
        }
    }

    showStartModal(modalName) {
        this.closeReactionPicker();
        if (modalName) {
            this.closeLeaderboardModal();
            this.closeFriendsModal();
            this.closeSocialCenterModal();
            this.closePlayerProfileModal();
            this.closeAccountModal();
            this.closeCoinShopModal();
            this.closeCosmeticsShopModal();
        }
        const solo = document.getElementById('solo-modal');
        const online = document.getElementById('online-modal');
        if (solo) solo.classList.toggle('active', modalName === 'solo');
        if (online) online.classList.toggle('active', modalName === 'online');
        if (modalName === 'solo') this.syncSoloOptions();
        if (modalName === 'online') this.syncMultiplayerOptions();
        if (!modalName) this.resetMultiplayerPanels(false);
        this.syncGameScreenUiState();
    }

    resetMultiplayerPanels(leaveRoom = false) {
        if (leaveRoom && this.network) {
            this.network.leaveRoom({ explicit: true, reason: 'menu' });
            this.currentRoomState = null;
            this.syncBotTakeoverUiState(null);
            this.sendSocialPresenceUpdate('online', { roomCode: null }).catch(() => {});
        }
        this.showMultiplayerPanel(null);
        document.getElementById('online-entry-ui')?.classList.add('is-hidden');
        document.getElementById('online-flow-ui')?.classList.add('is-hidden');
        document.getElementById('host-game-btn')?.classList.remove('is-hidden', 'online-create-btn');
        document.getElementById('join-game-btn')?.classList.remove('is-hidden');
        document.getElementById('host-cancel-btn')?.classList.remove('is-hidden');
        document.querySelector('#online-flow-ui .multiplayer-actions')?.classList.remove('online-create-actions');
        document.getElementById('connect-btn').disabled = false;
        document.getElementById('join-code-input').value = '';
        document.getElementById('room-code-display').textContent = '....';
        const roomCountEl = document.getElementById('room-player-count-display');
        if (roomCountEl) roomCountEl.textContent = `${this.onlinePlayerCount} / ${this.onlinePlayerCount}`;
        document.getElementById('room-player-list').innerHTML = '';
        this.hideSeatSelectionUi();
        this.setHostStatus(this.t('online-room-create-hint'));
        this.setJoinStatus(this.t('online-room-join-hint'));

        document.getElementById('online-invite-status-banner')?.classList.add('is-hidden');
        if (this.gameInviteState) {
            this.stopGameInviteRefresh();
            this.gameInviteState = null;
        }
    }

    setHostStatus(text) {
        document.getElementById('host-status').textContent = text;
    }

    setJoinStatus(text) {
        document.getElementById('join-status').textContent = text;
    }

    getCurrentRoomCode() {
        const code = String(this.currentRoomState?.roomCode || document.getElementById('room-code-display')?.textContent || '').trim().toUpperCase();
        return code && code !== '....' ? code : '';
    }

    getRoomShareUrl(roomCode) {
        const code = String(roomCode || '').trim().toUpperCase();
        if (!code) return window.location.href;
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('room', code);
            url.hash = '';
            return url.toString();
        } catch {
            return window.location.href;
        }
    }

    buildRoomShareMessage(roomCode) {
        const code = String(roomCode || '').trim().toUpperCase();
        const roomUrl = this.getRoomShareUrl(code);
        return this.format('online-room-share-message', {
            code,
            url: roomUrl
        });
    }

    async shareCurrentRoomCode() {
        const code = this.getCurrentRoomCode();
        if (!code) return;
        const roomUrl = this.getRoomShareUrl(code);
        const message = this.buildRoomShareMessage(code);
        try {
            if (navigator.share) {
                await navigator.share({
                    title: this.t('online-room-share-title'),
                    text: message,
                    url: roomUrl
                });
                this.setHostStatus(this.t('online-room-share-opened'));
                return;
            }
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(`${message}\n${roomUrl}`);
                this.setHostStatus(this.t('online-room-share-copied'));
                return;
            }
        } catch (error) {
            debugLog('Room share failed:', error);
        }
        this.setHostStatus(this.t('online-room-share-fail'));
    }

    applySharedRoomCodeFromUrl() {
        if (typeof window === 'undefined') return;
        try {
            const params = new URLSearchParams(window.location.search);
            const roomCode = String(params.get('room') || params.get('code') || '').trim().toUpperCase();
            if (roomCode) {
                this.pendingSharedRoomCode = roomCode;
                const input = document.getElementById('join-code-input');
                if (input && !String(input.value || '').trim()) {
                    input.value = roomCode;
                }
            }
        } catch {}
    }

    onRoomStateUpdate(roomState) {
        if (!roomState) return;
        const previousRoomState = this.currentRoomState || {};
        const incomingActive = Boolean(roomState?.gameActive);
        const localActive = Boolean(this.gameActive);
        const staleInactiveRoomState = localActive && !incomingActive && String(roomState?.roomId || '') === String(previousRoomState?.roomId || '');
        if (staleInactiveRoomState) {
            debugLog("[CLIENT_DEBUG] ignoring stale inactive room_state", {
                roomId: roomState?.roomId,
                roomCode: roomState?.roomCode,
                localGameActive: this.gameActive,
                incomingGameActive: incomingActive
            });
            return;
        }
        this.currentRoomState = roomState;
        const resolvedRoomMode = this.resolveRoomModeState(roomState, null);
        this.isTeamMode = resolvedRoomMode.isTeamMode;
        this._resolvedRoomModeFromState = resolvedRoomMode.roomModeFromState || '';
        this._resolvedScoreMode = resolvedRoomMode.scoreMode || '';
        this._resolvedTopHudMode = resolvedRoomMode.topHudMode || '';
        this._lastRoomStateGameMode = String(roomState?.gameMode || roomState?.mode || this._lastRoomStateGameMode || '').trim();
        this._lastRoomStateAt = Date.now();
        this._lastRoomStateIsTeamMode = resolvedRoomMode.isTeamMode;
        this._lastRoomStateRoomMode = resolvedRoomMode.roomMode;
        this._lastRoomStateRoomStart = roomState?.roomStart || null;
        this._lastRoomStatePlayersSafe = this.buildRoomStatePlayersSafe(roomState);
        this._lastRoomStateTeamAssignmentsSafe = this.buildTeamAssignmentsSafe(roomState);
        this._lastRoomStateSeatAssignmentsSafe = this.buildSeatAssignmentsSafe(roomState);
        this.turnVersion = Number(roomState?.turnVersion || this.turnVersion || 1);
        this.turnTimeoutMs = Number(roomState?.turnDurationMs || this.turnTimeoutMs || TURN_TIMEOUT_MS);
        this.syncServerClock(roomState?.serverNow || roomState?.serverTime || 0);
        this.syncBotTakeoverUiState(roomState);
        const topRightHud = this.getTopRightHudState();
        debugLog("[CLIENT_DEBUG] onRoomStateUpdate", {
            roomId: roomState?.roomId,
            roomCode: roomState?.roomCode,
            roomVisibility: roomState?.roomVisibility,
            gameActive: roomState?.gameActive,
            seatSelectionRequired: roomState?.seatSelectionRequired,
            currentPlayers: roomState?.currentPlayers,
            humanPlayers: roomState?.humanPlayers,
            humanSeats: roomState?.humanSeats,
            aiCount: roomState?.aiCount,
            totalPlayers: roomState?.totalPlayers,
            bankAmount: Number(roomState?.bankAmount || 0),
            serverNow: Number(roomState?.serverNow || 0),
            turnDurationMs: Number(roomState?.turnDurationMs || 0),
            stakeAmount: Number(roomState?.stakeAmount || 0),
            currentDealBankAmount: Number(roomState?.bankAmount || 0),
            playerScores: Array.isArray(this.scores) ? this.scores.slice() : [],
            rating: Number(this.accountProfile?.rating ?? this.accountDetails?.rating ?? 0),
            topRightHudValue: topRightHud.value,
            topRightHudSource: topRightHud.sourceField
        });
        if (incomingActive) {
            this.resetOnlineResultFlowState();
        }

        document.getElementById('room-code-display').textContent = roomState.roomCode || roomState.roomId || '....';
        const roomCountEl = document.getElementById('room-player-count-display');
        const humanJoined = roomState.humanPlayers ?? roomState.currentPlayers ?? 0;
        const humanSeats = roomState.humanSeats ?? roomState.maxPlayers ?? roomState.totalPlayers ?? 0;
        const aiCount = roomState.aiCount ?? 0;
        if (roomCountEl) {
            roomCountEl.textContent = aiCount > 0
                ? `${humanJoined} / ${humanSeats} + ${aiCount} AI`
                : `${humanJoined} / ${humanSeats}`;
        }

        const mySessionId = this.network?.room?.sessionId;
        const list = document.getElementById('room-player-list');
        list.innerHTML = '';
        const roomMode = String(roomState?.roomMode || (roomState?.isTeamMode ? 'team' : 'ffa')).trim().toLowerCase();
        const roomInviteContext = this.getCurrentRoomInviteContext({
            source: 'room-player-slot',
            openSeatPickerOnJoin: roomMode === 'team'
        });
        const createChip = ({ kind = 'human', displayName = '', subtitle = '', avatarUrl = '', seatNumber = 0, sessionId = '', isSelf = false, actionNode = null, iconText = '' }) => {
            const chip = document.createElement('div');
            chip.className = 'room-player-chip';
            chip.classList.add(kind);
            chip.classList.add(`is-${kind}`);
            if (isSelf) chip.classList.add('you');
            if (sessionId) chip.dataset.sessionId = sessionId;

            const seat = document.createElement('span');
            seat.className = 'room-player-seat';
            seat.textContent = seatNumber ? `${this.t('seat-prefix')} ${seatNumber}` : '';

            const avatar = document.createElement('span');
            avatar.className = 'room-player-avatar';
            if (avatarUrl) {
                avatar.classList.add('has-image');
                const img = document.createElement('img');
                img.alt = displayName || 'Player avatar';
                img.src = avatarUrl;
                img.referrerPolicy = 'no-referrer';
                img.onerror = () => {
                    img.onerror = null;
                    avatar.classList.remove('has-image');
                    avatar.textContent = iconText || this.getTurnAvatarText(displayName || '');
                };
                avatar.appendChild(img);
            } else {
                avatar.textContent = iconText || this.getTurnAvatarText(displayName || '');
            }

            const body = document.createElement('div');
            body.className = 'room-player-chip-body';
            const titleRow = document.createElement('div');
            titleRow.className = 'room-player-chip-title-row';
            const name = document.createElement('span');
            name.className = 'room-player-chip-title';
            name.textContent = displayName;
            titleRow.appendChild(name);
            const state = document.createElement('span');
            state.className = 'room-player-state';
            state.textContent = subtitle;
            body.appendChild(titleRow);
            body.appendChild(state);

            const actions = document.createElement('div');
            actions.className = 'room-player-chip-actions';
            if (actionNode) {
                actions.appendChild(actionNode);
            }

            chip.appendChild(seat);
            chip.appendChild(avatar);
            chip.appendChild(body);
            chip.appendChild(actions);
            return chip;
        };

        for (const [index, player] of (roomState.players || []).entries()) {
            const displayName = getFirstNameDisplayName(player.name || '', `Player ${index + 1}`);
            const avatarUrl = player.avatarUrl || this.roomAvatarBySessionId.get(player.sessionId) || '';
            if (player.sessionId) {
                this.roomAvatarBySessionId.set(player.sessionId, avatarUrl || this.roomAvatarBySessionId.get(player.sessionId) || '');
            }
            const row = createChip({
                kind: player.isBot ? 'bot' : 'human',
                displayName: player.sessionId === mySessionId ? `${displayName} (${this.t('online-you')})` : displayName,
                subtitle: this.getRoomStatePlayerSubtitle(player),
                avatarUrl,
                seatNumber: player.seatNumber,
                sessionId: player.sessionId || '',
                isSelf: player.sessionId === mySessionId,
                iconText: player.isBot ? '🤖' : ''
            });
            const stateEl = row.querySelector('.room-player-state');
            if (stateEl && this.isBotTakeoverSeat(player)) {
                stateEl.classList.add('is-bot-takeover');
            }
            if (player.sessionId && !player.isBot) {
                row.style.cursor = 'pointer';
                row.title = this.t('player-profile-open');
                row.addEventListener('click', (event) => {
                    if (event.target?.closest?.('button')) return;
                    void this.openPlayerProfileModal({
                        id: player.playerId || player.userId || player.sessionId,
                        playerId: player.playerId || player.userId || player.sessionId,
                        displayName: player.name || displayName,
                        avatarUrl: player.avatarUrl || ''
                    });
                });
            }
            list.appendChild(row);
        }

        const humanPlayerCount = (roomState.players || []).filter(player => !player.isBot).length;
        for (let i = humanPlayerCount; i < humanSeats; i++) {
            const inviteBtn = document.createElement('button');
            inviteBtn.type = 'button';
            inviteBtn.className = 'btn btn-menu room-slot-invite-btn';
            inviteBtn.textContent = 'Dəvət et';
            inviteBtn.addEventListener('click', async () => {
                await this.openContextualRoomInvitePicker({
                    source: 'ffa-slot',
                    targetSlotIndex: i,
                    openSeatPickerOnJoin: false,
                    roomInviteContext
                });
            });
            const row = createChip({
                kind: 'empty',
                displayName: 'Boş',
                subtitle: 'Dəvət et',
                seatNumber: i + 1,
                actionNode: inviteBtn,
                iconText: '○'
            });
            list.appendChild(row);
        }

        if (!roomState.gameActive && aiCount > 0) {
            for (let i = 0; i < aiCount; i++) {
                const row = createChip({
                    kind: 'bot',
                    displayName: 'AI Bot',
                    subtitle: 'Hazır',
                    seatNumber: humanSeats + i + 1,
                    iconText: '🤖'
                });
                list.appendChild(row);
            }
        }

        const preGameLobby = !roomState.gameActive
            && !this.isResultFlowActive(roomState)
            && (() => {
                const roomPhase = String(roomState?.roomPhase || '').trim().toLowerCase();
                return !roomPhase || roomPhase === 'lobby' || roomPhase === 'waiting';
            })();
        if (preGameLobby) {
            const statusText = humanJoined < humanSeats
                ? `${this.t('online-room-status-waiting')} (${humanJoined}/${humanSeats})`
                : this.t('online-room-status-ready');
            this.setHostStatus(statusText);
            this.setJoinStatus(statusText);
        }

        if (preGameLobby && this.isWaitingInOpenRoom(roomState)) {
            this.enterOpenRoomWaitingScreen(roomState);
        }

        if (this.shouldOpenSeatPickerAfterRoomCreate({
            roomVisibility: roomState?.roomVisibility || this.onlineRoomVisibility,
            roomMode: roomState?.roomMode || (roomState?.isTeamMode ? 'team' : 'ffa'),
            totalPlayers: roomState?.totalPlayers || roomState?.humanSeats || this.onlinePlayerCount,
            humanSeats: roomState?.humanSeats || this.onlinePlayerCount,
            isTeamMode: Boolean(roomState?.isTeamMode ?? this.isTeamMode),
            roomId: roomState?.roomId,
            roomCode: roomState?.roomCode
        }, roomState)) {
            this.enterOpenRoomWaitingScreen(roomState);
        }

        this.renderGiftPicker();

        if (this.network?.isMultiplayer) {
            this.persistGameResumeSnapshot();
        }

        this.renderSeatSelectionUi(roomState);

        try {
            this.voice?.syncRoomState?.(roomState);
        } catch (error) {
            console.warn("[VOICE] Failed to sync voice state", error);
        }

        if (roomState?.gameActive) {
            this.showStartModal(null);
            this.hideOpenRoomsModal();
            document.getElementById('start-screen')?.classList.remove('active');
            document.getElementById('game-screen')?.classList.add('active');
            this.syncGameScreenUiState();
        }
    }

    enterOpenRoomWaitingScreen(roomState) {
        debugLog("[CLIENT_DEBUG] enterOpenRoomWaitingScreen", {
            roomId: roomState?.roomId,
            roomCode: roomState?.roomCode,
            roomVisibility: roomState?.roomVisibility,
            gameActive: roomState?.gameActive,
            seatSelectionRequired: roomState?.seatSelectionRequired,
            currentPlayers: roomState?.currentPlayers,
            humanPlayers: roomState?.humanPlayers,
            humanSeats: roomState?.humanSeats,
            aiCount: roomState?.aiCount,
            totalPlayers: roomState?.totalPlayers
        });
        const startScreen = document.getElementById('start-screen');
        const gameScreen = document.getElementById('game-screen');
        startScreen?.classList.remove('active');
        gameScreen?.classList.add('active');
        this.syncGameScreenUiState();
        this.showStartModal(null);
        this.hideOpenRoomsModal();

        const roomPlayers = Array.isArray(roomState.players) ? roomState.players : [];
        const totalPlayers = Math.max(2, Number(roomState.totalPlayers || roomState.humanSeats || roomPlayers.length || 2));
        const resolvedRoomMode = this.resolveRoomModeState(roomState, null);
        this.isTeamMode = resolvedRoomMode.isTeamMode;
        this._resolvedRoomModeFromState = resolvedRoomMode.roomModeFromState || '';
        this._resolvedScoreMode = resolvedRoomMode.scoreMode || '';
        this._resolvedTopHudMode = resolvedRoomMode.topHudMode || '';
        const mySessionId = this.network?.room?.sessionId || '';
        const myIndex = roomPlayers.findIndex((player) => player.sessionId === mySessionId);

        this.playerCount = totalPlayers;
        this.playerNames = Array.from({ length: totalPlayers }, (_, index) => {
            const player = roomPlayers[index];
            if (player?.name) return player.name;
            if (player?.isBot) return `AI ${index + 1}`;
            return this.format('room-waiting-player', { index: index + 1 });
        });
        this.scores = Array.from({ length: totalPlayers }, (_, index) => this.scores[index] || 0);
        this.roundWins = Array.from({ length: totalPlayers }, (_, index) => this.roundWins[index] || 0);
        this.hands = Array.from({ length: totalPlayers }, () => []);
        this.myHand = [];
        this.humanPlayerIndex = myIndex >= 0 ? myIndex : 0;
        this.currentPlayer = this.humanPlayerIndex;
        this.board = new Board();
        this.board.startAxis = getBoardStartAxis();
        this.configureBoardForCurrentMode(this.board);
        this.boneyard = [];
        this.validMoves = [];
        this.selectedTileIndex = -1;
        this.roundOver = false;
        this.matchOver = false;
        this.gameActive = false;
        this.renderSeatSelectionUi(roomState);
        if (this.network.isMultiplayer) {
            this.scheduleRealtimeRender({
                boardChanged: false,
                handChanged: true,
                opponentHandsChanged: true,
                scoresChanged: true,
                infoChanged: true
            });
            return;
        }

        this.renderState();
    }

    onRoomClosed(payload) {
        if (isDebugLoggingEnabled()) {
            console.trace("[CLIENT_DEBUG] onRoomClosed", payload || {});
        }
        const reason = this.resolveUiReason(payload) || this.t('online-room-closed');
        const shouldReturnToOpenRooms = String(payload?.returnTo || '').trim() === 'open_rooms'
            || String(payload?.roomVisibility || '').trim().toLowerCase() === 'open';
        this.clearPendingOnlineAction({ rollback: false });
        this.clearNextDealAdvanceTimeout();
        this.clearTurnTimers();
        this.network.leaveRoom({ explicit: false, reason: 'room_closed' });
        this.voice?.destroy?.();
        this.currentRoomState = null;
        this.resetOnlineResultFlowState();
        this.roomAvatarBySessionId.clear();
        this.myHand = null;
        this.gameActive = false;
        this.onlineRoundBankAmount = 0;
        this.resetOnlineCoinSummary();
        this.resetMultiplayerPanels(false);
        document.getElementById('menu-screen').classList.remove('active');
        document.getElementById('round-end-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.remove('active');
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('start-screen').classList.toggle('active', !shouldReturnToOpenRooms);
        this.hideSeatSelectionUi();
        this.syncOpenRoomWaitingBanner(null);
        this.setJoinStatus(reason);
        this.setHostStatus(reason);
        this.clearGameResumeSnapshot();
        this.showStartModal(null);
        if (shouldReturnToOpenRooms) {
            this.showOpenRoomsModal();
            this.renderer.showMessage(this.t('open-room-closed-return'), 2200);
            return;
        }
        this.renderer.showMessage(reason, 2200);
    }

    cloneTilesForSnapshot(tiles = []) {
        return (Array.isArray(tiles) ? tiles : [])
            .map((tile) => (tile ? new Tile(tile.a, tile.b) : null))
            .filter(Boolean);
    }

    cloneBoardForSnapshot(board = this.board) {
        if (!board) { const b = new Board(); b.startAxis = getBoardStartAxis(); this.configureBoardForCurrentMode(b); return b; }
        return cloneBoard(board);
    }

    configureBoardForCurrentMode(board = this.board) {
        if (!board) return board;
        const classic101 = this.mode === 'classic101';
        board.telephoneEnabled = !classic101;
        board.scoringEnabled = !classic101;
        return board;
    }

    clearPendingOnlineAction({ rollback = false } = {}) {
        if (this.pendingOnlineActionTimer) {
            clearTimeout(this.pendingOnlineActionTimer);
            this.pendingOnlineActionTimer = null;
        }
        const pending = this.pendingOnlineAction;
        this.pendingOnlineAction = null;
        if (!rollback || !pending?.snapshot) return;

        this.board = pending.snapshot.board;
        this.myHand = pending.snapshot.myHand;
        if (pending.snapshot.humanPlayerIndex >= 0) {
            this.hands[pending.snapshot.humanPlayerIndex] = pending.snapshot.myHand;
        }
        this._pendingOptimisticPlayTileId = '';
        this._pendingOptimisticPlayActionId = '';
        this._boardAnimationActive = null;
        this._boardAnimationPromise = Promise.resolve();
        this.selectedTileIndex = pending.snapshot.selectedTileIndex;
        this.validMoves = pending.snapshot.validMoves;
        this.goshaCombo = pending.snapshot.goshaCombo;
        this.turnInProgress = false;
        this.renderState();
    }

    canSendMultiplayerAction() {
        if (!this.network?.isMultiplayer) {
            this.lastBlockedOnlineActionReason = "not_multiplayer";
            return false;
        }
        if (this.network?.reconnectInProgress) {
            this.lastBlockedOnlineActionReason = "reconnect_in_progress";
            this.lastOfflineActionBlockedAt = Date.now();
            return false;
        }
        if (!this.network?.room) {
            this.lastBlockedOnlineActionReason = "no_room";
            this.lastOfflineActionBlockedAt = Date.now();
            return false;
        }
        if (this.network?.isRoomConnectionOpen?.() !== true) {
            this.lastBlockedOnlineActionReason = "connection_closed";
            this.lastOfflineActionBlockedAt = Date.now();
            return false;
        }
        if (this.pendingOnlineAction) {
            this.lastBlockedOnlineActionReason = "pending_action";
            return false;
        }
        if (this.matchOver) {
            this.lastBlockedOnlineActionReason = "match_over";
            return false;
        }
        if (this.roundOver) {
            this.lastBlockedOnlineActionReason = "round_over";
            return false;
        }
        if (!this.gameActive) {
            this.lastBlockedOnlineActionReason = "game_inactive";
            return false;
        }
        if (this.isLocalSeatBotControlled()) {
            this.lastBlockedOnlineActionReason = "bot_takeover_active";
            return false;
        }
        if (this.currentPlayer !== this.humanPlayerIndex) {
            this.lastBlockedOnlineActionReason = "not_human_turn";
            return false;
        }
        return true;
    }

    notifyMultiplayerActionBlocked(reason = 'connection') {
        if (reason === 'connection') {
            const lang = this.currentLang || 'az';
            let msg = "Connection lost, reconnecting...";
            if (lang === 'az') {
                msg = "Bağlantı gözlənilir...";
            } else if (lang === 'ru') {
                msg = "Ожидание соединения...";
            }
            this.renderer?.showMessage?.(msg, 1800);
        } else {
            const message = reason === 'bot_takeover_active'
                ? (this.t('bot-takeover-active') || 'Bot is playing for you right now.')
                : (this.t('connection-lost') || 'Connection lost');
            this.renderer?.showMessage?.(message, 1800);
        }
    }

    resetReconnectRestoreUiState() {
        this.clearPendingOnlineAction({ rollback: false });
        this.turnInProgress = false;
        this.postMoveWindowActive = false;
        this.postMoveWindowEndsAt = 0;
        this.selectedTileIndex = -1;
        this._pendingOptimisticPlayTileId = '';
        this._pendingOptimisticPlayActionId = '';
        this._boardAnimationActive = null;
        this._boardAnimationPromise = Promise.resolve();
        this.renderer?.removeArrows?.();
        this.syncMoveHintSelectionUiState();
    }

    queuePendingOnlineAction(action) {
        this.clearPendingOnlineAction({ rollback: false });
        this.pendingOnlineAction = action;
        this.pendingOnlineActionTimer = setTimeout(() => {
            this.clearPendingOnlineAction({ rollback: true });
        }, 4000);
    }

    hasPendingOnlinePlayAck(state, playerOrder, getPlayer) {
        void playerOrder;
        void getPlayer;
        const pending = this.pendingOnlineAction;
        if (!pending || pending.type !== 'play') return false;

        const turnVersion = Number(state?.turnVersion || 0);
        return turnVersion > Number(pending.turnVersion || 0);
    }

    applyOptimisticOnlinePlay(tileIndex, openEndIndex, actionId = '') {
        if (!this.canSendMultiplayerAction() || this.currentPlayer !== this.humanPlayerIndex || !this.myHand) {
            return false;
        }

        const validMove = this.validMoves.find((move) => move.tileIndex === tileIndex && move.openEndIndex === openEndIndex);
        if (!validMove) return false;

        const tile = this.myHand[tileIndex];
        if (!tile) return false;

        const source = this.getBoardAnimationSource(this.humanPlayerIndex, tile.id);
        this.renderer._pendingBoardTileTravel = source?.sourceRect ? { tileId: tile.id, sourceRect: source.sourceRect, sourceNode: source.sourceNode } : null;

        const snapshot = {
            board: this.cloneBoardForSnapshot(),
            myHand: this.cloneTilesForSnapshot(this.myHand),
            humanPlayerIndex: this.humanPlayerIndex,
            selectedTileIndex: this.selectedTileIndex,
            validMoves: Array.isArray(this.validMoves) ? this.validMoves.map((move) => ({ ...move })) : [],
            goshaCombo: this.goshaCombo ? JSON.parse(JSON.stringify(this.goshaCombo)) : null
        };

        const nextBoard = this.cloneBoardForSnapshot();
        const nextHand = this.cloneTilesForSnapshot(this.myHand);
        nextHand.splice(tileIndex, 1);

        if (nextBoard.isEmpty) {
            nextBoard.placeFirst(tile);
        } else {
            nextBoard.placeTile(tile, openEndIndex);
        }

        this.board = nextBoard;
        this.myHand = nextHand;
        if (this.humanPlayerIndex >= 0) {
            this.hands[this.humanPlayerIndex] = nextHand;
        }
        this.selectedTileIndex = -1;
        this.validMoves = [];
        this.goshaCombo = null;
        this.turnInProgress = true;
        this.renderState();
        if (this.renderer._pendingBoardTileTravel) {
            this._pendingOptimisticPlayTileId = String(tile.id || '');
            this._pendingOptimisticPlayActionId = String(actionId || '').trim();
            const raf = typeof requestAnimationFrame === 'function'
                ? requestAnimationFrame.bind(window)
                : (callback) => setTimeout(callback, 0);
            const animationPromise = new Promise((resolve) => {
                raf(() => {
                    raf(() => {
                        this.renderer.animateTileTravel(tile.id)
                            .catch(() => {})
                            .finally(resolve);
                    });
                });
            });
            this.trackBoardAnimationPromise(animationPromise, {
                tileId: tile.id,
                action: 'play',
                source: 'optimistic'
            });
        }

        this.queuePendingOnlineAction({
            type: 'play',
            actionId: String(actionId || '').trim(),
            turnVersion: Number(this.turnVersion || this.network?.room?.state?.turnVersion || 0),
            expectedHandCount: nextHand.length,
            snapshot
        });
        return true;
    }

    onNetworkDisconnected(payload = {}) {
        this.networkActionBlockedForReconnect = true;
        this.lastOptimisticRollbackOnDisconnectAt = Date.now();
        this.lastOptimisticRollbackReason = payload.reconnecting ? 'reconnecting' : 'disconnect';

        this.clearPendingOnlineAction({ rollback: true });
        this.turnInProgress = false;
        this.postMoveWindowActive = false;
        this.selectedTileIndex = -1;
        this.renderer?.removeArrows?.();

        const snapshot = this.persistGameResumeSnapshot();
        this.refreshResumeBanner(snapshot);

        // Force render from current local/server state on disconnect
        this._realtimeRenderSignatures = {};
        this.syncOpenRoomWaitingBanner(this.currentRoomState);
        this.renderState();

        if (payload.reconnecting) {
            this.lastAccidentalDisconnectAt = Date.now();
            this.voice?.stopSpeaking?.();
            this.renderer.showMessage(this.t('connection-lost'), 2200);
        }
    }

    onNetworkReconnected() {
        this.networkActionBlockedForReconnect = false;
        document.getElementById('start-screen')?.classList.remove('active');
        document.getElementById('menu-screen')?.classList.remove('active');
        document.getElementById('round-end-screen')?.classList.remove('active');
        document.getElementById('game-over-screen')?.classList.remove('active');
        this.showStartModal(null);
        this.clearNextDealAdvanceTimeout();
        this.clearTurnTimers();
        this.resetReconnectRestoreUiState();
        this.pendingReconnectResolution = true;
        this.network?.sendSyncRequest?.();
        
        // Force full clean redraw ("Чистый лист")
        this._realtimeRenderSignatures = {};
        this.syncOpenRoomWaitingBanner(this.currentRoomState);
        this.renderState();

        // Safety net: if state wasn't restored fully, re-sync after a short delay
        clearTimeout(this._reconnectResyncTimer);
        this._reconnectResyncTimer = setTimeout(() => {
            if (!this.network?.isMultiplayer || !this.network?.room) return;
            // If gameActive but humanPlayerIndex is -1, or if it's our turn but validMoves is empty
            const needsResync =
                (this.gameActive && this.humanPlayerIndex < 0) ||
                (this.gameActive && this.currentPlayer === this.humanPlayerIndex && (!Array.isArray(this.validMoves) || this.validMoves.length === 0) && this.myHand?.length > 0);
            if (needsResync) {
                console.warn('[RECONNECT_DEBUG] Safety re-sync: state not fully restored, requesting sync again', {
                    gameActive: this.gameActive,
                    humanPlayerIndex: this.humanPlayerIndex,
                    currentPlayer: this.currentPlayer,
                    validMovesCount: this.validMoves?.length || 0,
                    myHandCount: this.myHand?.length || 0,
                    sessionId: this.network?.room?.sessionId || ''
                });
                this.network?.sendSyncRequest?.();
            }
        }, 1500);
    }

    onNetworkReconnectFailed(error) {
        console.warn('[Network] Reconnect failed permanently', error);
        this.resumeLastError = String(error?.message || error || 'reconnect-failed');
        void this.validateStoredResumeSnapshot();
        this.renderer.showMessage(this.t('session-restore-failed'), 2200);
    }

    setupGameControls() {
        this.bindTap(this.renderer.drawBtn, () => this.drawFromBoneyard());
        this.bindTap(this.renderer.passBtn, () => this.passTurn());
        document.getElementById('next-round-btn')?.addEventListener('click', () => {
            const screen = document.getElementById('round-end-screen');
            if (screen) {
                screen.classList.remove('active');
                screen.classList.remove('review-mode');
            }
            this.resetOnlineResultFlowState();
            if (this.matchOver) { this.showMatchResult(); return; }
            if (this.network.isMultiplayer) {
                this.network.sendNextDeal();
            } else {
                if (this.roundOver) void this.startRound();
                else this.startDeal();
            }
        });
        document.getElementById('new-game-btn')?.addEventListener('click', () => {
            const screen = document.getElementById('game-over-screen');
            if (screen) {
                screen.classList.remove('active');
                screen.classList.remove('review-mode');
            }
            if (this.network.isMultiplayer) {
                void this.returnToMainMenu({ settleForfeit: false });
                return;
            }
            void this.startNewGame();
        });
        document.getElementById('game-over-quit-btn')?.addEventListener('click', async () => {
            const screen = document.getElementById('game-over-screen');
            if (screen) {
                screen.classList.remove('active');
                screen.classList.remove('review-mode');
            }
            await this.returnToMainMenu({ settleForfeit: false });
        });

        const setupReviewMode = (screenId) => {
            const screen = document.getElementById(screenId);
            if (!screen) return;
            screen.querySelector('.btn-review-toggle')?.addEventListener('click', (e) => {
                e.stopPropagation();
                screen.classList.toggle('review-mode');
                e.currentTarget.blur();
            });
            screen.addEventListener('click', (e) => {
                if (screen.classList.contains('review-mode')) {
                    screen.classList.remove('review-mode');
                    return;
                }
                if (e.target === screen) {
                    screen.classList.add('review-mode');
                }
            });
        };
        setupReviewMode('round-end-screen');
        setupReviewMode('game-over-screen');

        this.bindTap(this.renderer.handEl, e => {
            const el = e.target.closest('.tile.playable');
            if (el) this.onHandTileClick(parseInt(el.dataset.handIndex));
        });
        this.setupReactionUI();
        this.setupGiftUI();
        this.setupVoiceUI();
    }
    bindTap(el, handler) {
        if (!window.PointerEvent) {
            el.addEventListener('click', handler);
            return;
        }
        let startX=0, startY=0, moved=false;
        el.addEventListener('pointerdown', e => {
            startX=e.clientX; startY=e.clientY; moved=false;
        }, { passive: true });
        el.addEventListener('pointermove', e => {
            if (Math.abs(e.clientX-startX) > 10 || Math.abs(e.clientY-startY) > 10) moved=true;
        }, { passive: true });
        el.addEventListener('pointerup', e => {
            if (!moved) handler(e);
        });
    }
    sanitizeName(name, fallback = 'Player') {
        return String(name || '').replace(/[<>&"']/g, '').trim().slice(0, 12) || fallback;
    }
    getFirstNameDisplayName(value, fallback = 'Player') {
        return getFirstNameDisplayName(value, fallback);
    }
    getOnlineDisplayName(fallback = '') {
        const current = getFirstNameDisplayName(fallback || this.playerName || this.accountProfile?.name || 'Player', 'Player');
        const accountName = getFirstNameDisplayName(this.accountProfile?.name || '', '');
        if (accountName && current === accountName) {
            const gameDisplayName = getFirstNameDisplayName(this.accountProfile?.gameDisplayName || '', current);
            return gameDisplayName || current.split(/\s+/).find(Boolean) || current;
        }
        return current;
    }
    setupReactionUI() {
        this.reactionBtn = document.getElementById('reaction-btn');
        this.reactionPicker = document.getElementById('reaction-picker');
        this.reactionStage = document.getElementById('reaction-stage');
        if (!this.reactionBtn || !this.reactionPicker || !this.reactionStage) return;

        this.reactionBtn.innerHTML = this.buildReactionMarkup(this.reactionPalette[0], 48);
        this.renderReactionPicker();
        this.bindReactionPickerDrag();

        this.reactionBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.toggleReactionPicker();
        });

        this._reactionOutsideHandler = (event) => {
            if (!this.reactionPicker.classList.contains('open')) return;
            const target = event.target;
            if (this.reactionPicker.contains(target) || this.reactionBtn.contains(target)) return;
            this.closeReactionPicker();
        };
        document.addEventListener('pointerdown', this._reactionOutsideHandler, true);
    }
    bindReactionPickerDrag() {
        if (!this.reactionPicker || this._reactionPickerDragBound) return;
        this._reactionPickerDragBound = true;
        const picker = this.reactionPicker;
        const scrollRoot = () => picker.querySelector('.reaction-picker-scroll') || picker;
        let startY = 0;
        let startScrollTop = 0;
        let dragging = false;
        let pointerId = null;

        const endDrag = () => {
            if (pointerId !== null) {
                picker.releasePointerCapture?.(pointerId);
            }
            pointerId = null;
            dragging = false;
            this._reactionDragState = null;
        };

        picker.addEventListener('pointerdown', (event) => {
            if (!this.reactionPicker?.classList.contains('open')) return;
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (!target.closest('.reaction-choice')) return;
            if (event.pointerType === 'touch') return;
            if (event.button !== 0) return;
            startY = event.clientY;
            startScrollTop = scrollRoot().scrollTop;
            dragging = false;
            pointerId = event.pointerId;
            this._reactionDragState = { startY, startScrollTop };
        });

        picker.addEventListener('pointermove', (event) => {
            if (pointerId === null || event.pointerId !== pointerId) return;
            const state = this._reactionDragState;
            if (!state) return;
            const deltaY = event.clientY - state.startY;
            if (!dragging && Math.abs(deltaY) < 6) return;
            dragging = true;
            event.preventDefault();
            const root = scrollRoot();
            const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
            root.scrollTop = Math.min(maxScroll, Math.max(0, state.startScrollTop - deltaY));
        }, { passive: false });

        picker.addEventListener('pointerup', () => {
            endDrag();
        });
        picker.addEventListener('pointercancel', () => {
            endDrag();
        });
        picker.addEventListener('lostpointercapture', () => {
            endDrag();
        });
        picker.addEventListener('click', (event) => {
            if (dragging) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);
    }
    renderReactionPicker() {
        if (!this.reactionPicker) return;
        this.reactionPicker.innerHTML = '';
        const scrollRoot = document.createElement('div');
        scrollRoot.className = 'reaction-picker-scroll';
        for (const reaction of this.reactionPalette) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'reaction-choice';
            btn.title = reaction.label;
            btn.setAttribute('aria-label', reaction.label);
            btn.dataset.reaction = reaction.code;
            btn.innerHTML = this.buildReactionMarkup(reaction, 48);
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                this.sendReaction(reaction.code);
            });
            scrollRoot.appendChild(btn);
        }
        this.reactionPicker.appendChild(scrollRoot);
    }
    toggleReactionPicker(force = null) {
        if (!this.reactionPicker || !this.reactionBtn) return;
        const open = force === null ? !this.reactionPicker.classList.contains('open') : !!force;
        this.reactionPicker.classList.toggle('open', open);
        this.reactionPicker.setAttribute('aria-hidden', String(!open));
        this.reactionBtn.setAttribute('aria-expanded', String(open));
    }
    closeReactionPicker() {
        this.toggleReactionPicker(false);
    }
    sendReaction(reactionId) {
        const reaction = this.reactionPalette.find((item) => item.code === reactionId) || this.reactionPalette[0];
        this.closeReactionPicker();
        if (this.network.isMultiplayer) {
            this.lastReactionSentAt = Date.now();
            this.lastReactionSentType = reaction.code;
            if (this.playerName) this.showReactionBurst(reaction.code, this.playerName);
            this.network.sendReaction(reaction.code);
            return;
        }
        this.showReactionBurst(reaction.code, this.playerName || '');
    }
    onNetworkReaction(payload) {
        if (!payload) return;
        const reactionId = payload.type || payload.reaction || 'spark';
        const senderSession = payload.sessionId || '';
        if (this.network?.room?.sessionId && senderSession === this.network.room.sessionId) {
            if (reactionId === this.lastReactionSentType && Date.now() - this.lastReactionSentAt < 1800) {
                return;
            }
        }
        this.showReactionBurst(reactionId, payload.name || '');
    }
    onNetworkGift(payload) {
        if (!payload) return;
        const gift = this.giftCatalog.find((item) => item.key === payload.giftKey || item.assetKey === payload.assetKey) || {
            key: payload.giftKey || payload.assetKey || 'gift_001',
            name: payload.giftName || 'Gift',
            assetKey: payload.assetKey || payload.giftKey || 'gift_001'
        };
        const senderSession = payload.sessionId || '';
        if (this.network?.room?.sessionId && senderSession === this.network.room.sessionId) {
            if (gift.key === this.lastGiftSentKey && Date.now() - this.lastGiftSentAt < 1800) {
                return;
            }
        }
        this.showGiftBurst(gift, payload.senderName || '', payload.recipientName || '');
    }
    onNetworkVoiceSignal(payload) {
        this.voice?.handleSignal?.(payload);
    }
    showReactionBurst(reactionId, senderName = '') {
        if (!this.reactionStage) return;
        const reaction = this.reactionPalette.find((item) => item.code === reactionId) || this.reactionPalette[0];
        const burst = document.createElement('div');
        burst.className = 'reaction-burst';

        const icon = document.createElement('div');
        icon.className = 'reaction-burst-icon';
        icon.innerHTML = this.buildReactionMarkup(reaction, 96);
        burst.appendChild(icon);

        if (senderName) {
            const label = document.createElement('div');
            label.className = 'reaction-burst-label';
            label.textContent = senderName;
            burst.appendChild(label);
        }

        this.reactionStage.appendChild(burst);
        window.setTimeout(() => {
            burst.remove();
        }, 1250);
    }
    buildReactionMarkup(reaction, size = 48) {
        const code = typeof reaction === 'string' ? reaction : reaction.code;
        const label = typeof reaction === 'string' ? reaction : (reaction.label || reaction.code);
        const src = `assets/reactions/${code}.svg`;
        return `<img src="${src}" alt="${label}" width="${size}" height="${size}" loading="eager" decoding="async">`;
    }
    setupGiftUI() {
        this.giftBtn = document.getElementById('gift-btn');
        const giftPicker = document.getElementById('gift-picker');
        if (!giftPicker) return;

        if (this.giftBtn) {
            this.giftBtn.innerHTML = this.buildGiftButtonMarkup(48);
            this.giftBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleGiftPicker(true, {
                    source: 'room',
                    roomId: String(this.currentRoomState?.roomId || this.network?.room?.roomId || this.network?.room?.id || '').trim(),
                    roomCode: String(this.currentRoomState?.roomCode || this.network?.room?.roomCode || '').trim()
                });
            });
        }
        this.renderGiftPicker();

        this._giftOutsideHandler = (event) => {
            const picker = document.getElementById('gift-picker');
            if (!picker || !picker.classList.contains('open')) return;
            const target = event.target;
            const chatGiftBtn = document.getElementById('chat-gift-btn');
            if (picker.contains(target) 
                || (this.giftBtn && this.giftBtn.contains(target))
                || (chatGiftBtn && chatGiftBtn.contains(target))
            ) return;
            this.closeGiftPicker();
        };
        document.addEventListener('pointerdown', this._giftOutsideHandler, true);
    }
    setupVoiceUI() {
        this.voiceBtn = document.getElementById('voice-btn');
        this.voiceUnlockBtn = document.getElementById('voice-unlock-btn');
        this.voiceStatusEl = document.getElementById('voice-status');
        this.voiceRosterBtn = document.getElementById('voice-roster-toggle');
        this.voiceRosterPanel = document.getElementById('voice-roster-panel');
        this.voiceRosterCloseBtn = document.getElementById('voice-roster-close-btn');
        if (!this.voiceBtn || !this.voiceStatusEl) return;

        this.voiceBtn.addEventListener('click', async (event) => {
            if (!this.network?.isMultiplayer) return;
            debugLog("[VOICE_DEBUG] mic:click");
            event.preventDefault();
            event.stopPropagation();
            await this.voice.toggleVoice();
            this.syncVoiceUi();
        });

        if (this.voiceUnlockBtn) {
            this.voiceUnlockBtn.addEventListener('click', async (event) => {
                debugLog("[VOICE_DEBUG] enableSound:clicked");
                event.preventDefault();
                event.stopPropagation();
                await this.voice.unlockRemoteAudio();
                this.syncVoiceUi();
            });
        }

        if (this.voiceRosterBtn && this.voiceRosterPanel) {
            this.voiceRosterBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.toggleVoiceRoster();
            });
        }

        if (this.voiceRosterCloseBtn) {
            this.voiceRosterCloseBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.toggleVoiceRoster(false);
            });
        }

        this._voiceRosterOutsideHandler = (event) => {
            const panel = document.getElementById('voice-roster-panel');
            const button = document.getElementById('voice-roster-toggle');
            if (!panel || panel.hidden) return;
            const target = event.target;
            if (panel.contains(target) || (button && button.contains(target))) return;
            this.toggleVoiceRoster(false);
        };
        document.addEventListener('pointerdown', this._voiceRosterOutsideHandler, true);
        this.syncVoiceUi();
    }
    syncVoiceUi() {
        if (this.voice?.syncVisibility) {
            this.voice.syncVisibility();
            this.voice.updateSpeakerUi?.();
            this.voice.updateAudioUnlockUi?.();
        }
    }
    renderGiftPicker() {
        const giftPicker = document.getElementById('gift-picker');
        if (!giftPicker) {
            debugLog('[Chat Debug] renderGiftPicker: giftPicker element not found.');
            return;
        }
        const mode = this.giftPickerMode || 'inventory';
        const inventory = Array.isArray(this.giftInventory) ? this.giftInventory.filter(item => Number(item?.quantity || 0) > 0) : [];
        debugLog('[Chat Debug] renderGiftPicker: rendering in mode:', mode, 'inventory count:', inventory.length);
        giftPicker.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'gift-picker-header';
        const title = document.createElement('div');
        title.className = 'gift-picker-title';
        const context = this.getGiftPickerContext();
        if (context.source === 'room') title.textContent = this.t('gift-picker-room-title');
        else if (context.source === 'chat') title.textContent = this.t('gift-picker-chat-title');
        else title.textContent = this.t('gift-picker-social-title');
        header.appendChild(title);

        const recipientRow = document.createElement('div');
        recipientRow.className = 'gift-recipient-row';
        const recipients = this.getGiftRecipientsByContext(context);
        
        if (!recipients.length) {
            const empty = document.createElement('div');
            empty.className = 'modal-desc';
            empty.textContent = context.source === 'room'
                ? this.t('gift-no-room-recipient')
                : this.t('gift-no-recipient');
            recipientRow.appendChild(empty);
        } else {
            if (!this.selectedGiftRecipientId || !recipients.some((item) => item.id === this.selectedGiftRecipientId)) {
                this.selectedGiftRecipientId = recipients[0].id;
            }
            recipients.forEach((recipient) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'gift-recipient-chip';
                if (recipient.id === this.selectedGiftRecipientId) btn.classList.add('active');
                btn.dataset.recipient = recipient.id;
                const avatar = document.createElement('div');
                avatar.className = 'gift-recipient-avatar';
                const avatarUrl = recipient.avatarUrl || '';
                if (avatarUrl) {
                    const img = document.createElement('img');
                    img.alt = recipient.displayName;
                    img.loading = 'lazy';
                    img.src = avatarUrl;
                    avatar.appendChild(img);
                } else {
                    avatar.textContent = this.getTurnAvatarText(recipient.displayName || '');
                }
                const name = document.createElement('span');
                name.textContent = recipient.displayName;
                btn.appendChild(avatar);
                btn.appendChild(name);
                btn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.selectedGiftRecipientId = recipient.id;
                    this.renderGiftPicker();
                });
                recipientRow.appendChild(btn);
            });
        }


        const menuBar = document.createElement('div');
        menuBar.className = 'gift-picker-menubar';
        menuBar.style.display = 'flex';
        menuBar.style.gap = '10px';
        menuBar.style.margin = '10px 14px';

        if (mode === 'inventory' && inventory.length > 0) {
            const buyBtn = document.createElement('button');
            buyBtn.type = 'button';
            buyBtn.className = 'btn btn-secondary';
            buyBtn.style.padding = '6px 12px';
            buyBtn.style.fontSize = '0.85em';
            buyBtn.textContent = 'Купить подарок';
            buyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.giftPickerMode = 'catalog';
                this.renderGiftPicker();
            });
            menuBar.appendChild(buyBtn);
        } else if (mode === 'catalog' && inventory.length > 0) {
            const vaultBtn = document.createElement('button');
            vaultBtn.type = 'button';
            vaultBtn.className = 'btn btn-secondary';
            vaultBtn.style.padding = '6px 12px';
            vaultBtn.style.fontSize = '0.85em';
            vaultBtn.textContent = 'Подарки из инвентаря';
            vaultBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.giftPickerMode = 'inventory';
                this.renderGiftPicker();
            });
            menuBar.appendChild(vaultBtn);
        }

        const grid = document.createElement('div');
        grid.className = 'gift-picker-grid';

        if (mode === 'inventory') {
            if (inventory.length === 0) {
                const noGiftsContainer = document.createElement('div');
                noGiftsContainer.style.gridColumn = '1 / -1';
                noGiftsContainer.style.textAlign = 'center';
                noGiftsContainer.style.padding = '30px 10px';

                const desc = document.createElement('div');
                desc.className = 'modal-desc';
                desc.style.marginBottom = '15px';
                desc.textContent = 'У вас нет полученных подарков. Вы можете купить подарок за монеты.';
                noGiftsContainer.appendChild(desc);

                const buyBtn = document.createElement('button');
                buyBtn.type = 'button';
                buyBtn.className = 'btn btn-primary';
                buyBtn.textContent = 'Купить подарок';
                buyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.giftPickerMode = 'catalog';
                    this.renderGiftPicker();
                });
                noGiftsContainer.appendChild(buyBtn);
                grid.appendChild(noGiftsContainer);
            } else {
                for (const item of inventory) {
                    const gift = item.catalog;
                    const card = document.createElement('button');
                    card.type = 'button';
                    card.className = 'gift-choice';
                    card.dataset.giftKey = gift.key;
                    
                    const visual = document.createElement('div');
                    visual.className = 'gift-choice-visual';
                    visual.innerHTML = this.buildGiftMarkup(gift, 64);
                    
                    const name = document.createElement('div');
                    name.className = 'gift-choice-name';
                    name.textContent = gift.name;
                    
                    const meta = document.createElement('div');
                    meta.className = 'gift-choice-meta';
                    meta.textContent = this.format('gift-choice-meta', {
                        rarity: gift.rarity || 'common',
                        exchangeValue: gift.exchangeValue || 0
                    });
                    
                    const count = document.createElement('div');
                    count.className = 'gift-choice-cost';
                    count.style.color = 'var(--color-primary, #00C853)';
                    count.textContent = `Количество: ${item.quantity}`;
                    
                    card.appendChild(visual);
                    card.appendChild(name);
                    card.appendChild(meta);
                    card.appendChild(count);
                    
                    card.addEventListener('click', async (event) => {
                        event.stopPropagation();
                        await this.sendGift(gift.key, this.selectedGiftRecipientId || recipients[0]?.id || '', true, context);
                    });
                    grid.appendChild(card);
                }
            }
        } else {
            // Catalog mode
            const gifts = Array.isArray(this.giftCatalog) ? this.giftCatalog : [];
            if (!gifts.length) {
                const empty = document.createElement('div');
                empty.className = 'modal-desc';
                empty.style.gridColumn = '1 / -1';
                empty.textContent = this.t('gift-loading');
                grid.appendChild(empty);
            } else {
                for (const gift of gifts) {
                    const card = document.createElement('button');
                    card.type = 'button';
                    card.className = 'gift-choice';
                    card.dataset.giftKey = gift.key;
                    
                    const visual = document.createElement('div');
                    visual.className = 'gift-choice-visual';
                    visual.innerHTML = this.buildGiftMarkup(gift, 64);
                    
                    const name = document.createElement('div');
                    name.className = 'gift-choice-name';
                    name.textContent = gift.name;
                    
                    const meta = document.createElement('div');
                    meta.className = 'gift-choice-meta';
                    meta.textContent = this.format('gift-choice-meta', {
                        rarity: gift.rarity || 'common',
                        exchangeValue: gift.exchangeValue || 0
                    });
                    
                    const cost = document.createElement('div');
                    cost.className = 'gift-choice-cost';
                    cost.textContent = this.format('gift-coins', { value: gift.coinCost || 100 });
                    
                    card.appendChild(visual);
                    card.appendChild(name);
                    card.appendChild(meta);
                    card.appendChild(cost);
                    
                    card.addEventListener('click', async (event) => {
                        event.stopPropagation();
                        await this.sendGift(gift.key, this.selectedGiftRecipientId || recipients[0]?.id || '', false, context);
                    });
                    grid.appendChild(card);
                }
            }
        }

        giftPicker.appendChild(header);
        giftPicker.appendChild(recipientRow);
        if (menuBar.childNodes.length > 0) {
            giftPicker.appendChild(menuBar);
        }
        giftPicker.appendChild(grid);
    }
    getGiftPickerContext(options = {}) {
        const nextOptions = options && typeof options === 'object' ? options : {};
        const chatPanel = document.getElementById('social-chats-panel');
        const isChatActive = chatPanel && !chatPanel.classList.contains('is-hidden');
        const defaultSource = isChatActive ? 'chat' : 'social';
        const current = this.giftPickerContext && typeof this.giftPickerContext === 'object'
            ? this.giftPickerContext
            : {};
        const source = String(nextOptions.source || current.source || defaultSource).trim().toLowerCase();
        return {
            source: source === 'room' || source === 'chat' ? source : 'social',
            activePlayerId: String(nextOptions.activePlayerId || current.activePlayerId || this.accountMessagesState?.activePlayerId || '').trim(),
            roomId: String(nextOptions.roomId || current.roomId || this.currentRoomState?.roomId || this.network?.room?.roomId || this.network?.room?.id || '').trim(),
            roomCode: String(nextOptions.roomCode || current.roomCode || this.currentRoomState?.roomCode || this.network?.room?.roomCode || '').trim()
        };
    }

    toggleGiftPicker(force = null, options = {}) {
        const giftPicker = document.getElementById('gift-picker');
        if (!giftPicker) {
            debugLog('[Chat Debug] toggleGiftPicker: giftPicker element not found.');
            return;
        }
        const open = force === null ? !giftPicker.classList.contains('open') : !!force;
        debugLog('[Chat Debug] toggleGiftPicker. force:', force, 'nextOpenState:', open);
        if (open) {
            this.toggleVoiceRoster(false);
        }
        giftPicker.classList.toggle('open', open);
        giftPicker.setAttribute('aria-hidden', String(!open));
        if (this.giftBtn) {
            this.giftBtn.setAttribute('aria-expanded', String(open));
        }
        if (open) {
            this.giftPickerContext = this.getGiftPickerContext(options);
            if (this.giftPickerContext.source === 'chat' && this.giftPickerContext.activePlayerId) {
                this.selectedGiftRecipientId = this.giftPickerContext.activePlayerId;
            }
            this.giftPickerMode = 'inventory'; // Reset mode to inventory on open
            this.renderGiftPicker();
            void this.loadGiftHub();
        }
    }
    closeGiftPicker() {
        this.toggleGiftPicker(false);
    }
    getGiftRecipients() {
        return this.getGiftRecipientsByContext(this.getGiftPickerContext());
    }

    toggleVoiceRoster(force = null) {
        const button = document.getElementById('voice-roster-toggle');
        const panel = document.getElementById('voice-roster-panel');
        const title = document.getElementById('voice-roster-title');
        const count = document.getElementById('voice-roster-count');
        if (!button || !panel) return false;
        const open = force === null ? !panel.classList.contains('open') : !!force;
        if (open) {
            this.closeGiftPicker();
            this.closeReactionPicker();
        }
        panel.classList.toggle('open', open);
        panel.hidden = !open;
        panel.setAttribute('aria-hidden', String(!open));
        button.setAttribute('aria-expanded', String(open));
        if (title) {
            title.textContent = this.t('voice-roster-toggle') || 'Players';
        }
        if (count) {
            count.textContent = String(Number(button.dataset.remoteSpeakers || 0) || 0);
        }
        if (open) {
            this.voice?.updateSpeakerUi?.();
        }
        return open;
    }

    getRoomGiftRecipients() {
        const recipients = [];
        const seen = new Set();
        const myPlayerId = this.getCurrentAccountPlayerId();
        const roomPlayers = Array.isArray(this.currentRoomState?.players) && this.currentRoomState.players.length
            ? this.currentRoomState.players
            : (Array.isArray(this.roomPlayerRefs) ? this.roomPlayerRefs : []);
        for (const player of roomPlayers) {
            if (player?.isBot) continue;
            const id = String(player?.playerId || player?.userId || '').trim();
            if (!id || id === myPlayerId || seen.has(id)) continue;
            seen.add(id);
            recipients.push({
                id,
                displayName: String(player?.name || 'Player').trim() || 'Player',
                avatarUrl: player?.avatarUrl || null
            });
        }
        return recipients;
    }

    getChatGiftRecipients() {
        const activePlayerId = String(this.accountMessagesState?.activePlayerId || '').trim();
        if (!activePlayerId || activePlayerId === this.getCurrentAccountPlayerId()) return [];
        const threads = Array.isArray(this.accountMessagesState?.threads) ? this.accountMessagesState.threads : [];
        const activeThread = threads.find((t) => String(t?.player?.id || t?.playerId || t?.id || '').trim() === activePlayerId) || null;
        const activePlayer = this.accountMessagesState?.activePlayerProfile || activeThread?.player || null;
        return [{
            id: activePlayerId,
            displayName: activePlayer?.displayName || this.getRecipientNameById(activePlayerId) || 'Player',
            avatarUrl: activePlayer?.avatarUrl || null
        }];
    }

    getFriendGiftRecipients() {
        const recipients = [];
        const seen = new Set();
        const myPlayerId = this.getCurrentAccountPlayerId();
        for (const friend of Array.isArray(this.friendHub?.accepted) ? this.friendHub.accepted : []) {
            const id = String(friend?.friend?.id || '').trim();
            if (!id || id === myPlayerId || seen.has(id)) continue;
            seen.add(id);
            recipients.push({
                id,
                displayName: String(friend?.friend?.displayName || 'Player').trim() || 'Player',
                avatarUrl: friend?.friend?.avatarUrl || null
            });
        }
        return recipients;
    }

    getGiftRecipientsByContext(context = this.getGiftPickerContext()) {
        if (context?.source === 'room') return this.getRoomGiftRecipients();
        if (context?.source === 'chat') return this.getChatGiftRecipients();
        return this.getFriendGiftRecipients();
    }
    async loadGiftHub() {
        if (!this.account?.getGiftCatalog) return;
        try {
            const [catalog, inventory, history] = await Promise.all([
                this.account.getGiftCatalog(),
                this.account.getGiftInventory(),
                this.account.getGiftHistory()
            ]);
            this.giftCatalog = Array.isArray(catalog) ? catalog : [];
            this.giftInventory = Array.isArray(inventory?.items) ? inventory.items : [];
            this.giftHistory = history || { sent: [], received: [], items: [] };
            this.renderGiftPicker();
            this.renderGiftInventory();
        } catch (err) {
            debugLog("Gift hub load failed:", err);
        }
    }
    renderGiftInventory() {
        const panel = document.getElementById('account-gifts-panel');
        const list = document.getElementById('account-gifts-list');
        if (!panel || !list) return;
        if (this.accountProfileTab !== 'gifts') {
            panel.classList.add('is-hidden');
            return;
        }
        list.innerHTML = '';
        const items = Array.isArray(this.giftInventory)
            ? this.giftInventory.filter((item) => Number(item?.quantity || 0) > 0)
            : [];
        if (!this.hasAuthenticatedAccount() || !items.length) {
            if (this.hasAuthenticatedAccount()) {
                panel.classList.remove('is-hidden');
                const empty = document.createElement('div');
                empty.className = 'modal-desc';
                empty.style.gridColumn = '1 / -1';
                empty.textContent = this.t('gift-no-items');
                list.appendChild(empty);
            } else {
            panel.classList.add('is-hidden');
            }
            return;
        }
        panel.classList.remove('is-hidden');
        for (const item of items) {
            const card = document.createElement('div');
            card.className = 'gift-inventory-card';
            const top = document.createElement('div');
            top.className = 'gift-inventory-top';
            const thumb = document.createElement('div');
            thumb.className = 'gift-inventory-thumb';
            thumb.innerHTML = this.buildGiftMarkup(item.catalog, 44);
            const copy = document.createElement('div');
            copy.className = 'gift-inventory-copy';
            const name = document.createElement('div');
            name.className = 'gift-inventory-name';
            name.textContent = item.catalog?.name || item.catalog?.key || this.t('gift-button');
            const meta = document.createElement('div');
            meta.className = 'gift-inventory-meta';
            meta.textContent = `${item.quantity || 0} pcs вЂў back ${item.catalog?.exchangeValue || 0}`;
            copy.appendChild(name);
            copy.appendChild(meta);
            top.appendChild(thumb);
            top.appendChild(copy);
            const actions = document.createElement('div');
            actions.className = 'gift-inventory-actions';
            const cost = document.createElement('span');
            cost.className = 'gift-cost-chip';
            cost.textContent = `${Math.max(0, item.catalog?.exchangeValue || 0)} coins`;
            meta.textContent = this.format('gift-inventory-meta', {
                quantity: item.quantity || 0,
                exchangeValue: item.catalog?.exchangeValue || 0
            });
            cost.textContent = this.format('gift-coins', { value: Math.max(0, item.catalog?.exchangeValue || 0) });
            const exchangeBtn = document.createElement('button');
            exchangeBtn.type = 'button';
            exchangeBtn.className = 'btn btn-menu';
            exchangeBtn.textContent = this.t('gift-exchange');
            exchangeBtn.disabled = (item.quantity || 0) <= 0;
            exchangeBtn.addEventListener('click', async () => {
                exchangeBtn.disabled = true;
                try {
                    await this.exchangeGift(item.catalog?.key || '');
                    await this.loadGiftHub();
                    this.renderer.showMessage(this.t('gift-exchanged'), 1500);
                } catch (err) {
                    this.renderer.showMessage(err.message || this.t('gift-exchange-failed'), 1800);
                } finally {
                    exchangeBtn.disabled = (item.quantity || 0) <= 0;
                }
            });
            actions.appendChild(cost);
            actions.appendChild(exchangeBtn);
            card.appendChild(top);
            card.appendChild(actions);
            list.appendChild(card);
        }
    }
    async sendGift(giftKey, recipientPlayerId, fromInventory = false, options = {}) {
        const recipientId = String(recipientPlayerId || '').trim();
        const key = String(giftKey || '').trim();
        const context = this.getGiftPickerContext(options);
        const contextType = context.source === 'room'
            ? 'room'
            : (context.source === 'chat' ? 'chat' : 'social');
        const contextId = context.source === 'room'
            ? (context.roomId || context.roomCode || this.currentRoomState?.roomId || this.currentRoomState?.roomCode || this.network?.room?.id || '')
            : (context.source === 'chat' ? context.activePlayerId : '');
        debugLog('[Chat Debug] sendGift requested:', { giftKey: key, recipientId, fromInventory, contextType, contextId });
        if (!recipientId || !key) {
            debugLog('[Chat Debug] sendGift aborted: missing recipientId or giftKey');
            this.renderer.showMessage(this.t('gift-select-recipient'), 1400);
            return null;
        }
        const myPlayerId = this.getCurrentAccountPlayerId();
        if (!this.accountProfile || recipientId === myPlayerId) {
            debugLog('[Chat Debug] sendGift aborted: sender is not authed or trying to send to self');
            this.renderer.showMessage(this.t('gift-self-send'), 1600);
            return null;
        }
        const gift = this.giftCatalog.find((item) => item.key === key);
        if (!gift) {
            debugLog('[Chat Debug] sendGift aborted: gift not found in catalog:', key);
            this.renderer.showMessage(this.t('gift-not-found'), 1600);
            return null;
        }
        try {
            debugLog('[Chat Debug] sendGift: calling account.sendGift API...', { recipientId, key, fromInventory });
            const result = await this.account.sendGift({
                recipientPlayerId: recipientId,
                giftKey: key,
                contextType,
                contextId,
                note: `${gift.name}`,
                fromInventory: fromInventory
            });
            debugLog('[Chat Debug] sendGift: API call successful, result:', result);
            const name = this.getRecipientNameById(recipientId);
            this.closeGiftPicker();
            this.lastGiftSentAt = Date.now();
            this.lastGiftSentKey = key;
            this.showGiftBurst(gift, this.accountProfile?.name || this.t('gift-button'), name);
            if (this.network?.isMultiplayer) {
                debugLog('[Chat Debug] sendGift: sending gift event over the socket to room...', { key, recipientId, name });
                this.network.sendGift({
                    giftKey: gift.key,
                    giftName: gift.name,
                    assetKey: gift.assetKey,
                    recipientPlayerId: recipientId,
                    recipientName: name,
                    contextType,
                    contextId
                });
            }
            await this.loadAccountProfile();
            await this.loadGiftHub();
            await this.loadSocialSummary();
            this.renderAccountModal();
            this.renderer.showMessage(this.t('gift-sent'), 1500);
            return result;
        } catch (err) {
            debugLog('[Chat Debug] sendGift: failed with error:', err);
            this.renderer.showMessage(err.message || this.t('gift-send-failed'), 1800);
            return null;
        }
    }
    async exchangeGift(giftKey) {
        const key = String(giftKey || '').trim();
        if (!key) return null;
        try {
            const result = await this.account.exchangeGift({
                giftKey: key,
                quantity: 1,
                note: 'Profile exchange'
            });
            await this.loadAccountProfile();
            await this.loadGiftHub();
            this.renderAccountModal();
            return result;
        } catch (err) {
            this.renderer.showMessage(err.message || 'Gift exchange failed', 1800);
            return null;
        }
    }
    getRecipientNameById(playerId) {
        const id = String(playerId || '').trim();
        if (!id) return 'Player';
        const roomPlayers = Array.isArray(this.currentRoomState?.players) ? this.currentRoomState.players : [];
        const roomPlayer = roomPlayers.find((player) => String(player?.playerId || player?.userId || '').trim() === id);
        if (roomPlayer?.name) return roomPlayer.name;
        const friend = Array.isArray(this.friendHub?.accepted)
            ? this.friendHub.accepted.find((item) => String(item?.friend?.id || '').trim() === id)
            : null;
        return friend?.friend?.displayName || 'Player';
    }
    buildGiftMarkup(gift, size = 48) {
        const assetKey = String(gift?.assetKey || gift?.key || 'gift_001').trim() || 'gift_001';
        const label = String(gift?.name || gift?.key || 'Gift').trim() || 'Gift';
        return `<img src="assets/gift/${assetKey}.png" alt="${label}" width="${size}" height="${size}" loading="eager" decoding="async">`;
    }
    buildGiftButtonMarkup(size = 48) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" aria-hidden="true"><path d="M5 9.5h14v9.5H5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 8h16v3H4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 8v11" stroke="currentColor" stroke-width="1.6"/><path d="M12 8c-1.3 0-3-1.1-3-2.6S10.3 3 12 5.1c1.7-2.1 3.9-2.7 4.7-1.2.8 1.5-.8 4.1-4.7 4.1Zm0 0c-1.4 0-3.1-1.2-4.3-2.4C6.6 4.3 6.2 2.9 7.2 2.3c1-.6 2.8.2 4.8 2.8Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    showGiftBurst(gift, senderName = '', recipientName = '') {
        if (!this.reactionStage) return;
        const burst = document.createElement('div');
        burst.className = 'gift-burst';
        const icon = document.createElement('div');
        icon.className = 'gift-burst-icon';
        icon.innerHTML = this.buildGiftMarkup(gift, 96);
        burst.appendChild(icon);
        const label = document.createElement('div');
        label.className = 'gift-burst-label';
        label.textContent = `${senderName || 'Player'} в†’ ${recipientName || 'Player'}`;
        burst.appendChild(label);
        if (gift?.name) {
            const chip = document.createElement('div');
            chip.className = 'gift-burst-chip';
            chip.textContent = gift.name;
            burst.appendChild(chip);
        }
        this.reactionStage.appendChild(burst);
        window.setTimeout(() => {
            burst.remove();
        }, 2100);
    }
    setupMenu() {
        document.getElementById('menu-btn')?.addEventListener('click', () => {
            this.closeReactionPicker();
            this.closeGiftPicker();
            document.getElementById('menu-screen').classList.add('active');
        });
        const menuScreen = document.getElementById('menu-screen');
        if (menuScreen) {
            menuScreen.addEventListener('click', async (event) => {
                const target = event.target?.closest?.('#menu-profile');
                if (!target) return;
                event.preventDefault();
                event.stopPropagation();
                document.getElementById('menu-screen').classList.remove('active');
                await this.openAccountModal();
            });
        }
        document.getElementById('menu-resume')?.addEventListener('click', () => document.getElementById('menu-screen').classList.remove('active'));
        document.getElementById('menu-next-track')?.addEventListener('click', () => {
            nextTrack();
        });
        document.getElementById('menu-toggle-mute')?.addEventListener('click', () => {
            toggleMute();
        });
        document.getElementById('menu-quit')?.addEventListener('click', async () => {
            document.getElementById('menu-screen').classList.remove('active');
            const shouldQuit = await this.confirmQuitCurrentMatch();
            if (!shouldQuit) return;
            await this.quitCurrentMatch();
        });
    }

    async confirmQuitCurrentMatch() {
        if (!this.gameActive) {
            return true;
        }

        const isStakeGame = this.network.isMultiplayer
            ? this.onlineEconomyMode === 'coins'
            : this.activeMatchEconomyMode === 'coins';

        const message = isStakeGame
            ? this.t('quit-confirm-stake')
            : this.t('quit-confirm-stake');

        return window.confirm(message);
    }

    async quitCurrentMatch() {
        await this.returnToMainMenu({ settleForfeit: true });
    }

    async returnToMainMenu({ settleForfeit = false } = {}) {
        this.clearRoundStage();
        this.clearPendingOnlineAction({ rollback: false });
        this.clearNextDealAdvanceTimeout();
        this.clearTurnTimers();
        this.resetOnlineResultFlowState();
        if (!this.network.isMultiplayer && this.currentRoundStakeSessionId) {
            try {
                if (settleForfeit) {
                    this.coinMatchSummary.spent += this.currentRoundStakeAmount || this.getStakeAmountByKey(this.currentRoundStakeKey);
                    await this.account?.settleSoloMatchStake?.({
                        matchId: this.currentRoundStakeSessionId,
                        stakeKey: this.currentRoundStakeKey,
                        result: 'loss',
                        difficulty: this.difficulty
                    });
                }
            } catch (error) {
                console.warn('[Economy] Solo forfeit settlement failed', error);
            }
        }

        this.clearGameResumeSnapshot();
        void this.clearLocalPresence();
        if (this.network.isMultiplayer && this.network.room) {
            this.network.leaveRoom({ explicit: true, reason: 'menu' });
            this.myHand = null;
        }
        this.voice?.destroy?.();
        this.gameActive = false;
        this.matchOver = false;
        this.roundOver = false;
        this.currentRoomState = null;
        this.syncBotTakeoverUiState(null);
        this.disconnectEconomyApplied = false;
        this.syncOpenRoomWaitingBanner(null);
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('start-screen').classList.add('active');
        this.syncGameScreenUiState();
        if (this.hasAuthenticatedAccount()) {
            startMenuMusic();
        } else {
            stopMusic();
        }
        this.showStartModal(null);
        this.resetMultiplayerPanels(false);
    }

    async startNewGame() {
        debugLog('[startNewGame] Starting...', 'isMultiplayer:', this.network.isMultiplayer);
        this.clearPendingOnlineAction({ rollback: false });
        this.clearNextDealAdvanceTimeout();
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        this.syncGameScreenUiState();
        startGameMusic();
        this.playerName = this.sanitizeName(this.playerName);

        // In multiplayer, server controls the game - just wait for state updates
        if (this.network.isMultiplayer) {
            debugLog('[startNewGame] Multiplayer mode - waiting for server');
            this.humanPlayerIndex = 0;
            if (this.isTeamMode) this.playerCount = 4;
            return;
        }

        this.humanPlayerIndex = 0;
        this.mode = this.getSoloStartMode();
        this.ruleset = getRuleset(this.mode);
        this.matchRuleState = this.mode === 'classic101'
            ? (this.ruleset.createMatchState?.(this.playerCount, this.isTeamMode) || null)
            : null;
        this.lastClassic101RoundResult = null;
        this.myHand = null;
        this.roomPlayerRefs = [];
        this.currentRoomState = null;
        this.validMoves = [];
        this.goshaCombo = null;
        this.networkActionBlockedForReconnect = false;
        if (this.isTeamMode) this.playerCount = 4;
        this.currentMatchStartedAt = new Date().toISOString();
        this.currentMatchSessionId = this.createResumeId('solo');
        this.playerMissingSuits = Array.from({ length: this.playerCount }, () => new Set());
        this.playerNames = [this.playerName];
        for (let i=1;i<this.playerCount;i++) {
            this.playerNames.push(`${this.currentLang==='az'?'Komp':'AI'} ${i}`);
        }
        this.roundWins = new Array(this.playerCount).fill(0);
        this.teamScores=[0,0]; this.teamRoundWins=[0,0];
        this.matchRound=1; this.matchOver=false; this.roundOver=false; this.lastDealWinner=null;
        this.disconnectEconomyApplied = false;
        this.coinMatchSummary = { spent: 0, won: 0 };
        this.pendingSoloSettlement = Promise.resolve();
        if (this.network.isMultiplayer) {
            this.resetOnlineCoinSummary();
        }
        
        // Settings
        this.instantWinEnabled = document.getElementById('instant-win-setting').checked;
        const dlossInput = parseInt(document.getElementById('dloss-setting').value, 10);
        this.dlossThreshold = isNaN(dlossInput) ? 255 : dlossInput;

        await this.loadAccountProfile();
        const stakePreparation = await this.prepareSoloEconomyStake();
        if (!stakePreparation?.ok) {
            document.getElementById('game-screen').classList.remove('active');
            document.getElementById('start-screen').classList.add('active');
            document.getElementById('solo-modal')?.classList.add('active');
            return;
        }
        this.activeMatchEconomyMode = this.soloEconomyMode;
        this.activeMatchStakeKey = this.soloStakeKey;

        this.ais=[]; 
        for(let i=1;i<this.playerCount;i++) {
            this.ais.push(new AIPlayer(i,this.difficulty));
        }
        debugLog('[startNewGame] Starting round...');
        const started = await this.startRound();
        if (!started) {
            document.getElementById('game-screen').classList.remove('active');
            document.getElementById('start-screen').classList.add('active');
            this.showStartModal(null);
            return;
        }
        void this.syncLocalPresence(true);
    }

    async prepareSoloEconomyStake() {
        const selection = this.readSoloEconomySelectionFromUi();
        this.soloEconomyMode = 'coins';
        this.soloStakeKey = selection.stakeKey;

        await this.loadAccountProfile();
        const token = this.account?.getRoomAuthToken?.();
        if (!token) {
            await this.requireRegisteredAccount('account-registration-required');
            return { ok: false, reason: 'auth_required' };
        }

        const stakeKey = this.soloStakeKey || 'stake_50';
        this.soloStakeKey = stakeKey;
        this.soloEconomyMode = 'coins';
        this.activeMatchEconomyMode = 'coins';
        this.activeMatchStakeKey = stakeKey;
        this.syncSoloOptions();
        return { ok: true, mode: 'coins', stakeKey };
    }
    async reserveSoloRoundStake() {
        const token = this.account?.getRoomAuthToken?.();
        if (!token) {
            return { ok: false, reason: 'auth_required' };
        }

        const roundStakeKey = this.currentRoundStakeKey
            ? this.currentRoundStakeKey
            : (this.soloStakeKey || 'stake_50');
        const roundStakeAmount = this.getStakeAmountByKey(roundStakeKey);

        try {
            const result = await this.account.reserveSoloMatchStake({
                matchId: this.currentRoundStakeSessionId,
                stakeKey: roundStakeKey,
                difficulty: this.difficulty
            });
            if (!result?.ok) {
                throw new Error(result?.reason || 'reserve_failed');
            }
            this.currentRoundStakeKey = roundStakeKey;
            this.currentRoundStakeAmount = roundStakeAmount;
            this.currentRoundBankAmount = roundStakeAmount > 0 ? roundStakeAmount * 2 : 0;
            this.activeMatchEconomyMode = 'coins';
            this.activeMatchStakeKey = roundStakeKey;
            return { ok: true, mode: 'coins', stakeKey: roundStakeKey, stakeAmount: roundStakeAmount };
        } catch (error) {
            return { ok: false, reason: error?.message || 'reserve_failed' };
        }
    }

    async settleSoloRoundStake(winnerIndex) {
        if (!this.currentRoundStakeSessionId) {
            return null;
        }

        const stakeAmount = this.currentRoundStakeAmount || this.getStakeAmountByKey(this.currentRoundStakeKey);
        const result = this.isTeamMode
            ? ((winnerIndex % 2) === (this.humanPlayerIndex % 2) ? 'win' : 'loss')
            : (winnerIndex === this.humanPlayerIndex ? 'win' : 'loss');

        const payout = result === 'win'
            ? Math.max(0, (stakeAmount * 2) - Math.max(0, Math.floor((stakeAmount * 2) * 0.05)))
            : 0;

        this.coinMatchSummary.spent += stakeAmount;
        this.coinMatchSummary.won += payout;

        try {
            await this.account.settleSoloMatchStake({
                matchId: this.currentRoundStakeSessionId,
                stakeKey: this.currentRoundStakeKey,
                result,
                difficulty: this.difficulty
            });
        } catch (settleError) {
            console.warn('[Economy] Solo round settlement failed:', settleError);
        }

        this.currentRoundStakeSessionId = null;
        this.currentRoundStakeKey = 'stake_50';
        this.currentRoundStakeAmount = 0;
        this.currentRoundBankAmount = 0;
        return { result, stakeAmount, payout };
    }

    async startRound() { 
        debugLog('[startRound] playerCount:', this.playerCount);
        this.clearRoundStage();
        this.roundOver=false; this.scores=new Array(this.playerCount).fill(0); if(this.isTeamMode) this.teamScores=[0,0]; this.deal=1; 
        this.clearNextDealAdvanceTimeout();
        await this.pendingSoloSettlement.catch(() => {});
        this.currentRoundStakeKey = this.soloStakeKey || 'stake_50';
        this.currentRoundStakeSessionId = this.createResumeId(`solo-round-${this.matchRound}`);
        const stakeReady = await this.reserveSoloRoundStake();
        if (!stakeReady?.ok) {
            this.matchOver = true;
            this.renderer.showMessage(
                stakeReady.reason === 'auth_required'
                    ? this.t('account-registration-required')
                    : this.t('not-enough-coins-round'),
                2400
            );
            if (this.matchRound <= 1) {
                document.getElementById('game-screen').classList.remove('active');
                document.getElementById('start-screen').classList.add('active');
                this.showStartModal('solo');
                return false;
            }
            this.showMatchResult();
            return false;
        }
        this.startDeal(); 
        return true;
    }

    startDeal() {
        debugLog('[startDeal] Initializing deal...');
        this.resetOnlineResultFlowState();
        this.clearRoundStage();
        this.openingRequiredTileId = '';
        this.openingRequiredTileIndex = -1;
        this.openingRequiredPlayerIndex = -1;
        document.getElementById('round-end-screen')?.classList.remove('review-mode');
        document.getElementById('game-over-screen')?.classList.remove('review-mode');
        this._turnCycleId += 1;
        const turnCycleId = this._turnCycleId;
        this.clearNextDealAdvanceTimeout();
        this.clearTurnTimers();
        this.board=new Board(); this.board.startAxis = getBoardStartAxis(); this.configureBoardForCurrentMode(this.board); this.selectedTileIndex=-1; this.roundOver=false; this.gameActive=true; this.turnInProgress=false;
        this.syncGameScreenUiState();
        const deal = this.dealHandsWithValidation();
        this.hands = deal.hands;
        this.boneyard = deal.boneyard;
        debugLog('[startDeal] Hands dealt, boneyard:', this.boneyard.length);
        if(this.lastDealWinner!==null){
            const fp=this.lastDealWinner;
            this.currentPlayer=fp; this.renderState();
            this.startTurnTimer();
            debugLog('[startDeal] Last deal winner starts:', fp);
            const displayName = this.getPlayerDisplayName(fp);
            this.showTimedRoundStage({
                phase: 'opening-turn',
                title: this.t('stage-last-winner-starts') || 'Победитель прошлой раздачи начинает',
                subtitle: displayName,
                blocksInput: false
            }, 2000);
            this.broadcastMsg(this.format('msg-last-winner-starts', { player: this.playerNames[fp] }),2000);
            this.queueAITurnIfNeeded(BOT_THINK_DELAY_MS, turnCycleId);
        }else{
            const f = this.ruleset.determineFirstPlayer(this.hands);
            let fp = f.player;
            let fi = f.tileIndex;
            if (f?.drawToOpen && this.mode === 'classic101' && typeof this.ruleset.drawToOpen === 'function') {
                const drawResult = this.ruleset.drawToOpen({
                    hands: this.hands,
                    boneyard: this.boneyard,
                    startPlayer: 0
                });
                fp = Number.isInteger(Number(drawResult.player)) ? Number(drawResult.player) : 0;
                fi = Number.isInteger(Number(drawResult.tileIndex)) ? Number(drawResult.tileIndex) : 0;
            }
            if (!this.hands[fp] || !this.hands[fp][fi]) {
                fp = 0;
                fi = 0;
            }
            const tile = this.hands[fp][fi];
            this.currentPlayer=fp; this.renderState();
            debugLog('[startDeal] First player determined:', fp);
            this.broadcastMsg(this.format('msg-first-turn', { player: this.playerNames[fp] }),2000);
            
            // Show "Finding first move..."
            this.setRoundStage({
                phase: 'search-opening',
                title: this.t('stage-search-opening') || 'Ищем первый ход...',
                blocksInput: true
            });
            
            this.roundStageTimer = setTimeout(() => {
                if (turnCycleId !== this._turnCycleId) return;
                
                const reason = this.describeOpeningReason(tile);
                const tileStr = this.describeTile(tile);
                const pName = this.getPlayerDisplayName(fp);
                
                this.setRoundStage({
                    phase: 'opening-turn',
                    title: this.format('stage-opening-turn-desc', { player: pName }) || `Первый ход: ${pName}`,
                    subtitle: `${tileStr} (${reason})`,
                    blocksInput: true
                });
                
                this.roundStageTimer = setTimeout(() => {
                    if (turnCycleId !== this._turnCycleId) return;
                    
                    this.clearRoundStage();
                    this.startTurnTimer();
                    this.turnInProgress = false;
                    
                    if (fp === this.humanPlayerIndex) {
                        this.openingRequiredPlayerIndex = fp;
                        this.openingRequiredTileIndex = fi;
                        this.openingRequiredTileId = tile.id;
                        this.renderState();
                        
                        this.setRoundStage({
                            phase: 'opening-you',
                            title: this.t('stage-opening-you') || 'Вы начинаете',
                            subtitle: this.format('stage-opening-required', { tile: tileStr }) || `Поставьте ${tileStr}`,
                            tile: tile,
                            blocksInput: false
                        });
                    } else {
                        this.renderState();
                        this.setRoundStage({
                            phase: 'opening-ai',
                            title: this.format('stage-opening-ai-desc', { player: pName }) || `${pName} начинает`,
                            subtitle: `Поставит ${tileStr}`,
                            tile: tile,
                            blocksInput: true
                        });
                        
                        this.roundStageTimer = setTimeout(() => {
                            if (turnCycleId !== this._turnCycleId) return;
                            this.clearRoundStage();
                            this.playTile(fp, fi, -1);
                        }, 1500);
                    }
                }, 1500);
            }, 1200);
        }
    }

    get turnInProgress() { return this._turnInProgress; }
    set turnInProgress(v) { this._turnInProgress = v; if (v) this.lastTurnStartTime = Date.now(); }

    getTeam(i){return i%2;}
    getTeamMembers(teamIndex) {
        const limit = Math.min(this.playerCount || 0, this.playerNames.length, this.hands.length);
        const members = [];
        for (let i = 0; i < limit; i++) {
            if (this.getTeam(i) === teamIndex) members.push(i);
        }
        return members;
    }
    getTeamDisplayName(teamIndex) {
        const teamHud = this.getRoomTeamHudState(this.currentRoomState);
        const team = Array.isArray(teamHud?.teams) ? teamHud.teams[teamIndex] : null;
        const names = Array.isArray(team?.names) ? team.names.filter(Boolean) : [];
        if (names.length) return names.join('\n');
        const members = this.getTeamMembers(teamIndex);
        const fallbackNames = members.map((i) => this.playerNames[i] || `Player ${i + 1}`);
        if (fallbackNames.length) return fallbackNames.join('\n');
        return teamIndex === 0 ? this.t('team-a') : this.t('team-b');
    }
    getTeamHandPoints(teamIndex) {
        return this.getTeamMembers(teamIndex).reduce((total, i) => total + this.ruleset.handPoints(this.hands[i] || []), 0);
    }
    getOpeningScoreContext(pi) {
        if (this.isTeamMode) {
            return Number(this.teamScores[this.getTeam(pi)] || 0);
        }
        return Number(this.scores[pi] || 0);
    }
    shouldRedealOpeningHands(hands = []) {
        return (Array.isArray(hands) ? hands : []).some((hand) => this.ruleset.needsRedeal(hand));
    }
    dealHandsWithValidation() {
        const hs = this.ruleset.getHandSize(this.playerCount);
        let hands = [];
        let boneyard = [];
        let attempts = 0;
        do {
            const all = shuffle(createFullSet());
            hands = [];
            let idx = 0;
            for (let p = 0; p < this.playerCount; p++) {
                hands.push(all.slice(idx, idx + hs));
                idx += hs;
            }
            boneyard = all.slice(idx);
            attempts += 1;
        } while (this.shouldRedealOpeningHands(hands) && attempts < 128);
        return { hands, boneyard };
    }
    getTeamLeftoverHands(teamIndex) {
        return this.getTeamMembers(teamIndex).map((i) => this.hands[i] || []);
    }
    isPlayerInTeam(teamIndex, playerIndex) {
        return this.getTeamMembers(teamIndex).includes(playerIndex);
    }
    getHumanHandForRender() {
        if (this.network?.isMultiplayer) {
            return this.myHand || this.hands[this.humanPlayerIndex] || [];
        }
        return this.hands[this.humanPlayerIndex] || [];
    }
    renderState() {
        this.renderer.removeArrows();
        const resolvedRoomMode = this.resolveRoomModeState(this.currentRoomState, null);
        this.isTeamMode = resolvedRoomMode.isTeamMode;
        this._resolvedRoomModeFromState = resolvedRoomMode.roomModeFromState || '';
        this._resolvedScoreMode = resolvedRoomMode.scoreMode || '';
        this._resolvedTopHudMode = resolvedRoomMode.topHudMode || '';
        const isTeamMode = resolvedRoomMode.isTeamMode;
        const teamHud = this.setTeamHudDebugState(this.currentRoomState, 'renderState');
        if (this.gameActive) {
            document.getElementById('round-end-screen')?.classList.remove('active');
        }
        let displayEntities;
        if (isTeamMode) {
            displayEntities = [
                { name: this.getTeamDisplayName(0), score: this.teamScores[0], roundWins: this.teamRoundWins[0], isCurrent: this.isPlayerInTeam(0, this.currentPlayer), index: this.getTeamMembers(0).includes(this.currentPlayer) ? this.currentPlayer : -1, playerId: String(teamHud?.teams?.[0]?.members?.find((member) => Boolean(member?.playerId) && !member?.isEmpty)?.playerId || '').trim(), isBot: Boolean(teamHud?.teams?.[0]?.members?.find((member) => Boolean(member?.isBot))) },
                { name: this.getTeamDisplayName(1), score: this.teamScores[1], roundWins: this.teamRoundWins[1], isCurrent: this.isPlayerInTeam(1, this.currentPlayer), index: this.getTeamMembers(1).includes(this.currentPlayer) ? this.currentPlayer : -1, playerId: String(teamHud?.teams?.[1]?.members?.find((member) => Boolean(member?.playerId) && !member?.isEmpty)?.playerId || '').trim(), isBot: Boolean(teamHud?.teams?.[1]?.members?.find((member) => Boolean(member?.isBot))) }
            ];
        } else {
            displayEntities = this.playerNames.map((n,i) => ({
                name: n,
                score: this.scores[i],
                roundWins: this.roundWins[i],
                isCurrent: this.currentPlayer === i,
                index: i,
                playerId: String(this.roomPlayerRefs?.[i]?.playerId || this.roomPlayerRefs?.[i]?.userId || this.roomPlayerRefs?.[i]?.id || '').trim(),
                isBot: Boolean(this.roomPlayerRefs?.[i]?.isBot)
            }));
        }
        this.renderer.renderScores(displayEntities, this.currentPlayer);
        this.renderer.renderInfo(this.matchRound, this.deal, this.boneyard.length, this.board.getOpenEndsScore(), this.getCurrentStakeLabel());
        this.syncMoveHintSelectionUiState();
        const waitingOpenRoom = this.isWaitingInOpenRoom(this.currentRoomState);
        const roundInfo = document.getElementById('round-info');
        const boneyardInfo = document.getElementById('boneyard-info');
        if (roundInfo) {
            if (waitingOpenRoom) {
                const seats = Number(this.currentRoomState?.humanSeats || this.currentRoomState?.totalPlayers || this.playerCount || 0);
                const joined = Number(this.currentRoomState?.humanPlayers || 0);
                roundInfo.textContent = this.format('room-waiting-open', { joined, seats });
                roundInfo.classList.remove('is-hidden');
            } else {
                roundInfo.textContent = '';
                roundInfo.classList.add('is-hidden');
            }
        }
        if (boneyardInfo) {
            if (waitingOpenRoom) {
                boneyardInfo.textContent = this.t('room-waiting-more-players');
                boneyardInfo.classList.remove('is-hidden');
            } else {
                boneyardInfo.textContent = '';
                boneyardInfo.classList.add('is-hidden');
            }
        }
        this.syncOpenRoomWaitingBanner(this.currentRoomState);
        
        this.renderer.renderBoard(this.board);
        this.syncGameScreenUiState();
        const roomPlayers = Array.isArray(this.currentRoomState?.players) ? this.currentRoomState.players : [];
        this.renderer.renderOpponentHands(this.hands, this.humanPlayerIndex, roomPlayers.length ? roomPlayers : this.playerNames, this.currentPlayer);
        const myHand = this.getHumanHandForRender();
        if (!this.network.isMultiplayer) {
            this.validMoves = this.board.getValidMoves(myHand);
        }
        const myTurn = this.currentPlayer === this.humanPlayerIndex;
        const localBotControlled = this.isLocalSeatBotControlled();
        this.renderer.renderHand(myHand, this.validMoves, this.selectedTileIndex, myTurn && !localBotControlled);

        const canPlay = this.board.canPlayAny(this.normalizeHandForBoard(myHand));
        const emptyBoneyard = this.boneyard.length === 0;
        const connectionLost = Boolean(this.network?.isMultiplayer) && (
            !this.network?.isRoomConnectionOpen?.() || this.networkActionBlockedForReconnect
        );
        this.renderer.drawBtn.disabled = connectionLost || waitingOpenRoom || !myTurn || localBotControlled || canPlay || emptyBoneyard || this.postMoveWindowActive || this.turnInProgress || this.lastMoveRevealPending;
        this.renderer.passBtn.disabled = connectionLost || waitingOpenRoom || !myTurn || localBotControlled || canPlay || !emptyBoneyard || this.postMoveWindowActive || this.turnInProgress || this.lastMoveRevealPending;

        this.goshaCombo = (this.gameActive && myTurn && !localBotControlled && this.mode !== 'classic101') ? this.board.getGoshaCombo(myHand) : null;
        this.renderer.showGoshaBtn(this.goshaCombo, () => this.playGoshaCombo());
        this.updateTurnTimerHud();
        this.syncBotTakeoverUiState(this.currentRoomState);
        void this.syncLocalPresence();
        this.persistGameResumeSnapshot();
    }

    playSound(name) {
        if (name==='place') sndPlace();
        if (name==='score') sndScore();
        if (name==='draw') sndDraw();
        if (name==='pass') sndPass();
        if (name==='win') sndWin();
        if (name==='gosha') sndGosha();
    }

    broadcastMsg(text, time) {
        this.renderer.showMessage(text, time);
    }

    getUiTextOverride(key) {
        const overrides = {
            "game-title": { az: "Domino", en: "Domino" },
            "game-subtitle": { az: "Azerbaijani Domino", en: "Azerbaijani Domino" },
            "label-players": { az: "Players", en: "Players" },
            "label-difficulty": { az: "Difficulty", en: "Difficulty" },
            "label-name": { az: "Name", en: "Name" },
            "label-instant-win": { az: "35 points = match ends", en: "35 points = match ends" },
            "label-dloss": { az: "Loss threshold", en: "Loss threshold" },
            "label-rules": { az: "Rules", en: "Rules" },
            "rule-match": { az: "365 points · 3 rounds", en: "365 points · 3 rounds" },
            "rule-telephone": { az: "Telephone · [3|2]", en: "Telephone · [3|2]" },
            "btn-start": { az: "Solo play", en: "Solo play" },
            "btn-solo-start": { az: "Start", en: "Start" },
            "label-online": { az: "Bağlı otaqlar", en: "Private rooms" },
            "label-online-help": { az: "Create a room or join with a code", en: "Create a room or join with a code" },
            "label-online-players": { az: "Room size", en: "Room size" },
            "label-ai-slots": { az: "AI slots", en: "AI slots" },
            "label-mode": { az: "Mode", en: "Mode" },
            "mode-ffa": { az: "Free for all", en: "Free for all" },
            "mode-team": { az: "2 vs 2", en: "2 vs 2" },
            "label-round-short": { az: "R", en: "R" },
            "label-deal-short": { az: "D", en: "D" },
            "label-boneyard-short": { az: "Bazaar", en: "Bazaar" },
            "summary-coins": { az: "Coinlər", en: "Coins" },
            "summary-won": { az: "Qazanılan", en: "Won" },
            "summary-lost": { az: "İtirilən", en: "Lost" },
            "summary-net": { az: "Fərq", en: "Net" },
            "label-economy-mode": { az: "Game mode", en: "Game mode" },
            "label-stake-table": { az: "Mərc masası", en: "Stake table", ru: "Стол ставок" },
            "label-stake-short": { az: "Bank", en: "Bank" },
            "economy-free": { az: "Free play", en: "Free play" },
            "economy-coins": { az: "Play on coins", en: "Play on coins" },
            "btn-host": { az: "Create", en: "Create" },
            "btn-join": { az: "Join", en: "Join" },
            "btn-draw": { az: "Draw", en: "Draw" },
            "btn-pass": { az: "Pass", en: "Pass" },
            "btn-reactions": { az: "Reactions", en: "Reactions" },
            "room-visibility-closed": { az: "Bağlı otaq", en: "Closed room", ru: "Закрытая комната" },
            "room-visibility-open": { az: "Açıq otaq", en: "Open room", ru: "Открытая комната" },
            "menu-title": { az: "Menu", en: "Menu" },
            "menu-resume": { az: "Resume", en: "Resume" },
            "menu-new": { az: "New game", en: "New game" },
            "menu-quit": { az: "Quit", en: "Quit" },
            "modal-close": { az: "Close", en: "Close" },
            "solo-modal-title": { az: "Solo play", en: "Solo play" },
            "solo-modal-desc": { az: "Pick difficulty, player count and game mode.", en: "Pick difficulty, player count and game mode." },
            "online-modal-title": { az: "Bağlı otaqlar", en: "Private rooms" },
            "online-modal-desc": { az: "Bağlı otaq yaradın və ya kodla qoşulun.", en: "Create a private room or join with a code." },
            "online-choice-create": { az: "Otaq yarat", en: "Create", ru: "Создать" },
            "online-choice-connect": { az: "Qoşul", en: "Join", ru: "Подключиться" },
            "account-btn": { az: "Account", en: "Account" },
            "account-kicker": { az: "Profile", en: "Profile" },
            "account-title": { az: "Account", en: "Account" },
            "account-desc": { az: "Reytinqi və tarixçəni saxla.", en: "Keep your rating and match history." },
            "account-name": { az: "Name", en: "Name" },
            "account-password": { az: "Password", en: "Password" },
            "account-create-account": { az: "Create account", en: "Create account" },
            "account-register": { az: "Register", en: "Register" },
            "account-login": { az: "Sign in", en: "Sign in" },
            "account-login-tab": { az: "Sign in", en: "Sign in" },
            "account-register-tab": { az: "Register", en: "Register" },
            "account-google": { az: "Continue with Google", en: "Continue with Google" },
            "account-auth-kicker": { az: "Sign in", en: "Sign in" },
            "account-auth-title": { az: "Sign in to your account", en: "Sign in to your account" },
            "account-auth-desc": { az: "Use your account to keep rating, match history and Google login.", en: "Use your account to keep rating, match history and Google login." },
            "account-profile": { az: "Profile", en: "Profile" },
            "account-history": { az: "Recent games", en: "Recent games" },
            "account-profile-loading": { az: "Loading profile...", en: "Loading profile..." },
            "account-profile-empty": { az: "No profile yet", en: "No profile yet" },
            "account-leaderboard": { az: "Leaderboard", en: "Leaderboard" },
            "account-rating": { az: "Reyting", en: "Rating" },
            "account-rank": { az: "Reyting", en: "Rating" },
            "account-points": { az: "Points", en: "Points" },
            "account-coins": { az: "Coin", en: "Coins" },
            "account-wins": { az: "Qələbələr", en: "Wins" },
            "account-losses": { az: "Losses", en: "Losses" },
            "account-draws": { az: "Draws", en: "Draws" },
            "account-matches": { az: "Oyunlar", en: "Games" },
            "account-refresh": { az: "Refresh", en: "Refresh" },
            "account-logout": { az: "Logout", en: "Logout" },
            "account-online": { az: "Server connected", en: "Server connected" },
            "account-offline": { az: "Server unavailable", en: "Server unavailable" },
            "account-history-empty": { az: "No match history yet", en: "No match history yet" },
            "account-history-win": { az: "Win", en: "Win" },
            "account-history-loss": { az: "Loss", en: "Loss" },
            "account-history-draw": { az: "Draw", en: "Draw" },
            "account-server-unavailable": { az: "Server unavailable", en: "Server unavailable" },
            "account-registration-required": { az: "Coin oyunu üçün hesaba daxil olun və ya qeydiyyatdan keçin", en: "Sign in or register to play coin matches" },
            "account-registration-required-online": { az: "Onlayn coin otaqları üçün hesab mütləqdir", en: "An account is required for online coin rooms" },
            "title-rookie": { az: "Rookie", en: "Rookie" },
            "title-bronze": { az: "Bronze", en: "Bronze" },
            "title-silver": { az: "Silver", en: "Silver" },
            "title-gold": { az: "Gold", en: "Gold" },
            "title-platinum": { az: "Platinum", en: "Platinum" },
            "title-diamond": { az: "Diamond", en: "Diamond" },
            "title-master": { az: "Master", en: "Master" },
            "title-legend": { az: "Legend", en: "Legend" },
            "placeholder-player-name": { az: "Enter your name", en: "Enter your name" },
            "online-room-status-created": { az: "Creating room...", en: "Creating room..." },
            "online-room-status-waiting": { az: "Waiting for players", en: "Waiting for players" },
            "online-room-status-ready": { az: "Room is ready", en: "Room is ready" },
            "online-room-status-connecting": { az: "Connecting...", en: "Connecting..." },
            "online-room-status-joined": { az: "Connected. Waiting for the room to fill", en: "Connected. Waiting for the room to fill" },
            "online-room-status-error": { az: "Error", en: "Error" },
            "online-room-cancel": { az: "Cancel", en: "Cancel" },
            "online-room-back": { az: "Back", en: "Back" },
            "online-room-code-placeholder": { az: "ABCD", en: "ABCD" },
            "online-room-create-hint": { az: "Share the room code with a friend", en: "Share the room code with a friend" },
            "online-room-join-hint": { az: "Enter a room code to connect", en: "Enter a room code to connect" },
            "online-room-code": { az: "Room code", en: "Room code" },
            "online-room-share": { az: "Share", en: "Share" },
            "online-room-share-title": { az: "Domino room invite", en: "Domino room invite" },
            "online-room-share-message": { az: "Join my Domino room. Code: {code}. Link: {url}", en: "Join my Domino room. Code: {code}. Link: {url}" },
            "online-room-share-opened": { az: "Share sheet opened", en: "Share sheet opened" },
            "online-room-share-copied": { az: "Invite link copied", en: "Invite link copied" },
            "online-room-share-fail": { az: "Share failed", en: "Share failed" },
            "online-you": { az: "you", en: "you" },
            "online-ready": { az: "ready", en: "ready" },
            "online-offline": { az: "offline", en: "offline" },
            "bot-takeover-playing": { az: "AI Bot oynayır", en: "AI Bot is playing", ru: "Играет AI-бот" },
            "bot-takeover-return-control": { az: "Oyuna qayıt", en: "Return to game", ru: "Вернуться в игру" },
            "bot-takeover-active": { az: "AI Bot Oynayır", en: "AI Bot is playing", ru: "Играет AI-бот" },
            "bot-takeover-you-back": { az: "Yenidən oyundasınız.", en: "You are back in the game.", ru: "Вы снова в игре." },
            "bot_takeover": { az: "{name} ayrıldı, indi onun yerinə bot oynayır", en: "{name} left, a bot is now playing", ru: "{name} выбыл, теперь за него играет бот" },
            "bot_resume": { az: "{name} qayıtdı, bot oyundan çıxdı", en: "{name} returned, the bot stepped away", ru: "{name} вернулся, бот уступил место" },
            "bot-takeover-all-absent": { az: "Bütün oyunçular oyundan ayrıldı. Matç heç-heçə bağlandı və stavkalar qaytarıldı.", en: "All players were absent. The match ended in a draw and stakes were refunded.", ru: "Все игроки отсутствовали. Матч завершён вничью, ставки возвращены." },
            "online-waiting-slot": { az: "Waiting for player {index}", en: "Waiting for player {index}" },
            "online-room-closed": { az: "Room closed", en: "Room closed" },
            "online-room-summary": { az: "{humans} humans + {bots} AI, {total} total", en: "{humans} humans + {bots} AI, {total} total" },
            "online-bot-slot": { az: "AI {index}", en: "AI {index}" },
            "resume-session-kicker": { az: "Yarımçıq sessiya", en: "Unfinished session", ru: "Незавершённая сессия" },
            "resume-session": { az: "Davam et", en: "Resume", ru: "Продолжить" },
            "resume-session-return": { az: "Oyuna qayt", en: "Return to game", ru: "Вернуться в игру" },
            "resume-session-title": { az: "Yarımçıq sessiyanı davam etdir", en: "Continue your unfinished session", ru: "Продолжить незавершённую сессию" },
            "resume-session-desc": { az: "Yarımda qalan oyunu eyni yerdən davam etdirə bilərsiniz.", en: "You can pick up the game from where you left off.", ru: "Можно продолжить игру с того же места." },
            "resume-session-online-title": { az: "Onlayn sessiyanız yarımçıq qalıb", en: "Your online session is unfinished", ru: "Ваша онлайн-сессия не завершена" },
            "resume-session-offline-title": { az: "Oyun yarımçıq qalıb", en: "Your offline game is unfinished", ru: "Игра не завершена" },
            "resume-session-online-desc": { az: "Otağa geri qayıdıb həmin matçı davam etdirin.", en: "Reconnect and continue the same match.", ru: "Вернитесь в комнату и продолжите тот же матч." },
            "resume-session-offline-desc": { az: "Yarımçıq oyunu eyni yerdən davam etdirin.", en: "Resume the game from the same point.", ru: "Продолжите игру с того же места." },
            "round-end-next": { az: "Continue", en: "Continue" },
            "new-game-btn": { az: "New game", en: "New game" },
            "summary-title": { az: "Summary", en: "Summary" }
        };
        const lang = translations[this.currentLang] ? this.currentLang : 'az';
        if (translations[lang]?.[key] ?? translations.en?.[key] ?? translations.az?.[key]) {
            return null;
        }
        return overrides[key]?.[lang] || overrides[key]?.en || null;
    }

    setLanguage(lang) {
        const nextLang = translations[lang] ? lang : (translations[this.currentLang] ? this.currentLang : 'az');
        this.currentLang = nextLang;
        const t = translations[nextLang] || translations.az;
        try {
            localStorage.setItem('domino-lang', nextLang);
        } catch {}
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            const value = t[key] || translations.en?.[key] || translations.az?.[key] || key;
            if (value) {
                if (el.tagName === 'INPUT') el.placeholder = value;
                else {
                    el.textContent = value;
                    if (el.id === 'menu-btn') el.title = value;
                }
            }
        });
        const reactionBtn = document.getElementById('reaction-btn');
        if (reactionBtn) {
            const reactionLabel = t['btn-reactions'] || 'Reactions';
            reactionBtn.title = reactionLabel;
            reactionBtn.setAttribute('aria-label', reactionLabel);
        }
        const giftBtn = document.getElementById('gift-btn');
        if (giftBtn) {
            const giftLabel = t['gift-button'] || 'Gifts';
            giftBtn.title = giftLabel;
            giftBtn.setAttribute('aria-label', giftLabel);
        }
        const openRoomsModalClose = document.getElementById('open-rooms-modal-close');
        if (openRoomsModalClose) {
            const closeLabel = t['open-rooms-close'] || translations.en?.['open-rooms-close'] || translations.az?.['open-rooms-close'] || 'Close';
            openRoomsModalClose.title = closeLabel;
            openRoomsModalClose.setAttribute('aria-label', closeLabel);
        }
        const openRoomsCreateBtn = document.getElementById('open-rooms-create-btn');
        if (openRoomsCreateBtn) {
            const createLabel = t['open-rooms-create'] || translations.en?.['open-rooms-create'] || translations.az?.['open-rooms-create'] || 'Create';
            openRoomsCreateBtn.title = createLabel;
            openRoomsCreateBtn.setAttribute('aria-label', createLabel);
        }
        document.querySelectorAll('.btn-lang').forEach(b => {
            b.classList.toggle('active', b.dataset.lang === nextLang);
        });
        this.syncAccountUiChrome();
        this.ensureShopIconMarkup();
        this.syncStartAuthButton();
        this.syncStartLanguageSelect();
        this.syncVoiceUi();
        this.renderGiftPicker();
        this.renderGiftInventory();
        if (document.getElementById('coin-shop-modal')?.classList.contains('active')) {
            this.renderCoinShopModal();
        }
        this.refreshResumeBanner();
        document.documentElement.lang = nextLang;
        this.renderDailyBonusCard();
        this.syncStartModeUI();
    }

    t(key) {
        return translations[this.currentLang]?.[key]
            || translations.en?.[key]
            || translations.az?.[key]
            || key;
    }

    loadSavedLanguage() {
        try {
            const saved = localStorage.getItem('domino-lang');
            if (translations[saved]) return saved;
        } catch {}
        return 'az';
    }

    loadPreferredStartMode() {
        try {
            const saved = localStorage.getItem('domino:preferredMode');
            if (saved === 'telefon' || saved === 'classic101') {
                return saved;
            }
        } catch {}
        return 'telefon';
    }

    savePreferredStartMode(mode) {
        try {
            localStorage.setItem('domino:preferredMode', mode);
        } catch {}
    }

    setPreferredStartMode(mode, { persist = true } = {}) {
        const nextMode = mode === 'classic101' ? 'classic101' : 'telefon';
        if (nextMode === this.preferredStartMode || this.startModeFlipLocked) return;
        this.preferredStartMode = nextMode;
        this.leaderboardGameMode = nextMode;
        if (persist) this.savePreferredStartMode(nextMode);
        this.startModeFlipLocked = true;
        if (this.startModeFlipUnlockTimer) {
            clearTimeout(this.startModeFlipUnlockTimer);
            this.startModeFlipUnlockTimer = null;
        }
        const heroStage = document.getElementById('start-mode-stage');
        const releaseLock = () => {
            if (this.startModeFlipUnlockTimer) {
                clearTimeout(this.startModeFlipUnlockTimer);
                this.startModeFlipUnlockTimer = null;
            }
            heroStage?.classList.remove('is-flipping');
            this.startModeFlipLocked = false;
        };
        const flipDurationMs = 450;
        if (heroStage) {
            requestAnimationFrame(() => heroStage.classList.add('is-flipping'));
            this.startModeFlipUnlockTimer = window.setTimeout(releaseLock, flipDurationMs);
        } else {
            this.startModeFlipUnlockTimer = window.setTimeout(releaseLock, flipDurationMs);
        }
        this.syncStartModeUI();
        if (document.getElementById('account-modal')?.classList.contains('active')) {
            void this.loadAccountProfile(nextMode);
        }
        if (document.getElementById('leaderboard-modal')?.classList.contains('active')) {
            this.syncLeaderboardModeUI(nextMode);
            void this.loadLeaderboard(this.leaderboardScope || 'overall', this.getSelectedGameMode());
        }
    }

    syncStartModeUI() {
        const startScreen = document.getElementById('start-screen');
        if (!startScreen) return;
        const mode = this.preferredStartMode === 'classic101' ? 'classic101' : 'telefon';
        const lang = translations[this.currentLang] ? this.currentLang : 'az';
        const t = translations[lang] || translations.az;
        const modeLabelKey = mode === 'classic101' ? 'mode-switch-101' : 'mode-switch-telefon';
        const modeTitleKey = mode === 'classic101' ? 'game-title-101' : 'game-title-telefon';
        const modeSubtitleKey = mode === 'classic101' ? 'game-subtitle-101' : 'game-subtitle-telefon';
        const ratingLabel = this.format('start-mode-rating', { mode: t[modeLabelKey] || translations.en?.[modeLabelKey] || translations.az?.[modeLabelKey] || (mode === 'classic101' ? '101' : 'Telefon') });
        const title = this.t(modeTitleKey);
        const subtitle = this.t(modeSubtitleKey);
        const soonLabel = ENABLE_MODE_101 ? '' : this.t('mode-soon');
        const leaderboardButtonLabel = this.t('leaderboard-title');

        document.documentElement.dataset.dominoStartMode = mode;
        this.onlineRoomFilters.gameMode = mode;
        startScreen.classList.toggle('mode-classic101', mode === 'classic101');
        startScreen.classList.toggle('mode-telefon', mode !== 'classic101');

        const heroStage = document.getElementById('start-mode-stage');
        if (heroStage) {
            heroStage.classList.toggle('is-flipped', mode === 'classic101');
        }

        const faces = startScreen.querySelectorAll('.start-hero-face');
        faces.forEach((face) => {
            const faceMode = String(face.dataset.modeFace || 'telefon').trim();
            const active = faceMode === mode;
            face.setAttribute('aria-hidden', String(!active));
            face.toggleAttribute('inert', !active);
        });

        startScreen.querySelectorAll('[data-mode-toggle]').forEach((button) => {
            const buttonMode = String(button.dataset.modeToggle || '').trim();
            const active = buttonMode === mode;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });

        startScreen.querySelectorAll('[data-mode-text="rating"]').forEach((node) => {
            node.textContent = ratingLabel;
        });
        startScreen.querySelectorAll('[data-mode-text="title"]').forEach((node) => {
            node.textContent = title;
        });
        startScreen.querySelectorAll('[data-mode-text="subtitle"]').forEach((node) => {
            node.textContent = subtitle;
        });
        startScreen.querySelectorAll('[data-mode-text="status"]').forEach((node) => {
            const showSoon = mode === 'classic101' && Boolean(soonLabel);
            node.textContent = showSoon ? soonLabel : '';
            node.classList.toggle('is-hidden', !showSoon);
        });

        const openLeaderboardBtn = document.getElementById('open-leaderboard-btn');
        if (openLeaderboardBtn) {
            openLeaderboardBtn.textContent = leaderboardButtonLabel;
            openLeaderboardBtn.title = leaderboardButtonLabel;
            openLeaderboardBtn.setAttribute('aria-label', leaderboardButtonLabel);
        }

        const startScreenHero = document.getElementById('start-mode-hero');
        if (startScreenHero) {
            startScreenHero.classList.toggle('is-mode-classic101', mode === 'classic101');
        }
        if (document.getElementById('open-rooms-modal')?.classList.contains('active')) {
            void this.loadOpenRooms();
        }
    }

    getSoloStartMode() {
        return ENABLE_MODE_101 && this.preferredStartMode === 'classic101' ? 'classic101' : 'telefon';
    }

    getSelectedGameMode() {
        return this.preferredStartMode === 'classic101' ? 'classic101' : 'telefon';
    }

    cloneMatchRuleState(matchState) {
        if (!matchState || typeof matchState !== 'object') return null;
        try {
            return JSON.parse(JSON.stringify(matchState));
        } catch {
            return null;
        }
    }

    syncClassic101ScoreState(matchState = this.matchRuleState) {
        if (this.mode !== 'classic101') return;
        if (!this.ruleset || typeof this.ruleset.normalizeMatchState !== 'function') return;
        const normalized = this.ruleset.normalizeMatchState(matchState || this.ruleset.createMatchState?.(this.playerCount, this.isTeamMode), this.playerCount, this.isTeamMode);
        this.matchRuleState = normalized;
        const scoreboard = this.ruleset.getScoreboard?.(normalized, this.isTeamMode, this.playerCount)
            || (this.isTeamMode
                ? {
                    teamScores: [Number(normalized.sides?.[0]?.scored || 0), Number(normalized.sides?.[1]?.scored || 0)],
                    scores: Array.from({ length: Math.max(0, Number(this.playerCount) || 0) }, (_, index) => (index % 2 === 0 ? Number(normalized.sides?.[0]?.scored || 0) : Number(normalized.sides?.[1]?.scored || 0)))
                }
                : {
                    teamScores: null,
                    scores: Array.isArray(normalized.sides) ? normalized.sides.map((side) => Number(side?.scored || 0)) : []
                });
        if (this.isTeamMode) {
            this.teamScores = Array.isArray(scoreboard.teamScores) ? scoreboard.teamScores.slice(0, 2) : [0, 0];
            this.scores = Array.from({ length: this.playerCount }, (_, index) => Number(this.teamScores[index % 2] || 0));
        } else {
            this.scores = Array.isArray(scoreboard.scores) ? scoreboard.scores.slice(0, this.playerCount) : new Array(this.playerCount).fill(0);
            this.teamScores = [0, 0];
        }
    }

    syncClassic101MatchStateFromNetwork(payload = {}) {
        if (this.mode !== 'classic101') {
            this.matchRuleState = null;
            return;
        }
        let networkMatchState = payload?.matchState ?? payload?.matchStateJson ?? payload?.state?.matchStateJson ?? payload?.state?.matchState ?? null;
        if (typeof networkMatchState === 'string') {
            try {
                networkMatchState = JSON.parse(networkMatchState);
            } catch {
                networkMatchState = null;
            }
        }
        this.matchRuleState = this.ruleset.normalizeMatchState?.(
            networkMatchState || this.ruleset.createMatchState?.(this.playerCount, this.isTeamMode) || null,
            this.playerCount,
            this.isTeamMode
        ) || null;
        this.syncClassic101ScoreState(this.matchRuleState);
    }

    format(key, values = {}) {
        return this.t(key).replace(/\{(\w+)\}/g, (_, token) => values[token] ?? `{${token}}`);
    }

    resolveUiMessage(payload) {
        if (!payload || typeof payload !== 'object') {
            return String(payload || '');
        }
        if (payload.key) {
            return this.format(String(payload.key), payload.values || {});
        }
        return String(payload.text || '');
    }

    resolveUiReason(payload) {
        if (!payload || typeof payload !== 'object') {
            return String(payload || '');
        }
        if (payload.reasonKey) {
            return this.format(String(payload.reasonKey), payload.values || {});
        }
        return String(payload.reason || '');
    }

    setRoundStage(stage = {}) {
        if (this.roundStageTimer) {
            clearTimeout(this.roundStageTimer);
            this.roundStageTimer = null;
        }
        this.roundStage = stage;
        if (stage.phase) {
            this.lastShownStageKey = stage.phase;
        }
        this.renderer.renderRoundStage(stage);
    }

    clearRoundStage(expectedPhase = '') {
        if (expectedPhase && this.roundStage?.phase !== expectedPhase) {
            return;
        }
        if (this.roundStageTimer) {
            clearTimeout(this.roundStageTimer);
            this.roundStageTimer = null;
        }
        this.roundStage = null;
        this.renderer.clearRoundStage();
    }

    showTimedRoundStage(stage, duration = 1200) {
        this.setRoundStage(stage);
        this.roundStageTimer = setTimeout(() => {
            this.clearRoundStage(stage.phase);
        }, duration);
    }

    isInputBlockedByStage() {
        if (this.lastMoveRevealPending) return true;
        if (this.roundStage) {
            if (this.roundStage.blocksInput) return true;
            if (this.roundStage.phase === 'final-move') return true;
            if (this.roundStage.phase === 'counting') return true;
        }
        if (this.pendingOnlineAction) return true;
        if (this.pendingReconnectResolution) return true;
        return false;
    }

    getPlayerDisplayName(playerIndex) {
        if (this.isTeamMode) {
            return this.getTeamDisplayName(this.getTeam(playerIndex));
        }
        return this.playerNames[playerIndex] || `Player ${playerIndex + 1}`;
    }

    getPlayerRole(playerIndex) {
        if (playerIndex === this.humanPlayerIndex) return 'self';
        if (this.isTeamMode && this.getTeam(playerIndex) === this.getTeam(this.humanPlayerIndex)) {
            return 'teammate';
        }
        const isBot = this.network?.isMultiplayer
            ? Boolean(this.currentRoomState?.players?.[playerIndex]?.isBot)
            : true;
        return isBot ? 'bot' : 'opponent';
    }

    describeTile(tile) {
        if (!tile) return '';
        return `[${tile.a}|${tile.b}]`;
    }

    describeOpeningReason(tile) {
        if (!tile) return '';
        if ((tile.a === 3 && tile.b === 2) || (tile.a === 2 && tile.b === 3)) {
            return '[3|2]';
        }
        if (tile.isDouble && tile.a >= 1 && tile.a <= 6) {
            return this.t('stage-opening-reason-gosha') || 'минимальная Гоша';
        }
        if (tile.isDouble && tile.a === 0) {
            return '[0|0]';
        }
        return this.t('stage-opening-reason-smallest') || 'самый маленький камень';
    }

    buildOpeningStageForLocal(firstInfo) {
        return firstInfo;
    }

    async showPreResultStage(finalInfo) {
        if (!finalInfo) return;
        const actorName = this.playerNames[finalInfo.actorIndex] || '';
        
        let title = '';
        let subtitle = '';
        
        switch (finalInfo.finishKind) {
            case 'tile':
                title = this.format('stage-final-tile-title', { player: actorName }) || `${actorName} поставил последний камень`;
                subtitle = this.t('stage-final-tile-subtitle') || 'Раунд окончен';
                break;
            case 'gosha':
                title = this.format('stage-final-gosha-title', { player: actorName }) || `${actorName} закрыл игру Гошей`;
                subtitle = this.format('stage-final-gosha-subtitle', { count: finalInfo.tileCount }) || `${finalInfo.tileCount} камня сыграны сразу`;
                break;
            case 'fish':
                title = this.t('stage-final-fish-title') || 'Рыба';
                subtitle = this.t('stage-final-fish-subtitle') || 'Подсчёт остатков';
                break;
            case 'instant_win':
            case 'instant_win_gosha':
                title = this.t('stage-final-instant-win-title') || 'Мгновенная победа';
                subtitle = this.format('stage-final-instant-win-desc', { player: actorName }) || `${actorName} набрал нужные очки`;
                break;
            case 'timeout_forfeit':
                title = this.t('timeout-forfeit-title') || `${actorName} не сделал ход вовремя`;
                subtitle = this.t('timeout-forfeit-desc-waiting') || 'Ждём, продолжит ли игрок игру';
                break;
            default:
                title = this.t('stage-final-tile-subtitle') || 'Раунд окончен';
                break;
        }

        this.setRoundStage({
            phase: 'final-move',
            title,
            subtitle,
            blocksInput: true
        });

        await new Promise(resolve => setTimeout(resolve, 200));

        this.setRoundStage({
            phase: 'counting',
            title: this.t('stage-counting') || 'Подсчёт очков...',
            blocksInput: true
        });

        await new Promise(resolve => setTimeout(resolve, 150));
        this.clearRoundStage();
    }

    inferFinalInfoFromLocalMove(pi, isGosha, isFish, isInstantWin, comboMatchesLength = 0) {
        let finishKind = 'tile';
        if (isInstantWin) {
            finishKind = isGosha ? 'instant_win_gosha' : 'instant_win';
        } else if (isGosha) {
            finishKind = 'gosha';
        } else if (isFish) {
            finishKind = 'fish';
        }
        return {
            actorIndex: pi,
            winnerIndex: isFish ? this.findFishWinner() : pi,
            finishKind,
            tileCount: isGosha ? comboMatchesLength : 1,
            fish: isFish,
            isLocal: true
        };
    }

    inferFinalInfoFromNetworkDealEnd(data) {
        if (!data) return null;
        const wi = data.winnerIndex;
        let finishKind = String(data.finishKind || '').trim() || (data.fish ? 'fish' : 'tile');
        return {
            actorIndex: wi,
            winnerIndex: wi,
            finishKind,
            tileCount: data.fish ? 0 : 1,
            fish: !!data.fish
        };
    }

    inferFinalInfoFromNetworkRoundEnd(data) {
        if (!data) return null;
        const wi = data.winnerIndex;
        let finishKind = String(data.finishKind || '').trim() || (data.isInstantWin ? 'instant_win' : 'tile');
        return {
            actorIndex: wi,
            winnerIndex: wi,
            finishKind,
            tileCount: 1,
            fish: false
        };
    }

    onNetworkRoundStage(payload = {}) {
        const phase = String(payload.phase || '');
        const blocksInput = Boolean(payload.blocksInput || phase === 'final-move' || phase === 'counting');
        
        let title = '';
        let subtitle = '';
        
        if (payload.titleKey) {
            title = this.format(payload.titleKey, payload.values || {});
        }
        if (payload.subtitleKey) {
            subtitle = this.format(payload.subtitleKey, payload.values || {});
        }
        
        if (!title && phase) {
            switch (phase) {
                case 'deal-start':
                    title = this.t('stage-deal-start') || 'Раздача карт...';
                    break;
                case 'opening-turn':
                    const actorName = payload.actorName || this.playerNames[payload.actorIndex] || `Player ${payload.actorIndex + 1}`;
                    title = this.format('stage-opening-turn-desc', { player: actorName }) || `Первый ход: ${actorName}`;
                    break;
                case 'final-move':
                    const pName = payload.actorName || this.playerNames[payload.actorIndex] || `Player ${payload.actorIndex + 1}`;
                    if (payload.finishKind === 'gosha') {
                        title = this.format('stage-final-gosha-title', { player: pName }) || `${pName} закрыл игру Гошей`;
                        subtitle = this.format('stage-final-gosha-subtitle', { count: payload.tileCount }) || `${payload.tileCount} камня сыграны сразу`;
                    } else if (payload.finishKind === 'fish') {
                        title = this.t('stage-final-fish-title') || 'Рыба';
                        subtitle = this.t('stage-final-fish-subtitle') || 'Подсчёт остатков';
                    } else if (payload.finishKind === 'instant_win' || payload.finishKind === 'instant_win_gosha') {
                        title = this.t('stage-final-instant-win-title') || 'Мгновенная победа';
                        subtitle = this.format('stage-final-instant-win-desc', { player: pName }) || `${pName} набрал нужные очки`;
                    } else {
                        title = this.format('stage-final-tile-title', { player: pName }) || `${pName} поставил последний камень`;
                        subtitle = this.t('stage-final-tile-subtitle') || 'Раунд окончен';
                    }
                    break;
                case 'counting':
                    title = this.t('stage-counting') || 'Подсчёт очков...';
                    break;
            }
        }
        
        this.setRoundStage({
            phase,
            title,
            subtitle,
            blocksInput
        });

        if (phase === 'deal-start' || (phase === 'opening-turn' && !blocksInput)) {
            setTimeout(() => {
                this.clearRoundStage(phase);
            }, 1500);
        }
    }

    shouldProcessSchemaState(state) {
        void state;
        return true;
    }

    requestRealtimeSync(reason = 'delta_desync') {
        debugLog('[CLIENT_DEBUG] realtime sync request', { reason });
        this.clearPendingOnlineAction({ rollback: false });
        this.network?.sendSyncRequest?.();
    }

    getBoardAnimationSource(actorIndex, tileId = '') {
        const boardContainer = document.getElementById('board-container');
        const fallbackRect = () => {
            const rect = boardContainer?.getBoundingClientRect?.() || null;
            if (!rect) return null;
            return {
                left: rect.left + rect.width / 2 - 33,
                top: rect.top + 10,
                width: 66,
                height: 34
            };
        };

        if (Number(actorIndex) === Number(this.humanPlayerIndex)) {
            const pendingRect = this.renderer?._pendingBoardTileTravel?.sourceRect || null;
            const pendingNode = this.renderer?._pendingBoardTileTravel?.sourceNode || null;
            if (pendingRect) {
                return { sourceRect: pendingRect, sourceNode: pendingNode };
            }
            const sourceEl = this.renderer?.handEl?.querySelector?.(`[data-tile-id="${String(tileId || '')}"]`)
                || this.renderer?.handEl?.children?.[this.selectedTileIndex] || null;
            const sourceRect = sourceEl?.getBoundingClientRect?.() || null;
            return {
                sourceRect,
                sourceNode: sourceEl?.cloneNode?.(true) || null
            };
        }

        const playerCount = Math.max(2, Number(this.playerCount || this.playerNames.length || 2));
        const relativeSeat = playerCount > 0
            ? (Number(actorIndex) - Number(this.humanPlayerIndex) + playerCount) % playerCount
            : 0;
        let container = null;
        if (playerCount === 2) {
            container = document.getElementById('opp-top');
        } else if (relativeSeat === 1) {
            container = document.getElementById('opp-left');
        } else if (relativeSeat === 2) {
            container = document.getElementById('opp-top');
        } else if (relativeSeat === 3) {
            container = document.getElementById('opp-right');
        } else {
            container = document.getElementById('opp-top');
        }

        const sourceEl = container?.querySelector?.('.opp-hand-group') || container || null;
        const sourceRect = sourceEl?.getBoundingClientRect?.() || fallbackRect();
        return {
            sourceRect,
            sourceNode: sourceEl?.cloneNode?.(true) || container?.cloneNode?.(true) || null
        };
    }

    getPlayerSourceRectForBoardAnimation(actorIndex, tileId = '') {
        return this.getBoardAnimationSource(actorIndex, tileId).sourceRect;
    }

    enqueueScorePopupAfterBoardAnimation(score) {
        const value = Number(score || 0);
        if (value > 0) {
            this.pendingScorePopupAfterBoardAnimation.push(value);
        }
    }

    flushPendingScorePopupAfterBoardAnimation() {
        if (!this.pendingScorePopupAfterBoardAnimation.length) return;
        const queue = this.pendingScorePopupAfterBoardAnimation.splice(0);
        for (const score of queue) {
            this.showScoreFeedback(score);
        }
    }

    onNetworkScorePopup(score) {
        const payload = (score && typeof score === 'object') ? score : { score };
        const value = Number(payload?.score || 0);
        const scoreSource = String(payload?.scoreSource || payload?.source || '').trim();
        if (!(value > 0)) return;
        if (scoreSource === 'hand_bonus' || scoreSource === 'deal_bonus') return;
        if (this.onlineResultActive || this.lastMoveRevealPending) {
            return;
        }
        if (this._boardAnimationActive) {
            this.enqueueScorePopupAfterBoardAnimation(value);
            this.getBoardAnimationPromise().finally(() => {
                this.flushPendingScorePopupAfterBoardAnimation();
            });
            return;
        }
        this.showScoreFeedback(value);
    }

    getBoardAnimationPromise() {
        return Promise.resolve(this._boardAnimationPromise || Promise.resolve());
    }

    trackBoardAnimationPromise(promise, context = {}) {
        const tileId = String(context?.tileId || '').trim();
        const tracked = Promise.resolve(promise)
            .catch(() => {})
            .finally(() => {
                fmLog('track.resolved', { tileId });
                if (this._boardAnimationPromise === tracked) {
                    this._boardAnimationPromise = Promise.resolve();
                }
                if (!tileId || String(this._boardAnimationActive?.tileId || '') === tileId) {
                    this._boardAnimationActive = null;
                }
            });
        this._boardAnimationPromise = tracked;
        fmLog('track.set', { tileId, action: context?.action, source: context?.source });
        if (tileId) {
            this._boardAnimationActive = {
                tileId,
                action: String(context?.action || '').trim(),
                source: String(context?.source || '').trim()
            };
        }
        return tracked;
    }

    cancelOnlineResultPresentation() {
        this._onlineResultPresentationToken += 1;
    }

    presentOnlineResultAfterBoardAnimation(presenter) {
        const token = ++this._onlineResultPresentationToken;
        fmLog('present.call', { token, boardAnimActive: Boolean(this._boardAnimationActive) });
        void (async () => {
            await this.getBoardAnimationPromise();
            if (token !== this._onlineResultPresentationToken) return;
            await new Promise((resolve) => setTimeout(resolve, RESULT_MODAL_AFTER_LAND_DELAY_MS));
            if (token !== this._onlineResultPresentationToken) return;
            fmLog('present.fire(modal)', { token, current: this._onlineResultPresentationToken });
            try {
                presenter?.();
            } catch (error) {
                console.error('[CLIENT_DEBUG] Failed to present online result', error);
            }
        })();
    }

    showScoreFeedback(score, options = {}) {
        const value = Number(score || 0);
        if (!(value > 0)) return;
        if (options.sound !== false) {
            this.playSound('score');
        }
        this.renderer.showScorePopup(value);
    }

    scheduleRealtimeRender(flags = {}) {
        const nextFlags = {
            boardChanged: false,
            handChanged: false,
            opponentHandsChanged: false,
            scoresChanged: false,
            infoChanged: false,
            ...flags
        };
        this._realtimeRenderFlags = this._realtimeRenderFlags
            ? {
                boardChanged: this._realtimeRenderFlags.boardChanged || nextFlags.boardChanged,
                handChanged: this._realtimeRenderFlags.handChanged || nextFlags.handChanged,
                opponentHandsChanged: this._realtimeRenderFlags.opponentHandsChanged || nextFlags.opponentHandsChanged,
                scoresChanged: this._realtimeRenderFlags.scoresChanged || nextFlags.scoresChanged,
                infoChanged: this._realtimeRenderFlags.infoChanged || nextFlags.infoChanged
            }
            : nextFlags;
        if (this._realtimeRenderRafId) return;
        this._realtimeRenderRafId = requestAnimationFrame(() => {
            this._realtimeRenderRafId = 0;
            this.flushRealtimeRender();
        });
    }

    flushRealtimeRender() {
        const flags = this._realtimeRenderFlags;
        this._realtimeRenderFlags = null;
        if (!flags) return;
        const debugBoardRenderer = Boolean(window.DOMINO_DEBUG_BOARD_RENDERER);
        const startedAt = debugBoardRenderer ? performance.now() : 0;
        this.renderRealtimeGameDeltaView(flags);
        if (debugBoardRenderer) {
            console.debug('[RealtimeRender]', {
                flags,
                action: this._lastRealtimeRenderAction || '',
                boardFirst: Boolean(flags.boardChanged),
                ms: Number((performance.now() - startedAt).toFixed(2))
            });
        }
    }

    getScoresRenderSignature(displayEntities = [], currentPlayer = -1) {
        return `${currentPlayer}::${(Array.isArray(displayEntities) ? displayEntities : []).map((player) => [
            String(player?.team ?? ''),
            String(player?.name ?? ''),
            Number(player?.score || 0),
            Number(player?.roundWins || 0),
            Number(Boolean(player?.isCurrent) ? 1 : 0),
            String(player?.playerId ?? ''),
            Number(Boolean(player?.isBot) ? 1 : 0)
        ].join(':')).join('|')}`;
    }

    getInfoRenderSignature(matchRound, deal, boneyardCount, openEndsScore, stakeLabel = '') {
        return [
            Number(matchRound || 0),
            Number(deal || 0),
            Number(boneyardCount || 0),
            Number(openEndsScore || 0),
            String(stakeLabel || ''),
            String(this.network?.isMultiplayer ? 1 : 0),
            String(this.onlineRoundBankAmount || 0)
        ].join('::');
    }

    getOpponentHandsRenderSignature(hands = [], hi = -1, playersOrNames = [], cur = -1) {
        const players = Array.isArray(playersOrNames) ? playersOrNames : [];
        return `${hi}:${cur}::${(Array.isArray(hands) ? hands : []).map((hand, index) => {
            const playerRef = players[index] || {};
            const label = typeof playerRef === 'string'
                ? playerRef
                : (playerRef?.name || playerRef?.displayName || this.playerNames?.[index] || `Player ${index + 1}`);
            return [
                index,
                index === hi ? 'self' : 'opp',
                String(label || ''),
                Number((hand || []).length || 0),
                String(playerRef?.playerId || playerRef?.userId || playerRef?.id || ''),
                Number(Boolean(playerRef?.isBot) ? 1 : 0)
            ].join(':');
        }).join('|')}`;
    }

    getHandRenderSignature(hand = [], validMoves = [], selectedTileIndex = -1, isCurrent = false) {
        const tiles = Array.isArray(hand) ? hand : [];
        const moves = Array.isArray(validMoves) ? validMoves : [];
        return [
            Number(selectedTileIndex || -1),
            Number(Boolean(isCurrent) ? 1 : 0),
            tiles.map((tile, index) => `${index}:${tile?.id ?? ''}:${tile?.a ?? ''}:${tile?.b ?? ''}`).join('|'),
            moves.map((move) => `${move?.tileIndex ?? ''}:${move?.openEndIndex ?? ''}`).join('|')
        ].join('::');
    }

    applyPlayerRows(playerOrder = [], playerRows = []) {
        const rows = Array.isArray(playerRows) ? playerRows : [];
        const getPlayer = (sid, index) => rows.find((player) => {
            const sessionId = String(player?.sessionId || '').trim();
            if (sessionId && sessionId === String(sid || '').trim()) return true;
            if (Number.isInteger(Number(player?.index)) && Number(player.index) === index) return true;
            return false;
        }) || null;
        const roomPlayers = Array.isArray(this.currentRoomState?.players) ? this.currentRoomState.players : [];
        this.roomPlayerRefs = playerOrder.map((sid, index) => {
            const playerRow = getPlayer(sid, index) || {};
            const roomPlayer = roomPlayers.find((player) => {
                const sessionId = String(player?.sessionId || '').trim();
                if (sessionId && sessionId === String(sid || '').trim()) return true;
                if (Number.isInteger(Number(player?.index)) && Number(player.index) === index) return true;
                if (Number.isInteger(Number(player?.seatNumber)) && Number(player.seatNumber) - 1 === index) return true;
                return false;
            }) || null;
            return {
                ...playerRow,
                ...(roomPlayer || {}),
                sessionId: sid
            };
        });
        for (const sid of playerOrder) {
            if (!sid) continue;
            const player = getPlayer(sid, playerOrder.indexOf(sid));
            const avatarUrl = player?.avatarUrl || '';
            this.roomAvatarBySessionId.set(sid, avatarUrl || this.roomAvatarBySessionId.get(sid) || '');
        }
        this.playerNames = playerOrder.map((sid, index) => getFirstNameDisplayName(getPlayer(sid, index)?.name || '', `Player ${index + 1}`));
        this.scores = playerOrder.map((sid, index) => Number(getPlayer(sid, index)?.score || 0));
        this.roundWins = playerOrder.map((sid, index) => Number(getPlayer(sid, index)?.roundWins || 0));
        this.hands = playerOrder.map((sid, index) => new Array(Number(getPlayer(sid, index)?.handCount || 0)).fill(null));
        this.playerCount = playerOrder.length;
        return getPlayer;
    }

    updateHandsFromPlayerStats(playerStats = []) {
        const stats = Array.isArray(playerStats) ? playerStats : [];
        for (let i = 0; i < stats.length; i++) {
            const item = stats[i] || {};
            this.scores[i] = Number(item.score || 0);
            this.roundWins[i] = Number(item.roundWins || 0);
            const count = Math.max(0, Number(item.handCount || 0));
            if (i === this.humanPlayerIndex && Array.isArray(this.myHand)) {
                this.hands[i] = this.myHand;
                continue;
            }
            this.hands[i] = new Array(count).fill(null);
        }
    }

    normalizeHandForBoard(hand = []) {
        const tiles = Array.isArray(hand) ? hand : [];
        return tiles
            .map((tile) => {
                if (!tile || typeof tile.a !== 'number' || typeof tile.b !== 'number') return null;
                return (tile instanceof Tile) ? tile : new Tile(tile.a, tile.b);
            })
            .filter(Boolean);
    }

    applyBoardDelta(delta = null) {
        if (!delta) return true;
        const kind = String(delta.kind || '').trim();
        if (!kind) return true;
        try {
            if (kind === 'first') {
                const tile = delta.tile ? new Tile(delta.tile.a, delta.tile.b) : null;
                if (!tile) return false;
                this.board.placeFirst(tile);
                return true;
            }
            if (kind === 'play') {
                const tile = delta.tile ? new Tile(delta.tile.a, delta.tile.b) : null;
                const openEndIndex = Number(delta.openEndIndex);
                if (!tile || !Number.isInteger(openEndIndex)) return false;
                return this.board.placeTile(tile, openEndIndex) >= 0;
            }
            if (kind === 'gosha') {
                const placements = Array.isArray(delta.placements) ? delta.placements : [];
                for (const placement of placements) {
                    const tile = placement?.tile ? new Tile(placement.tile.a, placement.tile.b) : null;
                    const nodeId = Number(placement?.nodeId);
                    const side = String(placement?.side || '');
                    if (!tile || !Number.isInteger(nodeId) || !side) return false;
                    const openEndIndex = this.board.findOpenEndIndex(nodeId, side);
                    if (openEndIndex === -1) return false;
                    this.board.placeTile(tile, openEndIndex);
                }
                return true;
            }
        } catch (error) {
            console.warn('[CLIENT_DEBUG] Failed to apply board delta', error);
            return false;
        }
        return false;
    }

    renderRealtimeGameDeltaView({ boardChanged = false, handChanged = true, opponentHandsChanged = true, scoresChanged = true, infoChanged = true, force = false } = {}) {
        const roomPlayers = Array.isArray(this.currentRoomState?.players) ? this.currentRoomState.players : [];
        const resolvedRoomMode = this.resolveRoomModeState(this.currentRoomState, null);
        this.isTeamMode = resolvedRoomMode.isTeamMode;
        this._resolvedRoomModeFromState = resolvedRoomMode.roomModeFromState || '';
        this._resolvedScoreMode = resolvedRoomMode.scoreMode || '';
        this._resolvedTopHudMode = resolvedRoomMode.topHudMode || '';
        const isTeamMode = resolvedRoomMode.isTeamMode;
        const teamHud = this.setTeamHudDebugState(this.currentRoomState, 'realtime');
        let displayEntities;
        if (isTeamMode) {
            displayEntities = [
                { name: this.getTeamDisplayName(0), score: this.teamScores[0], roundWins: this.teamRoundWins[0], isCurrent: this.isPlayerInTeam(0, this.currentPlayer), index: this.getTeamMembers(0).includes(this.currentPlayer) ? this.currentPlayer : -1, playerId: String(teamHud?.teams?.[0]?.members?.find((member) => Boolean(member?.playerId) && !member?.isEmpty)?.playerId || '').trim(), isBot: Boolean(teamHud?.teams?.[0]?.members?.find((member) => Boolean(member?.isBot))) },
                { name: this.getTeamDisplayName(1), score: this.teamScores[1], roundWins: this.teamRoundWins[1], isCurrent: this.isPlayerInTeam(1, this.currentPlayer), index: this.getTeamMembers(1).includes(this.currentPlayer) ? this.currentPlayer : -1, playerId: String(teamHud?.teams?.[1]?.members?.find((member) => Boolean(member?.playerId) && !member?.isEmpty)?.playerId || '').trim(), isBot: Boolean(teamHud?.teams?.[1]?.members?.find((member) => Boolean(member?.isBot))) }
            ];
        } else {
            displayEntities = this.playerNames.map((n, i) => ({
                name: n,
                score: this.scores[i],
                roundWins: this.roundWins[i],
                isCurrent: this.currentPlayer === i,
                index: i,
                playerId: String(this.roomPlayerRefs?.[i]?.playerId || this.roomPlayerRefs?.[i]?.userId || this.roomPlayerRefs?.[i]?.id || '').trim(),
                isBot: Boolean(this.roomPlayerRefs?.[i]?.isBot)
            }));
        }

        const nextSignatures = {
            scores: `${this.getScoresRenderSignature(displayEntities, this.currentPlayer)}::${Number(this.matchRound || 0)}::${Number(this.deal || 0)}`,
            info: this.getInfoRenderSignature(this.matchRound, this.deal, this.boneyard.length, this.board.getOpenEndsScore(), this.getCurrentStakeLabel()),
            opponents: this.getOpponentHandsRenderSignature(this.hands, this.humanPlayerIndex, roomPlayers.length ? roomPlayers : this.playerNames, this.currentPlayer),
            hand: this.getHandRenderSignature(this.getHumanHandForRender(), this.validMoves, this.selectedTileIndex, this.currentPlayer === this.humanPlayerIndex)
        };

        if (boardChanged) {
            this.renderer.renderBoard(this.board);
        }
        if (opponentHandsChanged && (force || nextSignatures.opponents !== this._realtimeRenderSignatures.opponents)) {
            this.renderer.renderOpponentHands(this.hands, this.humanPlayerIndex, roomPlayers.length ? roomPlayers : this.playerNames, this.currentPlayer);
            this._realtimeRenderSignatures.opponents = nextSignatures.opponents;
        }
        const myHand = this.getHumanHandForRender();
        const myTurn = this.currentPlayer === this.humanPlayerIndex;
        if (handChanged && (force || nextSignatures.hand !== this._realtimeRenderSignatures.hand)) {
            this.renderer.renderHand(myHand, this.validMoves, this.selectedTileIndex, myTurn);
            this._realtimeRenderSignatures.hand = nextSignatures.hand;
        }
        if (scoresChanged && (force || nextSignatures.scores !== this._realtimeRenderSignatures.scores)) {
            this.renderer.renderScores(displayEntities, this.currentPlayer);
            this._realtimeRenderSignatures.scores = nextSignatures.scores;
        }
        if (infoChanged && (force || nextSignatures.info !== this._realtimeRenderSignatures.info)) {
            this.renderer.renderInfo(this.matchRound, this.deal, this.boneyard.length, this.board.getOpenEndsScore(), this.getCurrentStakeLabel());
            this._realtimeRenderSignatures.info = nextSignatures.info;
        }
        this.syncMoveHintSelectionUiState();

        const waitingOpenRoom = this.isWaitingInOpenRoom(this.currentRoomState);
        const canPlay = this.board.canPlayAny(this.normalizeHandForBoard(myHand));
        const emptyBoneyard = this.boneyard.length === 0;
        const connectionLost = Boolean(this.network?.isMultiplayer) && (
            !this.network?.isRoomConnectionOpen?.() || this.networkActionBlockedForReconnect
        );
        this.renderer.drawBtn.disabled = connectionLost || waitingOpenRoom || !myTurn || canPlay || emptyBoneyard || this.postMoveWindowActive || this.turnInProgress || this.lastMoveRevealPending;
        this.renderer.passBtn.disabled = connectionLost || waitingOpenRoom || !myTurn || canPlay || !emptyBoneyard || this.postMoveWindowActive || this.turnInProgress || this.lastMoveRevealPending;

        this.goshaCombo = (this.gameActive && myTurn && this.mode !== 'classic101') ? this.goshaCombo : null;
        this.renderer.showGoshaBtn(this.goshaCombo, () => this.playGoshaCombo());
        this.syncOpenRoomWaitingBanner(this.currentRoomState);
        this.updateTurnTimerHud();
        this.persistGameResumeSnapshot();
    }

    onNetworkFullState(payload = {}) {
        const playerOrder = Array.from(payload?.playerOrder || []);
        const getPlayer = this.applyPlayerRows(playerOrder, payload?.players || []);
        this.turnTimeoutMs = Number(payload?.turnDurationMs || this.turnTimeoutMs || TURN_TIMEOUT_MS);
        this.syncServerClock(payload?.serverNow || 0);
        this.currentPlayer = Number(payload?.currentPlayerIndex ?? 0);
        this.boneyard = Array.from({ length: Number(payload?.boneyardCount || 0) });
        const resolvedRoomMode = this.resolveRoomModeState(this.currentRoomState, payload);
        this.isTeamMode = resolvedRoomMode.isTeamMode;
        this._resolvedRoomModeFromState = resolvedRoomMode.roomModeFromState || '';
        this._resolvedScoreMode = resolvedRoomMode.scoreMode || '';
        this._resolvedTopHudMode = resolvedRoomMode.topHudMode || '';
        const nextMode = String(payload?.gameMode || payload?.mode || this.mode || 'telefon').trim() || 'telefon';
        if (nextMode !== this.mode) {
            this.mode = nextMode;
            this.ruleset = getRuleset(this.mode);
        }
        this.playerCount = Number(payload?.totalPlayers || this.playerCount || playerOrder.length || 0);
        this.teamScores = Array.from(payload?.teamScores || [0, 0]);
        this.teamRoundWins = Array.from(payload?.teamRoundWins || [0, 0]);
        this.syncClassic101MatchStateFromNetwork(payload);
        this.matchRound = Number(payload?.matchRound || 1);
        this.deal = Number(payload?.deal || 1);
        this.gameActive = Boolean(payload?.gameActive);
        this.matchOver = Boolean(payload?.matchOver);
        this.lastFinishInfo = payload?.finishInfo || this.lastFinishInfo || null;
        if (this.gameActive) {
            this.resetOnlineResultFlowState();
            this.roundOver = false;
            this.matchOver = false;
            this.pendingReconnectResolution = false;
            this.lastMoveRevealPending = false;
            this.clearRoundStage();
            document.getElementById('round-end-screen')?.classList.remove('active');
            document.getElementById('game-over-screen')?.classList.remove('active');
        }
        this.onlineStakeKey = payload?.stakeKey || this.onlineStakeKey;
        this.onlineRoundBankAmount = Math.max(0, Number(payload?.bankAmount || 0));
        this.turnVersion = Number(payload?.turnVersion || this.turnVersion || 1);
        this.board = reconstructBoard(payload?.board || {});
        this.configureBoardForCurrentMode(this.board);
        this.myHand = Array.isArray(payload?.selfHand) ? payload.selfHand.map((t) => new Tile(t.a, t.b)) : [];
        const mySid = this.network?.room?.sessionId || '';
        const myIdx = playerOrder.indexOf(mySid);
        if (myIdx !== -1) {
            this.humanPlayerIndex = myIdx;
            this.hands[myIdx] = this.myHand;
        }
        this.validMoves = Array.isArray(payload?.turnInfo?.validMoves) ? payload.turnInfo.validMoves : [];
        this.goshaCombo = this.mode === 'classic101' ? null : (payload?.turnInfo?.goshaCombo || null);
        if (this.gameActive && Number(payload?.turnDeadlineAt || 0) > 0) {
            this.startTurnTimer(Number(payload.turnDeadlineAt), Number(payload?.turnVersion || this.turnVersion || 1), this.currentPlayer);
        } else {
            this.clearTurnTimers();
        }
        this.resetReconnectRestoreUiState();
        
        this.lastMoveRevealPending = Boolean(payload?.lastMoveRevealPending);
        if (this.lastMoveRevealPending) {
            this.setRoundStage({
                phase: 'counting',
                title: this.t('stage-counting') || 'Подсчёт очков...',
                blocksInput: true
            });
        } else if (!this.gameActive) {
            this.clearRoundStage();
        }
        
        // Reset signatures to force UI redraw
        this._realtimeRenderSignatures = {};
        
        // Debug metrics
        this.lastFullStateForcedRenderAt = Date.now();
        this.lastFullStateIsMyTurn = (this.currentPlayer === this.humanPlayerIndex);
        this.lastFullStateValidMovesCount = this.validMoves.length;
        this.lastFullStateSelfHandCount = this.myHand.length;
        this.lastFullStateControlsShouldBeEnabled = (this.currentPlayer === this.humanPlayerIndex && this.validMoves.length > 0);

        this.renderRealtimeGameDeltaView({
            boardChanged: true,
            handChanged: true,
            opponentHandsChanged: true,
            scoresChanged: true,
            infoChanged: true,
            force: true
        });
        this.renderState();
    }

    onNetworkActionAck(payload = {}) {
        const pending = this.pendingOnlineAction;
        const actionId = String(payload?.actionId || '').trim();
        if (!pending) return;
        if (actionId && pending.actionId && actionId !== pending.actionId) return;

        this.turnVersion = Number(payload?.turnVersion || this.turnVersion || 1);
        this.turnTimeoutMs = Number(payload?.turnDurationMs || this.turnTimeoutMs || TURN_TIMEOUT_MS);
        this.syncServerClock(payload?.serverNow || 0);

        if (!payload?.accepted) {
            this.clearPendingOnlineAction({ rollback: true });
            const reason = String(payload?.reason || '').trim();
            if (reason && reason !== 'stale_turn') {
                const message = reason === 'bot_takeover_active'
                    ? (this.t('bot-takeover-active') || 'Bot is playing for you right now.')
                    : reason.replace(/_/g, ' ');
                this.renderer.showMessage(message, 1200);
            }
            return;
        }

        if (Array.isArray(payload?.selfHand)) {
            this.myHand = payload.selfHand.map((t) => new Tile(t.a, t.b));
            if (this.humanPlayerIndex >= 0) {
                this.hands[this.humanPlayerIndex] = this.myHand;
            }
            this.scheduleRealtimeRender({
                boardChanged: false,
                handChanged: true,
                opponentHandsChanged: false,
                scoresChanged: false,
                infoChanged: false
            });
        }
        if (payload?.turnInfo) {
            this.validMoves = payload.turnInfo.validMoves || [];
            this.goshaCombo = payload.turnInfo.goshaCombo || null;
        }
        this.clearPendingOnlineAction({ rollback: false });
    }

    onNetworkGameDelta(payload = {}) {
        if (!this.network?.isMultiplayer) return;
        const action = String(payload?.action || '').trim();
        this._lastRealtimeRenderAction = action;
        this.turnTimeoutMs = Number(payload?.turnDurationMs || this.turnTimeoutMs || TURN_TIMEOUT_MS);
        this.syncServerClock(payload?.serverNow || 0);
        let boardChanged = Boolean(payload?.boardDelta);
        const scoreDelta = Math.max(0, Number(payload?.scoreDelta || 0));
        const payloadTileId = String(payload?.boardDelta?.tile?.id || '');
        const isOwnOptimisticPlay = action === 'play'
            && payloadTileId
            && String(this._pendingOptimisticPlayTileId || '') === payloadTileId;
        if (isOwnOptimisticPlay) {
            boardChanged = false;
        }
        const isBoardAnimationAction = boardChanged && (action === 'play' || action === 'gosha') && !isOwnOptimisticPlay;
        fmLog('game_delta', { action, payloadTileId, isOwnOptimisticPlay, boardChanged, isFinalMove: payload?.isFinalMove, lastMoveRevealPending: payload?.lastMoveRevealPending, scoreDelta });
        const deferScoreUi = scoreDelta > 0 && (action === 'play' || action === 'gosha');
        const resolvedRoomMode = this.resolveRoomModeState(this.currentRoomState, payload);
        this.isTeamMode = resolvedRoomMode.isTeamMode;
        this._resolvedRoomModeFromState = resolvedRoomMode.roomModeFromState || '';
        this._resolvedScoreMode = resolvedRoomMode.scoreMode || '';
        this._resolvedTopHudMode = resolvedRoomMode.topHudMode || '';

        const previousTileIds = new Set(this.board.nodes.map((n) => n.tile.id));

        if (boardChanged && !isOwnOptimisticPlay && !this.applyBoardDelta(payload.boardDelta)) {
            this.requestRealtimeSync('board_delta_failed');
            return;
        }

        this.currentPlayer = Number(payload?.currentPlayerIndex ?? this.currentPlayer ?? 0);
        this.boneyard = Array.from({ length: Number(payload?.boneyardCount || 0) });
        this.isTeamMode = Boolean(payload?.isTeamMode ?? this.isTeamMode);
        this.gameActive = Boolean(payload?.gameActive ?? this.gameActive);
        this.matchRound = Number(payload?.matchRound || this.matchRound || 1);
        this.deal = Number(payload?.deal || this.deal || 1);
        this.turnVersion = Number(payload?.turnVersion || this.turnVersion || 1);
        this.onlineStakeKey = payload?.stakeKey || this.onlineStakeKey;
        this.onlineRoundBankAmount = Math.max(0, Number(payload?.bankAmount || this.onlineRoundBankAmount || 0));
        this.teamScores = Array.from(payload?.teamScores || this.teamScores || [0, 0]);
        this.teamRoundWins = Array.from(payload?.teamRoundWins || this.teamRoundWins || [0, 0]);
        this.updateHandsFromPlayerStats(payload?.playerStats || []);
        this.lastMoveRevealPending = Boolean(payload?.lastMoveRevealPending);

        const turnDeadlineAt = Number(payload?.turnDeadlineAt || 0);
        if (this.gameActive && turnDeadlineAt > 0) {
            this.startTurnTimer(turnDeadlineAt, Number(payload?.turnVersion || this.turnVersion || 1), this.currentPlayer);
        } else {
            this.clearTurnTimers();
        }

        if (this.currentPlayer !== this.humanPlayerIndex) {
            this.validMoves = [];
            this.goshaCombo = null;
        }
        this.turnInProgress = false;

        if (boardChanged && !isOwnOptimisticPlay) {
            const newTiles = this.board.nodes.filter((n) => !previousTileIds.has(n.tile.id));
            if (newTiles.length > 0) {
                const lastNewTile = newTiles[newTiles.length - 1];
                const tileId = String(lastNewTile?.tile?.id || '');
                if (tileId) {
                    const currentPendingId = String(this.renderer?._pendingBoardTileTravel?.tileId || '');
                    if (currentPendingId !== tileId) {
                        const source = this.getBoardAnimationSource(payload?.actorIndex, tileId);
                        this.renderer._pendingBoardTileTravel = source?.sourceRect
                            ? { tileId, sourceRect: source.sourceRect, sourceNode: source.sourceNode }
                            : null;
                    }
                }
            }
        }

        const renderFlags = {
            boardChanged,
            handChanged: action === 'draw' || (action === 'play' && Number(payload?.actorIndex) === Number(this.humanPlayerIndex)) || (action === 'gosha' && Number(payload?.actorIndex) === Number(this.humanPlayerIndex)),
            opponentHandsChanged: ['play', 'draw', 'gosha'].includes(action),
            scoresChanged: !deferScoreUi && (scoreDelta > 0 || action === 'score'),
            infoChanged: !deferScoreUi && (['play', 'draw', 'pass', 'gosha', 'score'].includes(action) || boardChanged)
        };
        this.renderRealtimeGameDeltaView(renderFlags);

        let animationPromise = Promise.resolve();
        if (isBoardAnimationAction) {
            const animationTileId = String(this.renderer?._pendingBoardTileTravel?.tileId || '');
            if (animationTileId) {
                fmLog('animate.start', { animationTileId, action });
                animationPromise = this.trackBoardAnimationPromise(
                    this.renderer.animateTileTravel(animationTileId).catch((error) => {
                        console.warn('[CLIENT_DEBUG] board animation failed', error);
                    }),
                    { tileId: animationTileId, action, source: 'server-delta' }
                );
            }
        } else if (isOwnOptimisticPlay) {
            fmLog('no-animation(optimistic)');
            animationPromise = this.getBoardAnimationPromise();
        }

        const shouldDelayScorePopup = scoreDelta > 0 && (action === 'play' || action === 'gosha') && (isBoardAnimationAction || isOwnOptimisticPlay);

        if (shouldDelayScorePopup && String(payload?.scoreSource || '').trim() !== 'hand_bonus') {
            this.enqueueScorePopupAfterBoardAnimation(scoreDelta);
            animationPromise.finally(() => {
                this.flushPendingScorePopupAfterBoardAnimation();
                this.scheduleRealtimeRender({
                    boardChanged: false,
                    handChanged: false,
                    opponentHandsChanged: false,
                    scoresChanged: true,
                    infoChanged: true
                });
            });
        } else if (scoreDelta > 0 && String(payload?.scoreSource || '').trim() !== 'hand_bonus') {
            this.showScoreFeedback(scoreDelta);
        }

        if (isOwnOptimisticPlay) {
            this._pendingOptimisticPlayTileId = '';
            this._pendingOptimisticPlayActionId = '';
        }
    }

    // --- Network Handlers (Thin Client Mode) ---
    onNetworkStateUpdate(state) {
        fmLog('schema.enter', { gameActive: state?.gameActive, hasBoardJson: Boolean(state?.boardJson), boardAnimActive: Boolean(this._boardAnimationActive) });
        if (this.shouldProcessSchemaState(state) === false) {
            return;
        }
        this.turnTimeoutMs = Number(state?.turnDurationMs || this.turnTimeoutMs || TURN_TIMEOUT_MS);
        this.syncServerClock(state?.serverNow || 0);
        const roomPlayers = Array.isArray(this.currentRoomState?.players) ? this.currentRoomState.players : [];
        const playerOrder = roomPlayers.map((player, index) => {
            const sid = String(player?.sessionId || '').trim();
            return sid || `player-${index}`;
        });
        this.roomPlayerRefs = roomPlayers.map((roomPlayer, index) => ({
            ...(roomPlayer || {}),
            sessionId: String(roomPlayer?.sessionId || playerOrder[index] || '').trim()
        }));
        for (const sid of playerOrder) {
            if (!sid) continue;
            const avatarUrl = roomPlayers.find((player, index) => {
                const sessionId = String(player?.sessionId || '').trim();
                if (sessionId && sessionId === sid) return true;
                if (Number.isInteger(Number(player?.index)) && Number(player.index) === playerOrder.indexOf(sid)) return true;
                return false;
            })?.avatarUrl || '';
            this.roomAvatarBySessionId.set(sid, avatarUrl || this.roomAvatarBySessionId.get(sid) || '');
        }

        // Calculate actual humanPlayerIndex based on roomPlayers and current socket sessionId
        const mySid = this.network?.room?.sessionId || '';
        if (mySid && roomPlayers.length > 0) {
            const myIdx = roomPlayers.findIndex(p => String(p?.sessionId || '').trim() === mySid);
            if (myIdx !== -1) {
                const seatIndex = roomPlayers[myIdx].seatIndex;
                this.humanPlayerIndex = (Number.isInteger(seatIndex) && seatIndex >= 0) ? seatIndex : myIdx;
            }
        }

        const preserveGameStats = Boolean(state?.gameActive);
        const schemaPlayerOrder = Array.isArray(state?.playerOrder) ? Array.from(state.playerOrder) : playerOrder;
        const schemaPlayers = state?.players;
        const hasSchemaPlayerMap = Boolean(schemaPlayers && typeof schemaPlayers.get === 'function' && schemaPlayerOrder.length);
        const incomingHasScoreData = roomPlayers.some((player) => Number(player?.score || 0) > 0 || Number(player?.roundWins || 0) > 0);
        if (!preserveGameStats) {
            if (roomPlayers.length > 0) {
                this.playerNames = roomPlayers.map((player, index) => getFirstNameDisplayName(player?.name || '', `Player ${index + 1}`));
                if (incomingHasScoreData || !Array.isArray(this.scores) || this.scores.length === 0) {
                    this.scores = roomPlayers.map((player) => Number(player?.score || 0));
                    this.roundWins = roomPlayers.map((player) => Number(player?.roundWins || 0));
                }
                this.hands = roomPlayers.map((player) => new Array(Number(player?.handCount || 0)).fill(null));
            }
        } else if (hasSchemaPlayerMap) {
            this.scores = schemaPlayerOrder.map((sid, index) => Number(schemaPlayers.get(sid)?.score || roomPlayers[index]?.score || 0));
            this.roundWins = schemaPlayerOrder.map((sid, index) => Number(schemaPlayers.get(sid)?.roundWins || roomPlayers[index]?.roundWins || 0));
            this.hands = schemaPlayerOrder.map((sid, index) => new Array(Number(schemaPlayers.get(sid)?.handCount || roomPlayers[index]?.handCount || 0)).fill(null));
            if (this.humanPlayerIndex >= 0 && Array.isArray(this.myHand)) {
                this.hands[this.humanPlayerIndex] = this.myHand;
            }
        }
        if (state.playerCount !== undefined && state.playerCount !== null) {
            this.playerCount = Number(state.playerCount);
        }
        const nextMode = String(state?.gameMode || state?.mode || this.mode || 'telefon').trim() || 'telefon';
        if (nextMode !== this.mode) {
            this.mode = nextMode;
            this.ruleset = getRuleset(this.mode);
        }
        this._lastRoomStateGameMode = String(state?.gameMode || state?.mode || this._lastRoomStateGameMode || '').trim();

        if (state.boardJson && !this._boardAnimationActive) {
            try {
                const parsed = JSON.parse(state.boardJson);
                this.board = reconstructBoard(parsed);
                this.configureBoardForCurrentMode(this.board);
            } catch (e) { console.error(e); }
            fmLog('schema.board-applied', { gameActive: state?.gameActive, deal: state?.deal });
        } else if (state.boardJson) {
            fmLog('schema.board-skipped', { gameActive: state?.gameActive, deal: state?.deal, boardAnimActive: Boolean(this._boardAnimationActive) });
        }
        
        if (state.currentPlayerIndex !== undefined && state.currentPlayerIndex !== null) {
            this.currentPlayer = Number(state.currentPlayerIndex);
        }
        if (state.boneyardCount !== undefined && state.boneyardCount !== null) {
            this.boneyard = Array.from({ length: state.boneyardCount || 0 });
        }
        const resolvedRoomMode = this.resolveRoomModeState(this.currentRoomState, state);
        this.isTeamMode = resolvedRoomMode.isTeamMode;
        this._resolvedRoomModeFromState = resolvedRoomMode.roomModeFromState || '';
        this._resolvedScoreMode = resolvedRoomMode.scoreMode || '';
        this._resolvedTopHudMode = resolvedRoomMode.topHudMode || '';
        this.syncClassic101MatchStateFromNetwork(state);
        if (state.matchRound !== undefined && state.matchRound !== null) {
            this.matchRound = Number(state.matchRound);
        }
        if (state.deal !== undefined && state.deal !== null) {
            this.deal = Number(state.deal);
        }
        if (state.gameActive !== undefined && state.gameActive !== null) {
            this.gameActive = Boolean(state.gameActive);
        }
        if (state.matchOver !== undefined && state.matchOver !== null) {
            this.matchOver = Boolean(state.matchOver);
        }
        this.lastFinishInfo = state?.finishInfo || this.lastFinishInfo || null;
        this.onlineStakeKey = state?.stakeKey || this.onlineStakeKey;
        this.onlineRoundBankAmount = Math.max(0, Number(state?.bankAmount || 0));
        if (state.turnVersion !== undefined && state.turnVersion !== null) {
            this.turnVersion = Number(state.turnVersion);
        }
        if (this.hasPendingOnlinePlayAck(state, playerOrder, null)) {
            this.clearPendingOnlineAction({ rollback: false });
            this.turnInProgress = false;
        }
        const shouldKeepTurnHints = this.gameActive && this.currentPlayer === this.humanPlayerIndex;
        if (!shouldKeepTurnHints) {
            this.validMoves = [];
            this.goshaCombo = null;
        } else if ((!Array.isArray(this.validMoves) || this.validMoves.length === 0) && this.myHand && this.myHand.length > 0) {
            this.validMoves = this.board?.getValidMoves?.(this.myHand) || [];
        }
        if (this.gameActive && Number(state?.turnDeadlineAt || 0) > 0) {
            this.startTurnTimer(Number(state.turnDeadlineAt), Number(state?.turnVersion || this.turnVersion || 1), this.currentPlayer);
        } else {
            this.clearTurnTimers();
        }

        const gameOverReason = String(state?.gameOverReason || '').trim();
        if (this.pendingReconnectResolution) {
            if (this.matchOver && gameOverReason === 'disconnect') {
                let economy = this.lastDisconnectEconomySummary || null;
                if (!economy && state?.gameOverSummaryJson) {
                    try {
                        economy = JSON.parse(state.gameOverSummaryJson);
                    } catch {}
                }
                const payload = {
                    reasonKey: 'game-over-disconnect',
                    values: { player: String(state?.gameOverPlayerName || '').trim() },
                    economy,
                    players: this.playerNames.map((name, index) => ({
                        name,
                        score: this.scores[index] || 0,
                        roundWins: this.roundWins[index] || 0
                    })),
                    isTeamMode: this.isTeamMode,
                    teamScores: Array.from(this.teamScores || [0, 0]),
                    teamRoundWins: Array.from(this.teamRoundWins || [0, 0])
                };
                this.renderDisconnectGameOver(payload);
                this.renderer.showMessage(this.t('connection-restored'), 1600);
                this.pendingReconnectResolution = false;
                return;
            }
            // If the game is already active or we received full_state payload, clear the block
            if (this.gameActive) {
                this.pendingReconnectResolution = false;
            }
        }

        // Hide start screen if we just started
        if (this.gameActive) {
            this.resetOnlineResultFlowState();
            this.roundOver = false;
            this.matchOver = false;
            this.lastMoveRevealPending = false;
            this.clearRoundStage();
            document.getElementById('round-end-screen')?.classList.remove('active');
            document.getElementById('game-over-screen')?.classList.remove('active');
            this.showStartModal(null);
            this.hideOpenRoomsModal();
            if (document.getElementById('start-screen').classList.contains('active')) {
                document.getElementById('start-screen').classList.remove('active');
                document.getElementById('game-screen').classList.add('active');
            }
        }

        if (this.matchOver && gameOverReason === 'disconnect') {
            let economy = this.lastDisconnectEconomySummary || null;
            if (!economy && state?.gameOverSummaryJson) {
                try {
                    economy = JSON.parse(state.gameOverSummaryJson);
                } catch {}
            }
            const payload = {
                reasonKey: 'game-over-disconnect',
                values: { player: String(state?.gameOverPlayerName || '').trim() },
                economy,
                players: this.playerNames.map((name, index) => ({
                    name,
                    score: this.scores[index] || 0,
                    roundWins: this.roundWins[index] || 0
                })),
                isTeamMode: this.isTeamMode,
                teamScores: Array.from(this.teamScores || [0, 0]),
                teamRoundWins: Array.from(this.teamRoundWins || [0, 0])
            };
            this.renderDisconnectGameOver(payload);
            return;
        }

        if (this.gameActive && Array.isArray(this.hands) && this.hands.length < this.playerNames.length) {
            this.hands = Array.from({ length: this.playerNames.length }, (_, index) => this.hands[index] || []);
        }

        this.renderState();
    }

    onNetworkHandUpdate(handData) {
        this.myHand = handData.map(t => new Tile(t.a, t.b));
        // We find our index
        const mySid = this.network?.room?.sessionId || '';
        const myIdx = Array.isArray(this.roomPlayerRefs)
            ? this.roomPlayerRefs.findIndex((player) => String(player?.sessionId || '') === mySid)
            : -1;
        if (myIdx !== -1) {
            this.humanPlayerIndex = myIdx;
            this.hands[myIdx] = this.myHand;
        }
        if (this.network.isMultiplayer) {
            this.scheduleRealtimeRender({ boardChanged: false, handChanged: true, opponentHandsChanged: false, scoresChanged: false, infoChanged: false });
            return;
        }
        this.renderState();
    }

    onNetworkTurnInfo(info) {
        this.validMoves = info.validMoves || [];
        this.goshaCombo = this.mode === 'classic101' ? null : (info.goshaCombo || null);
        if (this.network.isMultiplayer) {
            this.turnInProgress = false;
            this.scheduleRealtimeRender({ boardChanged: false, handChanged: true, opponentHandsChanged: false, scoresChanged: false, infoChanged: false });
            return;
        }
        this.renderState();
    }


    onNetworkDealEnd(data) {
        fmLog('deal_end.recv', { winnerIndex: data?.winnerIndex, boardAnimActive: Boolean(this._boardAnimationActive) });
        this.onlineResultActive = true;
        this.syncOpenRoomWaitingBanner(this.currentRoomState);
        debugLog('[DealEnd]', {
            bonus: data?.bonus,
            bonusSource: data?.bonusSource,
            tableScoreDelta: data?.tableScoreDelta,
            waitingForBoardAnimation: Boolean(this._boardAnimationActive)
        });
        this.clearTurnTimers();
        this.gameActive = false;
        this.lastMoveRevealPending = false;
        // Reconstruct all hands to show them at the end
        const finalHands = data.hands.map(h => h.map(t => new Tile(t.a, t.b)));
        this.hands = finalHands;
        const isTeamMode = this.resolveRoomModeState(this.currentRoomState, data).isTeamMode;
        const finishInfo = data.finishInfo || this.inferFinalInfoFromNetworkDealEnd(data);
        this.lastFinishInfo = finishInfo;

        let displayEntities;
        if (isTeamMode) {
            const wt = data.winnerIndex % 2;
            displayEntities = [
                { name: this.getTeamDisplayName(0), isWinner: wt === 0, score: this.teamScores[0], handPoints: this.getTeamHandPoints(0), leftoverHands: this.getTeamLeftoverHands(0) },
                { name: this.getTeamDisplayName(1), isWinner: wt === 1, score: this.teamScores[1], handPoints: this.getTeamHandPoints(1), leftoverHands: this.getTeamLeftoverHands(1) }
            ];
        } else {
            displayEntities = this.playerNames.map((n, i) => ({ name: n, isWinner: i === data.winnerIndex, handPoints: this.ruleset.handPoints(this.hands[i]), score: this.scores[i], leftoverHands: [this.hands[i]] }));
        }

        this.presentOnlineResultAfterBoardAnimation(() => {
            this.clearRoundStage();
            this.renderer.renderDealEnd(this.playerNames[data.winnerIndex], displayEntities, data.fish, data.bonus, finishInfo || {});
            this.persistGameResumeSnapshot();
        });
    }

    applyOnlineEconomySettlement(economy) {
        if (!this.network.isMultiplayer || this.onlineEconomyMode !== 'coins' || !economy) return;
        const stakeAmount = Math.max(0, Number(economy.stakeAmount || 0));
        const reservations = Array.isArray(economy.reservations) ? economy.reservations : [];
        const myUserId = String(
            this.accountProfile?.profile?.userId ||
            this.accountDetails?.user?.id ||
            this.account?.getStoredProfile?.()?.userId ||
            ''
        ).trim();
        const myReservation = reservations.find((entry) => String(entry?.userId || '').trim() === myUserId);
        const myPayout = Math.max(0, Number(myReservation?.payout ?? 0));
        if (stakeAmount > 0) {
            this.onlineCoinSummary.spent += stakeAmount;
            this.onlineCoinSummary.won += myPayout;
        }
    }

    onNetworkRoundEnd(data) {
        fmLog('round_end.recv', { winnerIndex: data?.winnerIndex, boardAnimActive: Boolean(this._boardAnimationActive) });
        this.onlineResultActive = true;
        this.syncOpenRoomWaitingBanner(this.currentRoomState);
        this.gameActive = false;
        this.lastMoveRevealPending = false;
        this.clearTurnTimers();
        const wi = data.winnerIndex;
        const isTeamMode = this.resolveRoomModeState(this.currentRoomState, data).isTeamMode;
        const winnerTeamIndex = isTeamMode ? (wi % 2) : null;
        this.roundOver = true;

        if (isTeamMode) {
            this.teamScores = Array.from(data.teamScores || this.teamScores || [0, 0]);
            this.teamRoundWins = Array.from(data.teamRoundWins || this.teamRoundWins || [0, 0]);
        } else {
            for (const p of data.players) {
                const idx = this.playerNames.indexOf(p.name);
                if (idx !== -1) {
                    this.scores[idx] = p.score;
                    this.roundWins[idx] = p.roundWins;
                }
            }
        }

        this.matchOver = data.isMatchOver;

        this.applyOnlineEconomySettlement(data.economy);

        let displayEntities;
        if (isTeamMode) {
            displayEntities = [
                {name: this.getTeamDisplayName(0), isWinner: winnerTeamIndex === 0, score: data.teamScores[0], roundWins: data.teamRoundWins[0]},
                {name: this.getTeamDisplayName(1), isWinner: winnerTeamIndex === 1, score: data.teamScores[1], roundWins: data.teamRoundWins[1]}
            ];
        } else {
            displayEntities = data.players.map(p => ({name: p.name, isWinner: p.isWinner, score: p.score, roundWins: p.roundWins}));
        }

        const gameOverReason = String(this.currentRoomState?.gameOverReason || data.gameOverReason || '').trim();
        const isDisconnect = data.isMatchOver && (gameOverReason === 'disconnect' || data.forfeit);
        const finishInfo = data.finishInfo || this.inferFinalInfoFromNetworkRoundEnd(data);
        this.lastFinishInfo = finishInfo;

        this.presentOnlineResultAfterBoardAnimation(() => {
            this.clearRoundStage();
            if (isDisconnect) {
                this.matchRound = data.matchRound + 1;
                this.clearGameResumeSnapshot();
                this.showMatchResult();
                return;
            }
            if (data.isMatchOver) {
                this.showMatchResult();
            } else {
                const winnerLabel = isTeamMode ? this.getTeamDisplayName(winnerTeamIndex) : this.playerNames[wi];
                const isTimeoutForfeit = String(data?.finishKind || '').trim() === 'timeout_forfeit' || String(data?.forfeitReason || '').trim() === 'turn_timeout';
                const timeoutLoserSessionId = String(data?.timeoutLoserSessionId || '').trim();
                const mySessionId = String(this.network?.room?.sessionId || '').trim();
                const isTimeoutLoser = Boolean(timeoutLoserSessionId && mySessionId && timeoutLoserSessionId === mySessionId);
                const currentBalance = Number(this.getCurrentWalletBalance?.() || 0);
                const requiredStakeAmount = Math.max(0, Number(data?.requiredStakeAmount || data?.stakeAmount || data?.bankAmount || this.onlineRoundBankAmount || 0));
                this.renderer.renderRoundEnd(winnerLabel, displayEntities, data.wins, data.matchRound, false, isTimeoutForfeit ? {
                    timeoutForfeit: true,
                    isTimeoutLoser,
                    continueExpiresAt: Number(data?.continueExpiresAt || 0),
                    loserName: String(data?.timeoutLoserName || '').trim(),
                    stakeKey: String(data?.stakeKey || this.onlineStakeKey || '').trim(),
                    requiredStakeAmount,
                    currentBalance,
                    hasInsufficientBalance: currentBalance < requiredStakeAmount,
                    onContinue: async () => {
                        this.network.room?.send?.('timeout_continue');
                    },
                    onTopUp: () => {
                        void this.openCoinShopModal();
                    },
                    onExit: () => {
                        this.network.leaveRoom({ explicit: true, reason: 'timeout_continue_exit' });
                    }
                } : {});
            }
            this.matchRound = data.matchRound + 1;
            if (data.isMatchOver) this.clearGameResumeSnapshot();
            else this.persistGameResumeSnapshot();
        });
    }

    onTimeoutContinueResult(payload = {}) {
        const ok = Boolean(payload?.ok);
        this.renderer?.onTimeoutContinueResult?.(payload);
        if (ok) {
            return;
        }

        const reason = String(payload?.reason || '').trim();
        if (reason === 'insufficient_balance') {
            this.renderer.showMessage(this.t('timeout-forfeit-insufficient-balance') || 'Not enough coins', 2200);
            return;
        }
        if (reason === 'continue_in_progress') {
            this.renderer.showMessage(this.t('timeout-forfeit-continue-in-progress') || 'Continue already in progress', 1800);
            return;
        }
        if (reason === 'stake_unavailable') {
            this.renderer.showMessage(this.t('timeout-forfeit-stake-unavailable') || 'Stake is unavailable right now', 1800);
            return;
        }
        if (reason === 'room_closed') {
            this.renderer.showMessage(this.t('timeout-forfeit-room-closed') || 'Room closed', 1800);
            return;
        }
        if (reason) {
            this.renderer.showMessage(reason.replace(/_/g, ' '), 1600);
        }
    }

    // Override actions to send to network
    onHandTileClick(ti, fromRemote=false) {
        if (this.isInputBlockedByStage()) return;
        this.selectedTileIndex = -1;
        this.renderer.removeArrows();
        this.syncMoveHintSelectionUiState();
        if (this.network.isMultiplayer) {
            if (!this.canSendMultiplayerAction()) {
                const reason = this.lastBlockedOnlineActionReason;
                if (reason === 'connection_closed' || reason === 'reconnect_in_progress' || reason === 'no_room') {
                    this.notifyMultiplayerActionBlocked('connection');
                }
                return;
            }
            // In server multiplayer, client only sends its own moves
            if (this.currentPlayer !== this.humanPlayerIndex) return;
            if (!this.myHand) return;
            const tile = this.myHand[ti];
            if (!tile) return;
            if (this.board.isEmpty) {
                const actionId = this.network.nextActionId('play');
                if (!this.applyOptimisticOnlinePlay(ti, -1, actionId)) return;
                this.network.sendPlay(ti, -1, actionId);
                return;
            }
            const ends = [];
            for (let j=0; j<this.board.openEnds.length; j++) if (tile.hasValue(this.board.openEnds[j].value)) ends.push(j);
            if (ends.length > 1 && this.board.nodes.length === 1 && this.board.nodes[0].tile.isDouble) ends.length = 1;
            if (ends.length === 1) {
                const actionId = this.network.nextActionId('play');
                if (!this.applyOptimisticOnlinePlay(ti, ends[0], actionId)) return;
                this.network.sendPlay(ti, ends[0], actionId);
            }
            else if (ends.length > 1) {
                this.selectedTileIndex = ti;
                this.renderer.renderHand(this.myHand, this.validMoves, this.selectedTileIndex);
                this.syncMoveHintSelectionUiState();
                this.renderer.showArrowChoices(this.board, ends,
                    (ei) => {
                        if (this.isInputBlockedByStage()) return;
                        const actionId = this.network.nextActionId('play');
                        if (!this.applyOptimisticOnlinePlay(ti, ei, actionId)) {
                            this.selectedTileIndex = -1;
                            this.renderer.renderHand(this.myHand, this.validMoves, -1);
                            this.syncMoveHintSelectionUiState();
                            return;
                        }
                        this.network.sendPlay(ti, ei, actionId);
                    },
                    () => {
                        this.selectedTileIndex = -1;
                        this.renderer.renderHand(this.myHand, this.validMoves, -1);
                        this.syncMoveHintSelectionUiState();
                    }
                );
                this.syncMoveHintSelectionUiState();
            }
            return;
        }

        // --- Local Game Logic Below ---
        if(this.matchOver||this.roundOver||!this.gameActive) return;

        const pi = this.currentPlayer;
        const hand = this.hands[pi];
        const tile = hand[ti];
        if (!tile) return;
        
        if (this.board.isEmpty) {
            if (this.openingRequiredTileId) {
                if (pi !== this.openingRequiredPlayerIndex || tile.id !== this.openingRequiredTileId) {
                    const reqTile = hand.find(t => t.id === this.openingRequiredTileId) || tile;
                    const reqTileStr = this.describeTile(reqTile);
                    this.showTimedRoundStage({
                        phase: 'opening-required',
                        title: this.t('stage-opening-required-title') || 'Неверный первый ход',
                        subtitle: this.format('stage-opening-required', { tile: reqTileStr }) || `Начать нужно с ${reqTileStr}`,
                        tile: reqTile,
                        blocksInput: false
                    }, 1500);
                    return;
                }
                this.openingRequiredTileId = '';
                this.openingRequiredTileIndex = -1;
                this.openingRequiredPlayerIndex = -1;
                this.clearRoundStage();
            }
            this.playTile(pi, ti, -1);
            return;
        }
        const ends = [];
        for (let j=0; j<this.board.openEnds.length; j++) if (tile.hasValue(this.board.openEnds[j].value)) ends.push(j);
        if (ends.length > 1 && this.board.nodes.length === 1 && this.board.nodes[0].tile.isDouble) ends.length = 1;
        if (ends.length === 1) this.playTile(pi, ti, ends[0]);
        else if (ends.length > 1) {
            this.selectedTileIndex = ti;
            this.renderer.renderHand(hand, this.validMoves, this.selectedTileIndex);
            this.syncMoveHintSelectionUiState();
            this.renderer.showArrowChoices(this.board, ends,
                (ei) => {
                    if (this.isInputBlockedByStage()) return;
                    this.selectedTileIndex = -1;
                    this.playTile(pi, ti, ei);
                    this.syncMoveHintSelectionUiState();
                },
                () => {
                    this.selectedTileIndex = -1;
                    this.renderer.renderHand(this.hands[pi], this.validMoves, -1);
                    this.syncMoveHintSelectionUiState();
                }
            );
            this.syncMoveHintSelectionUiState();
        }
    }

    playGoshaCombo(fromRemote=false) {
        if (this.isInputBlockedByStage()) return;
        if (this.mode === 'classic101') return;
        if (this.network.isMultiplayer) {
            if (!this.canSendMultiplayerAction()) {
                const reason = this.lastBlockedOnlineActionReason;
                if (reason === 'connection_closed' || reason === 'reconnect_in_progress' || reason === 'no_room') {
                    this.notifyMultiplayerActionBlocked('connection');
                }
                return;
            }
            if (this.turnInProgress) return;
            this.turnInProgress = true;
            const actionId = this.network.sendGosha();
            if (!actionId) {
                this.turnInProgress = false;
                this.notifyMultiplayerActionBlocked('connection');
                return;
            }
            this.queuePendingOnlineAction({ type: 'gosha', actionId });
            return;
        }
        if(!this.goshaCombo||!this.gameActive||this.turnInProgress) return;
        const isHuman = this.currentPlayer === this.humanPlayerIndex;
        const isAI = this.ais.some(a => a.index === this.currentPlayer);
        if (!isHuman && !isAI) return;

        this.clearTurnTimers();
        this.turnInProgress=true; this.playSound('gosha');
        const pi = this.currentPlayer;
        const hand=this.hands[pi];
        const matches=this.goshaCombo.matches;
        const sorted=[...matches].sort((a,b)=>b.tileIndex-a.tileIndex);
        const tilesByIndex = new Map(matches.map((m) => [m.tileIndex, hand[m.tileIndex]]));
        for(const m of sorted) hand.splice(m.tileIndex,1);
        for(const m of matches){
            const openEndIndex = this.board.findOpenEndIndex(m.nodeId, m.side);
            const tile = tilesByIndex.get(m.tileIndex);
            if(openEndIndex === -1 || !tile){
                this.turnInProgress=false;
                return;
            }
            this.board.placeTile(tile,openEndIndex);
        }
        this.renderState();
        
        const score = this.goshaCombo?.score || this.ruleset.scoreDuringPlay(this.board);
        const roundEnd = this.ruleset.resolveRoundEnd({
            score,
            hand,
            board: this.board,
            hands: this.hands,
            boneyard: this.boneyard,
            playerIndex: pi,
            isInstantWinEnabled: this.instantWinEnabled,
            isGosha: true,
            isTeamMode: this.isTeamMode,
            matchState: this.matchRuleState,
            getTeamMembers: this.getTeamMembers.bind(this)
        });
        if(score>0){this.addScore(pi,score);if(this.checkEnd(pi,score,true,matches.length))return true;}
        this.broadcastMsg(this.format('msg-gosha', { player: this.playerNames[pi] }),2000);
        if(roundEnd?.dealEnd && !roundEnd?.fish){ this.delayLastMoveSettlement(()=>this.endDeal(pi,false), LAST_MOVE_REVEAL_DELAY_MS, this.inferFinalInfoFromLocalMove(pi, true, false, false, matches.length)); return true;}
        if(roundEnd?.dealEnd && roundEnd?.fish){ this.delayLastMoveSettlement(()=>this.endDeal(Number.isInteger(Number(roundEnd?.winnerIndex)) ? Number(roundEnd.winnerIndex) : this.findFishWinner(),true), LAST_MOVE_REVEAL_DELAY_MS, this.inferFinalInfoFromLocalMove(pi, true, true, false, matches.length)); return true;}
        this.turnInProgress=false;
        const advanceDelay = this.shouldOpenGoshaChainWindow(pi) ? this.postMoveAdvanceMs : 0;
        this.scheduleTurnAdvance(advanceDelay, this._turnCycleId);
    }

    drawFromBoneyard(fromRemote=false) {
        if (this.isInputBlockedByStage()) return;
        if (this.network.isMultiplayer) {
            if (!this.canSendMultiplayerAction()) {
                const reason = this.lastBlockedOnlineActionReason;
                if (reason === 'connection_closed' || reason === 'reconnect_in_progress' || reason === 'no_room') {
                    this.notifyMultiplayerActionBlocked('connection');
                }
                return;
            }
            if (this.turnInProgress) return;
            this.turnInProgress = true;
            const actionId = this.network.sendDraw();
            if (!actionId) {
                this.turnInProgress = false;
                this.notifyMultiplayerActionBlocked('connection');
                return;
            }
            this.queuePendingOnlineAction({ type: 'draw', actionId });
            return;
        }
        if(!this.gameActive||this.postMoveWindowActive) return;
        const isHuman = this.currentPlayer === this.humanPlayerIndex;
        const isAI = this.ais.some(a => a.index === this.currentPlayer);
        if (!isHuman && !isAI) return;

        const pi = this.currentPlayer;
        if(this.board.canPlayAny(this.normalizeHandForBoard(this.hands[pi]))){
            if (isHuman) this.renderer.showMessage(this.t('msg-has-move'), 1500);
            return;
        }
        if(!this.boneyard.length) return;

        const openValues = this.board.openEnds.map(e => e.value);
        for (const v of openValues) {
            if (this.playerMissingSuits[pi]) this.playerMissingSuits[pi].add(v);
        }

        if (this.mode === 'classic101' && isAI) {
            void this.runClassic101BotDrawSequence(pi, this._turnCycleId);
            return;
        }

        this.hands[pi].push(this.boneyard.pop());
        this.playSound('draw'); this.broadcastMsg(this.t('msg-took-bazaar'), 1500); this.renderState();
    }

    async runClassic101BotDrawSequence(pi, turnCycleId = this._turnCycleId) {
        if (this.mode !== 'classic101' || !this.ais.some((ai) => ai.index === pi)) return;
        const delay = CLASSIC101_BOT_DRAW_STEP_DELAY_MS;
        const hasPlayableMove = () => this.board.canPlayAny(this.normalizeHandForBoard(this.hands[pi]));
        while (
            turnCycleId === this._turnCycleId &&
            this.gameActive &&
            !this.roundOver &&
            !this.matchOver &&
            !hasPlayableMove()
        ) {
            if (!this.boneyard.length) {
                this.turnInProgress = false;
                this.passTurn();
                return;
            }
            const drawnTile = this.boneyard.pop();
            if (!drawnTile) break;
            this.hands[pi].push(drawnTile);
            this.playSound('draw');
            this.renderState();
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        if (
            turnCycleId !== this._turnCycleId ||
            !this.gameActive ||
            this.roundOver ||
            this.matchOver
        ) {
            this.turnInProgress = false;
            return;
        }
        if (!hasPlayableMove()) {
            this.turnInProgress = false;
            if (!this.boneyard.length) this.passTurn();
            return;
        }
        const moves = this.board.getValidMoves(this.normalizeHandForBoard(this.hands[pi]));
        const move = moves[0];
        if (!move) {
            this.turnInProgress = false;
            if (!this.boneyard.length) this.passTurn();
            return;
        }
        this.turnInProgress = false;
        const pName = this.getPlayerDisplayName(pi);
        this.showTimedRoundStage({
            phase: 'ai-playing',
            title: this.t('stage-ai-playing') || 'AI ходит',
            subtitle: pName,
            blocksInput: true
        }, 800);
        setTimeout(() => {
            if (turnCycleId !== this._turnCycleId) return;
            this.playTile(pi, move.tileIndex, move.openEndIndex);
        }, 800);
    }
    passTurn(fromRemote=false) {
        if (this.isInputBlockedByStage()) return;
        if (this.network.isMultiplayer) {
            if (!this.canSendMultiplayerAction()) {
                const reason = this.lastBlockedOnlineActionReason;
                if (reason === 'connection_closed' || reason === 'reconnect_in_progress' || reason === 'no_room') {
                    this.notifyMultiplayerActionBlocked('connection');
                }
                return;
            }
            if (this.turnInProgress) return;
            this.turnInProgress = true;
            const actionId = this.network.sendPass();
            if (!actionId) {
                this.turnInProgress = false;
                this.notifyMultiplayerActionBlocked('connection');
                return;
            }
            this.queuePendingOnlineAction({ type: 'pass', actionId });
            return;
        }
        if(!this.gameActive||this.turnInProgress||this.postMoveWindowActive) return;
        const isHuman = this.currentPlayer === this.humanPlayerIndex;
        const isAI = this.ais.some(a => a.index === this.currentPlayer);
        if (!isHuman && !isAI) return;

        const pi = this.currentPlayer;
        if(this.board.canPlayAny(this.normalizeHandForBoard(this.hands[pi]))){
            if (isHuman) this.renderer.showMessage(this.t('msg-has-move'), 1500);
            return;
        }
        if(this.boneyard.length>0){
            if (isHuman) this.renderer.showMessage(this.t('msg-wait-bazaar'), 1500);
            return;
        }

        const openValues = this.board.openEnds.map(e => e.value);
        for (const v of openValues) {
            if (this.playerMissingSuits[pi]) this.playerMissingSuits[pi].add(v);
        }
        this.clearTurnTimers();
        this.turnInProgress=true;
        this.playSound('pass'); this.broadcastMsg(this.t('btn-pass'), 300); 
        this._turnAdvanceTimeout = setTimeout(()=>{this.turnInProgress=false;this.advanceTurn();}, 300);
    }

    log(m) {
        const l = document.getElementById('debug-log');
        if(!l) return;
        const d = document.createElement('div'); d.textContent = `> ${m}`;
        l.appendChild(d); if(l.children.length > 5) l.removeChild(l.firstChild);
    }

    addScore(pi,score){
        this.scores[pi]+=score; if(this.isTeamMode)this.teamScores[this.getTeam(pi)]+=score;
        this.showScoreFeedback(score);
        this.broadcastMsg(`${this.playerNames[pi]} +${score}!`,2000);
        return score;
    }
    checkEnd(pi,score,isGosha=false,comboMatchesLength=0){
        const roundEnd = this.ruleset.resolveRoundEnd({
            score,
            hand: this.hands[pi] || [],
            board: this.board,
            hands: this.hands,
            boneyard: this.boneyard,
            playerIndex: pi,
            isInstantWinEnabled: this.instantWinEnabled,
            isGosha,
            isTeamMode: this.isTeamMode,
            matchState: this.matchRuleState,
            getTeamMembers: this.getTeamMembers.bind(this)
        });
        if (roundEnd?.isInstantWin) {
            this.playSound('win');
            this.delayLastMoveSettlement(() => this.endRound(pi, true), LAST_MOVE_REVEAL_DELAY_MS, this.inferFinalInfoFromLocalMove(pi, isGosha, false, true, comboMatchesLength));
            return true;
        }
        return false;
    }

    async playTile(pi,ti,oei) {
        if(this.turnInProgress) return;
        if (this.postMoveWindowActive) return;
        this.clearTurnTimers();
        this.turnInProgress=true;
        const turnCycleId = this._turnCycleId;
        try {
        const hand=this.hands[pi],tile=hand && hand[ti];
        if(!tile){this.turnInProgress=false;return;}
        if(!this.board.isEmpty && !this.board.openEnds[oei]){this.turnInProgress=false;return;}
        if (!this.board.isEmpty) {
            const openEnd = this.board.openEnds[oei];
            if (!openEnd || !tile.hasValue(openEnd.value)) {
                this.turnInProgress = false;
                return;
            }
        }
        const sourceEl = pi === this.humanPlayerIndex ? this.renderer.handEl?.children?.[ti] || null : null;
        const sourceRect = sourceEl?.getBoundingClientRect?.() || null;
        const sourceNode = sourceEl?.cloneNode?.(true) || null;
        this.renderer._pendingBoardTileTravel = sourceRect && sourceNode ? { tileId: tile.id, sourceRect, sourceNode } : null;
        hand.splice(ti,1);
        this.playSound('place');
        const wasEmpty = this.board.isEmpty;
        let score = 0;
        if (wasEmpty) {
            this.board.placeFirst(tile);
            score = this.ruleset.openingPlayScore(tile, this.getOpeningScoreContext(pi));
        } else {
            score = this.board.placeTile(tile,oei);
        }
        this.selectedTileIndex=-1;
        this.log(`Play pi=${pi} ti=${ti}`);
        this.renderState();
        const travelPromise = sourceRect
            ? new Promise((resolve) => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        this.renderer.animateTileTravel(tile.id).finally(resolve);
                    });
                });
            })
            : Promise.resolve();
        await travelPromise;
        if (this.mode === 'classic101') {
            score = this.ruleset.scoreDuringPlay(this.board);
        }

        if (this.mode === 'classic101') {
            debugLog('[101-debug] playTile pre-resolve', {
                player: pi,
                handLength: hand.length,
                score,
                boardEmpty: wasEmpty,
                fish: false,
                turnInProgress: this.turnInProgress
            });
        }
        const roundEnd = this.ruleset.resolveRoundEnd({
            score,
            hand,
            board: this.board,
            hands: this.hands,
            boneyard: this.boneyard,
            playerIndex: pi,
            isInstantWinEnabled: this.instantWinEnabled,
            isGosha: false,
            isTeamMode: this.isTeamMode,
            matchState: this.matchRuleState,
            getTeamMembers: this.getTeamMembers.bind(this)
        });

        if(score>0){this.addScore(pi,score);if(this.checkEnd(pi,score))return true;}
        if (this.mode === 'classic101') {
            debugLog('[101-debug] playTile roundEnd', {
                player: pi,
                handLength: hand.length,
                dealEnd: Boolean(roundEnd?.dealEnd),
                fish: Boolean(roundEnd?.fish),
                isFinalMove: Boolean(roundEnd?.isFinalMove),
                winnerIndex: roundEnd?.winnerIndex,
                scoreDelta: roundEnd?.scoreDelta,
                rawPoints: roundEnd?.rawPoints
            });
        }
        if(roundEnd?.dealEnd && !roundEnd?.fish){ this.delayLastMoveSettlement(()=>{ if (turnCycleId !== this._turnCycleId) return; this.endDeal(pi,false); }, LAST_MOVE_REVEAL_DELAY_MS, this.inferFinalInfoFromLocalMove(pi, false, false, false)); return true;}
        if(roundEnd?.dealEnd && roundEnd?.fish){ this.delayLastMoveSettlement(()=>{ if (turnCycleId !== this._turnCycleId) return; this.endDeal(Number.isInteger(Number(roundEnd?.winnerIndex)) ? Number(roundEnd.winnerIndex) : this.findFishWinner(),true); }, LAST_MOVE_REVEAL_DELAY_MS, this.inferFinalInfoFromLocalMove(pi, false, true, false)); return true;}

        this.turnInProgress=false;
        if (this.mode === 'classic101') {
            debugLog('[101-debug] playTile advanceTurn', {
                player: pi,
                nextPlayer: (pi + 1) % this.playerCount,
                turnCycleId
            });
        }
        this.scheduleTurnAdvance(0, turnCycleId);
        } catch (e) {
            console.error('[playTile] Error:', e);
            this.turnInProgress = false;
        }
    }

    advanceTurn() {
        this.postMoveWindowActive = false;
        clearTimeout(this._turnAdvanceTimeout);
        this._turnAdvanceTimeout = null;
        const blocked = this.mode === 'classic101' && this.boneyard.length > 0
            ? null
            : this.ruleset.resolveBlocked({
                board: this.board,
                hands: this.hands,
                boneyard: this.boneyard,
                isTeamMode: this.isTeamMode,
                matchState: this.matchRuleState,
                getTeamMembers: this.getTeamMembers.bind(this)
            });
        if (blocked?.blocked) {
            this.endDeal(Number.isInteger(Number(blocked?.winnerIndex)) ? Number(blocked.winnerIndex) : this.findFishWinner(), true);
            return;
        }
        this.currentPlayer=(this.currentPlayer+1)%this.playerCount;
        this.renderState();
        this.startTurnTimer();
        if(this.currentPlayer===this.humanPlayerIndex){
            const h=this.hands[this.currentPlayer];
            if(!this.board.canPlayAny(this.normalizeHandForBoard(h))&&!this.boneyard.length){
                this.broadcastMsg(this.t('msg-no-moves'), 1000);
                this.turnInProgress=true;
                setTimeout(()=>{this.turnInProgress=false;this.advanceTurn();},1000);
            } else {
                this.showTimedRoundStage({
                    phase: 'your-turn',
                    title: this.t('stage-your-turn') || 'Ваш ход',
                    blocksInput: false
                }, 1000);
                this.renderer.showMessage(this.t('msg-your-turn'), 1000);
            }
        } else {
            const pName = this.getPlayerDisplayName(this.currentPlayer);
            this.setRoundStage({
                phase: 'ai-thinking',
                title: this.t('stage-ai-thinking') || 'AI думает...',
                subtitle: pName,
                blocksInput: false
            });
        }
        debugLog('[turn] advanceTurn handoff', {
            mode: this.mode,
            nextPlayer: this.currentPlayer,
            isAI: this.ais.some((ai) => ai.index === this.currentPlayer),
            turnInProgress: this.turnInProgress
        });
        this.queueAITurnIfNeeded(BOT_THINK_DELAY_MS);
    }

    queueAITurnIfNeeded(delay) {
        const isAI = this.ais.some(a => a.index === this.currentPlayer);
        if (isAI) {
            const turnCycleId = this._turnCycleId;
            clearTimeout(this._aiTurnTimeout);
            debugLog('[turn] queueAITurnIfNeeded', {
                mode: this.mode,
                nextPlayer: this.currentPlayer,
                delay,
                turnCycleId
            });
            this._aiTurnTimeout = setTimeout(() => {
                if (turnCycleId !== this._turnCycleId) return;
                this.aiTurn();
            }, delay);
        }
    }

    aiTurn() {
        if(!this.gameActive||this.turnInProgress||this.matchOver||this.roundOver) return;
        const pi=this.currentPlayer;
        const ai=this.ais.find(a=>a.index===pi);
        if(!ai) return;

        const hand = this.hands[pi];
        this.turnInProgress = true;
        const turnCycleId = this._turnCycleId;
        clearTimeout(this._aiTurnTimeout);
        if (turnCycleId !== this._turnCycleId) return;

        const combo = this.board.getGoshaCombo(hand);
        if (combo) {
            this.goshaCombo = combo;
            this.turnInProgress = false;
            const pName = this.getPlayerDisplayName(pi);
            this.showTimedRoundStage({
                phase: 'ai-playing',
                title: this.t('stage-ai-gosha') || 'AI играет Гошу',
                subtitle: pName,
                blocksInput: true
            }, 800);
            setTimeout(() => {
                if (turnCycleId !== this._turnCycleId) return;
                this.playGoshaCombo();
            }, 800);
            return;
        }

        const moves = this.board.getValidMoves(hand);
        const move = ai.chooseMove(this.board, hand, moves, this.scores, this.hands, this.boneyard, this.playerMissingSuits);

        if (move) {
            this.turnInProgress = false;
            const pName = this.getPlayerDisplayName(pi);
            this.showTimedRoundStage({
                phase: 'ai-playing',
                title: this.t('stage-ai-playing') || 'AI ходит',
                subtitle: pName,
                blocksInput: true
            }, 800);
            setTimeout(() => {
                if (turnCycleId !== this._turnCycleId) return;
                this.playTile(pi, move.tileIndex, move.openEndIndex);
            }, 800);
        } else if (this.boneyard.length > 0) {
            if (this.mode === 'classic101') {
                void this.runClassic101BotDrawSequence(pi, turnCycleId);
                return;
            }
            this.turnInProgress = false;
            this.drawFromBoneyard();
            debugLog('[turn] aiTurn draw handoff', {
                mode: this.mode,
                player: pi,
                nextPlayer: this.currentPlayer,
                turnInProgress: this.turnInProgress
            });
            this.queueAITurnIfNeeded(BOT_THINK_DELAY_MS);
        } else {
            this.turnInProgress = false;
            this.passTurn();
        }
    }

    findFishWinner(){
        const resolved = this.ruleset.resolveBlocked({
            board: this.board,
            hands: this.hands,
            boneyard: this.boneyard,
            isTeamMode: this.isTeamMode,
            matchState: this.matchRuleState,
            getTeamMembers: this.getTeamMembers.bind(this)
        });
        return Number.isInteger(Number(resolved?.winnerIndex)) ? Number(resolved.winnerIndex) : 0;
    }

    isMatchTargetReached() {
        const pool = this.isTeamMode ? this.teamScores : this.scores;
        return pool.some((score) => Number(score || 0) >= this.ruleset.matchTarget);
    }

    getMatchWinnerIndex() {
        const pool = this.isTeamMode ? this.teamScores : this.scores;
        if (!Array.isArray(pool) || pool.length === 0) return 0;
        const top = Math.max(...pool.map((score) => Number(score || 0)));
        return Math.max(0, pool.indexOf(top));
    }

    endDeal(wi,fish){
        this.roundOver=false;
        this.gameActive=false;this.lastDealWinner=wi;this.turnInProgress=false;this.clearTurnTimers();let bonus=0;
        if (this.mode === 'classic101') {
            debugLog('[101-debug] endDeal classic101', {
                winnerIndex: wi,
                fish: Boolean(fish),
                currentHands: this.hands.map((hand) => Array.isArray(hand) ? hand.length : 0),
                currentScores: this.scores.slice(),
                teamScores: this.teamScores.slice()
            });
            const roundResult = this.ruleset.resolveRoundEnd({
                score: 0,
                hand: this.hands[wi] || [],
                board: this.board,
                hands: this.hands,
                boneyard: this.boneyard,
                playerIndex: wi,
                isInstantWinEnabled: this.instantWinEnabled,
                isGosha: false,
                isTeamMode: this.isTeamMode,
                fish: Boolean(fish),
                matchState: this.matchRuleState,
                getTeamMembers: this.getTeamMembers.bind(this)
            });
            this.lastClassic101RoundResult = roundResult;
            this.matchRuleState = roundResult.matchState || this.matchRuleState;
            this.syncClassic101ScoreState(this.matchRuleState);
            bonus = Number(roundResult?.scoreDelta || 0);
            if (bonus > 0) {
                this.playSound('score');
                this.showScoreFeedback(bonus);
            }
            sndWin();
            const scorePool = this.isTeamMode ? this.teamScores : this.scores;
            const cs = scorePool.length > 0 ? Math.max(...scorePool) : 0;
            if (cs >= this.ruleset.matchTarget) {
                const rw = scorePool.indexOf(cs);
                if (rw === -1) return;
                this.endRound(this.isTeamMode ? (rw === 0 ? 0 : 1) : rw);
                return;
            }
            let displayEntities;
            if (this.isTeamMode) {
                const wt = this.getTeam(wi);
                displayEntities = [
                    {name: this.getTeamDisplayName(0), isWinner: wt===0, score: this.teamScores[0], handPoints: this.getTeamHandPoints(0), leftoverHands: this.getTeamLeftoverHands(0)},
                    {name: this.getTeamDisplayName(1), isWinner: wt===1, score: this.teamScores[1], handPoints: this.getTeamHandPoints(1), leftoverHands: this.getTeamLeftoverHands(1)}
                ];
            } else {
                displayEntities = this.playerNames.map((n,i)=>({name:n,isWinner:i===wi,handPoints:this.ruleset.handPoints(this.hands[i]),score:this.scores[i], leftoverHands: [this.hands[i]]}));
            }
            this.renderer.renderDealEnd(this.playerNames[wi],displayEntities,Boolean(fish),bonus);
            this.deal++;
            this.persistGameResumeSnapshot();
            void this.syncLocalPresence();
            this.scheduleNextDealAdvance(DEAL_END_MODAL_MS);
            return;
        }
        let displayEntities;
        if(this.isTeamMode){
            const wt=this.getTeam(wi);let os=0;
            const teamMembers = this.getTeamMembers(wt);
            const otherMembers = this.getTeamMembers(1 - wt);
            for (const i of otherMembers) os += this.ruleset.handPoints(this.hands[i] || []);
            if (fish) for (const i of teamMembers) os -= this.ruleset.handPoints(this.hands[i] || []);
            const currentScore = this.teamScores[wt] || 0;
            bonus = currentScore > 300 ? 0 : roundTo5(Math.max(0, os));
            if (bonus > 0) bonus = this.addScore(wi, bonus);
            displayEntities = [
                {name: this.getTeamDisplayName(0), isWinner: wt===0, score: this.teamScores[0], handPoints: this.getTeamHandPoints(0), leftoverHands: this.getTeamLeftoverHands(0)},
                {name: this.getTeamDisplayName(1), isWinner: wt===1, score: this.teamScores[1], handPoints: this.getTeamHandPoints(1), leftoverHands: this.getTeamLeftoverHands(1)}
            ];
        }else{
            let os=0;for(let i=0;i<this.playerCount;i++)if(i!==wi)os+=this.ruleset.handPoints(this.hands[i]);
            if(fish)os-=this.ruleset.handPoints(this.hands[wi]);
            const currentScore = this.scores[wi] || 0;
            bonus = currentScore > 300 ? 0 : roundTo5(Math.max(0, os));
            if (bonus > 0) bonus = this.addScore(wi, bonus);
            displayEntities = this.playerNames.map((n,i)=>({name:n,isWinner:i===wi,handPoints:this.ruleset.handPoints(this.hands[i]),score:this.scores[i], leftoverHands: [this.hands[i]]}));
        }
        sndWin();
        const scorePool = this.isTeamMode ? this.teamScores : this.scores;
        const cs = scorePool.length > 0 ? Math.max(...scorePool) : 0;
        if (cs >= this.ruleset.matchTarget) {
            const rw = scorePool.indexOf(cs);
            if (rw === -1) return;
            this.endRound(this.isTeamMode ? (rw === 0 ? 0 : 1) : rw);
            return;
        }
        this.renderer.renderDealEnd(this.playerNames[wi],displayEntities,fish,bonus);
        this.deal++;
        this.persistGameResumeSnapshot();
        void this.syncLocalPresence();
        this.scheduleNextDealAdvance(DEAL_END_MODAL_MS);
    }
    endRound(wi){
        this.roundOver=true;
        this.clearTurnTimers();
        let wins=1;
        let displayEntities;
        if (this.mode === 'classic101') {
            debugLog('[101-debug] endRound classic101', {
                winnerIndex: wi,
                dryWin: this.lastClassic101RoundResult?.dryWin,
                currentScores: this.scores.slice(),
                teamScores: this.teamScores.slice()
            });
            wins = this.lastClassic101RoundResult?.dryWin ? 2 : 1;
            this.lastClassic101RoundResult = null;
            if(this.isTeamMode){
                this.teamRoundWins[this.getTeam(wi)]+=wins;
                displayEntities = [
                    {name: this.getTeamDisplayName(0), isWinner: this.getTeam(wi)===0, score: this.teamScores[0], roundWins: this.teamRoundWins[0]},
                    {name: this.getTeamDisplayName(1), isWinner: this.getTeam(wi)===1, score: this.teamScores[1], roundWins: this.teamRoundWins[1]}
                ];
            } else {
                this.roundWins[wi]+=wins;
                displayEntities = this.playerNames.map((n,i)=>({name:n,isWinner:i===wi,score:this.scores[i],roundWins:this.roundWins[i]}));
            }
        } else if(this.isTeamMode){
            if(this.teamScores[1-this.getTeam(wi)]<this.dlossThreshold)wins=2;this.teamRoundWins[this.getTeam(wi)]+=wins;
            displayEntities = [
                {name: this.getTeamDisplayName(0), isWinner: this.getTeam(wi)===0, score: this.teamScores[0], roundWins: this.teamRoundWins[0]},
                {name: this.getTeamDisplayName(1), isWinner: this.getTeam(wi)===1, score: this.teamScores[1], roundWins: this.teamRoundWins[1]}
            ];
        }else{
            for(let i=0;i<this.playerCount;i++)if(i!==wi&&this.scores[i]<this.dlossThreshold){wins=2;break;}this.roundWins[wi]+=wins;
            displayEntities = this.playerNames.map((n,i)=>({name:n,isWinner:i===wi,score:this.scores[i],roundWins:this.roundWins[i]}));
        }
        this.matchOver = this.isMatchTargetReached();
        if (!this.isTeamMode && this.soloEconomyMode === 'coins') {
            this.pendingSoloSettlement = this.settleSoloRoundStake(wi);
        } else if (this.isTeamMode && this.soloEconomyMode === 'coins') {
            this.pendingSoloSettlement = this.settleSoloRoundStake(wi);
        }
        if (this.matchOver) {
            this.showMatchResult();
            this.matchRound++;
            void this.syncLocalPresence();
            return;
        }
        this.matchRound++;
        this.persistGameResumeSnapshot();
        void this.syncLocalPresence();
        const winnerLabel = this.isTeamMode ? this.getTeamDisplayName(this.getTeam(wi)) : this.playerNames[wi];
        this.renderer.renderRoundEnd(winnerLabel,displayEntities,wins,this.matchRound - 1,false);
        this.scheduleNextDealAdvance(DEAL_END_MODAL_MS);
    }
    showMatchResult(){
        this.clearRoundStage();
        this.clearNextDealAdvanceTimeout();
        const newGameBtn = document.getElementById('new-game-btn');
        if (newGameBtn) newGameBtn.style.display = '';
        const economySummary = this.network.isMultiplayer
            ? (this.onlineEconomyMode === 'coins' ? { ...this.onlineCoinSummary } : null)
            : (this.soloEconomyMode === 'coins' ? { ...this.coinMatchSummary } : null);
        const isTeamMode = this.resolveRoomModeState(this.currentRoomState, null).isTeamMode;
        if(isTeamMode){
            const w=this.teamScores[0]>=this.teamScores[1]?0:1;
            this.renderer.renderGameOver(w===0?this.getTeamDisplayName(0):this.getTeamDisplayName(1),[
                {name:this.t('team-a'),score:this.teamScores[0],roundWins:this.teamRoundWins[0]},
                {name:this.t('team-b'),score:this.teamScores[1],roundWins:this.teamRoundWins[1]}
            ], economySummary);
            void this.recordLocalMatchResult(w);
        }
        else{
            let w=0,mx=-Infinity;for(let i=0;i<this.playerCount;i++)if((this.scores[i]||0)>mx){mx=this.scores[i]||0;w=i;}
            this.renderer.renderGameOver(this.playerNames[w],this.playerNames.map((n,i)=>({name:n,score:this.scores[i],roundWins:this.roundWins[i]})), economySummary);
            void this.recordLocalMatchResult(w);
        }
        void this.clearLocalPresence();
        this.clearGameResumeSnapshot();
    }

    renderDisconnectGameOver(payload = {}) {
        this.clearNextDealAdvanceTimeout();
        this.clearTurnTimers();
        this.lastGameEndModalReason = String(payload.reasonKey || payload.reason || 'game-over-disconnect').trim() || 'game-over-disconnect';
        this.gameActive = false;
        this.roundOver = true;
        this.matchOver = true;
        this.lastDisconnectEconomySummary = payload.economy || null;
        if (!this.disconnectEconomyApplied) {
            this.applyOnlineEconomySettlement(payload.economy || null);
            this.disconnectEconomyApplied = true;
        }

        const titleText = this.t('game-over-disconnect');
        const players = Array.isArray(payload.players) && payload.players.length
            ? payload.players
            : this.playerNames.map((name, index) => ({
                name,
                score: this.scores[index] || 0,
                roundWins: this.roundWins[index] || 0
            }));
        const isTeamMode = this.resolveRoomModeState(this.currentRoomState, null).isTeamMode;
        const winnerLabel = isTeamMode
            ? (payload.teamScores?.[0] >= payload.teamScores?.[1] ? this.getTeamDisplayName(0) : this.getTeamDisplayName(1))
            : (payload.values?.player || this.t('online-room-closed'));
        const economySummary = this.network.isMultiplayer
            ? (this.onlineEconomyMode === 'coins' ? { ...this.onlineCoinSummary } : null)
            : (this.soloEconomyMode === 'coins' ? { ...this.coinMatchSummary } : null);
        this.renderer.renderGameOver(winnerLabel, players, economySummary, { titleText });
        const newGameBtn = document.getElementById('new-game-btn');
        if (newGameBtn) newGameBtn.style.display = 'none';
        const quitBtn = document.getElementById('game-over-quit-btn');
        if (quitBtn) quitBtn.textContent = this.t('game-over-quit');
        document.getElementById('round-end-screen')?.classList.remove('active');
        document.getElementById('menu-screen')?.classList.remove('active');
        document.getElementById('start-screen')?.classList.remove('active');
        document.getElementById('game-screen')?.classList.remove('active');
        document.getElementById('game-over-screen')?.classList.add('active');
    }

    async recordLocalMatchResult(winnerIndex) {
        if (this.network.isMultiplayer) return;
        const platformToken = this.account?.getRoomAuthToken?.();
        if (!platformToken) return;
        const isTeamMode = this.resolveRoomModeState(this.currentRoomState, null).isTeamMode;
        try {
            const participants = this.playerNames.map((name, index) => ({
                isSelf: index === this.humanPlayerIndex,
                name,
                teamIndex: isTeamMode ? (index % 2) : null,
                winnerKey: isTeamMode ? `team:${winnerIndex}` : `player:${winnerIndex}`,
                points: isTeamMode ? (this.teamScores[index % 2] || 0) : (this.scores[index] || 0),
                roundWins: isTeamMode ? (this.teamRoundWins[index % 2] || 0) : (this.roundWins[index] || 0),
                economyMode: this.soloEconomyMode,
                stakeKey: this.soloStakeKey
            }));
            await this.account.recordMatch({
                mode: isTeamMode ? 'team' : 'solo',
                isTeamMode,
                winnerKey: isTeamMode ? `team:${winnerIndex}` : `player:${winnerIndex}`,
                participants,
                economyMode: this.soloEconomyMode,
                stakeKey: this.soloStakeKey,
                matchSessionId: this.currentMatchSessionId
            });
        } catch (err) {
            console.warn('[Account] Failed to record local match:', err);
        }
    }
}
let game = null;
game = new DominoGame();
window.game = game;
window.__dominoSocialRealtimeStatus = () => window.game?.getSocialRealtimeStatus?.() || null;
window.__dominoClearAppCacheAndReload = async () => {
    try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => String(key).startsWith('domino-')).map((key) => caches.delete(key)));
    } catch (error) {
        console.warn('[SW] cache clear failed', error);
    }

    try {
        const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];
        await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch (error) {
        console.warn('[SW] unregister failed', error);
    }

    try {
        localStorage.removeItem('dominoSwReloadedForVersion');
    } catch {}

    location.reload();
};
window.__dominoForceSocialSocketConnect = async () => {
    const app = window.game;
    if (!app) {
        return { error: 'app_unavailable' };
    }
    await app.ensureSocialRealtimeStarted?.('manual-force');
    return window.__dominoSocialRealtimeStatus?.() || null;
};
window.__dominoSocialSocketDebugOn = () => {
    try {
        localStorage.setItem('dominoDebugSocial', 'true');
    } catch {}
    window.DOMINO_DEBUG_SOCIAL = true;
    window.game?.ensureSocialDebugPanel?.();
    return window.__dominoSocialRealtimeStatus?.() || null;
};
window.__dominoSocialDebugState = () => {
    const app = window.game;
    if (!app) {
        return { error: 'app_unavailable' };
    }
    return app.getSocialDebugState?.() || { error: 'debug_state_unavailable' };
};
window.__dominoInviteDebugState = () => {
    const app = window.game;
    if (!app) {
        return { error: 'app_unavailable' };
    }

    const debugState = app.getSocialDebugState?.() || {};
    const invites = debugState.invites || {};
    const socialCenterOpen = Boolean(document.getElementById('social-center-modal')?.classList.contains('active'));

    return {
        socketConnected: Boolean(debugState.socket?.socketConnected),
        socketReady: Boolean(debugState.socket?.socketReady),
        ...invites,
        socialCenterOpen,
        currentSocialTab: String(app.socialCenterTab || '').trim() || null
    };
};
window.__dominoDailyBonusDebugState = () => {
    const app = window.game;
    if (!app) {
        return { error: 'app_unavailable' };
    }
    return app.getDailyBonusDebugState?.() || { error: 'debug_state_unavailable' };
};
window.__dominoFindDailyBonusButtons = () => {
    const app = window.game;
    if (!app) {
        return { error: 'app_unavailable' };
    }
    return app.getDailyBonusButtonsSnapshot?.() || { error: 'debug_state_unavailable' };
};
window.__dominoCheckSocialSocketPrerequisites = async () => {
    const app = window.game;
    if (!app) {
        return { error: 'app_unavailable' };
    }
    const platformApiBase = String(app.account?.platformApiBase || '').trim();
    const token = String(app.account?.getSocialSocketAuthToken?.() || app.account?.platformGameToken || '').trim();
    const socketUrl = String(app.account?.getSocialSocketUrl?.() || '').trim();
    const socketPath = String(app.account?.getSocialSocketPath?.() || '/api/socket.io').trim();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    const probe = async (url) => {
        try {
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
                headers
            });
            return { ok: response.ok, status: response.status };
        } catch (error) {
            return { ok: false, status: 0, error: String(error?.message || error || 'fetch_failed') };
        }
    };

    const health = await probe(`${platformApiBase}/health`);
    const summary = await probe(`${platformApiBase}/social/summary`);
    return {
        healthOk: Boolean(health.ok),
        healthStatus: Number(health.status || 0) || 0,
        summaryOk: Boolean(summary.ok),
        summaryStatus: Number(summary.status || 0) || 0,
        tokenExists: Boolean(token),
        socketUrl,
        socketPath
    };
};

// Re-render board on resize for correct scaling (debounced)
let _resizeTimer = null;
window.addEventListener('resize', () => {
    if (!game?.gameActive) return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => game.renderState(), 150);
});

window.__dominoDebugState = () => {
    const app = window.game;
    if (!app) return { error: 'app_unavailable' };
    const board = app.board || {};
    const bounds = app.renderer?._konvaBoardRenderer?.lastLayout?.bounds || {};
    return {
        boardStartAxis: board.startAxis || 'horizontal',
        firstTileOrientation: board.nodes?.[0]?.orientation || null,
        firstOpenEndSides: board.openEnds?.map(oe => oe.side) || [],
        firstOpenEndGrowthDirs: board.openEnds?.map(oe => oe.growthDir) || [],
        boardBoundsWidth: bounds.width || 0,
        boardBoundsHeight: bounds.height || 0,
        boardScale: app.renderer?._konvaBoardRenderer?.lastLayout?.scale || 0,
        boardIsVerticalStartEnabled: (board.startAxis === 'vertical')
    };
};



