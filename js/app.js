import { Tile, createFullSet, shuffle, getHandSize, determineFirstPlayer, handPoints, getOpeningPlayScore, hasInvalidOpeningHand, roundTo5 } from './model.js';
import { Board, cloneBoard, reconstructBoard } from './board.js';
import { AIPlayer } from './ai.js';
import { Renderer } from './renderer.js?v=social-live-1';
import { translations } from './translations.js';
import { AccountClient } from './account.js';
import { VoiceChatManager } from './voice.js';
import { sndPlace, sndScore, sndDraw, sndPass, sndWin, sndGosha, startMenuMusic, startGameMusic, nextTrack, toggleMute, stopMusic } from './sounds.js?v=social-live-1';
// NetworkManager is loaded as global script

const TARGET=365, MAX_R=3, DLOSS=255, IWIN=35;
const TURN_TIMEOUT_MS = 30000;
const BOT_THINK_DELAY_MS = 1500;
const DEAL_END_MODAL_MS = 5000;
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
        return window.__DOMINO_DEBUG_LOGS === true || window.localStorage?.getItem("dominoDebugLogs") === "true";
    } catch {
        return false;
    }
}

function debugLog(...args) {
    if (isDebugLoggingEnabled()) console.log(...args);
}

const DOMINO_CLIENT_BUILD = {
    gitCommit: '669bbdc',
    builtAt: new Date().toISOString(),
    socialRealtimeDebugVersion: 'browser-production-trace-v1',
    cacheFixVersion: 'domino-v35'
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
        this.renderer = new Renderer(this); this.board = new Board();
        this.playerMissingSuits = [];
        this.playerCount=2; this.onlinePlayerCount=2; this.onlineAiCount=0; this.playerName=''; this.difficulty='medium';
        this.onlineStakeKey = 'stake_200';
        this.onlineRoomVisibility = 'closed';
        this.onlineRoomSource = 'closed';
        this.openRoomsStage = 'menu';
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
        this.voice = new VoiceChatManager(this);
        this.account = new AccountClient(() => this.network.getServerUrl());
        this.accountProfile = this.account.getStoredProfile();
        this.accountDetails = null;
        this.accountOnline = false;
        this.accountMode = 'login';
        this.pendingAvatarMode = 'keep';
        this.pendingAvatarDataUrl = null;
        this.pendingAvatarProfile = null;
        this.localPresenceLastSentAt = 0;
        this.localPresenceClearQueued = false;
        this.currentLang = this.loadSavedLanguage();
        this.currentMatchStartedAt = null;
        this.currentMatchSessionId = null;
        this.activeMatchEconomyMode = 'coins';
        this.activeMatchStakeKey = 'stake_50';
        this.currentRoundStakeSessionId = null;
        this.currentRoundStakeKey = 'stake_50';
        this.currentRoundStakeAmount = 0;
        this.currentRoundBankAmount = 0;
        this.coinMatchSummary = { spent: 0, won: 0 };
        this.onlineCoinSummary = { spent: 0, won: 0 };
        this.currentRoomState = null;
        this.seatSelectionUi = null;
        this.pendingReconnectResolution = false;
        this.openRooms = [];
        this.socialCenterTab = 'friends';
        this.socialCenterView = 'list';
        this.onlineSocialPanel = 'rooms';
        this.onlineRoomFilters = {
            search: '',
            roomMode: 'all',
            stakeKey: 'all'
        };
        this.pendingSharedRoomCode = '';
        this.friendSearchResults = [];
        this.friendHub = { accepted: [], incoming: [], outgoing: [] };
        this.friendPresenceMap = new Map();
        this.roomInvitations = { incoming: [], sent: [] };
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
        this._socialSocketAuthRefreshPending = false;
        this._socialSocketFallbackTimer = null;
        this._socialSocketFallbackActive = false;
        this._socialSocketPath = '';
        this._socialSocketUrl = '';
        this._socialSocketLastConnectError = '';
        this._socialSocketLastEventAt = 0;
        this._socialSocketAuthToken = "";
        this._socialSocketAuthRefreshAttempted = false;
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
        this._pendingOptimisticPlayTileId = '';
        this._pendingOptimisticPlayActionId = '';
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
        this.selectedGiftRecipientId = '';
        this.lastGiftSentAt = 0;
        this.lastGiftSentKey = '';
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
        this.playerProfileState = null;
        this.socialCenterUnreadCount = 0;
        this.dailyBonusState = {
            loading: false,
            status: null,
            claiming: false,
            error: ''
        };
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
        this.stopOpenRoomsAutoRefresh();
        this.stopCoinShopTicker();
        this.voice?.destroy?.();
        this.clearTurnTimers();
    }
    setupStartScreen() {
        this.ensureStartScreenEnhancements();
        this.ensureGameHudEnhancements();
        this.ensureMenuEnhancements();
        this.ensureAuthIconMarkup();
        this.ensureSocialIconMarkup();
        this.ensureSocialCenterUi();
        this.ensureNameEditModal();
        this.ensureSeatSelectionUi();
        this.setLanguage(this.currentLang);

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
            this.openRoomsStage = 'menu';
            this.hideOpenRoomsModal();
            this.showStartModal('online');
            this.showOnlineCreateFlow('open');
        });
        const openRoomsJoinBtn = document.getElementById('open-rooms-join-btn');
        if (openRoomsJoinBtn) openRoomsJoinBtn.addEventListener('click', () => this.showOpenRoomsList());
        if (openLeaderboardBtn) openLeaderboardBtn.addEventListener('click', async () => {
            await this.openLeaderboardModal();
        });
        document.querySelectorAll('[data-leaderboard-scope]').forEach((button) => {
            button.addEventListener('click', () => {
                void this.loadLeaderboard(button.dataset.leaderboardScope || 'overall');
            });
        });
        if (openFriendsBtn) openFriendsBtn.addEventListener('click', async () => {
            await this.openFriendsModal();
        });
        if (openSocialBtn) openSocialBtn.addEventListener('click', async () => {
            await this.openSocialCenterModal('friends');
        });
        const socialCenterTabs = document.getElementById('social-center-tabs');
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
        if (playerProfileModalClose) playerProfileModalClose.addEventListener('click', () => this.closePlayerProfileModal());
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
            });
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
        document.getElementById('open-room-mode-filter')?.addEventListener('change', () => {
            this.onlineRoomFilters.roomMode = document.getElementById('open-room-mode-filter').value || 'all';
            void this.loadOpenRooms();
        });
        document.getElementById('open-room-stake-filter')?.addEventListener('change', () => {
            this.onlineRoomFilters.stakeKey = document.getElementById('open-room-stake-filter').value || 'all';
            void this.loadOpenRooms();
        });
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
                this.claimDailyBonus();
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
        const details = await this.account.bootstrap();
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
            startMenuMusic();
        } else {
            this.tableSkinShop = null;
        }
        this.renderAccountModal();
        this.syncStartAuthButton();
        this.refreshResumeBanner(null);
        await this.validateStoredResumeSnapshot();
        void this.loadSocialSummary();
        if (!this.hasAuthenticatedAccount()) this.setAccountStatus(this.t('account-login-required'));
        this.syncStartAuthGate();
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

    async loadAccountProfile() {
        try {
            const details = await this.account.getProfileDetails();
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
        await this.loadAccountProfile();
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
        await this.loadLeaderboard(this.leaderboardScope || 'overall');
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
        if (playerRef) {
            const playerId = String(playerRef?.playerId || playerRef?.userId || playerRef?.id || playerRef || '').trim();
            if (playerId) {
                this.accountMessagesState = {
                    ...(this.accountMessagesState || {}),
                    activePlayerId: playerId,
                    error: ''
                };
            }
        }
        this.socialCenterTab = nextTab;
        this.socialCenterView = nextTab === 'inbox' && playerRef ? 'conversation' : 'list';
        this.renderSocialCenter();

        if (!this.hasAuthenticatedAccount()) {
            this.updateSocialCenterBadge();
            return;
        }

        if (nextTab === 'inbox') {
            await this.loadInboxPage();
            await this.loadSocialInvitesPage().catch(() => {});
        } else {
            await this.loadSocialSummary();
            if (nextTab === 'friends') {
                await this.loadFriendsPage();
                await this.loadSocialInvitesPage().catch(() => {});
            } else if (nextTab === 'invites') {
                await this.loadSocialInvitesPage();
            }
        }

        if (nextTab === 'inbox' && this.socialCenterView === 'conversation') {
            const activeId = String(this.accountMessagesState?.activePlayerId || '').trim();
            if (activeId) {
                await this.loadMessageThreads();
                await this.loadConversationWithPlayer(activeId, true);
            }
        }

        await this.loadSocialSummary();
        this.updateSocialCenterBadge();
    }

    closePlayerProfileModal() {
        document.getElementById('player-profile-modal')?.classList.remove('active');
        this.playerProfileState = null;
    }

    async openPlayerProfileModal(playerRef) {
        const playerId = this.resolvePlayerProfileId(playerRef);
        const modal = document.getElementById('player-profile-modal');
        if (!modal || !playerId) return;

        this.closeSocialCenterModal();
        this.closeStartModals();
        this.closeAccountModal();
        this.closeCoinShopModal();
        this.closeCosmeticsShopModal();
        this.closeLeaderboardModal();
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
        this.accountMessagesState = {
            ...(this.accountMessagesState || {}),
            activePlayerId: playerId,
            error: ''
        };
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
        this._socialSocketFallbackActive = false;
        this._socialSocketLastConnectError = '';
        this._socialSocketLastEventAt = 0;
        this._socialSocketAuthToken = '';
        this._socialSocketAuthRefreshPending = false;
        this._socialSocketAuthRefreshAttempted = false;
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

    initSocialSocket() {
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
                    this.initSocialSocket();
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
                return true;
            }
            this.closeSocialSocket();
        }

        this.clearSocialSocketFallbackTimer();
        this._socialSocketLastConnectError = '';
        this._socialSocketUrl = socketUrl;
        this._socialSocketPath = socketPath;
        this.logSocialSocket('init', {
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
            const threadPlayerId = String(payload?.threadPlayerId || '').trim();
            const activePlayerId = String(this.accountMessagesState?.activePlayerId || '').trim();
            if (threadPlayerId && activePlayerId && threadPlayerId === activePlayerId) {
                this.scheduleSocialRefresh('conversation', {
                    delayMs: 1200,
                    reason: 'socket-dm-new',
                    playerId: threadPlayerId
                });
            }
            this.scheduleSocialRefresh('messages', { delayMs: 1400, reason: 'socket-dm-new' });
        });

        socket.on('dm:ack', (payload) => {
            markTouch('dm:ack', payload);
            this.applyRealtimeDirectMessage(payload);
            const threadPlayerId = String(payload?.threadPlayerId || '').trim();
            const activePlayerId = String(this.accountMessagesState?.activePlayerId || '').trim();
            if (threadPlayerId && activePlayerId && threadPlayerId === activePlayerId) {
                this.scheduleSocialRefresh('conversation', {
                    delayMs: 1200,
                    reason: 'socket-dm-ack',
                    playerId: threadPlayerId
                });
            }
            this.scheduleSocialRefresh('messages', { delayMs: 1400, reason: 'socket-dm-ack' });
        });

        socket.on('dm:read', (payload) => {
            markTouch('dm:read', payload);
            const threadPlayerId = String(payload?.threadPlayerId || '').trim();
            if (!threadPlayerId) return;
            const activePlayerId = String(this.accountMessagesState?.activePlayerId || '').trim();
            if (activePlayerId && activePlayerId === threadPlayerId) {
                this.scheduleSocialRefresh('conversation', {
                    delayMs: 1200,
                    reason: 'socket-dm-read',
                    playerId: threadPlayerId
                });
            }
            this.scheduleSocialRefresh('messages', { delayMs: 1400, reason: 'socket-dm-read' });
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

        socket.on('invite:new', (payload) => {
            markTouch('invite:new', payload);
            this.applyRealtimeRoomInvitation(payload);
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-invite-new' });
        });

        socket.on('invite:update', (payload) => {
            markTouch('invite:update', payload);
            this.applyRealtimeRoomInvitation(payload);
            this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'socket-invite-update' });
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

        const healthUrl = `${String(this.account?.platformApiBase || '').replace(/\/$/, '')}/health`;
        void fetch(healthUrl, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store'
        }).then((response) => {
            if (!response?.ok) {
                throw new Error(`health_${response?.status || 0}`);
            }
            if (this._socialSocket !== socket || this._socialSocketReady) return;
            this.logSocialSocket('connect-request', { healthOk: true });
            try {
                socket.connect?.();
            } catch (error) {
                this._socialSocketLastConnectError = String(error?.message || error || 'socket_connect_failed');
                this._socialSocketFallbackActive = true;
                this.closeSocialSocket();
                if (!this._socialSse) {
                    this.initSocialSse();
                }
            }
        }).catch((error) => {
            this._socialSocketLastConnectError = String(error?.message || error || 'health_check_failed');
            this.logSocialSocket('health-failed', { error: this._socialSocketLastConnectError });
            if (this._socialSocket === socket && !socket.connected) {
                this._socialSocketFallbackActive = true;
                this.closeSocialSocket();
                if (!this._socialSse) {
                    this.initSocialSse();
                }
            }
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
            socket.emit('dm:send', {
                tempId: String(tempId || '').trim(),
                receiverPlayerId: cleanTargetId,
                text: cleanText
            }, (response) => {
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
        return this.account.sendDirectMessage(targetId, text);
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
        const socketResponse = await this.sendSocialInviteCreate({ roomId, ...(payload || {}) }).catch(() => null);
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
        return this.account.inviteFriendToRoom(roomId, payload);
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
                const threadPlayerId = String(data?.threadPlayerId || '').trim();
                const activePlayerId = String(this.accountMessagesState?.activePlayerId || '').trim();
                if (threadPlayerId && activePlayerId && threadPlayerId === activePlayerId) {
                    this.scheduleSocialRefresh('conversation', {
                        delayMs: 1200,
                        reason: 'sse-message',
                        playerId: threadPlayerId
                    });
                }
                this.scheduleSocialRefresh('messages', { delayMs: 1400, reason: 'sse-message' });
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
                    this.applyRealtimeRoomInvitation(data);
                }
                this.scheduleSocialRefresh('invites', { delayMs: 1200, reason: 'sse-invite-update' });
            } catch (err) {
                console.error("SSE invite_update handler error:", err);
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
        }
        this.updateSocialCenterBadge();
        if (this.hasAuthenticatedAccount()) {
            this.startGameInviteRefresh();
        }
        return this.socialSummary;
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

        if (!isBackground) {
            this.socialInboxState = {
                ...(this.socialInboxState || {}),
                loading: true,
                error: ''
            };
            this.renderSocialInboxPanel();
        }

        try {
            const [data, threadData] = await Promise.all([
                this.account.getInbox(),
                this.account.getMessageThreads().catch(() => [])
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
        }
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
            appendSectionTitle('Messages / Chat threads');
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
                const lastText = String(thread?.lastMessage?.text || thread?.lastMessage?.body || '').trim();
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
        if (!this.account?.getMessageThreads || this.accountMessagesState?.threadsLoading) {
            return Array.isArray(this.accountMessagesState?.threads) ? this.accountMessagesState.threads : [];
        }

        this.accountMessagesState = {
            ...(this.accountMessagesState || {}),
            threadsLoading: true,
            error: ''
        };
        this.renderAccountMessagesPanel();

        try {
            const items = await this.account.getMessageThreads();
            const threads = Array.isArray(items) ? items : [];
            const currentActiveId = String(this.accountMessagesState?.activePlayerId || '').trim();
            const activeThread = threads.find((thread) => String(thread?.player?.id || thread?.playerId || thread?.id || '').trim() === currentActiveId) || null;
            const nextActiveId = activeThread
                ? currentActiveId
                : String(threads[0]?.player?.id || threads[0]?.playerId || threads[0]?.id || '').trim();
            this.accountMessagesState = {
                ...(this.accountMessagesState || {}),
                threads,
                threadsLoading: false,
                error: '',
                activePlayerId: nextActiveId || currentActiveId
            };
            this.renderAccountMessagesPanel();
            await this.loadSocialSummary();
            this.updateSocialCenterBadge();
            if (nextActiveId && nextActiveId !== currentActiveId) {
                await this.loadConversationWithPlayer(nextActiveId);
            }
            return threads;
        } catch (err) {
            this.accountMessagesState = {
                ...(this.accountMessagesState || {}),
                threads: [],
                threadsLoading: false,
                error: err?.message || this.t('messages-load-failed') || this.t('chats-load-failed')
            };
            this.renderAccountMessagesPanel();
            await this.loadSocialSummary();
            this.updateSocialCenterBadge();
            return [];
        }
    }

    async loadConversationWithPlayer(playerRef, isBackground = false) {
        const playerId = String(playerRef?.playerId || playerRef?.userId || playerRef?.id || playerRef || '').trim();
        if (!playerId || !this.hasAuthenticatedAccount()) {
            return [];
        }
        this.socialCenterView = 'conversation';
        this.accountMessagesState = {
            ...(this.accountMessagesState || {}),
            activePlayerId: playerId,
            conversationLoading: true,
            error: ''
        };
        this.renderAccountMessagesPanel();

        try {
            const readPromise = this.markDirectMessageThreadReadWithFallback(playerId).catch(() => {});
            const profilePromise = (this.accountMessagesState?.activePlayerId === playerId && this.accountMessagesState?.activePlayerProfile)
                ? Promise.resolve(this.accountMessagesState.activePlayerProfile)
                : this.account.getPlayerProfile(playerId).catch(() => null);
            const messagesPromise = this.account.getDirectMessages(playerId);

            const [_, profile, messages] = await Promise.all([
                readPromise,
                profilePromise,
                messagesPromise
            ]);

            this.accountMessagesState = {
                ...(this.accountMessagesState || {}),
                activePlayerId: playerId,
                activePlayerProfile: profile || this.accountMessagesState?.activePlayerProfile || null,
                messages: Array.isArray(messages) ? messages : [],
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

            return this.accountMessagesState.messages;
        } catch (err) {
            this.accountMessagesState = {
                ...(this.accountMessagesState || {}),
                activePlayerId: playerId,
                conversationLoading: false,
                error: err?.message || this.t('messages-load-failed') || this.t('chats-load-failed')
            };
            this.renderAccountMessagesPanel();
            void this.loadSocialSummary().then(() => this.updateSocialCenterBadge()).catch(() => {});
            return [];
        }
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
        const incomingInvitesPending = (this.roomInvitations?.incoming || []).filter(inv => this.isRoomInvitationPending(inv)).length;
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
    }

    async loadSocialInvitesPage(isBackground = false) {
        const incomingList = document.getElementById('social-invites-incoming-list');
        const sentList = document.getElementById('social-invites-sent-list');
        const fallbackList = document.getElementById('social-invites-list');
        const hasSplitLayout = Boolean(incomingList && sentList);
        const invitesList = fallbackList || incomingList || sentList;
        if (!invitesList) return [];
        if (!this.hasAuthenticatedAccount()) {
            this.setSummaryMessage(invitesList, this.t('friends-login-required'));
            return [];
        }

        if (!isBackground && !invitesList.children.length) {
            this.setSummaryMessage(invitesList, this.t('account-profile-loading'));
        }
        try {
            const invitations = await this.account.getRoomInvitations();
            this.roomInvitations = invitations || { incoming: [], sent: [] };
            this.restoreGameInviteStateFromInvitations();
            void this.refreshGameInviteState().catch(() => {});
            const { incoming, sent } = this.getActiveRoomInvitations(this.roomInvitations);

            const renderList = (container, items, kind, emptyKey) => {
                if (!container) return;
                container.innerHTML = '';
                const activeItems = Array.isArray(items) ? items : [];
                if (!activeItems.length) {
                    this.setSummaryMessage(container, this.t(emptyKey));
                    return;
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
                const combined = [...incoming, ...sent].filter((invite) => this.isRoomInvitationActive(invite));
                if (!combined.length) {
                    this.setSummaryMessage(invitesList, this.t('no-room-invites'));
                } else {
                    combined.forEach((invite) => {
                        invitesList.appendChild(this.createRoomInvitationCard(invite, incoming.some((item) => item?.id === invite?.id) ? 'incoming' : 'sent'));
                    });
                }
            }
        } catch (err) {
            const message = err?.message || this.t('friends-load-failed');
            this.setSummaryMessage(invitesList, message);
            if (incomingList && sentList) {
                this.setSummaryMessage(incomingList, message);
                this.setSummaryMessage(sentList, message);
            }
        }
        await this.loadSocialSummary();
        this.updateSocialCenterBadge();
        return [];
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
        const activePlayer = state.activePlayerProfile || activeThread?.player || null;
        const activeMessages = Array.isArray(state.messages) ? state.messages : [];
        const currentPlayerId = String(this.accountProfile?.playerId || this.accountProfile?.id || '').trim();

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
            || (state.threadsLoading
                ? this.t('account-profile-loading')
                : this.format('messages-thread-count', { count: String(threads.length) }));

        // Render threads list atomically using replaceChildren
        const threadNodes = [];
        if (!threads.length) {
            const empty = document.createElement('div');
            empty.className = 'room-summary';
            empty.textContent = state.threadsLoading ? this.t('account-profile-loading') : (this.t('messages-empty') || this.t('chats-empty'));
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
                preview.textContent = lastMessage?.text || this.t('messages-empty');

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

        conversationTitle.textContent = activePlayer?.displayName || this.t('messages-conversation-title');

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
            if (state.conversationLoading) {
                const loading = document.createElement('div');
                loading.className = 'room-summary';
                loading.textContent = this.t('account-profile-loading');
                conversationNodes.push(loading);
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
                    const row = document.createElement('div');
                    row.className = `message-row ${mine ? 'is-self' : 'is-other'}${optimistic ? ' is-pending' : ''}`;

                    const bubbleContainer = document.createElement('div');
                    bubbleContainer.className = 'message-bubble-container';

                    if (!mine) {
                        const partnerRating = this.friendRatingMap?.get(String(activePlayerId)) || 1000;
                        const avatar = this.createPremiumAvatar(activePlayer, partnerRating);
                        row.appendChild(avatar);
                    }

                    const bubble = document.createElement('div');
                    bubble.className = `message-bubble${optimistic ? ' is-pending' : ''}`;

                    const text = document.createElement('div');
                    text.className = 'message-text';
                    text.textContent = message.text || message.body || '';
                    bubble.appendChild(text);

                    const footer = document.createElement('div');
                    footer.className = 'message-bubble-footer';
                    const timeEl = document.createElement('span');
                    timeEl.className = 'message-time';
                    const timeStr = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    timeEl.textContent = timeStr;
                    footer.appendChild(timeEl);

                    if (mine) {
                        const checks = document.createElement('span');
                        checks.className = 'message-checks';
                        checks.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0zM10.354 3.646a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L3.5 9.293l5.646-5.647a.5.5 0 0 1 .708 0z"/></svg>`;
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
            if (!chatGiftBtn.dataset.bound) {
                chatGiftBtn.dataset.bound = '1';
                chatGiftBtn.addEventListener('click', () => {
                    const targetId = String(this.accountMessagesState?.activePlayerId || '').trim();
                    if (!targetId) return;
                    this.selectedGiftRecipientId = targetId;
                    this.renderGiftPicker();
                    this.toggleGiftPicker(true);
                });
            }
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
                messageInput.value = '';
                try {
                    const result = await this.sendDirectMessageWithFallback(targetId, text, tempId);
                    const sentMessage = result?.item || tempMessage;
                    const messages = Array.isArray(this.accountMessagesState?.messages) ? [...this.accountMessagesState.messages] : [];
                    const tempIndex = messages.findIndex((row) => String(row?.id || '').trim() === tempId);
                    if (tempIndex >= 0) {
                        messages[tempIndex] = {
                            ...sentMessage,
                            isOptimistic: false,
                            localStatus: 'sent'
                        };
                    } else {
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
                        message: sentMessage,
                        threadPlayerId: targetId
                    });
                    this.renderer.showMessage(this.t('messages-sent') || this.t('chats-sent'), 1400);
                    this.scheduleSocialSoftRefresh('send-direct-message', 4000);
                } catch (err) {
                    const messages = Array.isArray(this.accountMessagesState?.messages)
                        ? this.accountMessagesState.messages.filter((row) => String(row?.id || '').trim() !== tempId)
                        : [];
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
            if (this.dailyBonusState.status?.claimedToday) {
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

    async claimDailyBonus() {
        if (this.dailyBonusState.claiming) return;
        this.dailyBonusState.claiming = true;
        this.dailyBonusState.error = '';
        this.renderDailyBonusCard();

        try {
            const result = await this.account.claimDailyBonus();
            if (result?.ok) {
                this.dailyBonusState.status = result.dailyBonus || null;
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
                    const earnedAmount = result.claim?.amount || 0;
                    this.renderer.showMessage(this.t('daily-bonus-toast').replace('{amount}', earnedAmount), 3000);
                }
                
                if (this.dailyBonusState.status?.claimedToday) {
                    this.startDailyBonusTicker();
                }
            } else {
                this.dailyBonusState.error = result.reason || 'Could not claim daily bonus';
            }
        } catch (err) {
            this.dailyBonusState.error = err.message || this.t('daily-bonus-error');
        } finally {
            this.dailyBonusState.claiming = false;
            this.renderDailyBonusCard();
        }
    }

    renderDailyBonusCard() {
        const card = document.getElementById('daily-bonus-card');
        if (!card) return;

        const isAuthed = this.hasAuthenticatedAccount();
        if (!isAuthed) {
            card.classList.add('is-hidden');
            this.stopDailyBonusTicker();
            return;
        }

        card.classList.remove('is-hidden');

        const titleEl = card.querySelector('.daily-bonus-title');
        const metaEl = document.getElementById('daily-bonus-meta');
        const amountEl = document.getElementById('daily-bonus-amount');
        const streakEl = document.getElementById('daily-bonus-streak');
        const btn = document.getElementById('daily-bonus-claim-btn');
        const streakRow = document.getElementById('daily-bonus-streak-row');

        if (titleEl) titleEl.textContent = this.t('daily-bonus-title');

        if (this.dailyBonusState.loading) {
            if (metaEl) metaEl.textContent = this.t('daily-bonus-loading');
            if (amountEl) amountEl.textContent = '';
            if (streakEl) streakEl.textContent = '';
            if (btn) {
                btn.disabled = true;
                btn.textContent = this.t('daily-bonus-loading');
            }
            if (streakRow) streakRow.innerHTML = '';
            return;
        }

        if (this.dailyBonusState.error) {
            if (metaEl) metaEl.textContent = this.dailyBonusState.error;
            if (amountEl) amountEl.textContent = '';
            if (streakEl) streakEl.textContent = '';
            if (btn) {
                btn.disabled = true;
                btn.textContent = this.t('daily-bonus-error');
            }
            if (streakRow) streakRow.innerHTML = '';
            return;
        }

        const status = this.dailyBonusState.status;
        if (!status) {
            if (metaEl) metaEl.textContent = this.t('daily-bonus-error');
            if (amountEl) amountEl.textContent = '';
            if (streakEl) streakEl.textContent = '';
            if (btn) {
                btn.disabled = true;
                btn.textContent = this.t('daily-bonus-error');
            }
            if (streakRow) streakRow.innerHTML = '';
            return;
        }

        if (amountEl) {
            amountEl.textContent = `${status.todayAmount} coins`;
        }

        if (streakEl) {
            streakEl.textContent = `${this.t('daily-bonus-streak')}: ${status.streakDay}/${status.maxStreak}`;
        }

        if (btn) {
            if (this.dailyBonusState.claiming) {
                btn.disabled = true;
                btn.textContent = this.t('daily-bonus-loading');
            } else if (status.claimedToday) {
                btn.disabled = true;
                btn.textContent = this.t('daily-bonus-claimed');
            } else {
                btn.disabled = false;
                btn.textContent = this.t('daily-bonus-claim');
            }
        }

        if (metaEl) {
            if (status.claimedToday) {
                if (!this.dailyBonusTickerId) {
                    this.startDailyBonusTicker();
                }
            } else {
                this.stopDailyBonusTicker();
                metaEl.textContent = this.t('daily-bonus-subtitle');
            }
        }

        if (streakRow) {
            streakRow.innerHTML = '';
            const maxDays = status.maxStreak || 7;
            const staticAmounts = {
                1: 200,
                2: 300,
                3: 350,
                4: 400,
                5: 800,
                6: 1000,
                7: 2000
            };

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

                const dayReward = staticAmounts[day] || staticAmounts[7] || 2000;

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
        const isAuthed = this.hasAuthenticatedAccount();
        startScreen.classList.toggle('auth-required', !isAuthed);
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
            return 'https://gamed.simplesoft.az/mobile-auth-complete.html';
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

    updateSocialCenterBadge() {
        const button = document.getElementById('open-social-btn');
        if (!button) return;
        const badge = button.querySelector('.start-social-badge');
        if (!badge) return;
        if (!this.hasAuthenticatedAccount()) {
            badge.textContent = '';
            badge.classList.add('is-hidden');
            badge.removeAttribute('title');
            return;
        }
        const toNonNegativeInt = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
        };
        const serverCount = toNonNegativeInt(this.socialSummary?.totalUnreadCount || 0);
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
        const incomingInvites = Array.isArray(this.roomInvitations?.incoming)
            ? this.roomInvitations.incoming.filter((inv) => this.isRoomInvitationPending(inv)).length
            : 0;
        const localCount = Math.max(0, unreadInboxItems + unreadThreads + incomingFriends + incomingInvites);
        const count = Math.max(serverCount, localCount);
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.classList.remove('is-hidden');
            badge.title = `${this.t('social-badge-label')}: ${count}`;
        } else {
            badge.textContent = '';
            badge.classList.add('is-hidden');
            badge.removeAttribute('title');
        }
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

    async loadLeaderboard(scope = this.leaderboardScope || 'overall') {
        const list = document.getElementById('leaderboard-list');
        const tabs = document.getElementById('leaderboard-tabs');
        if (!list) return;
        this.leaderboardScope = scope === 'weekly' || scope === 'friends' ? scope : 'overall';
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
            const rows = await this.account.getLeaderboard(20, this.leaderboardScope);
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
            if (!modal?.classList.contains('active') || this.openRoomsStage !== 'list') return;
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

        searchInput.disabled = false;
        if (!isBackground) {
            if (!friendsList.children.length) this.setSummaryMessage(friendsList, loading);
            if (!requestsList.children.length) this.setSummaryMessage(requestsList, loading);
            if (!searchResults.children.length) this.setSummaryMessage(searchResults, loading);
        }

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

                    const friendId = String(item.friend?.id || '').trim();
                    const hasPendingInvite = friendId && (this.roomInvitations?.sent || []).some(inv => 
                        String(inv.invitee?.id || '').trim() === friendId && 
                        this.isRoomInvitationPending(inv)
                    );
                    const canInvite = Boolean(item.friend?.id) && !hasPendingInvite;

                    const inviteBtn = document.createElement('button');
                    inviteBtn.className = 'btn btn-action btn-strong invite-action-btn action-text-btn';
                    inviteBtn.type = 'button';
                    inviteBtn.title = this.t('friend-invite');
                    inviteBtn.setAttribute('aria-label', this.t('friend-invite'));
                    if (hasPendingInvite) {
                        inviteBtn.classList.add('is-invited');
                        inviteBtn.textContent = this.t('invite-status-invited');
                        inviteBtn.disabled = true;
                    } else {
                        inviteBtn.textContent = this.t('friend-invite');
                        inviteBtn.disabled = !canInvite;
                        inviteBtn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            inviteBtn.disabled = true;
                            const originalText = inviteBtn.textContent;
                            inviteBtn.textContent = '...';
                            try {
                                await this.sendGameInviteToPlayer(item.friend, { source: 'friends-page' });
                                this.renderer.showMessage(this.t('invite-sent'), 1400);
                                await this.loadFriendsPage();
                            } catch (err) {
                                this.renderer.showMessage(err.message || this.t('friends-load-failed'), 1800);
                                inviteBtn.textContent = originalText;
                                inviteBtn.disabled = !canInvite;
                            }
                        });
                    }

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

                    action.appendChild(inviteBtn);
                    action.appendChild(messageBtn);
                    action.appendChild(removeBtn);
                    card.appendChild(action);
                    friendsList.appendChild(card);
                });
            }

            requestsList.innerHTML = '';
            const incomingRequests = Array.isArray(this.friendHub.incoming) ? this.friendHub.incoming : [];
            const outgoingRequests = Array.isArray(this.friendHub.outgoing) ? this.friendHub.outgoing : [];
            if (!incomingRequests.length && !outgoingRequests.length) {
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
        }
        await this.loadSocialSummary();
        this.updateSocialCenterBadge();
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
            incoming: incoming.filter((invite) => this.isRoomInvitationActive(invite)),
            sent: sent.filter((invite) => this.isRoomInvitationActive(invite))
        };
    }

    createRoomInvitationCard(invite, kind = 'incoming') {
        const card = document.createElement('div');
        card.className = 'friend-card premium-social-card invite-card';
        const pending = this.isRoomInvitationPending(invite);

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
        meta.textContent = `${invite?.roomCode || ''}${invite?.roomMode ? ` · ${invite.roomMode}` : ''}`.trim();
        copy.appendChild(name);
        copy.appendChild(meta);

        const statusLabel = document.createElement('span');
        statusLabel.className = 'room-summary invite-status-label';
        statusLabel.textContent = this.getRoomInvitationStatusLabel(invite);
        const showStatusLabel = kind === 'sent' || !pending;
        if (showStatusLabel) {
            copy.appendChild(statusLabel);
        }
        card.appendChild(copy);

        const action = document.createElement('div');
        action.className = 'friend-card-actions';

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
                    if (accepted?.ok === false || String(accepted?.reason || '').trim() === 'room_not_available') {
                        this.renderer.showMessage(this.t('invite-status-expired') || 'Invite expired or room unavailable', 1800);
                    } else {
                        const joinRoomCode = String(accepted?.join?.roomCode || '').trim();
                        if (this.isValidRoomCode(joinRoomCode)) {
                            await this.joinOnlineRoom(joinRoomCode);
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
                    const targetPlayerId = String(player.id || '').trim();
                    const hasPendingInvite = targetPlayerId && (this.roomInvitations?.sent || []).some(inv => 
                        String(inv.invitee?.id || '').trim() === targetPlayerId && 
                        this.isRoomInvitationPending(inv)
                    );
                    const canInvite = Boolean(player.id) && !hasPendingInvite;

                    const inviteBtn = document.createElement('button');
                    inviteBtn.className = 'btn btn-action btn-strong invite-action-btn action-text-btn';
                    inviteBtn.type = 'button';
                    inviteBtn.title = this.t('friend-invite');
                    inviteBtn.setAttribute('aria-label', this.t('friend-invite'));
                    if (hasPendingInvite) {
                        inviteBtn.classList.add('is-invited');
                        inviteBtn.textContent = this.t('invite-status-invited');
                        inviteBtn.disabled = true;
                    } else {
                        inviteBtn.textContent = this.t('friend-invite');
                        inviteBtn.disabled = !canInvite;
                        inviteBtn.addEventListener('click', async () => {
                            inviteBtn.disabled = true;
                            const originalText = inviteBtn.textContent;
                            inviteBtn.textContent = '...';
                            try {
                                await this.sendGameInviteToPlayer(player, { source: 'friends-search' });
                                this.renderer.showMessage(this.t('invite-sent'), 1400);
                                await this.loadFriendsPage();
                            } catch (err) {
                                this.renderer.showMessage(err.message || this.t('friends-load-failed'), 1800);
                                inviteBtn.textContent = originalText;
                                inviteBtn.disabled = !canInvite;
                            }
                        });
                    }
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

                    action.appendChild(inviteBtn);
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
        const profile = this.playerProfileState?.profile || null;
        const isAuthed = this.hasAuthenticatedAccount();
        const isSelf = profile?.friendshipStatus === 'self';
        const loading = Boolean(this.playerProfileState?.loading);
        const canInvite = Boolean(isAuthed && !isSelf && profile?.id);

        if (name) name.textContent = profile?.displayName || this.playerProfileState?.error || this.t('account-profile-loading');
        if (status) {
            status.textContent = this.playerProfileState?.error
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
                pending_outgoing: 'Cancel',
                accepted: this.t('friends-request-accepted')
            };
            friendBtn.textContent = labels[statusKey] || this.t('friend-add');
            const allowAction = isAuthed && !isSelf && (statusKey === 'none' || statusKey === 'pending_incoming' || statusKey === 'pending_outgoing');
            friendBtn.hidden = isSelf || !isAuthed || statusKey === 'accepted';
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
            const hasPendingInvite = profileId && (this.roomInvitations?.sent || []).some(inv => 
                String(inv.invitee?.id || '').trim() === profileId && 
                this.isRoomInvitationPending(inv)
            );
            const canInviteReal = canInvite && !hasPendingInvite;

            inviteBtn.hidden = isSelf || !isAuthed;
            inviteBtn.classList.toggle('is-invited', Boolean(hasPendingInvite));
            if (hasPendingInvite) {
                inviteBtn.textContent = this.t('invite-status-invited');
                inviteBtn.disabled = true;
                inviteBtn.title = this.t('invite-status-invited');
            } else {
                inviteBtn.textContent = this.t('friend-invite');
                inviteBtn.disabled = !canInviteReal || loading;
                inviteBtn.title = canInviteReal
                    ? this.t('friend-invite')
                    : this.t('player-profile-invite-unavailable');
                inviteBtn.onclick = async () => {
                    if (!isAuthed || isSelf || !profileId) return;
                    if (!canInviteReal) {
                        this.renderer.showMessage(this.t('player-profile-invite-unavailable'), 1600);
                        return;
                    }
                    inviteBtn.disabled = true;
                    const originalText = inviteBtn.textContent;
                    inviteBtn.textContent = '...';
                    try {
                        await this.sendGameInviteToPlayer(profile, { source: 'profile' });
                        this.renderer.showMessage(this.t('invite-sent'), 1400);
                        this.openPlayerProfileModal(profile);
                    } catch (err) {
                        this.renderer.showMessage(err?.message || this.t('friends-load-failed'), 1800);
                        inviteBtn.textContent = originalText;
                        inviteBtn.disabled = !canInviteReal;
                    }
                };
            }
        }

        if (messageBtn) {
            messageBtn.hidden = !canMessage;
            messageBtn.disabled = !canMessage || loading;
            messageBtn.onclick = async () => {
                if (!canMessage || !profile?.id) return;
                await this.openConversationWithPlayer(profile.id);
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
        if (ratingValue) ratingValue.textContent = String(profile?.rating ?? 1000);
        if (winsValue) winsValue.textContent = String(profile?.wins ?? 0);
        if (matchesValue) matchesValue.textContent = String(profile?.matchesPlayed ?? 0);
        if (coinsValue) coinsValue.textContent = String(details?.wallet?.balance ?? profile?.coins ?? profile?.wallet?.balance ?? 0);
        const titleCard = document.getElementById('account-title-value')?.closest?.('.account-stat-card');
        if (titleCard) titleCard.classList.add('is-hidden');
        if (!profile) {
            if (historyList) this.setSummaryMessage(historyList, this.t('account-history-empty'));
            return;
        }
        if (historyList) {
            const recentMatches = Array.isArray(details?.recentMatches) ? details.recentMatches : [];
            if (!recentMatches.length) {
                this.setSummaryMessage(historyList, this.t('account-history-empty'));
            } else {
                historyList.innerHTML = '';
            recentMatches.forEach((match) => {
                const item = document.createElement('div');
                const delta = Number(match.ratingDelta || 0);
                    const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
                    const resultKey = match.result === 'win'
                        ? 'account-history-win'
                        : match.result === 'loss'
                            ? 'account-history-loss'
                            : 'account-history-draw';
                    item.className = 'room-player-chip';
                    label.textContent = `${this.t(resultKey)} · ${match.mode}`;
                    value.textContent = deltaLabel;
                    item.appendChild(label);
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
        clearTimeout(this._turnTimeoutId);
        clearInterval(this._turnTimerTickId);
        this._firstTurnTimeout = null;
        this._aiTurnTimeout = null;
        this._turnAdvanceTimeout = null;
        this._dealEndTimeout = null;
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
            localStatus: payload.localStatus || payload.status || ''
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
        this.updateSocialCenterBadge();
        return normalized;
    }

    applyRealtimeRoomInvitation(payload) {
        const invite = payload?.invite && typeof payload.invite === 'object' ? payload.invite : null;
        if (!invite) return null;
        const currentPlayerId = this.getCurrentAccountPlayerId();
        const normalizedInvite = { ...invite };
        const inviteStatus = String(normalizedInvite.status || '').trim().toLowerCase();
        const roomInvitations = this.roomInvitations || { incoming: [], sent: [] };
        const incoming = Array.isArray(roomInvitations.incoming) ? [...roomInvitations.incoming] : [];
        const sent = Array.isArray(roomInvitations.sent) ? [...roomInvitations.sent] : [];
        const upsertInto = (list, direction) => {
            if (!Array.isArray(list)) return list;
            const inviteId = String(normalizedInvite.id || '').trim();
            if (!inviteId) return list;
            const idx = list.findIndex((item) => String(item?.id || '').trim() === inviteId);
            const currentSideMatches = direction === 'incoming'
                ? String(normalizedInvite.invitee?.id || '').trim() === currentPlayerId
                : String(normalizedInvite.inviter?.id || '').trim() === currentPlayerId;
            if (!currentSideMatches) return list;
            if (idx >= 0) {
                list[idx] = { ...list[idx], ...normalizedInvite };
            } else {
                list.unshift(normalizedInvite);
            }
            return list;
        };
        this.roomInvitations = {
            incoming: upsertInto(incoming, 'incoming'),
            sent: upsertInto(sent, 'sent'),
            items: Array.from(new Map([...(incoming || []), ...(sent || [])].map((item) => [String(item?.id || ''), item]))).map(([, item]) => item)
        };
        if (inviteStatus === 'pending' && String(normalizedInvite.invitee?.id || '').trim() === currentPlayerId) {
            this.gameInviteState = {
                ...(this.gameInviteState || {}),
                inviteId: String(normalizedInvite.id || this.gameInviteState?.inviteId || '').trim(),
                inviteePlayerId: currentPlayerId,
                inviteeDisplayName: String(normalizedInvite.invitee?.displayName || this.accountProfile?.displayName || '').trim(),
                sessionId: String(normalizedInvite.roomId || this.gameInviteState?.sessionId || '').trim(),
                role: 'invitee',
                roomLinked: Boolean(String(normalizedInvite.roomCode || '').trim()),
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
                sessionId: String(normalizedInvite.roomId || this.gameInviteState.sessionId || '').trim(),
                roomLinked: Boolean(String(normalizedInvite.roomCode || '').trim()),
                createdAt: this.gameInviteState.createdAt || Date.now()
            };
        }
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
                const invitations = await this.account.getRoomInvitations();
                if (!invitations) return;
                const incoming = Array.isArray(invitations.incoming) ? invitations.incoming : [];
                const activeIncoming = incoming.filter((invite) => this.isRoomInvitationActive(invite));
                const activePendingIncoming = activeIncoming.filter((invite) => this.isRoomInvitationPending(invite));
                const incomingSignature = activePendingIncoming
                    .map((invite) => `${String(invite.id || '').trim()}:${String(invite.status || '').trim()}:${String(invite.updatedAt || invite.createdAt || '').trim()}`)
                    .join('|');
                const signatureChanged = incomingSignature !== this._lastIncomingInviteSignature;
                this._lastIncomingInviteSignature = incomingSignature;
                this.roomInvitations = invitations;

                const hasModalOpen = Boolean(document.getElementById('social-center-modal')?.classList.contains('active'));
                const hasPendingInvite = activePendingIncoming.length > 0;
                if (hasPendingInvite && (!this.gameInviteState?.sessionId || this.gameInviteState.role !== 'invitee')) {
                    const firstInvite = activePendingIncoming[0];
                    this.gameInviteState = {
                        inviteId: String(firstInvite.id || '').trim(),
                        inviteePlayerId: String(firstInvite.invitee?.id || this.getCurrentAccountPlayerId() || '').trim(),
                        inviteeDisplayName: String(firstInvite.invitee?.displayName || this.accountProfile?.displayName || '').trim(),
                        sessionId: String(firstInvite.roomId || '').trim(),
                        role: 'invitee',
                        roomLinked: Boolean(String(firstInvite.roomCode || '').trim()),
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
        const inviteePlayerId = String(playerRef?.id || playerRef?.playerId || '').trim();
        if (!inviteePlayerId) {
            throw new Error(this.t('friends-load-failed'));
        }

        const room = this.getCurrentRoomSnapshot();
        const activeRoomCode = String(room?.roomCode || this.network?.room?.state?.roomCode || '').trim().toUpperCase();

        if (activeRoomCode) {
            const activeRoomId = String(room?.roomId || this.network?.room?.roomId || this.network?.room?.id || '').trim();
            const payload = {
                inviteePlayerId,
                roomCode: activeRoomCode,
                roomMode: String(context.roomMode || room?.roomMode || (this.isTeamMode ? 'team' : 'ffa')).trim(),
                stakeKey: String(context.stakeKey || room?.stakeKey || this.onlineStakeKey || 'stake_200').trim(),
                stakeAmount: Number(context.stakeAmount || room?.stakeAmount || this.onlineRoundBankAmount || 0),
                humanSeats: Number(context.humanSeats || room?.humanSeats || this.onlinePlayerCount || 2),
                totalPlayers: Number(context.totalPlayers || room?.totalPlayers || this.onlinePlayerCount || 2),
                isTeamMode: Boolean(context.isTeamMode ?? room?.isTeamMode ?? this.isTeamMode),
                note: String(context.note || context.source || 'game-invite').trim() || 'game-invite',
                payloadJson: {
                    source: String(context.source || 'social').trim() || 'social',
                    inviteeDisplayName: String(playerRef?.displayName || '').trim() || null
                }
            };
            const result = await this.sendRoomInviteWithFallback(activeRoomId, payload);
            const item = result?.item || null;
            this.gameInviteState = {
                inviteId: String(item?.id || '').trim(),
                inviteePlayerId,
                inviteeDisplayName: String(playerRef?.displayName || '').trim(),
                sessionId: activeRoomId,
                role: 'inviter',
                roomLinked: true,
                createPromptShown: true,
                waitingPromptShown: true,
                createdAt: Date.now()
            };
            this.startGameInviteRefresh();
            await this.loadSocialSummary().catch(() => {});
            return item;
        }

        this.showStartModal('online');
        this.showOnlineCreateFlow('closed');
        this.showMultiplayerPanel('host');
        this.setHostStatus(this.t('online-room-status-created') || 'Creating room...');

        const inviteeName = String(playerRef?.displayName || '').trim() || 'Player';
        const targetStakeKey = this.onlineStakeKey || 'stake_200';
        const extraOptions = {
            isTeamMode: false,
            playerCount: 2,
            aiCount: 0,
            roomVisibility: "closed",
            stakeKey: targetStakeKey
        };

        return new Promise((resolve, reject) => {
            this.network.hostGame(async (roomId) => {
                try {
                    const inviteCode = await this.network.resolveRoomCode(roomId).catch(() => null);
                    const roomCode = String(inviteCode || '').trim().toUpperCase();
                    if (!roomCode) {
                        throw new Error('Failed to resolve room code');
                    }

                    const payload = {
                        inviteePlayerId,
                        roomCode,
                        roomMode: 'ffa',
                        stakeKey: targetStakeKey,
                        stakeAmount: this.onlineRoundBankAmount || 0,
                        humanSeats: 2,
                        totalPlayers: 2,
                        isTeamMode: false,
                        note: String(context.note || context.source || 'game-invite').trim() || 'game-invite',
                        payloadJson: {
                            source: String(context.source || 'social').trim() || 'social',
                            inviteeDisplayName: inviteeName
                        }
                    };

                    const result = await this.sendRoomInviteWithFallback(roomId, payload);
                    const item = result?.item || null;

                    this.gameInviteState = {
                        inviteId: String(item?.id || '').trim(),
                        inviteePlayerId,
                        inviteeDisplayName: inviteeName,
                        sessionId: roomId,
                        role: 'inviter',
                        roomLinked: true,
                        createPromptShown: true,
                        waitingPromptShown: true,
                        createdAt: Date.now()
                    };

                    this.startGameInviteRefresh();
                    this.setHostStatus(this.t('online-room-status-waiting') || 'Waiting for player...');
                    await this.loadSocialSummary().catch(() => {});
                    resolve(item);
                } catch (err) {
                    this.setHostStatus(err.message || 'Error creating room');
                    reject(err);
                }
            }, (err) => {
                const errorMsg = String(err || '');
                this.setHostStatus(`${this.t('online-room-status-error') || 'Error'}: ${errorMsg}`);
                reject(new Error(errorMsg));
            }, extraOptions);
        });
    }

    async attachGameInviteRoom(roomCode) {
        const invite = this.gameInviteState || {};
        const inviteePlayerId = String(invite.inviteePlayerId || '').trim();
        const sessionId = String(invite.sessionId || '').trim();
        const room = this.getCurrentRoomSnapshot();
        const rawRoomCode = String(roomCode || room?.roomCode || '').trim();
        let nextRoomCode = rawRoomCode.toUpperCase();
        if (!sessionId || !inviteePlayerId || !nextRoomCode) return null;
        const looksLikeRoomCode = /^[A-Z0-9]{4,8}$/.test(nextRoomCode);
        if (!looksLikeRoomCode || nextRoomCode.length > 8) {
            const resolvedRoomCode = await this.network.resolveRoomCode(rawRoomCode).catch(() => null);
            const normalizedResolvedCode = String(resolvedRoomCode || '').trim().toUpperCase();
            if (normalizedResolvedCode) {
                nextRoomCode = normalizedResolvedCode;
            } else if (!looksLikeRoomCode) {
                return null;
            }
        }
        const payload = {
            inviteePlayerId,
            roomCode: nextRoomCode,
            roomMode: String(room?.roomMode || (this.isTeamMode ? 'team' : 'ffa')).trim(),
            stakeKey: String(room?.stakeKey || this.onlineStakeKey || 'stake_200').trim(),
            stakeAmount: Number(room?.stakeAmount || this.onlineRoundBankAmount || 0),
            humanSeats: Number(room?.humanSeats || this.onlinePlayerCount || 0),
            totalPlayers: Number(room?.totalPlayers || this.onlinePlayerCount || 0),
            isTeamMode: Boolean(room?.isTeamMode ?? this.isTeamMode),
            note: 'invite-room-linked',
            payloadJson: {
                source: 'game-invite-room-linked',
                roomCode: nextRoomCode
            }
        };
        const result = await this.sendRoomInviteWithFallback(sessionId, payload);
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

        const invitations = await this.account.getRoomInvitations().catch(() => null);
        if (!invitations) return null;
        this.roomInvitations = invitations;

        const allItems = [
            ...(Array.isArray(invitations.incoming) ? invitations.incoming : []),
            ...(Array.isArray(invitations.sent) ? invitations.sent : [])
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

        const roomCode = String(target.roomCode || '').trim();
        const expiresAtStr = target.expiresAt ? String(target.expiresAt).trim() : '';
        const isExpired = expiresAtStr && new Date(expiresAtStr).getTime() <= Date.now();
        const status = (isExpired ? 'expired' : String(target.status || '').trim()).toLowerCase();
        const cleanRoomCode = this.isValidRoomCode(roomCode) ? roomCode : '';

        if (state.role === 'invitee') {
            if (status === 'accepted' && cleanRoomCode) {
                this.stopGameInviteRefresh();
                this.gameInviteState = null;
                await this.joinOnlineRoom(cleanRoomCode);
                return target;
            }
            if (status === 'accepted' && !cleanRoomCode) {
                if (!state.waitingPromptShown) {
                    this.renderer.showMessage(this.t('invite-waiting-room'), 1800);
                    state.waitingPromptShown = true;
                }
                if (forceRerender) {
                    void this.loadSocialInvitesPage().catch(() => {});
                }
                return target;
            }
            if (status === 'declined' || status === 'expired') {
                this.stopGameInviteRefresh();
                this.gameInviteState = null;
                this.renderer.showMessage(this.t('friends-load-failed'), 1800);
                return target;
            }
            return target;
        }

        if (state.role === 'inviter') {
            if (status === 'accepted' && cleanRoomCode) {
                this.stopGameInviteRefresh();
                this.gameInviteState = null;
                document.getElementById('online-invite-status-banner')?.classList.add('is-hidden');
                return target;
            }
            if (status === 'accepted' && !cleanRoomCode) {
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
            if (status === 'declined' || status === 'expired') {
                const msg = status === 'declined'
                    ? (this.t('invite-status-declined') || 'Declined')
                    : (this.t('invite-status-expired') || 'Expired');
                this.renderer.showMessage(msg, 1800);
                this.resetMultiplayerPanels(true);
                return target;
            }
        }

        return target;
    }

    restoreGameInviteStateFromInvitations() {
        if (this.gameInviteState?.sessionId) return this.gameInviteState;
        const invitations = this.roomInvitations || { incoming: [], sent: [] };
        const sent = (Array.isArray(invitations.sent) ? invitations.sent : [])
            .filter((item) => String(item?.status || '').trim() === 'accepted' && !String(item?.roomCode || '').trim())
            .sort((a, b) => new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime())[0] || null;
        if (sent) {
            this.gameInviteState = {
                inviteId: String(sent.id || '').trim(),
                inviteePlayerId: String(sent.invitee?.id || '').trim(),
                inviteeDisplayName: String(sent.invitee?.displayName || '').trim(),
                sessionId: String(sent.roomId || '').trim(),
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
            .filter((item) => String(item?.status || '').trim() === 'accepted' && !String(item?.roomCode || '').trim())
            .sort((a, b) => new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime())[0] || null;
        if (incoming) {
            this.gameInviteState = {
                inviteId: String(incoming.id || '').trim(),
                inviteePlayerId: String(incoming.invitee?.id || '').trim(),
                inviteeDisplayName: String(incoming.invitee?.displayName || '').trim(),
                sessionId: String(incoming.roomId || '').trim(),
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
            button.addEventListener('click', () => this.openPlayerProfileModal(playerRef));
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
        return String(match?.playerId || match?.id || '').trim();
    }

    ensureStartScreenEnhancements() {
        const startShell = document.querySelector('.start-shell');
        const startActions = document.querySelector('.start-actions');
        if (startShell && startActions && !document.getElementById('resume-session-banner')) {
            const banner = document.createElement('div');
            banner.id = 'resume-session-banner';
            banner.className = 'resume-session-banner is-hidden';
            const copy = document.createElement('div');
            copy.className = 'resume-session-copy';
            const kicker = document.createElement('div');
            kicker.className = 'section-kicker';
            kicker.dataset.i18n = 'resume-session-kicker';
            kicker.textContent = this.t('resume-session-kicker');
            const title = document.createElement('div');
            title.className = 'resume-session-title';
            title.id = 'resume-session-title';
            title.textContent = this.t('resume-session-title');
            const desc = document.createElement('div');
            desc.className = 'resume-session-desc';
            desc.id = 'resume-session-desc';
            desc.textContent = this.t('resume-session-desc');
            const resumeBtn = document.createElement('button');
            resumeBtn.className = 'btn btn-primary';
            resumeBtn.id = 'resume-session-btn';
            resumeBtn.type = 'button';
            resumeBtn.dataset.i18n = 'resume-session';
            resumeBtn.textContent = this.t('resume-session');
            copy.appendChild(kicker);
            copy.appendChild(title);
            copy.appendChild(desc);
            banner.appendChild(copy);
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
            frame.appendChild(img);
        } else {
            const fallback = document.createElement('span');
            fallback.textContent = this.getTurnAvatarText?.(player?.displayName || 'P') || 'P';
            frame.appendChild(fallback);
        }

        wrapper.appendChild(frame);

        // Add rating/level overlay badge
        const rating = typeof ratingValue === 'number' ? ratingValue : 1000;
        const level = Math.max(1, Math.floor((rating - 1000) / 25) + 30);
        
        const badge = document.createElement('div');
        badge.className = 'premium-avatar-level';
        badge.textContent = level;
        wrapper.appendChild(badge);

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
                        <button type="button" class="chat-action-btn phone-action" id="chat-phone-btn" aria-label="Call">📞</button>
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
                    </div>
                    <button type="button" class="chat-send-btn" id="account-message-send-btn">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
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
    }

    attachSocialUiEventListeners() {
        const attachBtn = document.querySelector('#social-chats-panel .composer-attach-btn');
        const emojiBtn = document.querySelector('#social-chats-panel .composer-emoji-btn');
        const coinsChip = document.querySelector('#social-center-modal .coins-chip');

        if (attachBtn) {
            attachBtn.addEventListener('click', () => {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.onchange = async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const targetId = String(this.accountMessagesState?.activePlayerId || '').trim();
                    if (!targetId) return;
                    try {
                        this.renderer.showMessage(this.t('sending-attachment') || 'Photo sending...', 1200);
                        await this.sendDirectMessageWithFallback(targetId, `📷 ${file.name}`);
                        await this.loadConversationWithPlayer(targetId);
                        await this.loadMessageThreads();
                    } catch (err) {
                        this.renderer.showMessage(err.message, 1800);
                    }
                };
                fileInput.click();
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
        head.appendChild(kicker);
        head.appendChild(title);
        head.appendChild(desc);
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
        footer.appendChild(footerText);

        panel.appendChild(head);
        panel.appendChild(tableWrap);
        panel.appendChild(footer);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.seatSelectionUi = { overlay, table, status, title, desc, footerText, centerTitle, centerNote };
    }

    hideSeatSelectionUi() {
        const overlay = document.getElementById('seat-selection-overlay');
        if (overlay) {
            overlay.classList.add('is-hidden');
            overlay.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.remove('seat-selection-active');
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
        if (!overlay || !table || !status) return;

        const totalSeats = Number(roomState?.totalPlayers || roomState?.humanSeats || 0);
        const roomIsActive = Boolean(roomState?.gameActive || this.gameActive);
        const shouldShow = Boolean(this.network?.isMultiplayer && !roomIsActive && totalSeats > 2 && roomState?.seatSelectionRequired !== false);
        debugLog("[CLIENT_DEBUG] renderSeatSelectionUi", {
            roomId: roomState?.roomId,
            roomCode: roomState?.roomCode,
            totalSeats,
            shouldShow,
            gameActive: roomState?.gameActive,
            seatSelectionRequired: roomState?.seatSelectionRequired
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
        table.innerHTML = '';
        table.dataset.totalSeats = String(totalSeats || 0);
        table.dataset.teamMode = roomState?.isTeamMode ? 'true' : 'false';
        const center = document.createElement('div');
        center.className = 'seat-selection-center';
        table.appendChild(center);
        const centerTitle = document.createElement('div');
        centerTitle.className = 'seat-selection-center-title';
        centerTitle.textContent = roomState?.isTeamMode && totalSeats >= 4
            ? `${this.t('seat-team-a')} / ${this.t('seat-team-b')}`
            : this.t('seat-selection-title');
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
    }

    buildVoiceButtonMarkup(size = 22) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6.5a3.5 3.5 0 1 0-7 0V12a3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M7.5 11.5v.5a4.5 4.5 0 0 0 9 0v-.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M12 16.5V20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
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
                const points = handPoints(this.hands[idx] || []);
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
            const points = handPoints(this.hands[i] || []);
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
        const title = document.getElementById('resume-session-title');
        const desc = document.getElementById('resume-session-desc');
        const button = document.getElementById('resume-session-btn');
        if (!banner) return;

        const hasState = Boolean(state);
        banner.classList.toggle('is-hidden', !hasState);
        if (!hasState) return;

        const isOnline = state.kind === 'online';
        if (title) {
            title.textContent = isOnline ? this.t('resume-session-online-title') : this.t('resume-session-offline-title');
        }
        if (desc) {
            desc.textContent = isOnline ? this.t('resume-session-online-desc') : this.t('resume-session-offline-desc');
        }
        if (button) {
            button.textContent = this.t('resume-session');
        }
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

        const isValid = await this.validateStoredResumeSnapshot();
        if (!isValid) {
            this.renderer.showMessage(this.t('session-not-found'), 1800);
            return false;
        }
        const isOnlineSnapshot = snapshot.kind === 'online'
            || Boolean(String(snapshot.reconnectionToken || '').trim() || String(snapshot.roomId || '').trim());

        if (isOnlineSnapshot) {
            const token = String(snapshot.reconnectionToken || this.network?.getStoredReconnectionToken?.() || '').trim();
            if (!token) {
                this.clearGameResumeSnapshot();
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
                return true;
            } catch (error) {
                console.warn('[Resume] Online session restore failed', error);
                await this.validateStoredResumeSnapshot();
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
            this.board = snapshot.board ? reconstructBoard(snapshot.board) : new Board();
            this.hands = Array.isArray(snapshot.hands)
                ? snapshot.hands.map((hand) => (Array.isArray(hand) ? hand.map((tile) => new Tile(tile.a, tile.b)) : []))
                : [];
            this.boneyard = Array.isArray(snapshot.boneyard)
                ? snapshot.boneyard.map((tile) => new Tile(tile.a, tile.b))
                : [];
            this.ais = [];
            for (let i = 1; i < this.playerCount; i++) {
                this.ais.push(new AIPlayer(i, this.difficulty));
            }
            this.myHand = this.hands[this.humanPlayerIndex] || null;
            document.getElementById('start-screen')?.classList.remove('active');
            document.getElementById('game-screen')?.classList.add('active');
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
            return true;
        } catch (error) {
            console.warn('[Resume] Solo session restore failed', error);
            this.clearGameResumeSnapshot();
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
        this.prefillOnlineNameIfPossible();
        this.openRoomsStage = 'menu';
        this.syncOpenRoomsStage();
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.style.zIndex = '24000';
        modal.classList.add('active');
        this.stopOpenRoomsAutoRefresh();
        this.resetOpenRoomsModalState();
    }

    showOpenRoomsMenu() {
        const modal = document.getElementById('open-rooms-modal');
        if (!modal) return;
        this.openRoomsStage = 'menu';
        this.syncOpenRoomsStage();
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.style.zIndex = '24000';
        modal.classList.add('active');
        this.stopOpenRoomsAutoRefresh();
        this.resetOpenRoomsModalState();
    }

    showOpenRoomsList() {
        const modal = document.getElementById('open-rooms-modal');
        if (!modal) return;
        this.openRoomsStage = 'list';
        this.syncOpenRoomsStage();
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.style.zIndex = '24000';
        modal.classList.add('active');
        void this.loadOpenRooms();
        this.startOpenRoomsAutoRefresh();
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

    hideOpenRoomsModal() {
        document.getElementById('open-rooms-modal')?.classList.remove('active');
        this.stopOpenRoomsAutoRefresh();
    }

    closeOpenRoomsModal() {
        if (this.openRoomsStage === 'list') {
            this.showOpenRoomsMenu();
            return;
        }
        this.stopOpenRoomsAutoRefresh();
        this.hideOpenRoomsModal();
    }

    resetOpenRoomsModalState() {
        const search = document.getElementById('open-room-search-input');
        const mode = document.getElementById('open-room-mode-filter');
        const stake = document.getElementById('open-room-stake-filter');
        if (search) search.value = this.onlineRoomFilters.search || '';
        if (mode) mode.value = this.onlineRoomFilters.roomMode || 'all';
        if (stake) stake.value = this.onlineRoomFilters.stakeKey || 'all';
    }

    syncOpenRoomsStage() {
        const menuUi = document.getElementById('open-rooms-menu-ui');
        const listUi = document.getElementById('open-rooms-list-ui');
        const menuVisible = this.openRoomsStage !== 'list';
        menuUi?.classList.toggle('is-hidden', !menuVisible);
        listUi?.classList.toggle('is-hidden', menuVisible);
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

    async loadOpenRooms() {
        const list = document.getElementById('open-rooms-list');
        const modal = document.getElementById('open-rooms-modal');
        if (!list || !modal?.classList.contains('active') || this.openRoomsStage !== 'list') return;
        this.setSummaryMessage(list, this.t('account-profile-loading'));
        try {
            const rooms = await this.account.getOpenRooms({
                search: this.onlineRoomFilters.search,
                roomMode: this.onlineRoomFilters.roomMode,
                stakeKey: this.onlineRoomFilters.stakeKey,
                roomVisibility: 'open',
                joinableOnly: true,
                limit: 24
            });
            if (!modal?.classList.contains('active') || this.openRoomsStage !== 'list') return;
            this.openRooms = Array.isArray(rooms) ? rooms : [];
            if (!this.openRooms.length) {
                this.setSummaryMessage(list, this.t('no-open-rooms'));
                return;
            }

            list.innerHTML = '';
            this.openRooms.forEach((room) => {
                const card = document.createElement('div');
                card.className = 'open-room-card';
                const title = document.createElement('div');
                title.className = 'open-room-title';
                const badges = document.createElement('div');
                title.textContent = `${room.hostName || room.roomCode || room.roomId || this.t('room-open')}${room.roomCode ? ' \u00b7 ' + room.roomCode : ''}`;
                badges.className = 'open-room-badges';
                const seatCount = `${room.connectedPlayers || 0}/${room.humanSeats || room.totalPlayers || 0}`;
                const modeLabel = room.roomMode === 'team'
                    ? this.t('mode-team')
                    : this.t('room-free-for-all');
                const stakeLabel = room.stakeKey
                    ? `${room.stakeKey.replace(/^stake_/i, '')}`
                    : '200';
                badges.appendChild(this.createRoomBadge('mode', modeLabel));
                badges.appendChild(this.createRoomBadge('players', seatCount));
                badges.appendChild(this.createRoomBadge('stake', stakeLabel));
                badges.appendChild(this.createRoomBadge('open', this.t('room-open')));
                const footer = document.createElement('div');
                footer.className = 'open-room-footer';
                const joinBtn = document.createElement('button');
                joinBtn.className = 'btn btn-action btn-strong';
                joinBtn.textContent = this.t('room-join');
                joinBtn.addEventListener('click', async () => {
                    const joined = await this.joinOnlineRoom(room.roomCode || room.roomId);
                    if (joined) this.hideOpenRoomsModal();
                });
                footer.appendChild(joinBtn);
                card.appendChild(title);
                card.appendChild(badges);
                card.appendChild(footer);
                list.appendChild(card);
            });
        } catch (err) {
            this.setSummaryMessage(list, err.message || this.t('account-server-unavailable'));
        }
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
            const [friendsResult, invitationsResult, presenceResult] = await Promise.allSettled([
                this.account.getFriends(),
                this.account.getRoomInvitations(),
                this.loadFriendPresenceMap()
            ]);
            const friends = friendsResult.status === 'fulfilled' ? friendsResult.value : null;
            const invitations = invitationsResult.status === 'fulfilled' ? invitationsResult.value : null;
            if (presenceResult.status === 'fulfilled' && presenceResult.value instanceof Map) {
                this.friendPresenceMap = presenceResult.value;
            }
            this.friendHub = friends || { accepted: [], incoming: [], outgoing: [], items: [] };
            this.roomInvitations = invitations || { incoming: [], sent: [] };
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
                    const friendId = String(item.friend?.id || '').trim();
                    const hasPendingInvite = friendId && (this.roomInvitations?.sent || []).some(inv => 
                        String(inv.invitee?.id || '').trim() === friendId && 
                        this.isRoomInvitationPending(inv)
                    );
                    const canInvite = Boolean(item.friend?.id) && !hasPendingInvite;

                    const messageBtn = document.createElement('button');
                    messageBtn.className = 'btn btn-menu message-action-btn';
                    messageBtn.textContent = 'Message';
                    messageBtn.addEventListener('click', () => {
                        void this.openConversationWithPlayer(item.friend);
                    });

                    const inviteBtn = document.createElement('button');
                    inviteBtn.className = 'btn btn-action btn-strong invite-action-btn';
                    if (hasPendingInvite) {
                        inviteBtn.classList.add('is-invited');
                        inviteBtn.textContent = this.t('invite-status-invited');
                        inviteBtn.disabled = true;
                    } else {
                        inviteBtn.textContent = this.t('friend-invite');
                        inviteBtn.disabled = !canInvite;
                        inviteBtn.addEventListener('click', async () => {
                            inviteBtn.disabled = true;
                            const originalText = inviteBtn.textContent;
                            inviteBtn.textContent = '...';
                            try {
                                await this.sendGameInviteToPlayer(item.friend, { source: 'friends-hub' });
                                await this.loadFriendsHub();
                                this.renderer.showMessage(this.t('invite-sent'), 1400);
                            } catch (err) {
                                this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
                                inviteBtn.textContent = originalText;
                                inviteBtn.disabled = !canInvite;
                            }
                        });
                    }
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'btn btn-menu';
                    removeBtn.textContent = this.t('friend-remove');
                    const giftBtn = document.createElement('button');
                    giftBtn.className = 'btn btn-action';
                    giftBtn.textContent = this.t('gift-button');
                    giftBtn.addEventListener('click', () => {
                        this.selectedGiftRecipientId = item.friend.id;
                        this.renderGiftPicker();
                        this.toggleGiftPicker(true);
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
                    action.appendChild(inviteBtn);
                    action.appendChild(giftBtn);
                    action.appendChild(removeBtn);
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
                if (invitationsResult.status !== 'fulfilled') {
                    setInvitesMessage(invitationsResult.reason?.message || this.t('friends-load-failed'));
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

    async joinOnlineRoom(code) {
        const nextCode = String(code || '').trim().toUpperCase();
        if (!nextCode) return false;
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
    }

    resetMultiplayerPanels(leaveRoom = false) {
        if (leaveRoom && this.network) {
            this.network.leaveRoom();
            this.currentRoomState = null;
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
            const inviteId = this.gameInviteState.inviteId;
            if (inviteId && this.gameInviteState.role === 'inviter') {
                void this.cancelRoomInviteWithFallback(inviteId).catch(() => {});
            }
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
        this.isTeamMode = Boolean(roomState?.isTeamMode ?? this.isTeamMode);
        this.turnVersion = Number(roomState?.turnVersion || this.turnVersion || 1);
        this.turnTimeoutMs = Number(roomState?.turnDurationMs || this.turnTimeoutMs || TURN_TIMEOUT_MS);
        this.syncServerClock(roomState?.serverNow || roomState?.serverTime || 0);
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

        for (const [index, player] of (roomState.players || []).entries()) {
            const displayName = getFirstNameDisplayName(player.name || '', `Player ${index + 1}`);
            const chip = document.createElement('div');
            chip.className = 'room-player-chip';
            if (player.sessionId === mySessionId) {
                chip.classList.add('you');
            }
            const avatar = document.createElement('span');
            avatar.className = 'room-player-avatar';
            const avatarUrl = player.avatarUrl || this.roomAvatarBySessionId.get(player.sessionId) || '';
            if (player.sessionId) {
                this.roomAvatarBySessionId.set(player.sessionId, avatarUrl || this.roomAvatarBySessionId.get(player.sessionId) || '');
            }
            if (avatarUrl) {
                avatar.classList.add('has-image');
                const img = document.createElement('img');
                img.alt = displayName || 'Player avatar';
                img.src = avatarUrl;
                img.referrerPolicy = 'no-referrer';
                avatar.appendChild(img);
            } else {
                avatar.textContent = this.getTurnAvatarText(displayName || '');
            }
            const name = document.createElement('span');
            name.textContent = player.sessionId === mySessionId ? `${displayName} (${this.t('online-you')})` : displayName;
            const state = document.createElement('span');
            state.className = 'room-player-state';
            state.textContent = player.isConnected ? this.t('online-ready') : this.t('online-offline');
            chip.dataset.sessionId = player.sessionId || '';
            if (player.seatNumber) {
                const seat = document.createElement('span');
                seat.className = 'room-player-seat';
                seat.textContent = `${this.t('seat-prefix')} ${player.seatNumber}`;
                chip.appendChild(seat);
            }

            chip.appendChild(avatar);
            chip.appendChild(name);
            chip.appendChild(state);
            list.appendChild(chip);
        }

        const humanPlayerCount = (roomState.players || []).filter(player => !player.isBot).length;
        for (let i = humanPlayerCount; i < humanSeats; i++) {
            const chip = document.createElement('div');
            chip.className = 'room-player-chip empty';
            chip.textContent = this.format('online-waiting-slot', { index: i + 1 });
            list.appendChild(chip);
        }

        if (!roomState.gameActive && aiCount > 0) {
            for (let i = 0; i < aiCount; i++) {
                const chip = document.createElement('div');
                chip.className = 'room-player-chip bot';
                chip.textContent = this.format('online-bot-slot', { index: i + 1 });
                list.appendChild(chip);
            }
        }

        if (!roomState.gameActive) {
            const statusText = humanJoined < humanSeats
                ? `${this.t('online-room-status-waiting')} (${humanJoined}/${humanSeats})`
                : this.t('online-room-status-ready');
            this.setHostStatus(statusText);
            this.setJoinStatus(statusText);
        }

        if (this.network?.isMultiplayer && roomState.roomVisibility === 'open' && !this.gameActive && !roomState.gameActive && roomState.seatSelectionRequired === true && !roomState.gameOverReason && !roomState.matchOver) {
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
        this.showStartModal(null);
        this.hideOpenRoomsModal();

        const roomPlayers = Array.isArray(roomState.players) ? roomState.players : [];
        const totalPlayers = Math.max(2, Number(roomState.totalPlayers || roomState.humanSeats || roomPlayers.length || 2));
        this.isTeamMode = Boolean(roomState?.isTeamMode ?? this.isTeamMode);
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
        this.clearPendingOnlineAction({ rollback: false });
        this.clearNextDealAdvanceTimeout();
        this.clearTurnTimers();
        this.network.leaveRoom();
        this.voice?.destroy?.();
        this.currentRoomState = null;
        this.roomAvatarBySessionId.clear();
        this.myHand = null;
        this.gameActive = false;
        this.onlineRoundBankAmount = 0;
        this.resetOnlineCoinSummary();
        this.showStartModal(null);
        this.resetMultiplayerPanels(false);
        document.getElementById('menu-screen').classList.remove('active');
        document.getElementById('round-end-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.remove('active');
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('start-screen').classList.add('active');
        this.hideSeatSelectionUi();
        this.setJoinStatus(reason);
        this.setHostStatus(reason);
        this.clearGameResumeSnapshot();
    }

    cloneTilesForSnapshot(tiles = []) {
        return (Array.isArray(tiles) ? tiles : [])
            .map((tile) => (tile ? new Tile(tile.a, tile.b) : null))
            .filter(Boolean);
    }

    cloneBoardForSnapshot(board = this.board) {
        if (!board) return new Board();
        return cloneBoard(board);
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
        if (!this.network.isMultiplayer || this.currentPlayer !== this.humanPlayerIndex || !this.myHand) {
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
            this._boardAnimationActive = {
                tileId: tile.id,
                action: 'play',
                source: 'optimistic'
            };
            this._boardAnimationPromise = this.renderer.animateTileTravel(tile.id)
                .catch(() => {})
                .finally(() => {
                    if (String(this._boardAnimationActive?.tileId || '') === String(tile.id)) {
                        this._boardAnimationActive = null;
                    }
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
        const snapshot = this.persistGameResumeSnapshot();
        this.refreshResumeBanner(snapshot);
        if (payload.reconnecting) {
            this.voice?.stopSpeaking?.();
            this.renderer.showMessage(this.t('connection-lost'), 2200);
        }
    }

    onNetworkReconnected() {
        document.getElementById('start-screen')?.classList.remove('active');
        document.getElementById('menu-screen')?.classList.remove('active');
        document.getElementById('round-end-screen')?.classList.remove('active');
        document.getElementById('game-over-screen')?.classList.remove('active');
        this.showStartModal(null);
        this.clearNextDealAdvanceTimeout();
        this.clearTurnTimers();
        this.pendingReconnectResolution = true;
    }

    onNetworkReconnectFailed(error) {
        console.warn('[Network] Reconnect failed permanently', error);
        void this.validateStoredResumeSnapshot();
        this.renderer.showMessage(this.t('session-restore-failed'), 2200);
    }

    setupGameControls() {
        this.bindTap(this.renderer.drawBtn, () => this.drawFromBoneyard());
        this.bindTap(this.renderer.passBtn, () => this.passTurn());
        document.getElementById('next-round-btn')?.addEventListener('click', () => {
            document.getElementById('round-end-screen').classList.remove('active');
            if (this.matchOver) { this.showMatchResult(); return; }
            if (this.network.isMultiplayer) {
                this.network.sendNextDeal();
            } else {
                if (this.roundOver) void this.startRound();
                else this.startDeal();
            }
        });
        document.getElementById('new-game-btn')?.addEventListener('click', () => {
            document.getElementById('game-over-screen').classList.remove('active');
            if (this.network.isMultiplayer) {
                void this.returnToMainMenu({ settleForfeit: false });
                return;
            }
            void this.startNewGame();
        });
        document.getElementById('game-over-quit-btn')?.addEventListener('click', async () => {
            document.getElementById('game-over-screen').classList.remove('active');
            await this.returnToMainMenu({ settleForfeit: false });
        });
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
        this.giftPicker = document.getElementById('gift-picker');
        if (!this.giftPicker) return;

        if (this.giftBtn) {
            this.giftBtn.innerHTML = this.buildGiftButtonMarkup(48);
            this.giftBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleGiftPicker();
            });
        }
        this.renderGiftPicker();

        this._giftOutsideHandler = (event) => {
            if (!this.giftPicker.classList.contains('open')) return;
            const target = event.target;
            const chatGiftBtn = document.getElementById('chat-gift-btn');
            if (this.giftPicker.contains(target) 
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
        if (!this.giftPicker) return;
        this.giftPicker.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'gift-picker-header';
        const title = document.createElement('div');
        title.className = 'gift-picker-title';
        title.textContent = this.t('gift-picker-title');
        header.appendChild(title);

        const recipientRow = document.createElement('div');
        recipientRow.className = 'gift-recipient-row';
        const recipients = this.getGiftRecipients();
        
        const activePlayerId = String(this.accountMessagesState?.activePlayerId || '').trim();
        const threads = Array.isArray(this.accountMessagesState?.threads) ? this.accountMessagesState.threads : [];
        const activeThread = threads.find((t) => String(t?.player?.id || t?.playerId || t?.id || '').trim() === activePlayerId) || null;
        const activePlayer = this.accountMessagesState?.activePlayerProfile || activeThread?.player || null;
        if (activePlayerId && !recipients.some((item) => item.id === activePlayerId)) {
            recipients.push({
                id: activePlayerId,
                displayName: activePlayer?.displayName || this.getRecipientNameById(activePlayerId) || 'Player',
                avatarUrl: activePlayer?.avatarUrl || null
            });
        }
        
        if (!recipients.length) {
            const empty = document.createElement('div');
            empty.className = 'modal-desc';
            empty.textContent = this.t('gift-no-recipient');
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

        const grid = document.createElement('div');
        grid.className = 'gift-picker-grid';
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
                meta.textContent = `${gift.rarity || 'common'} вЂў ${gift.exchangeValue || 0} back`;
                const cost = document.createElement('div');
                cost.className = 'gift-choice-cost';
                cost.textContent = `${gift.coinCost || 100} coins`;
                meta.textContent = this.format('gift-choice-meta', {
                    rarity: gift.rarity || 'common',
                    exchangeValue: gift.exchangeValue || 0
                });
                cost.textContent = this.format('gift-coins', { value: gift.coinCost || 100 });
                card.appendChild(visual);
                card.appendChild(name);
                card.appendChild(meta);
                card.appendChild(cost);
                card.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    await this.sendGift(gift.key, this.selectedGiftRecipientId || recipients[0]?.id || '');
                });
                grid.appendChild(card);
            }
        }

        this.giftPicker.appendChild(header);
        this.giftPicker.appendChild(recipientRow);
        this.giftPicker.appendChild(grid);
    }
    toggleGiftPicker(force = null) {
        if (!this.giftPicker) return;
        const open = force === null ? !this.giftPicker.classList.contains('open') : !!force;
        this.giftPicker.classList.toggle('open', open);
        this.giftPicker.setAttribute('aria-hidden', String(!open));
        if (this.giftBtn) {
            this.giftBtn.setAttribute('aria-expanded', String(open));
        }
        if (open) {
            this.renderGiftPicker();
            void this.loadGiftHub();
        }
    }
    closeGiftPicker() {
        this.toggleGiftPicker(false);
    }
    getGiftRecipients() {
        const recipients = [];
        const seen = new Set();
        const myPlayerId = String(this.accountProfile?.playerId || this.accountProfile?.id || this.accountProfile?.player?.id || '').trim();
        const roomPlayers = Array.isArray(this.currentRoomState?.players) ? this.currentRoomState.players : [];
        for (const player of roomPlayers) {
            const id = String(player?.playerId || player?.userId || player?.sessionId || '').trim();
            if (!id || id === myPlayerId || seen.has(id)) continue;
            seen.add(id);
            recipients.push({
                id,
                displayName: String(player?.name || 'Player').trim() || 'Player',
                avatarUrl: null
            });
        }
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
    async sendGift(giftKey, recipientPlayerId) {
        const recipientId = String(recipientPlayerId || '').trim();
        const key = String(giftKey || '').trim();
        if (!recipientId || !key) {
            this.renderer.showMessage(this.t('gift-select-recipient'), 1400);
            return null;
        }
        const myPlayerId = String(this.accountProfile?.playerId || this.accountProfile?.id || this.accountProfile?.player?.id || '').trim();
        if (!this.accountProfile || recipientId === myPlayerId) {
            this.renderer.showMessage(this.t('gift-self-send'), 1600);
            return null;
        }
        const gift = this.giftCatalog.find((item) => item.key === key);
        if (!gift) {
            this.renderer.showMessage(this.t('gift-not-found'), 1600);
            return null;
        }
        try {
            const result = await this.account.sendGift({
                recipientPlayerId: recipientId,
                giftKey: key,
                contextType: this.network?.isMultiplayer ? 'match' : 'profile',
                contextId: this.currentRoomState?.roomId || this.currentMatchSessionId || '',
                note: `${gift.name}`
            });
            const name = this.getRecipientNameById(recipientId);
            this.closeGiftPicker();
            this.lastGiftSentAt = Date.now();
            this.lastGiftSentKey = key;
            this.showGiftBurst(gift, this.accountProfile?.name || this.t('gift-button'), name);
            if (this.network?.isMultiplayer) {
                this.network.sendGift({
                    giftKey: gift.key,
                    giftName: gift.name,
                    assetKey: gift.assetKey,
                    recipientPlayerId: recipientId,
                    recipientName: name,
                    contextType: this.network?.isMultiplayer ? 'match' : 'profile',
                    contextId: this.currentRoomState?.roomId || this.currentMatchSessionId || ''
                });
            }
            await this.loadAccountProfile();
            await this.loadGiftHub();
            await this.loadSocialSummary();
            this.renderAccountModal();
            this.renderer.showMessage(this.t('gift-sent'), 1500);
            return result;
        } catch (err) {
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
        const roomPlayer = roomPlayers.find((player) => String(player?.playerId || player?.userId || player?.sessionId || '').trim() === id);
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
        this.clearPendingOnlineAction({ rollback: false });
        this.clearNextDealAdvanceTimeout();
        this.clearTurnTimers();
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
            this.network.leaveRoom();
            this.myHand = null;
        }
        this.voice?.destroy?.();
        this.gameActive = false;
        this.matchOver = false;
        this.roundOver = false;
        this.currentRoomState = null;
        this.disconnectEconomyApplied = false;
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('start-screen').classList.add('active');
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
        startGameMusic();
        this.playerName = this.sanitizeName(this.playerName);

        // In multiplayer, server controls the game - just wait for state updates
        if (this.network.isMultiplayer) {
            debugLog('[startNewGame] Multiplayer mode - waiting for server');
            this.humanPlayerIndex = 0;
            if (this.isTeamMode) this.playerCount = 4;
            return;
        }

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
        this._turnCycleId += 1;
        const turnCycleId = this._turnCycleId;
        this.clearNextDealAdvanceTimeout();
        this.clearTurnTimers();
        this.board=new Board(); this.selectedTileIndex=-1; this.roundOver=false; this.gameActive=true; this.turnInProgress=false;
        const deal = this.dealHandsWithValidation();
        this.hands = deal.hands;
        this.boneyard = deal.boneyard;
        debugLog('[startDeal] Hands dealt, boneyard:', this.boneyard.length);
        if(this.lastDealWinner!==null){
            const fp=this.lastDealWinner;
            this.currentPlayer=fp; this.renderState();
            this.startTurnTimer();
            debugLog('[startDeal] Last deal winner starts:', fp);
            this.broadcastMsg(this.format('msg-last-winner-starts', { player: this.playerNames[fp] }),2000);
            this.queueAITurnIfNeeded(BOT_THINK_DELAY_MS, turnCycleId);
        }else{
            const f=determineFirstPlayer(this.hands);
            const fp=f.player; const fi=f.tileIndex;
            this.currentPlayer=fp; this.renderState();
            this.startTurnTimer();
            debugLog('[startDeal] First player determined:', fp);
            this.broadcastMsg(this.format('msg-first-turn', { player: this.playerNames[fp] }),2000);
            this.turnInProgress=true;
            this._firstTurnTimeout = setTimeout(() => {
                if (turnCycleId !== this._turnCycleId) return;
                this.turnInProgress=false;
                this.playTile(fp,fi,-1);
            },BOT_THINK_DELAY_MS);
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
        const members = this.getTeamMembers(teamIndex);
        const names = members.map((i) => this.playerNames[i] || `Player ${i + 1}`);
        if (names.length) return names.join(' & ');
        return teamIndex === 0 ? this.t('team-a') : this.t('team-b');
    }
    getTeamHandPoints(teamIndex) {
        return this.getTeamMembers(teamIndex).reduce((total, i) => total + handPoints(this.hands[i] || []), 0);
    }
    getOpeningScoreContext(pi) {
        if (this.isTeamMode) {
            return Number(this.teamScores[this.getTeam(pi)] || 0);
        }
        return Number(this.scores[pi] || 0);
    }
    shouldRedealOpeningHands(hands = []) {
        return (Array.isArray(hands) ? hands : []).some((hand) => hasInvalidOpeningHand(hand));
    }
    dealHandsWithValidation() {
        const hs = getHandSize(this.playerCount);
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
    renderState() {
        if (this.gameActive) {
            document.getElementById('round-end-screen')?.classList.remove('active');
        }
        let displayEntities;
        if (this.isTeamMode) {
            const teamA = this.getTeamMembers(0);
            const teamB = this.getTeamMembers(1);
            const resolveTeamProfile = (members) => members.map((index) => this.roomPlayerRefs?.[index] || null).find((player) => Boolean(String(player?.playerId || player?.userId || player?.id || '').trim()) && !player?.isBot) || members.map((index) => this.roomPlayerRefs?.[index] || null).find((player) => Boolean(String(player?.playerId || player?.userId || player?.id || '').trim())) || null;
            const teamAProfile = resolveTeamProfile(teamA);
            const teamBProfile = resolveTeamProfile(teamB);
            displayEntities = [
                { name: this.getTeamDisplayName(0), score: this.teamScores[0], roundWins: this.teamRoundWins[0], isCurrent: this.isPlayerInTeam(0, this.currentPlayer), index: teamA.includes(this.currentPlayer) ? this.currentPlayer : -1, playerId: String(teamAProfile?.playerId || teamAProfile?.userId || teamAProfile?.id || '').trim(), isBot: Boolean(teamAProfile?.isBot) },
                { name: this.getTeamDisplayName(1), score: this.teamScores[1], roundWins: this.teamRoundWins[1], isCurrent: this.isPlayerInTeam(1, this.currentPlayer), index: teamB.includes(this.currentPlayer) ? this.currentPlayer : -1, playerId: String(teamBProfile?.playerId || teamBProfile?.userId || teamBProfile?.id || '').trim(), isBot: Boolean(teamBProfile?.isBot) }
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
        const waitingOpenRoom = this.network.isMultiplayer
            && !this.gameActive
            && this.currentRoomState?.roomVisibility === 'open';
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
        
        this.renderer.renderBoard(this.board);
        const roomPlayers = Array.isArray(this.currentRoomState?.players) ? this.currentRoomState.players : [];
        this.renderer.renderOpponentHands(this.hands, this.humanPlayerIndex, roomPlayers.length ? roomPlayers : this.playerNames, this.currentPlayer);
        const myHand = this.myHand || this.hands[this.humanPlayerIndex] || [];
        if (!this.network.isMultiplayer) {
            this.validMoves = this.board.getValidMoves(myHand);
        }
        const myTurn = this.currentPlayer === this.humanPlayerIndex;
        this.renderer.renderHand(myHand, this.validMoves, this.selectedTileIndex, myTurn);

        const canPlay = this.board.canPlayAny(this.normalizeHandForBoard(myHand));
        const emptyBoneyard = this.boneyard.length === 0;
        this.renderer.drawBtn.disabled = waitingOpenRoom || !myTurn || canPlay || emptyBoneyard || this.postMoveWindowActive || this.turnInProgress;
        this.renderer.passBtn.disabled = waitingOpenRoom || !myTurn || canPlay || !emptyBoneyard || this.postMoveWindowActive || this.turnInProgress;

        this.goshaCombo = (this.gameActive && myTurn) ? this.board.getGoshaCombo(myHand) : null;
        this.renderer.showGoshaBtn(this.goshaCombo, () => this.playGoshaCombo());
        this.updateTurnTimerHud();
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
            "online-waiting-slot": { az: "Waiting for player {index}", en: "Waiting for player {index}" },
            "online-room-closed": { az: "Room closed", en: "Room closed" },
            "online-room-summary": { az: "{humans} humans + {bots} AI, {total} total", en: "{humans} humans + {bots} AI, {total} total" },
            "online-bot-slot": { az: "AI {index}", en: "AI {index}" },
            "resume-session-kicker": { az: "Yarımçıq sessiya", en: "Unfinished session", ru: "Незавершённая сессия" },
            "resume-session": { az: "Davam et", en: "Resume", ru: "Продолжить" },
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
        let displayEntities;
        if (this.isTeamMode) {
            const teamA = this.getTeamMembers(0);
            const teamB = this.getTeamMembers(1);
            const resolveTeamProfile = (members) => members.map((index) => this.roomPlayerRefs?.[index] || null).find((player) => Boolean(String(player?.playerId || player?.userId || player?.id || '').trim()) && !player?.isBot) || members.map((index) => this.roomPlayerRefs?.[index] || null).find((player) => Boolean(String(player?.playerId || player?.userId || player?.id || '').trim())) || null;
            const teamAProfile = resolveTeamProfile(teamA);
            const teamBProfile = resolveTeamProfile(teamB);
            displayEntities = [
                { name: this.getTeamDisplayName(0), score: this.teamScores[0], roundWins: this.teamRoundWins[0], isCurrent: this.isPlayerInTeam(0, this.currentPlayer), index: teamA.includes(this.currentPlayer) ? this.currentPlayer : -1, playerId: String(teamAProfile?.playerId || teamAProfile?.userId || teamAProfile?.id || '').trim(), isBot: Boolean(teamAProfile?.isBot) },
                { name: this.getTeamDisplayName(1), score: this.teamScores[1], roundWins: this.teamRoundWins[1], isCurrent: this.isPlayerInTeam(1, this.currentPlayer), index: teamB.includes(this.currentPlayer) ? this.currentPlayer : -1, playerId: String(teamBProfile?.playerId || teamBProfile?.userId || teamBProfile?.id || '').trim(), isBot: Boolean(teamBProfile?.isBot) }
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
            hand: this.getHandRenderSignature(this.myHand || this.hands[this.humanPlayerIndex] || [], this.validMoves, this.selectedTileIndex, this.currentPlayer === this.humanPlayerIndex)
        };

        if (boardChanged) {
            this.renderer.renderBoard(this.board);
        }
        if (opponentHandsChanged && (force || nextSignatures.opponents !== this._realtimeRenderSignatures.opponents)) {
            this.renderer.renderOpponentHands(this.hands, this.humanPlayerIndex, roomPlayers.length ? roomPlayers : this.playerNames, this.currentPlayer);
            this._realtimeRenderSignatures.opponents = nextSignatures.opponents;
        }
        const myHand = this.myHand || this.hands[this.humanPlayerIndex] || [];
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

        const waitingOpenRoom = this.network.isMultiplayer
            && !this.gameActive
            && this.currentRoomState?.roomVisibility === 'open';
        const canPlay = this.board.canPlayAny(this.normalizeHandForBoard(myHand));
        const emptyBoneyard = this.boneyard.length === 0;
        this.renderer.drawBtn.disabled = waitingOpenRoom || !myTurn || canPlay || emptyBoneyard || this.postMoveWindowActive || this.turnInProgress;
        this.renderer.passBtn.disabled = waitingOpenRoom || !myTurn || canPlay || !emptyBoneyard || this.postMoveWindowActive || this.turnInProgress;

        this.goshaCombo = (this.gameActive && myTurn) ? this.goshaCombo : null;
        this.renderer.showGoshaBtn(this.goshaCombo, () => this.playGoshaCombo());
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
        this.isTeamMode = Boolean(payload?.isTeamMode);
        this.teamScores = Array.from(payload?.teamScores || [0, 0]);
        this.teamRoundWins = Array.from(payload?.teamRoundWins || [0, 0]);
        this.matchRound = Number(payload?.matchRound || 1);
        this.deal = Number(payload?.deal || 1);
        this.gameActive = Boolean(payload?.gameActive);
        this.matchOver = Boolean(payload?.matchOver);
        this.onlineStakeKey = payload?.stakeKey || this.onlineStakeKey;
        this.onlineRoundBankAmount = Math.max(0, Number(payload?.bankAmount || 0));
        this.turnVersion = Number(payload?.turnVersion || this.turnVersion || 1);
        this.board = reconstructBoard(payload?.board || {});
        this.myHand = Array.isArray(payload?.selfHand) ? payload.selfHand.map((t) => new Tile(t.a, t.b)) : [];
        const mySid = this.network?.room?.sessionId || '';
        const myIdx = playerOrder.indexOf(mySid);
        if (myIdx !== -1) {
            this.humanPlayerIndex = myIdx;
            this.hands[myIdx] = this.myHand;
        }
        this.validMoves = Array.isArray(payload?.turnInfo?.validMoves) ? payload.turnInfo.validMoves : [];
        this.goshaCombo = payload?.turnInfo?.goshaCombo || null;
        if (this.gameActive && Number(payload?.turnDeadlineAt || 0) > 0) {
            this.startTurnTimer(Number(payload.turnDeadlineAt), Number(payload?.turnVersion || this.turnVersion || 1), this.currentPlayer);
        } else {
            this.clearTurnTimers();
        }
        this.clearPendingOnlineAction({ rollback: false });
        this.turnInProgress = false;
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
                this.renderer.showMessage(reason.replace(/_/g, ' '), 1200);
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
        const scorePlayerIndex = Number.isInteger(Number(payload?.scorePlayerIndex))
            ? Number(payload.scorePlayerIndex)
            : Number.isInteger(Number(payload?.actorIndex))
                ? Number(payload.actorIndex)
                : -1;
        const payloadTileId = String(payload?.boardDelta?.tile?.id || '');
        const isOwnOptimisticPlay = action === 'play'
            && payloadTileId
            && String(this._pendingOptimisticPlayTileId || '') === payloadTileId;
        if (isOwnOptimisticPlay) {
            boardChanged = false;
        }
        const isBoardAnimationAction = boardChanged && (action === 'play' || action === 'gosha') && !isOwnOptimisticPlay;
        const deferScoreUi = scoreDelta > 0 && (action === 'play' || action === 'gosha');

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

        const animationPromise = isBoardAnimationAction
            ? (this.renderer?._pendingBoardTileTravel?.tileId
                ? this.renderer.animateTileTravel(this.renderer._pendingBoardTileTravel.tileId).catch((error) => {
                    console.warn('[CLIENT_DEBUG] board animation failed', error);
                })
                : this._boardAnimationPromise || Promise.resolve())
            : (isOwnOptimisticPlay ? (this._boardAnimationPromise || Promise.resolve()) : Promise.resolve());

        const shouldDelayScorePopup = scoreDelta > 0 && (action === 'play' || action === 'gosha') && (isBoardAnimationAction || isOwnOptimisticPlay);

        if (shouldDelayScorePopup) {
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
        } else if (scoreDelta > 0) {
            this.showScoreFeedback(scoreDelta);
        }

        if (isOwnOptimisticPlay) {
            this._pendingOptimisticPlayTileId = '';
            this._pendingOptimisticPlayActionId = '';
        }
    }

    // --- Network Handlers (Thin Client Mode) ---
    onNetworkStateUpdate(state) {
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
        this.playerCount = Number(state?.playerCount || playerOrder.length || this.playerCount || 0);

        if (state.boardJson) {
            try {
                const parsed = JSON.parse(state.boardJson);
                this.board = reconstructBoard(parsed);
            } catch (e) { console.error(e); }
        }
        
        this.currentPlayer = state?.currentPlayerIndex ?? 0;
        this.boneyard = Array.from({ length: state?.boneyardCount || 0 });
        this.isTeamMode = !!state?.isTeamMode;
        this.matchRound = state?.matchRound || 1;
        this.deal = state?.deal || 1;
        this.gameActive = !!state?.gameActive;
        this.matchOver = !!state?.matchOver;
        this.onlineStakeKey = state?.stakeKey || this.onlineStakeKey;
        this.onlineRoundBankAmount = Math.max(0, Number(state?.bankAmount || 0));
        this.turnVersion = Number(state?.turnVersion || this.turnVersion || 1);
        if (this.hasPendingOnlinePlayAck(state, playerOrder, null)) {
            this.clearPendingOnlineAction({ rollback: false });
            this.turnInProgress = false;
        }
        const shouldKeepTurnHints = this.gameActive && this.currentPlayer === this.humanPlayerIndex;
        if (!shouldKeepTurnHints) {
            this.validMoves = [];
            this.goshaCombo = null;
        }
        if (this.gameActive && Number(state?.turnDeadlineAt || 0) > 0) {
            this.startTurnTimer(Number(state.turnDeadlineAt), Number(state?.turnVersion || this.turnVersion || 1), this.currentPlayer);
        } else {
            this.clearTurnTimers();
        }

        const gameOverReason = String(state?.gameOverReason || '').trim();
        if (this.pendingReconnectResolution) {
            if (this.matchOver || gameOverReason === 'disconnect') {
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
            if (!this.gameActive) {
                return;
            }
            this.pendingReconnectResolution = false;
        }

        // Hide start screen if we just started
        if (this.gameActive && document.getElementById('start-screen').classList.contains('active')) {
            document.getElementById('start-screen').classList.remove('active');
            document.getElementById('game-screen').classList.add('active');
        }

        if (this.matchOver || gameOverReason === 'disconnect') {
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
        this.goshaCombo = info.goshaCombo || null;
        if (this.network.isMultiplayer) {
            this.turnInProgress = false;
            this.scheduleRealtimeRender({ boardChanged: false, handChanged: true, opponentHandsChanged: false, scoresChanged: false, infoChanged: false });
            return;
        }
        this.renderState();
    }


    onNetworkDealEnd(data) {
        this.gameActive = false;
        this.clearTurnTimers();
        // Reconstruct all hands to show them at the end
        const finalHands = data.hands.map(h => h.map(t => new Tile(t.a, t.b)));
        this.hands = finalHands;
        
        let displayEntities;
        if(this.isTeamMode){
            const wt = data.winnerIndex % 2;
            displayEntities = [
                {name: this.getTeamDisplayName(0), isWinner: wt===0, score: this.teamScores[0], handPoints: this.getTeamHandPoints(0), leftoverHands: this.getTeamLeftoverHands(0)},
                {name: this.getTeamDisplayName(1), isWinner: wt===1, score: this.teamScores[1], handPoints: this.getTeamHandPoints(1), leftoverHands: this.getTeamLeftoverHands(1)}
            ];
        }else{
            displayEntities = this.playerNames.map((n,i)=>({name:n,isWinner:i===data.winnerIndex,handPoints:handPoints(this.hands[i]),score:this.scores[i], leftoverHands: [this.hands[i]]}));
        }
        
        this.renderer.renderDealEnd(this.playerNames[data.winnerIndex], displayEntities, data.fish, data.bonus);
        this.persistGameResumeSnapshot();
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
        this.gameActive = false;
        this.clearTurnTimers();
        const wi = data.winnerIndex;
        const winnerTeamIndex = data.isTeamMode ? (wi % 2) : null;
        this.roundOver = true;

        if (data.isTeamMode) {
            this.teamScores = data.teamScores;
            this.teamRoundWins = data.teamRoundWins;
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
        if (data.isTeamMode) {
            displayEntities = [
                {name: this.getTeamDisplayName(0), isWinner: winnerTeamIndex === 0, score: data.teamScores[0], roundWins: data.teamRoundWins[0]},
                {name: this.getTeamDisplayName(1), isWinner: winnerTeamIndex === 1, score: data.teamScores[1], roundWins: data.teamRoundWins[1]}
            ];
        } else {
            displayEntities = data.players.map(p => ({name: p.name, isWinner: p.isWinner, score: p.score, roundWins: p.roundWins}));
        }

        if (data.isMatchOver) {
            this.showMatchResult();
        } else {
            const winnerLabel = data.isTeamMode ? this.getTeamDisplayName(winnerTeamIndex) : this.playerNames[wi];
            this.renderer.renderRoundEnd(winnerLabel, displayEntities, data.wins, data.matchRound, false);
        }
        this.matchRound = data.matchRound + 1;
        if (data.isMatchOver) this.clearGameResumeSnapshot();
        else this.persistGameResumeSnapshot();
    }

    // Override actions to send to network
    onHandTileClick(ti, fromRemote=false) {
        if (this.network.isMultiplayer) {
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
                this.renderer.showArrowChoices(this.board, ends,
                    (ei) => {
                        const actionId = this.network.nextActionId('play');
                        if (!this.applyOptimisticOnlinePlay(ti, ei, actionId)) {
                            this.selectedTileIndex = -1;
                            this.renderer.renderHand(this.myHand, this.validMoves, -1);
                            return;
                        }
                        this.network.sendPlay(ti, ei, actionId);
                    },
                    () => { this.selectedTileIndex = -1; this.renderer.renderHand(this.myHand, this.validMoves, -1); }
                );
            }
            return;
        }

        // --- Local Game Logic Below ---
        if(this.matchOver||this.roundOver||!this.gameActive) return;

        const pi = this.currentPlayer;
        const hand = this.hands[pi];
        const tile = hand[ti];
        if (!tile) return;
        
        if (this.board.isEmpty) { this.playTile(pi, ti, -1); return; }
        const ends = [];
            for (let j=0; j<this.board.openEnds.length; j++) if (tile.hasValue(this.board.openEnds[j].value)) ends.push(j);
            if (ends.length > 1 && this.board.nodes.length === 1 && this.board.nodes[0].tile.isDouble) ends.length = 1;
        if (ends.length === 1) this.playTile(pi, ti, ends[0]);
        else if (ends.length > 1) {
            this.selectedTileIndex = ti;
            this.renderer.renderHand(hand, this.validMoves, this.selectedTileIndex);
            this.renderer.showArrowChoices(this.board, ends,
                (ei) => { this.selectedTileIndex = -1; this.playTile(pi, ti, ei); },
                () => { this.selectedTileIndex = -1; this.renderer.renderHand(this.hands[pi], this.validMoves, -1); }
            );
        }
    }

    playGoshaCombo(fromRemote=false) {
        if (this.network.isMultiplayer) {
            if (this.turnInProgress) return;
            this.turnInProgress = true;
            const actionId = this.network.sendGosha();
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
        
        const score = this.goshaCombo?.score || this.board.calculateScore();
        if(score>0){this.addScore(pi,score);if(this.checkEnd(pi,score))return;}
        this.broadcastMsg(this.format('msg-gosha', { player: this.playerNames[pi] }),2000);
        if(hand.length===0){ this._dealEndTimeout = setTimeout(()=>this.endDeal(pi,false), 0); return;}
        if(this.board.isBlocked(this.hands,this.boneyard)){ this._dealEndTimeout = setTimeout(()=>this.endDeal(this.findFishWinner(),true), 0); return;}
        this.turnInProgress=false;
        const advanceDelay = this.shouldOpenGoshaChainWindow(pi) ? this.postMoveAdvanceMs : 0;
        this.scheduleTurnAdvance(advanceDelay, this._turnCycleId);
    }

    drawFromBoneyard(fromRemote=false) {
        if (this.network.isMultiplayer) {
            if (this.turnInProgress) return;
            this.turnInProgress = true;
            const actionId = this.network.sendDraw();
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

        this.hands[pi].push(this.boneyard.pop());
        this.playSound('draw'); this.broadcastMsg(this.t('msg-took-bazaar'), 1500); this.renderState();
    }
    passTurn(fromRemote=false) {
        if (this.network.isMultiplayer) {
            if (this.turnInProgress) return;
            this.turnInProgress = true;
            const actionId = this.network.sendPass();
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
    checkEnd(pi,score){
        if(this.instantWinEnabled && score>=IWIN){
            this.gameActive=false; this.roundOver=true; this.turnInProgress=false; this.playSound('win');
            this.renderState();
            setTimeout(() => this.endRound(pi, true), 800);
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
            score = getOpeningPlayScore(tile, this.getOpeningScoreContext(pi));
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
        
        if(score>0){this.addScore(pi,score);if(this.checkEnd(pi,score))return;}
        if(hand.length===0){ this._dealEndTimeout = setTimeout(()=>{ if (turnCycleId !== this._turnCycleId) return; this.endDeal(pi,false); }, 0); return;}
        if(this.board.isBlocked(this.hands,this.boneyard)){ this._dealEndTimeout = setTimeout(()=>{ if (turnCycleId !== this._turnCycleId) return; this.endDeal(this.findFishWinner(),true); }, 0); return;}

        this.turnInProgress=false;
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
        if(this.board.isBlocked(this.hands,this.boneyard)){this.endDeal(this.findFishWinner(),true);return;}
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
                this.renderer.showMessage(this.t('msg-your-turn'), 1000);
            }
        }
        this.queueAITurnIfNeeded(BOT_THINK_DELAY_MS);
    }

    queueAITurnIfNeeded(delay) {
        const isAI = this.ais.some(a => a.index === this.currentPlayer);
        if (isAI) {
            const turnCycleId = this._turnCycleId;
            clearTimeout(this._aiTurnTimeout);
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
            this.playGoshaCombo();
            return;
        }

        const moves = this.board.getValidMoves(hand);
        const move = ai.chooseMove(this.board, hand, moves, this.scores, this.hands, this.boneyard, this.playerMissingSuits);

        if (move) {
            this.turnInProgress = false;
            this.playTile(pi, move.tileIndex, move.openEndIndex);
        } else if (this.boneyard.length > 0) {
            this.turnInProgress = false;
            this.drawFromBoneyard();
            this.queueAITurnIfNeeded(BOT_THINK_DELAY_MS);
        } else {
            this.turnInProgress = false;
            this.passTurn();
        }
    }

    findFishWinner(){
        if(this.isTeamMode){
            const t0 = this.getTeamHandPoints(0);
            const t1 = this.getTeamHandPoints(1);
            const winningTeam = t0<=t1?0:1;
            const players = this.getTeamMembers(winningTeam);
            let minP = Infinity, bestP = players[0];
            for(const pIdx of players) {
                const p = handPoints(this.hands[pIdx] || []);
                if(p < minP) { minP = p; bestP = pIdx; }
            }
            return bestP;
        }
        let min=Infinity,w=0;for(let i=0;i<this.playerCount;i++){const p=handPoints(this.hands[i] || []);if(p<min){min=p;w=i;}}return w;
    }

    isMatchTargetReached() {
        const pool = this.isTeamMode ? this.teamScores : this.scores;
        return pool.some((score) => Number(score || 0) >= TARGET);
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
        let displayEntities;
        if(this.isTeamMode){
            const wt=this.getTeam(wi);let os=0;
            const teamMembers = this.getTeamMembers(wt);
            const otherMembers = this.getTeamMembers(1 - wt);
            for (const i of otherMembers) os += handPoints(this.hands[i] || []);
            if (fish) for (const i of teamMembers) os -= handPoints(this.hands[i] || []);
            const currentScore = this.teamScores[wt] || 0;
            bonus = currentScore > 300 ? 0 : roundTo5(Math.max(0, os));
            if (bonus > 0) bonus = this.addScore(wi, bonus);
            displayEntities = [
                {name: this.getTeamDisplayName(0), isWinner: wt===0, score: this.teamScores[0], handPoints: this.getTeamHandPoints(0), leftoverHands: this.getTeamLeftoverHands(0)},
                {name: this.getTeamDisplayName(1), isWinner: wt===1, score: this.teamScores[1], handPoints: this.getTeamHandPoints(1), leftoverHands: this.getTeamLeftoverHands(1)}
            ];
        }else{
            let os=0;for(let i=0;i<this.playerCount;i++)if(i!==wi)os+=handPoints(this.hands[i]);
            if(fish)os-=handPoints(this.hands[wi]);
            const currentScore = this.scores[wi] || 0;
            bonus = currentScore > 300 ? 0 : roundTo5(Math.max(0, os));
            if (bonus > 0) bonus = this.addScore(wi, bonus);
            displayEntities = this.playerNames.map((n,i)=>({name:n,isWinner:i===wi,handPoints:handPoints(this.hands[i]),score:this.scores[i], leftoverHands: [this.hands[i]]}));
        }
        sndWin();
        const scorePool = this.isTeamMode ? this.teamScores : this.scores;
        const cs = scorePool.length > 0 ? Math.max(...scorePool) : 0;
        if (cs >= TARGET) {
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
        if(this.isTeamMode){
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
        this.clearNextDealAdvanceTimeout();
        const newGameBtn = document.getElementById('new-game-btn');
        if (newGameBtn) newGameBtn.style.display = '';
        const economySummary = this.network.isMultiplayer
            ? (this.onlineEconomyMode === 'coins' ? { ...this.onlineCoinSummary } : null)
            : (this.soloEconomyMode === 'coins' ? { ...this.coinMatchSummary } : null);
        if(this.isTeamMode){
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
        const winnerLabel = this.isTeamMode
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
        try {
            const participants = this.playerNames.map((name, index) => ({
                isSelf: index === this.humanPlayerIndex,
                name,
                teamIndex: this.isTeamMode ? (index % 2) : null,
                winnerKey: this.isTeamMode ? `team:${winnerIndex}` : `player:${winnerIndex}`,
                points: this.isTeamMode ? (this.teamScores[index % 2] || 0) : (this.scores[index] || 0),
                roundWins: this.isTeamMode ? (this.teamRoundWins[index % 2] || 0) : (this.roundWins[index] || 0),
                economyMode: this.soloEconomyMode,
                stakeKey: this.soloStakeKey
            }));
            await this.account.recordMatch({
                mode: this.isTeamMode ? 'team' : 'solo',
                isTeamMode: this.isTeamMode,
                winnerKey: this.isTeamMode ? `team:${winnerIndex}` : `player:${winnerIndex}`,
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

// Re-render board on resize for correct scaling (debounced)
let _resizeTimer = null;
window.addEventListener('resize', () => {
    if (!game?.gameActive) return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => game.renderState(), 150);
});


