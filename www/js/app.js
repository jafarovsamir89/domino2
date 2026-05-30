import { Tile, createFullSet, shuffle, getHandSize, determineFirstPlayer, handPoints, getOpeningPlayScore, hasInvalidOpeningHand, roundTo5 } from './model.js';
import { Board, reconstructBoard } from './board.js';
import { AIPlayer } from './ai.js';
import { Renderer } from './renderer.js';
import { translations } from './translations.js';
import { AccountClient } from './account.js';
import { VoiceChatManager } from './voice.js';
import { sndPlace, sndScore, sndDraw, sndPass, sndWin, sndGosha } from './sounds.js';
// NetworkManager is loaded as global script

const TARGET=365, MAX_R=3, DLOSS=255, IWIN=35;
const TURN_TIMEOUT_MS = 30000;
const BOT_THINK_DELAY_MS = 1500;
const DEAL_END_MODAL_MS = 5000;
const DEFAULT_TABLE_SKIN_KEY = 'table_skin_default';
const DEFAULT_TABLE_SKIN = {
    key: DEFAULT_TABLE_SKIN_KEY,
    name: 'Standard Felt',
    description: 'Classic Domino table surface.',
    assetUrl: null
};

const DEFAULT_TABLE_SKINS = [
    {
        key: 'table_skin_01',
        name: 'Aurora Felt',
        description: 'Blue-green premium felt with a warm gold edge.',
        assetUrl: 'assets/cosmetics/table/table_skin_01.png'
    },
    {
        key: 'table_skin_02',
        name: 'Midnight Carbon',
        description: 'Dark carbon weave with a subtle studio shine.',
        assetUrl: 'assets/cosmetics/table/table_skin_02.png'
    },
    {
        key: 'table_skin_03',
        name: 'Emerald Classic',
        description: 'Rich green felt with clean tournament contrast.',
        assetUrl: 'assets/cosmetics/table/table_skin_03.png'
    },
    {
        key: 'table_skin_04',
        name: 'Ocean Drift',
        description: 'Deep blue surface with soft motion lines.',
        assetUrl: 'assets/cosmetics/table/table_skin_04.png'
    },
    {
        key: 'table_skin_05',
        name: 'Walnut Table',
        description: 'Warm wood grain for a premium club feel.',
        assetUrl: 'assets/cosmetics/table/table_skin_05.png'
    },
    {
        key: 'table_skin_06',
        name: 'Ivory Marble',
        description: 'Light marble with elegant veins and depth.',
        assetUrl: 'assets/cosmetics/table/table_skin_06.png'
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

class DominoGame {
    constructor() {
        this.renderer = new Renderer(this); this.board = new Board();
        this.playerMissingSuits = [];
        this.playerCount=2; this.onlinePlayerCount=2; this.onlineAiCount=0; this.playerName=''; this.difficulty='medium';
        this.onlineStakeKey = 'stake_200';
        this.onlineRoomVisibility = 'closed';
        this.onlineRoomSource = 'closed';
        this.openRoomsStage = 'menu';
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
        this.turnDeadlineAt = 0;
        this.turnTimeoutMs = TURN_TIMEOUT_MS;
        this.postMoveAdvanceMs = 2000;
        this.postMoveWindowActive = false;
        this.postMoveWindowEndsAt = 0;
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
        this.onlineSocialPanel = 'rooms';
        this.onlineRoomFilters = {
            search: '',
            roomMode: 'all',
            stakeKey: 'all'
        };
        this.pendingSharedRoomCode = '';
        this.friendSearchResults = [];
        this.friendHub = { accepted: [], incoming: [], outgoing: [] };
        this.roomInvitations = { incoming: [], sent: [] };
        this.pendingSoloSettlement = Promise.resolve();
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
        if (this._reactionOutsideHandler) {
            document.removeEventListener('pointerdown', this._reactionOutsideHandler, true);
            this._reactionOutsideHandler = null;
        }
        if (this._giftOutsideHandler) {
            document.removeEventListener('pointerdown', this._giftOutsideHandler, true);
            this._giftOutsideHandler = null;
        }
        this.stopCoinShopTicker();
        this.voice?.destroy?.();
        this.clearTurnTimers();
    }
    setupStartScreen() {
        this.ensureStartScreenEnhancements();
        this.ensureGameHudEnhancements();
        this.ensureMenuEnhancements();
        this.ensureAuthIconMarkup();
        this.ensureNameEditModal();
        this.ensureSeatSelectionUi();
        this.setLanguage(this.currentLang);

        const openSoloBtn = document.getElementById('open-solo-modal-btn');
        const openOnlineBtn = document.getElementById('open-online-modal-btn');
        const onlineCreateChoiceBtn = document.getElementById('online-create-choice-btn');
        const onlineConnectChoiceBtn = document.getElementById('online-connect-choice-btn');
        const accountBtn = document.getElementById('account-btn');
        const landingGoogleBtn = document.getElementById('landing-google-login-btn');
        const landingAppleBtn = document.getElementById('landing-apple-login-btn');
        const resumeSessionBtn = document.getElementById('resume-session-btn');
        const soloModalClose = document.getElementById('solo-modal-close');
        const onlineModalClose = document.getElementById('online-modal-close');
        const accountModalClose = document.getElementById('account-modal-close');
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
        if (landingGoogleBtn) landingGoogleBtn.addEventListener('click', () => this.startGoogleAccountSignIn());
        if (landingAppleBtn) landingAppleBtn.addEventListener('click', () => this.startAppleAccountSignIn());
        if (resumeSessionBtn) resumeSessionBtn.addEventListener('click', async () => {
            await this.resumeSavedSession();
        });
        if (soloModalClose) soloModalClose.addEventListener('click', () => this.showStartModal(null));
        if (onlineModalClose) onlineModalClose.addEventListener('click', () => this.closeOnlineModalToSource());
        if (accountModalClose) accountModalClose.addEventListener('click', () => this.closeAccountModal());
        if (coinShopModalClose) coinShopModalClose.addEventListener('click', () => this.closeCoinShopModal());
        if (cosmeticsShopModalClose) cosmeticsShopModalClose.addEventListener('click', () => this.closeCosmeticsShopModal());
        if (coinShopVideoBtn) coinShopVideoBtn.addEventListener('click', async () => {
            await this.claimCoinShopVideoReward();
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
            this.network.hostGame((roomId) => {
                document.getElementById('room-code-display').textContent = roomId;
                this.setHostStatus(this.t('online-room-status-waiting'));
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
        document.getElementById('friend-search-input')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                document.getElementById('friend-search-btn')?.click();
            }
        });
        document.getElementById('friend-search-btn')?.addEventListener('click', () => {
            void this.searchFriends();
        });
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
            await this.account.logout();
            this.accountProfile = null;
            this.accountDetails = null;
            this.accountOnline = false;
            this.setAccountMode('login');
            this.setAccountStatus('');
            this.renderAccountModal();
            this.syncStartAuthButton();
            this.syncStartAuthGate();
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
        } else {
            this.tableSkinShop = null;
        }
        this.renderAccountModal();
        this.syncStartAuthButton();
        this.refreshResumeBanner(null);
        await this.validateStoredResumeSnapshot();
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
        const name = this.accountProfile?.name || '';
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
                this.setAccountStatus(this.t('account-online'));
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
        this.renderAccountModal();
        this.syncStartAuthButton();
        if (!hadProfile) this.syncStartAuthGate();
        return null;
    }

    async openAccountModal() {
        if (!this.hasAuthenticatedAccount()) {
            this.syncStartAuthGate();
            return;
        }
        this.closeStartModals();
        this.ensureAccountModalPortal();
        const modal = document.getElementById('account-modal');
        if (modal) modal.classList.add('active');
        this.accountMode = this.accountProfile ? 'profile' : 'login';
        this.renderAccountModal();
        this.syncStartAuthButton();
        await this.loadAccountProfile();
        void this.loadTableSkinShop();
        await this.loadGiftHub();
        await this.loadLeaderboard();
    }

    async openCoinShopModal() {
        if (!this.hasAuthenticatedAccount()) {
            await this.openAccountModal();
            return;
        }
        this.closeStartModals();
        this.closeAccountModal();
        this.ensureCoinShopModalPortal();
        const modal = document.getElementById('coin-shop-modal');
        if (modal) modal.classList.add('active');
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
        this.closeStartModals();
        this.closeAccountModal();
        this.closeCoinShopModal();
        this.ensureCosmeticsShopModalPortal();
        const modal = document.getElementById('cosmetics-shop-modal');
        if (modal) modal.classList.add('active');
        await Promise.all([this.loadCoinShopStatus(), this.loadTableSkinShop()]);
        this.renderCosmeticsShopModal();
    }

    closeAccountModal() {
        const modal = document.getElementById('account-modal');
        if (modal) modal.classList.remove('active');
        this.closeGiftPicker();
    }

    closeCoinShopModal() {
        const modal = document.getElementById('coin-shop-modal');
        if (modal) modal.classList.remove('active');
        this.stopCoinShopTicker();
    }

    closeCosmeticsShopModal() {
        const modal = document.getElementById('cosmetics-shop-modal');
        if (modal) modal.classList.remove('active');
    }

    closeStartModals() {
        document.getElementById('solo-modal')?.classList.remove('active');
        document.getElementById('online-modal')?.classList.remove('active');
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
                    videoReward: { amount: 25, cooldownMinutes: 30, dailyLimit: 6 },
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
        if (normalizedKey === DEFAULT_TABLE_SKIN_KEY) {
            return {
                ...DEFAULT_TABLE_SKIN,
                owned: true,
                equipped: !(this.accountProfile?.tableSkinKey || this.tableSkinShop?.equippedKey || null),
                price: 0,
                isActive: true
            };
        }
        return this.getTableSkinCatalogEntries().find((skin) => skin.key === normalizedKey) || null;
    }

    applyActiveTableSkin() {
        const selectedKey = this.tableSkinShop?.equippedKey || this.accountProfile?.tableSkinKey || null;
        const skin = selectedKey === DEFAULT_TABLE_SKIN_KEY ? null : (selectedKey ? this.getTableSkinEntry(selectedKey) : null);
        this.renderer.setTableSkin(skin?.assetUrl || null);
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
            videoReward: { amount: 25, cooldownMinutes: 30, dailyLimit: 6 },
            packs: []
        };
        const wallet = this.coinShopStatus?.wallet || this.accountDetails?.wallet || this.accountProfile?.wallet || null;
        const balance = Number(wallet?.balance ?? this.accountProfile?.coins ?? 0);
        const reward = shop.videoReward || { amount: 25, cooldownMinutes: 30, dailyLimit: 6 };
        const canClaim = Boolean(this.coinShopStatus?.canClaim);
        const remainingSeconds = Number(this.coinShopStatus?.remainingSeconds || 0);
        const claimsToday = Number(this.coinShopStatus?.claimsToday || 0);
        const dailyLimit = Number(reward.dailyLimit || 6);
        const amount = Number(reward.amount || 25);
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
            statusEl.textContent = this.coinShopStatus?.error
                ? this.coinShopStatus.error
                : this.format('coin-shop-status-balance', {
                    amount: balance.toLocaleString('en-US')
                });
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
                action.textContent = this.t('coin-shop-pack-soon');
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
            statusEl.textContent = this.format('cosmetics-shop-status-balance', {
                amount: balance.toLocaleString('en-US')
            });
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

        const desc = document.createElement('p');
        desc.className = 'table-skin-desc';
        desc.textContent = skin.description;

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
        body.appendChild(desc);
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
                    videoReward: { amount: 25, cooldownMinutes: 30, dailyLimit: 6 },
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
        this.accountProfileTab = tab === 'gifts' ? 'gifts' : 'skins';
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
                        <button class="btn btn-icon btn-menu" id="account-avatar-modal-reset" type="button">
                            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none">
                                <path d="M12 5a7 7 0 1 1-6.06 10.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                                <path d="M8 5H5v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    <div class="modal-footer modal-footer-split field-span-2">
                        <button class="btn btn-primary btn-large modal-primary-btn" id="account-avatar-modal-save" type="button" data-i18n="account-avatar-save"></button>
                        <button class="btn btn-menu modal-close-btn modal-secondary-btn" id="account-avatar-modal-cancel" type="button" data-i18n="account-name-cancel"></button>
                    </div>
                </form>
            </section>`;
        document.body.appendChild(modal);
        this.setLanguage(this.currentLang);
        const resetBtn = document.getElementById('account-avatar-modal-reset');
        if (resetBtn) {
            const resetLabel = this.t('account-avatar-reset');
            resetBtn.setAttribute('aria-label', resetLabel);
            resetBtn.setAttribute('title', resetLabel);
        }
        document.getElementById('account-avatar-modal-pick')?.addEventListener('click', () => {
            document.getElementById('account-avatar-modal-input')?.click();
        });
        document.getElementById('account-avatar-modal-reset')?.addEventListener('click', () => {
            this.pendingAvatarMode = 'clear';
            this.pendingAvatarDataUrl = null;
            this.syncAvatarModalPreview();
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
        modal.classList.add('active');
        document.getElementById('account-avatar-modal-pick')?.focus?.();
    }

    closeAvatarEditModal() {
        document.getElementById('account-avatar-modal')?.classList.remove('active');
    }

    async loadLeaderboard() {
        const list = document.getElementById('leaderboard-list');
        if (!list) return;
        this.setSummaryMessage(list, this.t('account-profile-loading'));
        try {
            const rows = await this.account.getLeaderboard(10);
            this.accountOnline = true;
            if (!rows.length) {
                this.setSummaryMessage(list, this.t('account-profile-empty'));
                return;
            }
            list.innerHTML = '';
            rows.forEach((row) => {
                const item = document.createElement('div');
                item.className = 'room-player-chip';
                const label = document.createElement('div');
                const rating = document.createElement('div');
                label.textContent = `#${row.rank} ${row.name}`;
                rating.textContent = `ELO ${String(row.rating)}`;
                item.appendChild(label);
                item.appendChild(rating);
                list.appendChild(item);
            });
        } catch (err) {
            this.accountOnline = false;
            this.setSummaryMessage(list, err.message || this.t('account-server-unavailable'));
        }
    }

    renderAccountModal() {
        const profile = this.accountProfile;
        const details = this.accountDetails;
        const profilePanel = document.getElementById('account-profile-panel');
        const authPanel = document.getElementById('account-auth-panel');
        const title = document.getElementById('account-modal-title');
        const historyPanel = document.getElementById('account-history-panel');
        const leaderboardPanel = document.getElementById('account-leaderboard-panel');
        const summary = document.getElementById('account-profile-summary');
        const avatar = document.getElementById('account-avatar');
        const avatarEditButton = document.getElementById('account-edit-avatar-btn');
        const profileName = document.getElementById('account-profile-name');
        const profileMeta = document.getElementById('account-profile-meta');
        const profileCopy = document.querySelector('#account-profile-panel .account-profile-copy');
        const ratingValue = document.getElementById('account-rating-value');
        const pointsValue = document.getElementById('account-points-value');
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
            tabs.querySelectorAll('[data-profile-tab]').forEach((button) => {
                button.addEventListener('click', () => this.setAccountProfileTab(button.dataset.profileTab || 'skins'));
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
                await this.account.logout();
                this.accountProfile = null;
                this.accountDetails = null;
                this.accountOnline = false;
                this.setAccountMode('login');
                this.setAccountStatus('');
                this.renderAccountModal();
                this.syncStartAuthButton();
                this.syncStartAuthGate();
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
        if (!summary) return;
        const isAuthenticated = this.hasAuthenticatedAccount(profile);
        if (profilePanel) profilePanel.classList.toggle('is-hidden', !isAuthenticated);
        if (authPanel) authPanel.classList.toggle('is-hidden', isAuthenticated);
        if (historyPanel) historyPanel.classList.add('is-hidden');
        if (leaderboardPanel) leaderboardPanel.classList.add('is-hidden');
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
        if (pointsValue) pointsValue.textContent = String(profile?.points ?? 0);
        if (winsValue) winsValue.textContent = String(profile?.wins ?? 0);
        if (matchesValue) matchesValue.textContent = String(profile?.matchesPlayed ?? 0);
        if (coinsValue) coinsValue.textContent = String(details?.wallet?.balance ?? profile?.coins ?? profile?.wallet?.balance ?? 0);
        const titleCard = document.getElementById('account-title-value')?.closest?.('.account-stat-card');
        if (titleCard) titleCard.classList.add('is-hidden');
        if (!profile) {
            summary.textContent = this.accountOnline ? this.t('account-profile-empty') : this.t('account-offline');
            if (historyList) this.setSummaryMessage(historyList, this.t('account-history-empty'));
            return;
        }
        summary.innerHTML = '';
        const line2 = document.createElement('div');
        line2.textContent = `${this.t('account-wins')}: ${profile.wins} | ${this.t('account-losses')}: ${profile.losses} | ${this.t('account-draws')}: ${profile.draws}`;
        summary.appendChild(line2);
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
        this.syncStartShopButtons();
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
                    displayName: this.accountProfile?.name || this.playerName || "Player",
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
            displayName: this.accountProfile?.name || this.playerName || "Player",
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
            displayName: this.accountProfile?.name || this.playerName || "Player",
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
        this.postMoveWindowActive = false;
        this.postMoveWindowEndsAt = 0;
        this.turnDeadlineAt = 0;
        this.updateTurnTimerHud();
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
        const searchBtn = document.createElement('button');
        searchBtn.className = 'btn btn-action btn-strong';
        searchBtn.id = 'friend-search-btn';
        searchBtn.type = 'button';
        searchBtn.textContent = this.t('friend-search-button');
        filters.appendChild(searchInput);
        filters.appendChild(searchBtn);
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
        const shouldShow = Boolean(this.network?.isMultiplayer && !roomState?.gameActive && totalSeats > 2 && roomState?.seatSelectionRequired !== false);
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
        const playerOrder = Array.isArray(this.network?.room?.state?.playerOrder)
            ? this.network.room.state.playerOrder
            : Array.isArray(this.currentRoomState?.players)
                ? this.currentRoomState.players.map((player) => player.sessionId)
                : [];
        const sessionId = playerOrder[idx];
        const cachedAvatarUrl = sessionId && this.roomAvatarBySessionId instanceof Map
            ? this.roomAvatarBySessionId.get(sessionId)
            : '';
        const schemaPlayer = sessionId && this.network?.room?.state?.players
            ? this.network.room.state.players.get(sessionId)
            : null;
        const roomPlayer = Array.isArray(this.currentRoomState?.players)
            ? (this.currentRoomState.players[idx]
                || this.currentRoomState.players.find((player) => player?.sessionId === sessionId)
                || this.currentRoomState.players.find((player) => Number(player?.index) === idx))
            : null;
        const selfProfile = this.accountProfile || {};

        return String(
            cachedAvatarUrl
            || schemaPlayer?.avatarUrl
            || roomPlayer?.avatarUrl
            || (idx === this.humanPlayerIndex ? (selfProfile.avatarUrl || selfProfile.image || selfProfile.providerImage || '') : '')
            || ''
        ).trim();
    }

    startTurnTimer(deadlineAt = null) {
        const endAt = Number(deadlineAt || (Date.now() + this.turnTimeoutMs));
        this.turnDeadlineAt = endAt;
        clearTimeout(this._turnTimeoutId);
        clearInterval(this._turnTimerTickId);
        this._turnTimerTickId = setInterval(() => this.updateTurnTimerHud(), 200);
        const delay = Math.max(0, endAt - Date.now());
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
        const remaining = Math.max(0, this.turnDeadlineAt - Date.now());
        const progress = Math.min(1, Math.max(0, 1 - (remaining / this.turnTimeoutMs)));
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
        const menuPanel = document.querySelector('#menu-screen .menu-panel');
        if (menuPanel && !document.getElementById('menu-profile')) {
            const profileBtn = document.createElement('button');
            profileBtn.className = 'btn btn-menu';
            profileBtn.id = 'menu-profile';
            profileBtn.type = 'button';
            profileBtn.dataset.i18n = 'account-profile';
            profileBtn.textContent = this.t('account-profile');
            menuPanel.insertBefore(profileBtn, document.getElementById('menu-quit'));
        }
        if (menuPanel && !document.getElementById('menu-coin-shop')) {
            const coinShopBtn = document.createElement('button');
            coinShopBtn.className = 'btn btn-menu btn-menu-shop';
            coinShopBtn.id = 'menu-coin-shop';
            coinShopBtn.type = 'button';
            coinShopBtn.title = this.t('coin-shop-menu');
            coinShopBtn.setAttribute('aria-label', this.t('coin-shop-menu'));
            coinShopBtn.textContent = this.t('coin-shop-menu');
            menuPanel.insertBefore(coinShopBtn, document.getElementById('menu-quit'));
        }
        if (menuPanel && !document.getElementById('menu-cosmetics-shop')) {
            const cosmeticsShopBtn = document.createElement('button');
            cosmeticsShopBtn.className = 'btn btn-menu btn-menu-shop btn-menu-cosmetics';
            cosmeticsShopBtn.id = 'menu-cosmetics-shop';
            cosmeticsShopBtn.type = 'button';
            cosmeticsShopBtn.title = this.t('cosmetics-shop-menu');
            cosmeticsShopBtn.setAttribute('aria-label', this.t('cosmetics-shop-menu'));
            cosmeticsShopBtn.textContent = this.t('cosmetics-shop-menu');
            menuPanel.insertBefore(cosmeticsShopBtn, document.getElementById('menu-quit'));
        }
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
            || this.accountProfile?.name
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
                const stakeLabel = (Array.from(document.querySelectorAll('#online-stake-group .btn-option')).find((button) => button.dataset.value === this.onlineStakeKey)?.textContent || '200').trim();            summary.textContent = `${this.format('online-room-summary', { humans, bots: this.onlineAiCount, total: this.onlinePlayerCount })} ? ${stakeLabel}`;
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
    }

    showOpenRoomsModal() {
        const modal = document.getElementById('open-rooms-modal');
        if (!modal) return;
        this.prefillOnlineNameIfPossible();
        this.openRoomsStage = 'menu';
        this.syncOpenRoomsStage();
        modal.classList.add('active');
        this.resetOpenRoomsModalState();
    }

    showOpenRoomsMenu() {
        const modal = document.getElementById('open-rooms-modal');
        if (!modal) return;
        this.openRoomsStage = 'menu';
        this.syncOpenRoomsStage();
        modal.classList.add('active');
        this.resetOpenRoomsModalState();
    }

    showOpenRoomsList() {
        const modal = document.getElementById('open-rooms-modal');
        if (!modal) return;
        this.openRoomsStage = 'list';
        this.syncOpenRoomsStage();
        modal.classList.add('active');
        void this.loadOpenRooms();
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
    }

    closeOpenRoomsModal() {
        if (this.openRoomsStage === 'list') {
            this.showOpenRoomsMenu();
            return;
        }
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
        if (!list) return;
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
                const name = document.createElement('strong');
                name.textContent = player.displayName;
                const id = document.createElement('span');
                id.textContent = player.id;
                copy.appendChild(name);
                copy.appendChild(id);
                const action = document.createElement('div');
                action.className = 'friend-card-actions';
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
                card.appendChild(copy);
                card.appendChild(action);
                resultsList.appendChild(card);
            });
        } catch (err) {
            this.setSummaryMessage(resultsList, err.message || this.t('account-server-unavailable'));
        }
    }

    async loadFriendsHub() {
        const friendsList = document.getElementById('friend-list');
        const requestsList = document.getElementById('friend-requests-list');
        const invitesList = document.getElementById('room-invites-list');
        const searchResults = document.getElementById('friend-search-results');
        const loggedIn = Boolean(this.account?.getRoomAuthToken?.());
        const emptyText = this.t('friends-sign-in');

        if (!friendsList || !requestsList || !invitesList || !searchResults) return;
        if (!loggedIn) {
            this.setSummaryMessage(friendsList, emptyText);
            this.setSummaryMessage(requestsList, emptyText);
            this.setSummaryMessage(invitesList, emptyText);
            this.setSummaryMessage(searchResults, emptyText);
            return;
        }

        this.setSummaryMessage(friendsList, this.t('account-profile-loading'));
        this.setSummaryMessage(requestsList, this.t('account-profile-loading'));
        this.setSummaryMessage(invitesList, this.t('account-profile-loading'));
        try {
            const [friends, invitations] = await Promise.all([
                this.account.getFriends(),
                this.account.getRoomInvitations()
            ]);
            this.friendHub = friends || { accepted: [], incoming: [], outgoing: [] };
            this.roomInvitations = invitations || { incoming: [], sent: [] };

            friendsList.innerHTML = '';
            if (!this.friendHub.accepted.length) {
                this.setSummaryMessage(friendsList, this.t('no-friends-yet'));
            } else {
                this.friendHub.accepted.forEach((item) => {
                    const card = document.createElement('div');
                    card.className = 'friend-card';
                    const copy = document.createElement('div');
                    copy.className = 'friend-card-copy';
                    const name = document.createElement('strong');
                    name.textContent = item.friend.displayName;
                    const id = document.createElement('span');
                    id.textContent = item.friend.id;
                    copy.appendChild(name);
                    copy.appendChild(id);
                    const action = document.createElement('div');
                    action.className = 'friend-card-actions';
                    const inviteBtn = document.createElement('button');
                    inviteBtn.className = 'btn btn-action btn-strong';
                    inviteBtn.textContent = this.t('friend-invite');
                    const roomSnapshot = this.getCurrentRoomSnapshot();
                    const canInvite = Boolean(
                        roomSnapshot &&
                        roomSnapshot.roomId &&
                        roomSnapshot.roomCode &&
                        roomSnapshot.humanSeats > 0 &&
                        this.network?.isHost &&
                        !roomSnapshot.gameActive
                    );
                    inviteBtn.disabled = !canInvite;
                    inviteBtn.addEventListener('click', async () => {
                        if (!roomSnapshot) return;
                        inviteBtn.disabled = true;
                        try {
                            await this.account.inviteFriendToRoom(roomSnapshot.roomId, {
                                inviteePlayerId: item.friend.id,
                                roomCode: roomSnapshot.roomCode,
                                roomMode: roomSnapshot.roomMode,
                                stakeKey: roomSnapshot.stakeKey,
                                stakeAmount: roomSnapshot.stakeAmount,
                                humanSeats: roomSnapshot.humanSeats,
                                totalPlayers: roomSnapshot.totalPlayers,
                                isTeamMode: roomSnapshot.isTeamMode
                            });
                            await this.loadFriendsHub();
                            this.renderer.showMessage(this.t('invite-sent'), 1400);
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
                        } finally {
                            inviteBtn.disabled = !canInvite;
                        }
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
                    action.appendChild(inviteBtn);
                    action.appendChild(giftBtn);
                    action.appendChild(removeBtn);
                    card.appendChild(copy);
                    card.appendChild(action);
                    friendsList.appendChild(card);
                });
            }

            requestsList.innerHTML = '';
            if (!this.friendHub.incoming.length && !this.friendHub.outgoing.length) {
                this.setSummaryMessage(requestsList, this.t('no-friend-requests'));
            } else {
                const renderRequest = (item, label, acceptable) => {
                    const card = document.createElement('div');
                    card.className = 'friend-card';
                    const copy = document.createElement('div');
                    copy.className = 'friend-card-copy';
                    const name = document.createElement('strong');
                    name.textContent = item.friend.displayName;
                    const labelEl = document.createElement('span');
                    labelEl.textContent = label;
                    copy.appendChild(name);
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
                    card.appendChild(copy);
                    card.appendChild(action);
                    requestsList.appendChild(card);
                };
                this.friendHub.incoming.forEach((item) => renderRequest(item, this.t('friend-incoming'), true));
                this.friendHub.outgoing.forEach((item) => renderRequest(item, this.t('friend-outgoing'), false));
            }

            invitesList.innerHTML = '';
            if (!this.roomInvitations.incoming.length) {
                this.setSummaryMessage(invitesList, this.t('no-room-invites'));
            } else {
                this.roomInvitations.incoming.forEach((invite) => {
                    const card = document.createElement('div');
                    card.className = 'friend-card';
                    const copy = document.createElement('div');
                    copy.className = 'friend-card-copy';
                    const name = document.createElement('strong');
                    name.textContent = invite.inviter.displayName;
                    meta.textContent = `${invite.roomCode || invite.roomId} · ${invite.roomMode || 'ffa'}`;
                    copy.appendChild(name);
                    copy.appendChild(meta);
                    const action = document.createElement('div');
                    action.className = 'friend-card-actions';
                    const acceptBtn = document.createElement('button');
                    acceptBtn.className = 'btn btn-action btn-strong';
                    acceptBtn.textContent = this.t('room-join');
                    acceptBtn.addEventListener('click', async () => {
                        acceptBtn.disabled = true;
                        try {
                            const accepted = await this.account.acceptRoomInvitation(invite.id);
                            const row = accepted?.item || invite;
                            await this.joinOnlineRoom(row.roomCode || row.roomId);
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
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
                            await this.account.declineRoomInvitation(invite.id);
                            await this.loadFriendsHub();
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
                        } finally {
                            declineBtn.disabled = false;
                        }
                    });
                    action.appendChild(acceptBtn);
                    action.appendChild(declineBtn);
                    card.appendChild(copy);
                    card.appendChild(action);
                    invitesList.appendChild(card);
                });
            }
        } catch (err) {
            this.setSummaryMessage(friendsList, err.message || this.t('account-server-unavailable'));
            this.setSummaryMessage(requestsList, err.message || this.t('account-server-unavailable'));
            this.setSummaryMessage(invitesList, err.message || this.t('account-server-unavailable'));
        }
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
        this.currentRoomState = roomState;
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
            const chip = document.createElement('div');
            chip.className = 'room-player-chip';
            if (player.sessionId === mySessionId) {
                chip.classList.add('you');
            }
            const avatar = document.createElement('span');
            avatar.className = 'room-player-avatar';
            const avatarUrl = player.avatarUrl || this.network?.room?.state?.players?.get?.(player.sessionId)?.avatarUrl || '';
            if (player.sessionId) {
                this.roomAvatarBySessionId.set(player.sessionId, avatarUrl || this.roomAvatarBySessionId.get(player.sessionId) || '');
            }
            if (avatarUrl) {
                avatar.classList.add('has-image');
                const img = document.createElement('img');
                img.alt = player.name || 'Player avatar';
                img.src = avatarUrl;
                img.referrerPolicy = 'no-referrer';
                avatar.appendChild(img);
            } else {
                avatar.textContent = this.getTurnAvatarText(player.name || '');
            }
            const name = document.createElement('span');
            name.textContent = player.sessionId === mySessionId ? `${player.name} (${this.t('online-you')})` : (player.name || `Player ${index + 1}`);
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

        if (this.network?.isMultiplayer && roomState.roomVisibility === 'open' && !roomState.gameActive && roomState.seatSelectionRequired === true && !roomState.gameOverReason && !roomState.matchOver) {
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
        this.renderState();
    }

    onRoomClosed(payload) {
        if (isDebugLoggingEnabled()) {
            console.trace("[CLIENT_DEBUG] onRoomClosed", payload || {});
        }
        const reason = this.resolveUiReason(payload) || this.t('online-room-closed');
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
        if (!this.giftBtn || !this.giftPicker) return;

        this.giftBtn.innerHTML = this.buildGiftButtonMarkup(48);
        this.renderGiftPicker();

        this.giftBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.toggleGiftPicker();
        });

        this._giftOutsideHandler = (event) => {
            if (!this.giftPicker.classList.contains('open')) return;
            const target = event.target;
            if (this.giftPicker.contains(target) || this.giftBtn.contains(target)) return;
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
                meta.textContent = `${gift.rarity || 'common'} • ${gift.exchangeValue || 0} back`;
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
        if (!this.giftPicker || !this.giftBtn) return;
        const open = force === null ? !this.giftPicker.classList.contains('open') : !!force;
        this.giftPicker.classList.toggle('open', open);
        this.giftPicker.setAttribute('aria-hidden', String(!open));
        this.giftBtn.setAttribute('aria-expanded', String(open));
        if (open) this.renderGiftPicker();
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
            meta.textContent = `${item.quantity || 0} pcs • back ${item.catalog?.exchangeValue || 0}`;
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
        label.textContent = `${senderName || 'Player'} → ${recipientName || 'Player'}`;
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
        document.getElementById('menu-newgame')?.addEventListener('click', () => { document.getElementById('menu-screen').classList.remove('active'); void this.startNewGame(); });
        const menuProfileBtn = document.getElementById('menu-profile');
        if (menuProfileBtn) {
            menuProfileBtn.addEventListener('click', async () => {
                document.getElementById('menu-screen').classList.remove('active');
                await this.openAccountModal();
            });
        }
        const coinShopBtn = document.getElementById('menu-coin-shop');
        if (coinShopBtn) {
            coinShopBtn.addEventListener('click', async () => {
                document.getElementById('menu-screen').classList.remove('active');
                await this.openCoinShopModal();
            });
        }
        const cosmeticsShopBtn = document.getElementById('menu-cosmetics-shop');
        if (cosmeticsShopBtn) {
            cosmeticsShopBtn.addEventListener('click', async () => {
                document.getElementById('menu-screen').classList.remove('active');
                await this.openCosmeticsShopModal();
            });
        }
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
        this.showStartModal(null);
        this.resetMultiplayerPanels(false);
    }

    async startNewGame() {
        debugLog('[startNewGame] Starting...', 'isMultiplayer:', this.network.isMultiplayer);
        this.clearNextDealAdvanceTimeout();
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
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
            displayEntities = [
                { name: this.getTeamDisplayName(0), score: this.teamScores[0], roundWins: this.teamRoundWins[0], isCurrent: this.isPlayerInTeam(0, this.currentPlayer), index: teamA.includes(this.currentPlayer) ? this.currentPlayer : -1 },
                { name: this.getTeamDisplayName(1), score: this.teamScores[1], roundWins: this.teamRoundWins[1], isCurrent: this.isPlayerInTeam(1, this.currentPlayer), index: teamB.includes(this.currentPlayer) ? this.currentPlayer : -1 }
            ];
        } else {
            displayEntities = this.playerNames.map((n,i) => ({
                name: n, score: this.scores[i], roundWins: this.roundWins[i], isCurrent: this.currentPlayer === i, index: i
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
        this.renderer.renderOpponentHands(this.hands, this.humanPlayerIndex, this.playerNames, this.currentPlayer);
        const myHand = this.myHand || this.hands[this.humanPlayerIndex] || [];
        this.validMoves = this.board.getValidMoves(myHand);
        const myTurn = this.currentPlayer === this.humanPlayerIndex;
        this.renderer.renderHand(myHand, this.validMoves, this.selectedTileIndex, myTurn);

        const canPlay = this.board.canPlayAny(myHand);
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
            "label-stake-table": { az: "M\u0259rc masas\u0131", en: "Stake table", ru: "Стол ставок" },
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
            "online-choice-connect": { az: "Qoşul", en: "Connect", ru: "Подключиться" },
            "account-btn": { az: "Account", en: "Account" },
            "account-kicker": { az: "Profile", en: "Profile" },
            "account-title": { az: "Account", en: "Account" },
            "account-desc": { az: "Keep your score, rating and match history.", en: "Keep your score, rating and match history." },
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
            "account-rating": { az: "Rating", en: "Rating" },
            "account-rank": { az: "Rank", en: "Rank" },
            "account-points": { az: "Points", en: "Points" },
            "account-coins": { az: "Coins", en: "Coins" },
            "account-wins": { az: "Wins", en: "Wins" },
            "account-losses": { az: "Losses", en: "Losses" },
            "account-draws": { az: "Draws", en: "Draws" },
            "account-matches": { az: "Matches", en: "Matches" },
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
            "resume-session-kicker": { az: "Yar\u0131m\u00e7\u0131q sessiya", en: "Unfinished session", ru: "Незавершённая сессия" },
            "resume-session": { az: "Davam et", en: "Resume", ru: "Продолжить" },
            "resume-session-title": { az: "Yar\u0131m\u00e7\u0131q sessiyan\u0131 davam etdir", en: "Continue your unfinished session", ru: "Продолжить незавершённую сессию" },
            "resume-session-desc": { az: "Yar\u0131mda qalan oyunu eyni yerd\u0259n davam etdir\u0259 bil\u0259rsiniz.", en: "You can pick up the game from where you left off.", ru: "Можно продолжить игру с того же места." },
            "resume-session-online-title": { az: "Onlayn sessiyan\u0131z yar\u0131m\u00e7\u0131q qalıb", en: "Your online session is unfinished", ru: "Ваша онлайн-сессия не завершена" },
            "resume-session-offline-title": { az: "Oyun yar\u0131m\u00e7\u0131q qalıb", en: "Your offline game is unfinished", ru: "Игра не завершена" },
            "resume-session-online-desc": { az: "Ota\u011fa geri qayıdıb həmin matçı davam etdirin.", en: "Reconnect and continue the same match.", ru: "Вернитесь в комнату и продолжите тот же матч." },
            "resume-session-offline-desc": { az: "Yar\u0131m\u00e7\u0131q oyunu eyni yerd\u0259n davam etdirin.", en: "Resume the game from the same point.", ru: "Продолжите игру с того же места." },
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
        const browserLang = (navigator.language || '').slice(0, 2).toLowerCase();
        if (translations[browserLang]) return browserLang;
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

    // --- Network Handlers (Thin Client Mode) ---
    onNetworkStateUpdate(state) {
        const playerOrder = Array.from(state?.playerOrder || []);
        const players = state?.players;
        const getPlayer = (sid) => (players && sid !== undefined && sid !== null) ? players.get(sid) : null;
        for (const sid of playerOrder) {
            if (!sid) continue;
            const avatarUrl = getPlayer(sid)?.avatarUrl || '';
            this.roomAvatarBySessionId.set(sid, avatarUrl || this.roomAvatarBySessionId.get(sid) || '');
        }

        this.playerNames = playerOrder.map((sid, index) => getPlayer(sid)?.name || `Player ${index + 1}`);
        this.scores = playerOrder.map(sid => getPlayer(sid)?.score || 0);
        this.roundWins = playerOrder.map(sid => getPlayer(sid)?.roundWins || 0);
        this.playerCount = state?.playerCount || playerOrder.length;
        
        if (state.boardJson) {
            try {
                const parsed = JSON.parse(state.boardJson);
                this.board = reconstructBoard(parsed);
            } catch (e) { console.error(e); }
        }
        
        this.currentPlayer = state?.currentPlayerIndex ?? 0;
        this.boneyard = Array.from({ length: state?.boneyardCount || 0 });
        this.isTeamMode = !!state?.isTeamMode;
        this.teamScores = Array.from(state?.teamScores || [0, 0]);
        this.teamRoundWins = Array.from(state?.teamRoundWins || [0, 0]);
        this.matchRound = state?.matchRound || 1;
        this.deal = state?.deal || 1;
        this.gameActive = !!state?.gameActive;
        this.matchOver = !!state?.matchOver;
        this.onlineStakeKey = state?.stakeKey || this.onlineStakeKey;
        this.onlineRoundBankAmount = Math.max(0, Number(state?.bankAmount || 0));
        if (this.gameActive && Number(state?.turnDeadlineAt || 0) > 0) {
            this.startTurnTimer(Number(state.turnDeadlineAt));
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

        // Create dummy opponent hands based on handCount from state
        this.hands = [];
        for (let i = 0; i < this.playerNames.length; i++) {
            const sid = playerOrder[i];
            const count = getPlayer(sid)?.handCount || 0;
            this.hands.push(new Array(count).fill(null));
        }

        // Restore our actual hand if we already received it
        if (this.network && this.network.room) {
            const mySid = this.network.room.sessionId;
            const myIdx = playerOrder.indexOf(mySid);
            if (myIdx !== -1) {
                this.humanPlayerIndex = myIdx;
                if (this.myHand) {
                    this.hands[myIdx] = this.myHand;
                }
            }
        }

        this.renderState();
    }

    onNetworkHandUpdate(handData) {
        this.myHand = handData.map(t => new Tile(t.a, t.b));
        // We find our index
        if (!this.network?.room) return;
        const mySid = this.network.room.sessionId;
        const playerOrder = this.network.room.state?.playerOrder || [];
        const myIdx = playerOrder.indexOf(mySid);
        if (myIdx !== -1) {
            this.humanPlayerIndex = myIdx;
            this.hands[myIdx] = this.myHand;
        }
        this.renderState();
    }

    onNetworkTurnInfo(info) {
        this.validMoves = info.validMoves || [];
        this.goshaCombo = info.goshaCombo || null;
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
            if (this.board.isEmpty) { this.network.sendPlay(ti, -1); return; }
            const ends = [];
            for (let j=0; j<this.board.openEnds.length; j++) if (tile.hasValue(this.board.openEnds[j].value)) ends.push(j);
            if (ends.length > 1 && this.board.nodes.length === 1 && this.board.nodes[0].tile.isDouble) ends.length = 1;
            if (ends.length === 1) this.network.sendPlay(ti, ends[0]);
            else if (ends.length > 1) {
                this.selectedTileIndex = ti;
                this.renderer.renderHand(this.myHand, this.validMoves, this.selectedTileIndex);
                this.renderer.showArrowChoices(this.board, ends,
                    (ei) => { this.selectedTileIndex = -1; this.network.sendPlay(ti, ei); },
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
            this.network.sendGosha();
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
            this.network.sendDraw();
            return;
        }
        if(!this.gameActive||this.postMoveWindowActive) return;
        const isHuman = this.currentPlayer === this.humanPlayerIndex;
        const isAI = this.ais.some(a => a.index === this.currentPlayer);
        if (!isHuman && !isAI) return;

        const pi = this.currentPlayer;
        if(this.board.canPlayAny(this.hands[pi])){
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
            this.network.sendPass();
            return;
        }
        if(!this.gameActive||this.turnInProgress||this.postMoveWindowActive) return;
        const isHuman = this.currentPlayer === this.humanPlayerIndex;
        const isAI = this.ais.some(a => a.index === this.currentPlayer);
        if (!isHuman && !isAI) return;

        const pi = this.currentPlayer;
        if(this.board.canPlayAny(this.hands[pi])){
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
        this.playSound('score'); this.renderer.showScorePopup(score);
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
            if(!this.board.canPlayAny(h)&&!this.boneyard.length){
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

// Re-render board on resize for correct scaling (debounced)
let _resizeTimer = null;
window.addEventListener('resize', () => {
    if (!game?.gameActive) return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => game.renderState(), 150);
});

