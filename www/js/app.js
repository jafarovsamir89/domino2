import { Tile, createFullSet, shuffle, getHandSize, determineFirstPlayer, handPoints, roundTo5 } from './model.js';
import { Board, reconstructBoard } from './board.js';
import { AIPlayer } from './ai.js';
import { Renderer } from './renderer.js';
import { translations } from './translations.js';
import { AccountClient } from './account.js';
import { sndPlace, sndScore, sndDraw, sndPass, sndWin, sndGosha } from './sounds.js';
// NetworkManager is loaded as global script

const TARGET=365, MAX_R=3, DLOSS=255, IWIN=35;

class DominoGame {
    constructor() {
        this.renderer = new Renderer(this); this.board = new Board();
        this.playerMissingSuits = [];
        this.playerCount=2; this.onlinePlayerCount=2; this.onlineAiCount=0; this.playerName=''; this.difficulty='medium';
        this.onlineStakeKey = 'stake_200';
        this.onlineRoomVisibility = 'closed';
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
        this.network = new NetworkManager(this);
        this.account = new AccountClient(() => this.network.getServerUrl());
        this.accountProfile = this.account.getStoredProfile();
        this.accountDetails = null;
        this.accountOnline = false;
        this.accountMode = 'login';
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
        this.openRooms = [];
        this.onlineSocialPanel = 'rooms';
        this.onlineRoomFilters = {
            search: '',
            roomMode: 'all',
            stakeKey: 'all'
        };
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
        this.lastReactionSentAt = 0;
        this.lastReactionSentType = '';
        this.setLanguage(this.currentLang);
        this.setupStartScreen(); this.setupGameControls(); this.setupMenu();
        this.bootstrapAccount();

        // Watchdog for turn freeze
        this._watchdogId = setInterval(() => {
            if (this.turnInProgress && Date.now() - this.lastTurnStartTime > 6000) {
                this.log("Watchdog: Resetting stuck turn");
                this.turnInProgress = false;
            }
        }, 2000);
    }
    setupStartScreen() {
        this.ensureStartScreenEnhancements();
        this.ensureGameHudEnhancements();
        this.ensureMenuEnhancements();
        this.setLanguage(this.currentLang);

        const openSoloBtn = document.getElementById('open-solo-modal-btn');
        const openOnlineBtn = document.getElementById('open-online-modal-btn');
        const onlineCreateChoiceBtn = document.getElementById('online-create-choice-btn');
        const onlineConnectChoiceBtn = document.getElementById('online-connect-choice-btn');
        const accountBtn = document.getElementById('account-btn');
        const resumeSessionBtn = document.getElementById('resume-session-btn');
        const soloModalClose = document.getElementById('solo-modal-close');
        const onlineModalClose = document.getElementById('online-modal-close');
        const accountModalClose = document.getElementById('account-modal-close');

        if (openSoloBtn) openSoloBtn.addEventListener('click', () => {
            this.syncSoloOptions();
            this.showStartModal('solo');
        });
        if (openOnlineBtn) openOnlineBtn.addEventListener('click', () => {
            this.resetMultiplayerPanels(false);
            this.syncMultiplayerOptions();
            this.showStartModal('online');
            this.showOnlineLanding();
        });
        const openRoomsBtn = document.getElementById('open-rooms-btn');
        if (openRoomsBtn) openRoomsBtn.addEventListener('click', () => this.showOpenRoomsModal());
        if (onlineCreateChoiceBtn) onlineCreateChoiceBtn.addEventListener('click', () => {
            this.showOnlineCreateFlow();
        });
        if (onlineConnectChoiceBtn) onlineConnectChoiceBtn.addEventListener('click', () => {
            this.showOnlineJoinFlow();
        });
        const onlineSocialRefreshBtn = document.getElementById('online-social-refresh-btn');
        const openRoomsModalClose = document.getElementById('open-rooms-modal-close');
        if (onlineSocialRefreshBtn) onlineSocialRefreshBtn.addEventListener('click', () => void this.loadFriendsHub());
        if (openRoomsModalClose) openRoomsModalClose.addEventListener('click', () => this.hideOpenRoomsModal());
        if (accountBtn) accountBtn.addEventListener('click', async () => {
            await this.openAccountModal();
        });
        if (resumeSessionBtn) resumeSessionBtn.addEventListener('click', async () => {
            await this.resumeSavedSession();
        });
        if (soloModalClose) soloModalClose.addEventListener('click', () => this.showStartModal(null));
        if (onlineModalClose) onlineModalClose.addEventListener('click', () => this.showStartModal(null));
        if (accountModalClose) accountModalClose.addEventListener('click', () => this.closeAccountModal());

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
        document.getElementById('start-game-btn').addEventListener('click', async () => {
            const name = this.requirePlayerName('solo');
            if (!name) return;
            await this.ensureGuestAccount(name, { allowOfflineFallback: true });
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

        document.querySelectorAll('#online-visibility-group .btn-option').forEach((button) => {
            button.addEventListener('click', () => {
                document.querySelectorAll('#online-visibility-group .btn-option').forEach((item) => item.classList.remove('active'));
                button.classList.add('active');
                this.onlineRoomVisibility = button.dataset.value || 'closed';
            });
        });

        document.getElementById('host-game-btn').addEventListener('click', async () => {
            const name = this.requirePlayerName('online');
            if (!name) return;
            const profile = await this.ensureGuestAccount(name);
            if (!profile) {
                this.setHostStatus(this.t('account-server-unavailable'));
                return;
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

        document.getElementById('join-game-btn').addEventListener('click', () => {
            this.showMultiplayerPanel('join');
            this.setJoinStatus(this.t('online-room-join-hint'));
        });

        document.getElementById('connect-btn').addEventListener('click', async () => {
            const code = document.getElementById('join-code-input').value.trim().toUpperCase();
            if (!code) return;
            await this.joinOnlineRoom(code);
        });

        document.getElementById('join-code-input').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                document.getElementById('connect-btn').click();
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
        document.getElementById('copy-room-code-btn').addEventListener('click', async () => {
            const code = document.getElementById('room-code-display').textContent.trim();
            if (!code || code === '....') return;
            try {
                await navigator.clipboard.writeText(code);
                this.setHostStatus(this.format('online-copy-success', { code }));
            } catch (e) {
                this.setHostStatus(this.format('online-copy-fail', { code }));
            }
        });
        document.getElementById('host-cancel-btn').addEventListener('click', () => {
            if (this.network?.room) {
                this.showStartModal(null);
                this.resetMultiplayerPanels(true);
                return;
            }
            this.showOnlineLanding();
        });
        document.getElementById('join-cancel-btn').addEventListener('click', () => {
            if (this.network?.room) {
                this.showStartModal(null);
                this.resetMultiplayerPanels(true);
                return;
            }
            this.showOnlineLanding();
        });

        const loginTabBtn = document.getElementById('login-tab-btn');
        const registerTabBtn = document.getElementById('register-tab-btn');
        const loginForm = document.getElementById('account-login-form');
        const registerForm = document.getElementById('account-register-form');
        const guestAccountBtn = document.getElementById('guest-account-btn');
        const createAccountBtn = document.getElementById('create-account-btn');
        const googleLoginBtn = document.getElementById('google-login-btn');
        const refreshAccountBtn = document.getElementById('account-refresh-btn');
        const logoutAccountBtn = document.getElementById('account-logout-btn');

        if (loginTabBtn) loginTabBtn.addEventListener('click', () => this.setAccountMode('login'));
        if (registerTabBtn) registerTabBtn.addEventListener('click', () => this.setAccountMode('register'));

        if (loginForm) loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            try {
                const email = String(document.getElementById('account-login-email-input')?.value || this.accountProfile?.email || '').trim();
                const password = String(document.getElementById('account-login-password-input')?.value || '').trim();
                if (!email || !password) {
                    this.setAccountStatus(this.t('account-name-password-required'));
                    return;
                }
                const result = await this.account.login({ email, password });
                this.accountProfile = result.profile || result.user || null;
                this.accountDetails = result;
                this.accountOnline = true;
                this.prefillAccountNames();
                this.setAccountMode('profile');
                this.renderAccountModal();
                this.syncStartAuthButton();
                await this.loadAccountProfile();
                this.renderer.showMessage(this.t('account-login'), 1500);
            } catch (err) {
                this.setAccountStatus(err.message || 'Login failed');
            }
        });

        if (registerForm) registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            try {
                const name = this.sanitizeName(document.getElementById('account-name-input')?.value || this.readPlayerName('any') || this.accountProfile?.name || '', '');
                const email = String(document.getElementById('account-email-input')?.value || this.accountProfile?.email || '').trim();
                const password = String(document.getElementById('account-password-input')?.value || '').trim();
                if (!name) {
                    this.renderer.showMessage(this.currentLang === 'ru' ? 'Введите имя' : this.currentLang === 'en' ? 'Enter your name' : 'Ad daxil edin', 1800);
                    return;
                }
                if (!password) {
                    this.setAccountStatus(this.t('account-password-required'));
                    return;
                }
                const result = await this.account.register({ name, email, password });
                this.accountProfile = result.profile || result.user || null;
                this.accountDetails = result;
                this.accountOnline = true;
                this.prefillAccountNames();
                this.setAccountMode('profile');
                this.renderAccountModal();
                this.syncStartAuthButton();
                await this.loadAccountProfile();
                this.renderer.showMessage(this.t('account-register'), 1500);
            } catch (err) {
                this.setAccountStatus(err.message || 'Registration failed');
            }
        });

        if (googleLoginBtn) googleLoginBtn.addEventListener('click', () => {
            this.startGoogleAccountSignIn();
        });

        if (guestAccountBtn) guestAccountBtn.addEventListener('click', async () => {
            const name = this.readPlayerName('any') || this.accountProfile?.name || 'Player';
            const profile = await this.ensureGuestAccount(name);
            if (!profile) return;
            this.setAccountMode('profile');
            this.renderAccountModal();
            this.renderer.showMessage(this.t('account-guest'), 1500);
        });
        if (createAccountBtn) createAccountBtn.addEventListener('click', () => {
            const guestName = this.accountProfile?.provider === 'local-guest'
                ? (this.accountProfile?.name || this.readPlayerName('any') || '')
                : (this.readPlayerName('any') || this.accountProfile?.name || '');
            if (guestName) {
                const registerName = document.getElementById('account-name-input');
                if (registerName && !registerName.value.trim()) registerName.value = guestName;
                const soloName = document.getElementById('player-name');
                const onlineName = document.getElementById('player-name-online');
                if (soloName && !soloName.value.trim()) soloName.value = guestName;
                if (onlineName && !onlineName.value.trim()) onlineName.value = guestName;
            }
            this.setAccountMode('register');
            const emailInput = document.getElementById('account-email-input');
            emailInput?.focus?.();
        });
        if (refreshAccountBtn) refreshAccountBtn.addEventListener('click', async () => {
            await this.loadAccountProfile();
        });
        if (logoutAccountBtn) logoutAccountBtn.addEventListener('click', async () => {
            const wasGuest = this.accountProfile?.provider === 'local-guest';
            const guestName = this.accountProfile?.name || this.readPlayerName('any') || '';
            if (wasGuest) {
                await this.clearLocalPresence();
                this.account?.clearLocalGameSessionId?.();
            }
            await this.account.logout();
            this.accountProfile = null;
            this.accountDetails = null;
            this.accountOnline = false;
            this.setAccountMode(wasGuest ? 'register' : 'login');
            this.setAccountStatus('');
            if (wasGuest && guestName) {
                const registerName = document.getElementById('account-name-input');
                const soloName = document.getElementById('player-name');
                const onlineName = document.getElementById('player-name-online');
                if (registerName && !registerName.value.trim()) registerName.value = guestName;
                if (soloName && !soloName.value.trim()) soloName.value = guestName;
                if (onlineName && !onlineName.value.trim()) onlineName.value = guestName;
            }
            const email = document.getElementById('account-email-input');
            if (email) email.value = '';
            const loginEmail = document.getElementById('account-login-email-input');
            if (loginEmail) loginEmail.value = '';
            const pwd = document.getElementById('account-password-input');
            if (pwd) pwd.value = '';
            const loginPwd = document.getElementById('account-login-password-input');
            if (loginPwd) loginPwd.value = '';
            this.renderAccountModal();
            this.syncStartAuthButton();
            if (wasGuest) {
                document.getElementById('account-email-input')?.focus?.();
            }
        });

        document.querySelectorAll('.btn-lang[data-lang]').forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang;
                if (lang) this.setLanguage(lang);
            });
        });
        this.syncMultiplayerOptions();
        this.resetMultiplayerPanels(false);
        this.showStartModal(null);
        this.renderAccountModal();
        this.syncStartAuthButton();
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
        this.accountOnline = !!details;
        this.accountMode = this.accountProfile ? 'profile' : 'login';
        this.prefillAccountNames();
        this.renderAccountModal();
        this.syncStartAuthButton();
        this.refreshResumeBanner();
    }

    prefillAccountNames() {
        const name = this.accountProfile?.name || '';
        const email = this.accountProfile?.email || '';
        if (!name) return;
        const soloNameInput = document.getElementById('player-name');
        const onlineNameInput = document.getElementById('player-name-online');
        const accountNameInput = document.getElementById('account-name-input');
        const accountEmailInput = document.getElementById('account-email-input');
        const loginEmailInput = document.getElementById('account-login-email-input');
        if (soloNameInput && !soloNameInput.value.trim()) soloNameInput.value = name;
        if (onlineNameInput && !onlineNameInput.value.trim()) onlineNameInput.value = name;
        if (accountNameInput && !accountNameInput.value.trim()) accountNameInput.value = name;
        if (accountEmailInput && !accountEmailInput.value.trim() && email) accountEmailInput.value = email;
        if (loginEmailInput && !loginEmailInput.value.trim() && email) loginEmailInput.value = email;
    }

    async ensureGuestAccount(name, options = {}) {
        const allowOfflineFallback = options.allowOfflineFallback === true;
        if (!this.account.getRoomAuthToken()) {
            try {
                const details = await this.account.getProfileDetails();
                if (details?.profile && details.profile.provider !== 'local-guest') {
                    this.accountDetails = details;
                    this.accountProfile = details.profile;
                    this.accountOnline = true;
                    this.accountMode = 'profile';
                    this.renderAccountModal();
                    this.syncStartAuthButton();
                    return this.accountProfile;
                }
            } catch {}
        }
        if (this.account.getRoomAuthToken() && this.accountProfile?.name) return this.accountProfile;
        try {
            const profile = await this.account.createGuest(name || 'Player');
            this.accountProfile = profile.profile || profile.user || null;
            this.accountDetails = profile;
            this.accountOnline = true;
            this.accountMode = 'profile';
            this.renderAccountModal();
            this.syncStartAuthButton();
            return this.accountProfile;
        } catch (err) {
            this.accountOnline = false;
            this.setAccountStatus(err.message || this.t('account-server-unavailable'));
            this.renderAccountModal();
            this.syncStartAuthButton();
            if (allowOfflineFallback) {
                return {
                    id: '',
                    sessionId: this.account?.getLocalGameSessionId?.() || '',
                    name: this.sanitizeName(name || 'Player', 'Player'),
                    isGuest: true
                };
            }
            return null;
        }
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
                this.renderAccountModal();
                this.syncStartAuthButton();
                this.setAccountStatus(this.t('account-online'));
                return details;
            }
        } catch (err) {
            this.setAccountStatus(err.message || this.t('account-server-unavailable'));
        }

        const storedProfile = this.account.getStoredProfile?.();
        if (storedProfile?.provider === 'local-guest') {
            this.accountProfile = storedProfile;
            this.accountDetails = {
                profile: storedProfile,
                user: {
                    id: '',
                    name: storedProfile.name || 'Player',
                    email: '',
                    role: 'player',
                    image: null
                },
                player: {
                    id: '',
                    displayName: storedProfile.name || 'Player',
                    avatarSeed: null,
                    language: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                },
                stats: {
                    rating: 1000,
                    points: 0,
                    wins: 0,
                    losses: 0,
                    draws: 0,
                    matchesPlayed: 0,
                    currentStreak: 0,
                    bestStreak: 0
                },
                recentMatches: [],
                session: null,
                token: null
            };
            this.accountOnline = true;
            this.accountMode = 'profile';
            this.renderAccountModal();
            this.syncStartAuthButton();
            return this.accountDetails;
        }

        this.accountOnline = false;
        this.accountDetails = null;
        this.accountProfile = null;
        this.renderAccountModal();
        this.syncStartAuthButton();
        return null;
    }

    async openAccountModal() {
        this.closeStartModals();
        this.ensureAccountModalPortal();
        const modal = document.getElementById('account-modal');
        if (modal) modal.classList.add('active');
        this.accountMode = this.accountProfile ? 'profile' : 'login';
        this.renderAccountModal();
        this.syncStartAuthButton();
        await this.loadAccountProfile();
        await this.loadLeaderboard();
    }

    closeAccountModal() {
        const modal = document.getElementById('account-modal');
        if (modal) modal.classList.remove('active');
    }

    closeStartModals() {
        document.getElementById('solo-modal')?.classList.remove('active');
        document.getElementById('online-modal')?.classList.remove('active');
    }

    setAccountStatus(text) {
        const el = document.getElementById('account-status');
        if (el) el.textContent = text || '';
        const registerStatus = document.getElementById('account-register-status');
        if (registerStatus) registerStatus.textContent = text || '';
    }

    syncAccountUiChrome() {
        const closeButton = document.getElementById('account-modal-close');
        if (closeButton) {
            closeButton.textContent = 'x';
            closeButton.title = this.t('modal-close');
            closeButton.setAttribute('aria-label', this.t('modal-close'));
        }

        const placeholders = [
            ['account-login-email-input', 'Email address'],
            ['account-email-input', 'Email address'],
            ['account-login-password-input', 'Enter your password'],
            ['account-password-input', 'Create a password'],
            ['account-name-input', 'Player name']
        ];

        placeholders.forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) input.setAttribute('placeholder', value);
        });
    }

    setAccountMode(mode) {
        if (mode === 'profile') {
            this.accountMode = 'profile';
        } else if (mode === 'register') {
            this.accountMode = 'register';
        } else {
            this.accountMode = 'login';
        }
        this.renderAccountModal();
    }

    startGoogleAccountSignIn() {
        const callbackURL = `${window.location.origin}${window.location.pathname}${window.location.search}`;
        const authOrigin = String(this.account?.platformApiBase || `${window.location.protocol}//${window.location.hostname}/api`)
            .replace(/\/api\/?$/, "/");
        const googleAuthURL = new URL("/auth/google", authOrigin);
        googleAuthURL.searchParams.set("callbackURL", callbackURL);
        window.location.assign(googleAuthURL.toString());
    }

    async loadLeaderboard() {
        const list = document.getElementById('leaderboard-list');
        if (!list) return;
        list.innerHTML = `<div class="room-summary">${this.t('account-profile-loading')}</div>`;
        try {
            const rows = await this.account.getLeaderboard(10);
            this.accountOnline = true;
            if (!rows.length) {
                list.innerHTML = `<div class="room-summary">${this.t('account-profile-empty')}</div>`;
                return;
            }
            list.innerHTML = '';
            rows.forEach((row) => {
                const item = document.createElement('div');
                item.className = 'room-player-chip';
                const titleKey = `title-${String(row.titleCode || 'rookie')}`;
                const title = this.t(titleKey);
                item.innerHTML = `<span>#${row.rank} ${row.name} · ${title}</span><strong>${row.rating}</strong>`;
                list.appendChild(item);
            });
        } catch (err) {
            this.accountOnline = false;
            list.innerHTML = `<div class="room-summary">${err.message || this.t('account-server-unavailable')}</div>`;
        }
    }

    renderAccountModal() {
        const profile = this.accountProfile;
        const details = this.accountDetails;
        const profilePanel = document.getElementById('account-profile-panel');
        const authPanel = document.getElementById('account-auth-panel');
        const loginForm = document.getElementById('account-login-form');
        const registerForm = document.getElementById('account-register-form');
        const loginTabBtn = document.getElementById('login-tab-btn');
        const registerTabBtn = document.getElementById('register-tab-btn');
        const createAccountBtn = document.getElementById('create-account-btn');
        const title = document.getElementById('account-modal-title');
        const historyPanel = document.getElementById('account-history-panel');
        const leaderboardPanel = document.getElementById('account-leaderboard-panel');
        const summary = document.getElementById('account-profile-summary');
        const nameInput = document.getElementById('account-name-input');
        const emailInput = document.getElementById('account-email-input');
        const loginEmailInput = document.getElementById('account-login-email-input');
        const loginPasswordInput = document.getElementById('account-login-password-input');
        const registerPasswordInput = document.getElementById('account-password-input');
        const avatar = document.getElementById('account-avatar');
        const profileName = document.getElementById('account-profile-name');
        const profileMeta = document.getElementById('account-profile-meta');
        const ratingValue = document.getElementById('account-rating-value');
        const titleValue = document.getElementById('account-title-value');
        const pointsValue = document.getElementById('account-points-value');
        const winsValue = document.getElementById('account-wins-value');
        const matchesValue = document.getElementById('account-matches-value');
        const coinsValue = document.getElementById('account-coins-value');
        const historyList = document.getElementById('account-history-list');
        const refreshButton = document.getElementById('account-refresh-btn');
        const logoutButton = document.getElementById('account-logout-btn');
        const titleLabel = this.t(`title-${profile?.titleCode || 'rookie'}`);
        this.syncAccountUiChrome();
        if (nameInput && !nameInput.value.trim() && profile?.name) {
            nameInput.value = profile.name;
        }
        if (emailInput && !emailInput.value.trim() && profile?.email) {
            emailInput.value = profile.email;
        }
        if (loginEmailInput && !loginEmailInput.value.trim() && profile?.email) {
            loginEmailInput.value = profile.email;
        }
        if (!summary) return;
        const isAuthenticated = Boolean(profile && this.accountOnline);
                title.textContent = `${room.hostName || room.roomCode || room.roomId || 'Room'}${room.roomCode ? ' · ' + room.roomCode : ''}`;
        if (profilePanel) profilePanel.classList.toggle('is-hidden', !isAuthenticated);
        if (authPanel) authPanel.classList.toggle('is-hidden', isAuthenticated);
        if (historyPanel) historyPanel.classList.add('is-hidden');
        if (leaderboardPanel) leaderboardPanel.classList.add('is-hidden');
        if (loginForm) loginForm.classList.toggle('active', !isAuthenticated && this.accountMode !== 'register');
        if (registerForm) registerForm.classList.toggle('active', !isAuthenticated && this.accountMode === 'register');
        if (loginTabBtn) loginTabBtn.classList.toggle('active', this.accountMode !== 'register');
        if (registerTabBtn) registerTabBtn.classList.toggle('active', this.accountMode === 'register');
        if (createAccountBtn) createAccountBtn.classList.toggle('is-hidden', !(profile?.provider === 'local-guest'));
        if (loginEmailInput && !isAuthenticated && !loginEmailInput.value.trim() && profile?.email) loginEmailInput.value = profile.email;
        if (loginPasswordInput && isAuthenticated) loginPasswordInput.value = '';
        if (registerPasswordInput && isAuthenticated) registerPasswordInput.value = '';
        const canRefresh = Boolean(this.account.getRoomAuthToken()) || profile?.provider === 'local-guest';
        const canLogout = Boolean(this.account.getRoomAuthToken()) || profile?.provider === 'local-guest';
        if (refreshButton) refreshButton.disabled = !canRefresh;
        if (logoutButton) logoutButton.disabled = !canLogout;
        if (avatar) avatar.textContent = (profile?.name || 'D').slice(0, 1).toUpperCase();
        if (profileName) profileName.textContent = profile?.name || 'Domino Player';
        if (profileMeta) {
            profileMeta.textContent = profile
                ? (profile.isGuest ? this.t('account-guest-meta') : `${titleLabel} · ${this.t('account-rating')}: ${profile.rating}`)
                : this.t('account-profile-empty');
        }
        if (ratingValue) ratingValue.textContent = String(profile?.rating ?? 1000);
        if (titleValue) titleValue.textContent = titleLabel;
        if (pointsValue) pointsValue.textContent = String(profile?.points ?? 0);
        if (winsValue) winsValue.textContent = String(profile?.wins ?? 0);
        if (matchesValue) matchesValue.textContent = String(profile?.matchesPlayed ?? 0);
        if (coinsValue) coinsValue.textContent = String(details?.wallet?.balance ?? profile?.coins ?? profile?.wallet?.balance ?? 0);
        if (!profile) {
            summary.textContent = this.accountOnline ? this.t('account-profile-empty') : this.t('account-offline');
            if (historyList) historyList.innerHTML = `<div class="room-summary">${this.t('account-history-empty')}</div>`;
            this.syncAccountModeButtons();
            return;
        }
        summary.innerHTML = `
            <div>${this.accountOnline ? this.t('account-online') : this.t('account-offline')}</div>
            <div>${this.t('account-wins')}: ${profile.wins} | ${this.t('account-losses')}: ${profile.losses} | ${this.t('account-draws')}: ${profile.draws}</div>
        `;
        if (historyList) {
            const recentMatches = Array.isArray(details?.recentMatches) ? details.recentMatches : [];
            if (!recentMatches.length) {
                historyList.innerHTML = `<div class="room-summary">${this.t('account-history-empty')}</div>`;
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
                    item.innerHTML = `<span>${this.t(resultKey)} · ${match.mode}</span><strong>${deltaLabel}</strong>`;
                    historyList.appendChild(item);
                });
            }
        }
        this.syncStartAuthButton();
        this.syncAccountModeButtons();
    }

    syncAccountModeButtons() {
        const loginTabBtn = document.getElementById('login-tab-btn');
        const registerTabBtn = document.getElementById('register-tab-btn');
        const loginForm = document.getElementById('account-login-form');
        const registerForm = document.getElementById('account-register-form');
        const isRegister = this.accountMode === 'register';
        if (loginTabBtn) loginTabBtn.classList.toggle('active', !isRegister);
        if (registerTabBtn) registerTabBtn.classList.toggle('active', isRegister);
        if (loginForm) loginForm.classList.toggle('active', !isRegister);
        if (registerForm) registerForm.classList.toggle('active', isRegister);
    }

    syncStartAuthButton() {
        const button = document.getElementById('account-btn');
        if (!button) return;
        const hasSession = Boolean(this.account?.getRoomAuthToken?.()) || Boolean(this.accountProfile?.provider === 'local-guest');
        const labelKey = hasSession ? 'account-profile' : 'account-login';
        const label = this.t(labelKey);
        button.dataset.i18n = labelKey;
        button.textContent = label;
        button.setAttribute('aria-label', label);
        button.title = label;
        button.classList.toggle('is-authenticated', hasSession);
    }

    hasGuestSession() {
        return this.accountProfile?.provider === 'local-guest' || Boolean(this.account.getStoredProfile?.()?.provider === 'local-guest');
    }

    async syncLocalPresence(force = false) {
        if (this.network.isMultiplayer) return;
        const localSessionId = this.account?.getOrCreateLocalGameSessionId?.() || this.accountProfile?.sessionId || "";
        if (!this.gameActive && !this.roundOver && !this.matchOver) {
            if (!this.localPresenceClearQueued) {
                this.localPresenceClearQueued = true;
                await this.account.sendLocalGameHeartbeat({
                    sessionId: localSessionId,
                    displayName: this.accountProfile?.name || this.playerName || "Player",
                    provider: this.accountProfile?.provider || "local-guest",
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
            provider: this.accountProfile?.provider || "local-guest",
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
        const localSessionId = this.account?.getOrCreateLocalGameSessionId?.() || this.accountProfile?.sessionId || "";
        await this.account.sendLocalGameHeartbeat({
            sessionId: localSessionId,
            displayName: this.accountProfile?.name || this.playerName || "Player",
            provider: this.accountProfile?.provider || "local-guest",
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
        return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    }

    ensureStartScreenEnhancements() {
        const startShell = document.querySelector('.start-shell');
        const startActions = document.querySelector('.start-actions');
        if (startShell && startActions && !document.getElementById('resume-session-banner')) {
            const banner = document.createElement('div');
            banner.id = 'resume-session-banner';
            banner.className = 'resume-session-banner is-hidden';
            banner.innerHTML = `
                <div class="resume-session-copy">
                    <div class="section-kicker" data-i18n="resume-session-kicker">Unfinished session</div>
                    <div class="resume-session-title" id="resume-session-title">${this.t('resume-session-title')}</div>
                    <div class="resume-session-desc" id="resume-session-desc">${this.t('resume-session-desc')}</div>
                </div>
                <button class="btn btn-primary" id="resume-session-btn" type="button" data-i18n="resume-session">Resume</button>
            `;
            startActions.insertAdjacentElement('afterend', banner);
        }

        const stakeGroup = document.getElementById('solo-stake-wrapper');
        if (!stakeGroup) {
            const soloGridRoot = document.querySelector('#solo-modal .settings-grid');
            const nameGroup = document.querySelector('#solo-modal #player-name')?.closest('.settings-group');
            const stakeWrapper = document.createElement('div');
            stakeWrapper.className = 'settings-group field-span-2';
            stakeWrapper.id = 'solo-stake-wrapper';
            stakeWrapper.innerHTML = `
                <label data-i18n="label-stake-table">Mərc masası</label>
                <div class="btn-group" id="solo-stake-group">
                    <button class="btn btn-option" data-value="stake_50">50</button>
                    <button class="btn btn-option" data-value="stake_100">100</button>
                    <button class="btn btn-option" data-value="stake_200">200</button>
                </div>
            `;
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
        social.innerHTML = `            <div class="online-social-panel">
                <div class="online-social-head">
                    <div>
                        <div class="section-kicker">Dostlar</div>
                        <div class="section-note">Sor?ular v? d?v?tnam?l?r burada g?r?n?r.</div>
                    </div>
                    <button class="btn btn-menu online-social-refresh" id="online-social-refresh-btn" type="button">Yenil?</button>
                </div>
                <div class="online-social-filters">
                    <input type="search" id="friend-search-input" placeholder="Adla axtar">
                    <button class="btn btn-action btn-strong" id="friend-search-btn" type="button">Axtar</button>
                </div>
                <div class="social-section">
                    <div class="section-kicker">Axtar?? n?tic?l?ri</div>
                    <div id="friend-search-results" class="room-player-list"></div>
                </div>
                <div class="social-section">
                    <div class="section-kicker">Dost sor?ular?</div>
                    <div id="friend-requests-list" class="room-player-list"></div>
                </div>
                <div class="social-section">
                    <div class="section-kicker">Dostlar</div>
                    <div id="friend-list" class="room-player-list"></div>
                </div>
                <div class="social-section">
                    <div class="section-kicker">Otaq d?v?tnam?l?ri</div>
                    <div id="room-invites-list" class="room-player-list"></div>
                </div>
            </div>        `;
        onlineFlow.insertAdjacentElement('beforebegin', social);
    }

    ensureGameHudEnhancements() {
        const gameInfo = document.querySelector('.game-info');
        if (gameInfo && !document.getElementById('stake-info')) {
            const stakeInfo = document.createElement('span');
            stakeInfo.id = 'stake-info';
            gameInfo.insertBefore(stakeInfo, document.getElementById('boneyard-info'));
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
    }

    ensureAccountModalPortal() {
        const accountModal = document.getElementById('account-modal');
        if (!accountModal) return;
        if (accountModal.parentElement === document.body) return;
        document.body.appendChild(accountModal);
    }

    syncSoloOptions() {
        const stakeWrapper = document.getElementById('solo-stake-wrapper');
        const stakeButtons = document.querySelectorAll('#solo-stake-group .btn-option');
        this.soloEconomyMode = 'coins';

        if (stakeWrapper) {
            stakeWrapper.classList.remove('is-hidden');
        }

        stakeButtons.forEach((button) => {
            const shouldBeActive = button.dataset.value === this.soloStakeKey;
            button.classList.toggle('active', shouldBeActive);
            button.disabled = false;
        });

        if (!this.soloStakeKey || this.soloStakeKey === 'free') {
            this.soloStakeKey = 'stake_50';
        }
    }

    readSoloEconomySelectionFromUi() {
        const selectedStakeButton = document.querySelector('#solo-stake-group .btn-option.active');
        const stakeKey = selectedStakeButton?.dataset.value || this.soloStakeKey || 'stake_50';
        return { mode: 'coins', stakeKey };
    }

    getStakeLabelByKey(stakeKey) {
        const labels = {
            stake_50: '50 coins',
            stake_100: '100 coins',
            stake_200: '200 coins',
            stake_250: '250 coins',
            stake_500: '500 coins',
            stake_1000: '1,000 coins',
            stake_5000: '5,000 coins'
        };

        return labels[stakeKey] || '50 coins';
    }

    getStakeAmountByKey(stakeKey) {
        const amounts = {
            stake_50: 50,
            stake_100: 100,
            stake_200: 200,
            stake_250: 250,
            stake_500: 500,
            stake_1000: 1000,
            stake_5000: 5000
        };

        return amounts[stakeKey] || 0;
    }

    getCurrentStakeLabel() {
        const stakeKey = this.network.isMultiplayer ? this.onlineStakeKey : (this.gameActive ? this.currentRoundStakeKey : this.soloStakeKey);
        const resolvedStakeKey = !stakeKey || stakeKey === 'free'
            ? (this.network.isMultiplayer ? 'stake_200' : 'stake_50')
            : stakeKey;

        const stakeAmount = this.getStakeAmountByKey(resolvedStakeKey);
        const participants = this.network.isMultiplayer
            ? Math.max(2, this.onlinePlayerCount || 2)
            : 2;
        const bankAmount = this.network.isMultiplayer
            ? (this.gameActive
                ? (this.onlineRoundBankAmount > 0 ? this.onlineRoundBankAmount : stakeAmount * participants)
                : 0)
            : (this.gameActive && this.currentRoundBankAmount > 0 ? this.currentRoundBankAmount : stakeAmount * participants);
        return bankAmount > 0 ? `${bankAmount} coins` : '';
    }

    resetOnlineCoinSummary() {
        this.onlineCoinSummary = { spent: 0, won: 0 };
    }

    buildGameResumeSnapshot() {
        const isOnline = this.network.isMultiplayer;
        const boardState = this.board ? JSON.parse(JSON.stringify(this.board)) : null;
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
            roomCode: isOnline ? (document.getElementById('room-code-display')?.textContent?.trim() || null) : null,
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
            dlossThreshold: this.dlossThreshold,
            instantWinEnabled: this.instantWinEnabled,
            board: boardState,
            hands,
            boneyard,
            createdAt: this.currentMatchStartedAt || new Date().toISOString()
        };
    }

    persistGameResumeSnapshot() {
        try {
            const snapshot = this.buildGameResumeSnapshot();
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

    refreshResumeBanner(snapshot = null) {
        const state = snapshot || this.account?.getStoredGameResumeState?.();
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

    async resumeSavedSession() {
        const snapshot = this.account?.getStoredGameResumeState?.();
        if (!snapshot) return false;

        if (snapshot.kind === 'online') {
            const token = String(snapshot.reconnectionToken || this.network?.getStoredReconnectionToken?.() || '').trim();
            if (!token) {
                this.clearGameResumeSnapshot();
                this.renderer.showMessage(this.currentLang === 'az' ? 'Sessiya tapılmadı' : 'Session not found', 1800);
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
                await this.network.resumeRoom(token);
                this.currentMatchSessionId = snapshot.sessionId || this.currentMatchSessionId;
                this.showStartModal(null);
                document.getElementById('start-screen')?.classList.remove('active');
                document.getElementById('game-screen')?.classList.add('active');
                this.syncMultiplayerOptions();
                this.refreshResumeBanner(snapshot);
                return true;
            } catch (error) {
                console.warn('[Resume] Online session restore failed', error);
                this.clearGameResumeSnapshot();
                this.renderer.showMessage(this.currentLang === 'az' ? 'Onlayn sessiya bitib' : 'The online session expired', 2000);
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
            this.soloEconomyMode = snapshot.soloEconomyMode || 'free';
            this.soloStakeKey = snapshot.soloStakeKey || 'free';
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
            if (this.gameActive && this.currentPlayer !== this.humanPlayerIndex) {
                this.queueAITurnIfNeeded(800);
            }
            this.refreshResumeBanner(snapshot);
            return true;
        } catch (error) {
            console.warn('[Resume] Solo session restore failed', error);
            return false;
        }
    }

    requirePlayerName(preferred = 'any') {
        const name = this.readPlayerName(preferred);
        if (name) return name;
        this.renderer.showMessage(
            this.currentLang === 'az'
                ? 'Ad daxil edin'
                : this.currentLang === 'ru'
                    ? 'Введите имя'
                    : 'Enter your name',
            1800
        );
        const primary = document.getElementById('player-name');
        const online = document.getElementById('player-name-online');
        (preferred === 'online' ? online : preferred === 'solo' ? primary : (primary || online))?.focus?.();
        return null;
    }

    onInviteCodeResolved(code) {
        const nextCode = String(code || '').trim();
        if (!nextCode) return;
        document.getElementById('room-code-display').textContent = nextCode;
        this.setHostStatus(this.t('online-room-status-waiting'));
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

        if (!this.onlineStakeKey || this.onlineStakeKey === 'free') {
            this.onlineStakeKey = 'stake_200';
        }
        if (!this.onlineRoomVisibility) {
            this.onlineRoomVisibility = 'closed';
        }

        const stakeWrapper = document.getElementById('online-stake-wrapper');
        if (stakeWrapper) {
            stakeWrapper.classList.remove('is-hidden');
        }

        document.querySelectorAll('#online-stake-group .btn-option').forEach((button) => {
            const shouldBeActive = button.dataset.value === this.onlineStakeKey;
            button.classList.toggle('active', shouldBeActive);
        });

        document.querySelectorAll('#online-visibility-group .btn-option').forEach((button) => {
            const shouldBeActive = button.dataset.value === this.onlineRoomVisibility;
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
                summary.textContent = `${this.format('online-room-summary', { humans, bots: this.onlineAiCount, total: this.onlinePlayerCount })} · ${stakeLabel}`;
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
            button.textContent = 'Geri';
            button.classList.add('btn-action');
            button.classList.remove('btn-menu');
            button.classList.add('online-back-btn');
        }
        return button;
    }

    placeOnlineBackButton(target, hidden = false) {
        const button = this.getOnlineBackButton();
        if (!button || !target) return;
        if (button.parentElement !== target) {
            target.appendChild(button);
        }
        button.classList.toggle('is-hidden', hidden);
    }

    showOnlineLanding() {
        document.getElementById('online-entry-ui')?.classList.remove('is-hidden');
        document.getElementById('online-flow-ui')?.classList.add('is-hidden');
        document.getElementById('online-entry-ui')?.classList.add('online-landing-actions');
        document.getElementById('online-flow-ui')?.classList.remove('online-create-flow', 'online-join-flow');
        document.querySelector('#online-flow-ui .multiplayer-actions')?.classList.remove('online-create-actions');
        document.getElementById('host-game-btn')?.classList.remove('is-hidden');
        document.getElementById('join-game-btn')?.classList.remove('is-hidden');
        document.getElementById('host-game-btn')?.classList.remove('online-create-btn');
        this.placeOnlineBackButton(document.getElementById('online-entry-ui'), false);
        this.showMultiplayerPanel(null);
        this.setHostStatus(this.t('online-room-create-hint'));
        this.setJoinStatus(this.t('online-room-join-hint'));
        void this.loadFriendsHub();
    }

    showOpenRoomsModal() {
        const modal = document.getElementById('open-rooms-modal');
        if (!modal) return;
        this.resetOpenRoomsModalState();
        modal.classList.add('active');
        void this.loadOpenRooms();
    }

    hideOpenRoomsModal() {
        document.getElementById('open-rooms-modal')?.classList.remove('active');
    }

    resetOpenRoomsModalState() {
        const search = document.getElementById('open-room-search-input');
        const mode = document.getElementById('open-room-mode-filter');
        const stake = document.getElementById('open-room-stake-filter');
        if (search) search.value = this.onlineRoomFilters.search || '';
        if (mode) mode.value = this.onlineRoomFilters.roomMode || 'all';
        if (stake) stake.value = this.onlineRoomFilters.stakeKey || 'all';
    }

    showOnlineCreateFlow() {
        document.getElementById('online-entry-ui')?.classList.add('is-hidden');
        document.getElementById('online-flow-ui')?.classList.remove('is-hidden');
        document.getElementById('online-flow-ui')?.classList.add('online-create-flow');
        document.getElementById('online-flow-ui')?.classList.remove('online-join-flow');
        document.querySelector('#online-flow-ui .settings-grid')?.classList.remove('is-hidden');
        document.querySelector('#online-flow-ui .multiplayer-actions')?.classList.remove('is-hidden');
        const actions = document.querySelector('#online-flow-ui .multiplayer-actions');
        actions?.classList.add('online-create-actions');
        this.placeOnlineBackButton(actions, false);
        document.getElementById('host-game-btn')?.classList.remove('is-hidden');
        document.getElementById('host-game-btn')?.classList.add('online-create-btn');
        document.getElementById('join-game-btn')?.classList.add('is-hidden');
        this.showMultiplayerPanel(null);
        this.setHostStatus(this.t('online-room-create-hint'));
        this.setJoinStatus(this.t('online-room-join-hint'));
    }

    showOnlineJoinFlow() {
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
        this.placeOnlineBackButton(document.getElementById('online-flow-ui'), true);
        this.showMultiplayerPanel('join');
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
        list.innerHTML = `<div class="room-summary">${this.t('account-profile-loading')}</div>`;
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
                list.innerHTML = `<div class="room-summary">${this.currentLang === 'az' ? 'Açıq otaq yoxdur' : 'No open rooms yet'}</div>`;
                return;
            }

            list.innerHTML = '';
            this.openRooms.forEach((room) => {
                const card = document.createElement('div');
                card.className = 'open-room-card';
                const title = document.createElement('div');
                title.className = 'open-room-title';
                title.textContent = `${room.hostName || room.roomCode || room.roomId || 'Room'}${room.roomCode ? ' · ' + room.roomCode : ''}`;
                const badges = document.createElement('div');
                badges.className = 'open-room-badges';
                const seatCount = `${room.connectedPlayers || 0}/${room.humanSeats || room.totalPlayers || 0}`;
                const modeLabel = room.roomMode === 'team'
                    ? '2 vs 2'
                    : (this.currentLang === 'az' ? 'Hamı hər kəsə' : 'Free for all');
                const stakeLabel = room.stakeKey && room.stakeKey !== 'free'
                    ? `${room.stakeKey.replace(/^stake_/i, '')}`
                    : (this.currentLang === 'az' ? 'Pulsuz' : 'Free');
                badges.appendChild(this.createRoomBadge('mode', modeLabel));
                badges.appendChild(this.createRoomBadge('players', seatCount));
                badges.appendChild(this.createRoomBadge('stake', stakeLabel));
                badges.appendChild(this.createRoomBadge('open', this.currentLang === 'az' ? 'Açıq' : 'Open'));
                const footer = document.createElement('div');
                footer.className = 'open-room-footer';
                const joinBtn = document.createElement('button');
                joinBtn.className = 'btn btn-action btn-strong';
                joinBtn.textContent = this.currentLang === 'az' ? 'Qoşul' : 'Join';
                joinBtn.addEventListener('click', async () => {
                    this.hideOpenRoomsModal();
                    await this.joinOnlineRoom(room.roomCode || room.roomId);
                });
                footer.appendChild(joinBtn);
                card.appendChild(title);
                card.appendChild(badges);
                card.appendChild(footer);
                list.appendChild(card);
            });
        } catch (err) {
            list.innerHTML = `<div class="room-summary">${err.message || this.t('account-server-unavailable')}</div>`;
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
            resultsList.innerHTML = `<div class="room-summary">${this.currentLang === 'az' ? 'Ad yazın və axtarın' : 'Type a name to search'}</div>`;
            return;
        }
        resultsList.innerHTML = `<div class="room-summary">${this.t('account-profile-loading')}</div>`;
        try {
            const items = await this.account.searchPlayers(query);
            this.friendSearchResults = Array.isArray(items) ? items : [];
            if (!this.friendSearchResults.length) {
                resultsList.innerHTML = `<div class="room-summary">${this.currentLang === 'az' ? 'Nəticə tapılmadı' : 'No players found'}</div>`;
                return;
            }
            resultsList.innerHTML = '';
            this.friendSearchResults.forEach((player) => {
                const card = document.createElement('div');
                card.className = 'friend-card';
                const copy = document.createElement('div');
                copy.className = 'friend-card-copy';
                copy.innerHTML = `<strong>${player.displayName}</strong><span>${player.id}</span>`;
                const action = document.createElement('div');
                action.className = 'friend-card-actions';
                const addBtn = document.createElement('button');
                addBtn.className = 'btn btn-action';
                addBtn.textContent = this.currentLang === 'az' ? 'Dost et' : 'Add';
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
            resultsList.innerHTML = `<div class="room-summary">${err.message || this.t('account-server-unavailable')}</div>`;
        }
    }

    async loadFriendsHub() {
        const friendsList = document.getElementById('friend-list');
        const requestsList = document.getElementById('friend-requests-list');
        const invitesList = document.getElementById('room-invites-list');
        const searchResults = document.getElementById('friend-search-results');
        const loggedIn = Boolean(this.account?.getRoomAuthToken?.());
        const emptyText = this.currentLang === 'az' ? 'Dostlar üçün hesaba daxil olun' : 'Sign in to use friends';

        if (!friendsList || !requestsList || !invitesList || !searchResults) return;
        if (!loggedIn) {
            const message = `<div class="room-summary">${emptyText}</div>`;
            friendsList.innerHTML = message;
            requestsList.innerHTML = message;
            invitesList.innerHTML = message;
            searchResults.innerHTML = message;
            return;
        }

        friendsList.innerHTML = `<div class="room-summary">${this.t('account-profile-loading')}</div>`;
        requestsList.innerHTML = `<div class="room-summary">${this.t('account-profile-loading')}</div>`;
        invitesList.innerHTML = `<div class="room-summary">${this.t('account-profile-loading')}</div>`;
        try {
            const [friends, invitations] = await Promise.all([
                this.account.getFriends(),
                this.account.getRoomInvitations()
            ]);
            this.friendHub = friends || { accepted: [], incoming: [], outgoing: [] };
            this.roomInvitations = invitations || { incoming: [], sent: [] };

            friendsList.innerHTML = '';
            if (!this.friendHub.accepted.length) {
                friendsList.innerHTML = `<div class="room-summary">${this.currentLang === 'az' ? 'Hələ dost yoxdur' : 'No friends yet'}</div>`;
            } else {
                this.friendHub.accepted.forEach((item) => {
                    const card = document.createElement('div');
                    card.className = 'friend-card';
                    const copy = document.createElement('div');
                    copy.className = 'friend-card-copy';
                    copy.innerHTML = `<strong>${item.friend.displayName}</strong><span>${item.friend.id}</span>`;
                    const action = document.createElement('div');
                    action.className = 'friend-card-actions';
                    const inviteBtn = document.createElement('button');
                    inviteBtn.className = 'btn btn-action btn-strong';
                    inviteBtn.textContent = this.currentLang === 'az' ? 'Dəvət et' : 'Invite';
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
                            this.renderer.showMessage(this.currentLang === 'az' ? 'Dəvət göndərildi' : 'Invite sent', 1400);
                        } catch (err) {
                            this.renderer.showMessage(err.message || this.t('account-server-unavailable'), 1800);
                        } finally {
                            inviteBtn.disabled = !canInvite;
                        }
                    });
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'btn btn-menu';
                    removeBtn.textContent = this.currentLang === 'az' ? 'Sil' : 'Remove';
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
                    action.appendChild(removeBtn);
                    card.appendChild(copy);
                    card.appendChild(action);
                    friendsList.appendChild(card);
                });
            }

            requestsList.innerHTML = '';
            if (!this.friendHub.incoming.length && !this.friendHub.outgoing.length) {
                requestsList.innerHTML = `<div class="room-summary">${this.currentLang === 'az' ? 'Dostluq sorğusu yoxdur' : 'No friend requests'}</div>`;
            } else {
                const renderRequest = (item, label, acceptable) => {
                    const card = document.createElement('div');
                    card.className = 'friend-card';
                    const copy = document.createElement('div');
                    copy.className = 'friend-card-copy';
                    copy.innerHTML = `<strong>${item.friend.displayName}</strong><span>${label}</span>`;
                    const action = document.createElement('div');
                    action.className = 'friend-card-actions';
                    if (acceptable) {
                        const acceptBtn = document.createElement('button');
                        acceptBtn.className = 'btn btn-action btn-strong';
                        acceptBtn.textContent = this.currentLang === 'az' ? 'Qəbul et' : 'Accept';
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
                    declineBtn.textContent = this.currentLang === 'az' ? 'İmtina' : 'Decline';
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
                this.friendHub.incoming.forEach((item) => renderRequest(item, this.currentLang === 'az' ? 'Gələn sorğu' : 'Incoming', true));
                this.friendHub.outgoing.forEach((item) => renderRequest(item, this.currentLang === 'az' ? 'Göndərildi' : 'Outgoing', false));
            }

            invitesList.innerHTML = '';
            if (!this.roomInvitations.incoming.length) {
                invitesList.innerHTML = `<div class="room-summary">${this.currentLang === 'az' ? 'Room invite yoxdur' : 'No room invites'}</div>`;
            } else {
                this.roomInvitations.incoming.forEach((invite) => {
                    const card = document.createElement('div');
                    card.className = 'friend-card';
                    const copy = document.createElement('div');
                    copy.className = 'friend-card-copy';
                    copy.innerHTML = `<strong>${invite.inviter.displayName}</strong><span>${invite.roomCode || invite.roomId} · ${invite.roomMode || 'ffa'}</span>`;
                    const action = document.createElement('div');
                    action.className = 'friend-card-actions';
                    const acceptBtn = document.createElement('button');
                    acceptBtn.className = 'btn btn-action btn-strong';
                    acceptBtn.textContent = this.currentLang === 'az' ? 'Qoşul' : 'Join';
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
                    declineBtn.textContent = this.currentLang === 'az' ? 'İmtina' : 'Decline';
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
            friendsList.innerHTML = `<div class="room-summary">${err.message || this.t('account-server-unavailable')}</div>`;
            requestsList.innerHTML = `<div class="room-summary">${err.message || this.t('account-server-unavailable')}</div>`;
            invitesList.innerHTML = `<div class="room-summary">${err.message || this.t('account-server-unavailable')}</div>`;
        }
    }

    async joinOnlineRoom(code) {
        const nextCode = String(code || '').trim().toUpperCase();
        if (!nextCode) return false;
        const name = this.requirePlayerName('online');
        if (!name) return false;
        const profile = await this.ensureGuestAccount(name);
        if (!profile) {
            this.setJoinStatus(this.t('account-server-unavailable'));
            return false;
        }
        this.playerName = name;
        this.showOnlineJoinFlow();
        document.getElementById('join-code-input').value = nextCode;

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
        this.placeOnlineBackButton(document.getElementById('online-modal').querySelector('.modal-header > div') || document.getElementById('online-modal-close')?.parentElement, true);
        document.getElementById('connect-btn').disabled = false;
        document.getElementById('join-code-input').value = '';
        document.getElementById('room-code-display').textContent = '....';
        const roomCountEl = document.getElementById('room-player-count-display');
        if (roomCountEl) roomCountEl.textContent = `${this.onlinePlayerCount} / ${this.onlinePlayerCount}`;
        document.getElementById('room-player-list').innerHTML = '';
        this.setHostStatus(this.t('online-room-create-hint'));
        this.setJoinStatus(this.t('online-room-join-hint'));
    }

    setHostStatus(text) {
        document.getElementById('host-status').textContent = text;
    }

    setJoinStatus(text) {
        document.getElementById('join-status').textContent = text;
    }

    onRoomStateUpdate(roomState) {
        if (!roomState) return;
        this.currentRoomState = roomState;

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

        for (const player of roomState.players || []) {
            const chip = document.createElement('div');
            chip.className = 'room-player-chip';
            if (player.sessionId === mySessionId) {
                chip.classList.add('you');
            }
            const name = document.createElement('span');
            name.textContent = player.sessionId === mySessionId ? `${player.name} (${this.t('online-you')})` : player.name;
            const state = document.createElement('span');
            state.className = 'room-player-state';
            state.textContent = player.isConnected ? this.t('online-ready') : this.t('online-offline');

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
    }

    onRoomClosed(payload) {
        const reason = payload?.reason || this.t('online-room-closed');
        this.network.leaveRoom();
        this.currentRoomState = null;
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
        this.setJoinStatus(reason);
        this.setHostStatus(reason);
        this.refreshResumeBanner();
    }

    setupGameControls() {
        this.bindTap(this.renderer.drawBtn, () => this.drawFromBoneyard());
        this.bindTap(this.renderer.passBtn, () => this.passTurn());
        document.getElementById('next-round-btn').addEventListener('click', () => {
            document.getElementById('round-end-screen').classList.remove('active');
            if (this.matchOver) { this.showMatchResult(); return; }
            if (this.network.isMultiplayer) {
                this.network.sendNextDeal();
            } else {
                if (this.roundOver) void this.startRound();
                else this.startDeal();
            }
        });
        document.getElementById('new-game-btn').addEventListener('click', () => {
            document.getElementById('game-over-screen').classList.remove('active');
            document.getElementById('game-screen').classList.remove('active');
            document.getElementById('start-screen').classList.add('active');
            this.showStartModal(null);
            if (this.network.isMultiplayer && this.network.room) {
                this.network.leaveRoom();
                this.myHand = null;
            }
            this.clearLocalPresence();
            this.resetMultiplayerPanels(false);
        });
        this.bindTap(this.renderer.handEl, e => {
            const el = e.target.closest('.tile.playable');
            if (el) this.onHandTileClick(parseInt(el.dataset.handIndex));
        });
        this.setupReactionUI();
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
    renderReactionPicker() {
        if (!this.reactionPicker) return;
        this.reactionPicker.innerHTML = '';
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
            this.reactionPicker.appendChild(btn);
        }
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
    setupMenu() {
        document.getElementById('menu-btn').addEventListener('click', () => {
            this.closeReactionPicker();
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
        document.getElementById('menu-resume').addEventListener('click', () => document.getElementById('menu-screen').classList.remove('active'));
        document.getElementById('menu-newgame').addEventListener('click', () => { document.getElementById('menu-screen').classList.remove('active'); void this.startNewGame(); });
        const menuProfileBtn = document.getElementById('menu-profile');
        if (menuProfileBtn) {
            menuProfileBtn.addEventListener('click', async () => {
                document.getElementById('menu-screen').classList.remove('active');
                await this.openAccountModal();
            });
        }
        document.getElementById('menu-quit').addEventListener('click', async () => {
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
            ? this.onlineEconomyMode === 'coins' && this.onlineStakeKey !== 'free'
            : this.activeMatchEconomyMode === 'coins' && this.activeMatchStakeKey !== 'free';

        const message = isStakeGame
            ? (this.currentLang === 'az'
                ? 'Bu oyundan çıxsanız, cari gedişat silinəcək və bu partiya məğlubiyyət kimi sayılacaq. Davam edirsiniz?'
                : 'If you quit now, the current game will be lost and this coin match will count as a defeat. Continue?')
            : (this.currentLang === 'az'
                ? 'Bu oyundan çıxsanız, cari gedişat silinəcək. Davam edirsiniz?'
                : 'If you quit now, the current game progress will be lost. Continue?');

        return window.confirm(message);
    }

    async quitCurrentMatch() {
        if (!this.network.isMultiplayer && this.currentRoundStakeSessionId && this.currentRoundStakeKey !== 'free') {
            try {
                this.coinMatchSummary.spent += this.currentRoundStakeAmount || this.getStakeAmountByKey(this.currentRoundStakeKey);
                await this.account?.settleSoloMatchStake?.({
                    matchId: this.currentRoundStakeSessionId,
                    stakeKey: this.currentRoundStakeKey,
                    result: 'loss',
                    difficulty: this.difficulty
                });
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
        this.gameActive = false;
        this.matchOver = false;
        this.roundOver = false;
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('start-screen').classList.add('active');
        this.showStartModal(null);
        this.resetMultiplayerPanels(false);
    }

    async startNewGame() {
        console.log('[startNewGame] Starting...', 'isMultiplayer:', this.network.isMultiplayer);
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        this.playerName = this.sanitizeName(this.playerName);

        // In multiplayer, server controls the game - just wait for state updates
        if (this.network.isMultiplayer) {
            console.log('[startNewGame] Multiplayer mode - waiting for server');
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
        console.log('[startNewGame] Starting round...');
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
        this.soloEconomyMode = selection.mode;
        this.soloStakeKey = selection.stakeKey;

        await this.loadAccountProfile();
        const token = this.account?.getRoomAuthToken?.();
        if (!token) {
            this.renderer.showMessage(
                this.currentLang === 'az'
                    ? 'Monetli oyun üçün hesaba daxil olun'
                    : 'Log in to play on coins',
                2000
            );
            return { ok: false, reason: 'auth_required' };
        }

        const stakeKey = this.soloStakeKey && this.soloStakeKey !== 'free' ? this.soloStakeKey : 'stake_50';
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

        const roundStakeKey = this.currentRoundStakeKey && this.currentRoundStakeKey !== 'free'
            ? this.currentRoundStakeKey
            : (this.soloStakeKey && this.soloStakeKey !== 'free' ? this.soloStakeKey : 'stake_50');
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
        if (this.currentRoundStakeKey === 'free' || !this.currentRoundStakeSessionId) {
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
        console.log('[startRound] playerCount:', this.playerCount);
        this.roundOver=false; this.scores=new Array(this.playerCount).fill(0); if(this.isTeamMode) this.teamScores=[0,0]; this.deal=1; 
        await this.pendingSoloSettlement.catch(() => {});
        this.currentRoundStakeKey = this.soloStakeKey && this.soloStakeKey !== 'free'
            ? this.soloStakeKey
            : 'stake_50';
        this.currentRoundStakeSessionId = this.createResumeId(`solo-round-${this.matchRound}`);
        const stakeReady = await this.reserveSoloRoundStake();
        if (!stakeReady?.ok) {
            this.matchOver = true;
            this.renderer.showMessage(
                this.currentLang === 'az'
                    ? 'Növbəti raund üçün monet çatmır'
                    : 'Not enough coins for the next round',
                2400
            );
            if (this.matchRound <= 1) {
                document.getElementById('game-screen').classList.remove('active');
                document.getElementById('start-screen').classList.add('active');
                this.showStartModal(null);
                return false;
            }
            this.showMatchResult();
            return false;
        }
        this.startDeal(); 
        return true;
    }

    startDeal() {
        console.log('[startDeal] Initializing deal...');
        this.board=new Board(); this.selectedTileIndex=-1; this.roundOver=false; this.gameActive=true; this.turnInProgress=false;
        const all=shuffle(createFullSet()); const hs=getHandSize(this.playerCount);
        this.hands=[]; let idx=0;
        for(let p=0;p<this.playerCount;p++){this.hands.push(all.slice(idx,idx+hs));idx+=hs;}
        this.boneyard=all.slice(idx);
        console.log('[startDeal] Hands dealt, boneyard:', this.boneyard.length);
        if(this.lastDealWinner!==null){
            const fp=this.lastDealWinner;
            this.currentPlayer=fp; this.renderState();
            console.log('[startDeal] Last deal winner starts:', fp);
            this.broadcastMsg(this.format('msg-last-winner-starts', { player: this.playerNames[fp] }),2000);
            this.queueAITurnIfNeeded(1500);
        }else{
            const f=determineFirstPlayer(this.hands);
            const fp=f.player; const fi=f.tileIndex;
            this.currentPlayer=fp; this.renderState();
            console.log('[startDeal] First player determined:', fp);
            this.broadcastMsg(this.format('msg-first-turn', { player: this.playerNames[fp] }),2000);
            this.turnInProgress=true;
            setTimeout(()=>{this.turnInProgress=false;this.playTile(fp,fi,-1);},1200);
        }
    }

    get turnInProgress() { return this._turnInProgress; }
    set turnInProgress(v) { this._turnInProgress = v; if (v) this.lastTurnStartTime = Date.now(); }

    getTeam(i){return i%2;}
    renderState() {
        let displayEntities;
        if (this.isTeamMode) {
            displayEntities = [
                { name: `${this.playerNames[0]} & ${this.playerNames[2]}`, score: this.teamScores[0], roundWins: this.teamRoundWins[0], isCurrent: this.currentPlayer===0||this.currentPlayer===2, index: (this.currentPlayer===0||this.currentPlayer===2)?this.currentPlayer:-1 },
                { name: `${this.playerNames[1]} & ${this.playerNames[3]}`, score: this.teamScores[1], roundWins: this.teamRoundWins[1], isCurrent: this.currentPlayer===1||this.currentPlayer===3, index: (this.currentPlayer===1||this.currentPlayer===3)?this.currentPlayer:-1 }
            ];
        } else {
            displayEntities = this.playerNames.map((n,i) => ({
                name: n, score: this.scores[i], roundWins: this.roundWins[i], isCurrent: this.currentPlayer === i, index: i
            }));
        }
        this.renderer.renderScores(displayEntities, this.currentPlayer);
        this.renderer.renderInfo(this.matchRound, this.deal, this.boneyard.length, this.board.getOpenEndsScore(), this.getCurrentStakeLabel());
        const roundInfo = document.getElementById('round-info');
        const boneyardInfo = document.getElementById('boneyard-info');
        if (roundInfo) {
            roundInfo.textContent = '';
            roundInfo.classList.add('is-hidden');
        }
        if (boneyardInfo) {
            boneyardInfo.textContent = '';
            boneyardInfo.classList.add('is-hidden');
        }
        
        this.renderer.renderBoard(this.board);
        this.renderer.renderOpponentHands(this.hands, this.humanPlayerIndex, this.playerNames, this.currentPlayer);
        const myHand = this.myHand || this.hands[this.humanPlayerIndex];
        this.validMoves = this.board.getValidMoves(myHand);
        const myTurn = this.currentPlayer === this.humanPlayerIndex;
        this.renderer.renderHand(myHand, this.validMoves, this.selectedTileIndex, myTurn);

        const canPlay = this.board.canPlayAny(myHand);
        const emptyBoneyard = this.boneyard.length === 0;
        this.renderer.drawBtn.disabled = !myTurn || canPlay || emptyBoneyard;
        this.renderer.passBtn.disabled = !myTurn || canPlay || !emptyBoneyard;

        this.goshaCombo = (this.gameActive && myTurn) ? this.board.getGoshaCombo(myHand) : null;
        this.renderer.showGoshaBtn(this.goshaCombo, () => this.playGoshaCombo());
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
            "label-online": { az: "Online room", en: "Online room" },
            "label-online-help": { az: "Create a room or join with a code", en: "Create a room or join with a code" },
            "label-online-players": { az: "Room size", en: "Room size" },
            "label-ai-slots": { az: "AI slots", en: "AI slots" },
            "label-mode": { az: "Mode", en: "Mode" },
            "mode-ffa": { az: "Free for all", en: "Free for all" },
            "mode-team": { az: "2 vs 2", en: "2 vs 2" },
            "label-round-short": { az: "R", en: "R" },
            "label-deal-short": { az: "D", en: "D" },
            "label-boneyard-short": { az: "Bazaar", en: "Bazaar" },
            "label-economy-mode": { az: "Game mode", en: "Game mode" },
            "label-stake-table": { az: "Mərc masası", en: "Stake amount", ru: "Ставка" },
            "label-stake-short": { az: "Bank", en: "Bank" },
            "economy-free": { az: "Free play", en: "Free play" },
            "economy-coins": { az: "Play on coins", en: "Play on coins" },
            "btn-host": { az: "Create", en: "Create" },
            "btn-join": { az: "Join", en: "Join" },
            "btn-draw": { az: "Draw", en: "Draw" },
            "btn-pass": { az: "Pass", en: "Pass" },
            "btn-reactions": { az: "Reactions", en: "Reactions" },
            "menu-title": { az: "Menu", en: "Menu" },
            "menu-resume": { az: "Resume", en: "Resume" },
            "menu-new": { az: "New game", en: "New game" },
            "menu-quit": { az: "Quit", en: "Quit" },
            "modal-close": { az: "Close", en: "Close" },
            "solo-modal-title": { az: "Solo play", en: "Solo play" },
            "solo-modal-desc": { az: "Pick difficulty, player count and game mode.", en: "Pick difficulty, player count and game mode." },
            "online-modal-title": { az: "Online room", en: "Online room" },
            "online-modal-desc": { az: "Create a room, add bots or join with a code.", en: "Create a room, add bots or join with a code." },
            "online-choice-create": { az: "Otaq yarat", en: "Create", ru: "Создать" },
            "online-choice-connect": { az: "Qoşul", en: "Connect", ru: "Подключиться" },
            "account-btn": { az: "Account", en: "Account" },
            "account-kicker": { az: "Profile", en: "Profile" },
            "account-title": { az: "Account", en: "Account" },
            "account-desc": { az: "Keep your score, rating and match history.", en: "Keep your score, rating and match history." },
            "account-name": { az: "Name", en: "Name" },
            "account-password": { az: "Password", en: "Password" },
            "account-guest": { az: "Guest mode", en: "Guest mode" },
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
            "account-guest-meta": { az: "Guest profile", en: "Guest profile" },
            "account-online": { az: "Server connected", en: "Server connected" },
            "account-offline": { az: "Server unavailable", en: "Server unavailable" },
            "account-history-empty": { az: "No match history yet", en: "No match history yet" },
            "account-history-win": { az: "Win", en: "Win" },
            "account-history-loss": { az: "Loss", en: "Loss" },
            "account-history-draw": { az: "Draw", en: "Draw" },
            "account-server-unavailable": { az: "Server unavailable", en: "Server unavailable" },
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
            "online-room-copy": { az: "Copy", en: "Copy" },
            "online-copy-success": { az: "Code copied: {code}", en: "Code copied: {code}" },
            "online-copy-fail": { az: "Copy failed. Code: {code}", en: "Copy failed. Code: {code}" },
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
            const value = t[key] || translations.en?.[key] || translations.az?.[key] || this.getUiTextOverride(key) || key;
            if (value) {
                if (el.tagName === 'INPUT') el.placeholder = value;
                else {
                    el.textContent = value;
                    if (el.id === 'menu-btn') el.title = value;
                }
            }
        });
        const reactionBtn = document.getElementById('reaction-btn');
        if (reactionBtn) reactionBtn.title = t['btn-reactions'] || 'Reactions';
        document.querySelectorAll('.btn-lang').forEach(b => {
            b.classList.toggle('active', b.dataset.lang === nextLang);
        });
        this.syncAccountUiChrome();
        this.syncStartAuthButton();
        this.refreshResumeBanner();
        document.documentElement.lang = nextLang;
    }

    t(key) {
        return translations[this.currentLang]?.[key]
            || translations.en?.[key]
            || translations.az?.[key]
            || this.getUiTextOverride(key)
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

    // --- Network Handlers (Thin Client Mode) ---
    onNetworkStateUpdate(state) {
        const playerOrder = Array.from(state?.playerOrder || []);
        const players = state?.players;
        const getPlayer = (sid) => (players && sid !== undefined && sid !== null) ? players.get(sid) : null;

        this.playerNames = playerOrder.map(sid => getPlayer(sid)?.name || "Player");
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
        this.boneyard = new Array(state?.boneyardCount || 0).fill(null);
        this.isTeamMode = !!state?.isTeamMode;
        this.teamScores = Array.from(state?.teamScores || [0, 0]);
        this.teamRoundWins = Array.from(state?.teamRoundWins || [0, 0]);
        this.matchRound = state?.matchRound || 1;
        this.deal = state?.deal || 1;
        this.gameActive = !!state?.gameActive;
        this.onlineStakeKey = state?.stakeKey || this.onlineStakeKey;
        this.onlineRoundBankAmount = Math.max(0, Number(state?.bankAmount || 0));

        // Hide start screen if we just started
        if (this.gameActive && document.getElementById('start-screen').classList.contains('active')) {
            document.getElementById('start-screen').classList.remove('active');
            document.getElementById('game-screen').classList.add('active');
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
        // Reconstruct all hands to show them at the end
        const finalHands = data.hands.map(h => h.map(t => new Tile(t.a, t.b)));
        this.hands = finalHands;
        
        let displayEntities;
        if(this.isTeamMode){
            const wt = data.winnerIndex % 2;
            displayEntities = [
                {name: `${this.playerNames[0]} & ${this.playerNames[2]}`, isWinner: wt===0, score: this.teamScores[0], handPoints: handPoints(this.hands[0])+handPoints(this.hands[2]), leftoverHands: [this.hands[0], this.hands[2]]},
                {name: `${this.playerNames[1]} & ${this.playerNames[3]}`, isWinner: wt===1, score: this.teamScores[1], handPoints: handPoints(this.hands[1])+handPoints(this.hands[3]), leftoverHands: [this.hands[1], this.hands[3]]}
            ];
        }else{
            displayEntities = this.playerNames.map((n,i)=>({name:n,isWinner:i===data.winnerIndex,handPoints:handPoints(this.hands[i]),score:this.scores[i], leftoverHands: [this.hands[i]]}));
        }
        
        this.renderer.renderDealEnd(this.playerNames[data.winnerIndex], displayEntities, data.fish, data.bonus);
        this.persistGameResumeSnapshot();
    }

    onNetworkRoundEnd(data) {
        this.gameActive = false;
        const wi = data.winnerIndex;
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

        if (data.isInstantWin) {
            this.matchOver = data.isMatchOver;
            this.renderer.showInstantWin(this.playerNames[wi], data.wins);
            if (data.isMatchOver) this.clearGameResumeSnapshot();
            else this.persistGameResumeSnapshot();
            return;
        }

        this.matchOver = data.isMatchOver;

        if (this.network.isMultiplayer && this.onlineEconomyMode === 'coins' && data.economy) {
            const economy = data.economy || {};
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

        let displayEntities;
        if (data.isTeamMode) {
            displayEntities = [
                {name: `${this.playerNames[0]} & ${this.playerNames[2]}`, isWinner: data.teamRoundWins[0] > data.teamRoundWins[1], score: data.teamScores[0], roundWins: data.teamRoundWins[0]},
                {name: `${this.playerNames[1]} & ${this.playerNames[3]}`, isWinner: data.teamRoundWins[1] > data.teamRoundWins[0], score: data.teamScores[1], roundWins: data.teamRoundWins[1]}
            ];
        } else {
            displayEntities = data.players.map(p => ({name: p.name, isWinner: p.isWinner, score: p.score, roundWins: p.roundWins}));
        }

        this.renderer.renderRoundEnd(this.playerNames[wi], displayEntities, data.wins, data.matchRound, data.isMatchOver);
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

        this.turnInProgress=true; this.playSound('gosha');
        const pi = this.currentPlayer;
        const hand=this.hands[pi];
        const matches=this.goshaCombo.matches;
        const sorted=[...matches].sort((a,b)=>b.tileIndex-a.tileIndex);
        const tilesByIndex = new Map(matches.map((m) => [m.tileIndex, hand[m.tileIndex]]));
        for(const m of sorted) hand.splice(m.tileIndex,1);
        let score=0;
        for(const m of matches){
            const openEndIndex = this.board.findOpenEndIndex(m.nodeId, m.side);
            const tile = tilesByIndex.get(m.tileIndex);
            if(openEndIndex === -1 || !tile){
                this.turnInProgress=false;
                return;
            }
            score=this.board.placeTile(tile,openEndIndex);
        }
        this.renderState();
        
        if(score>0){this.addScore(pi,score);if(this.checkEnd(pi,score))return;}
        this.broadcastMsg(this.format('msg-gosha', { player: this.playerNames[pi], count: matches.length, score }),2000);
        if(hand.length===0){ setTimeout(()=>this.endDeal(pi,false), 400); return;}
        if(this.board.isBlocked(this.hands,this.boneyard)){ setTimeout(()=>this.endDeal(this.findFishWinner(),true), 400); return;}
        setTimeout(() => { this.turnInProgress=false; this.advanceTurn(); }, 300);
    }

    drawFromBoneyard(fromRemote=false) {
        if (this.network.isMultiplayer) {
            this.network.sendDraw();
            return;
        }
        if(!this.gameActive) return;
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
        if(!this.gameActive||this.turnInProgress) return;
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
        this.turnInProgress=true;
        this.playSound('pass'); this.broadcastMsg(this.t('btn-pass'), 300); 
        setTimeout(()=>{this.turnInProgress=false;this.advanceTurn();}, 300);
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
            this.gameActive=false; this.roundOver=true; this.matchOver=true; this.turnInProgress=false; this.playSound('win');
            if(this.isTeamMode)this.teamRoundWins[this.getTeam(pi)]+=2;else this.roundWins[pi]+=2;
            this.renderState();
            setTimeout(() => this.renderer.showInstantWin(this.playerNames[pi],score), 800);
            return true;
        }
        return false;
    }

    async playTile(pi,ti,oei) {
        if(this.turnInProgress) return;
        this.turnInProgress=true;
        try {
        const hand=this.hands[pi],tile=hand && hand[ti];
        if(!tile){this.turnInProgress=false;return;}
        if(!this.board.isEmpty && !this.board.openEnds[oei]){this.turnInProgress=false;return;}
        const sourceEl = pi === this.humanPlayerIndex ? this.renderer.handEl?.children?.[ti] || null : null;
        const sourceRect = sourceEl?.getBoundingClientRect?.() || null;
        const sourceNode = sourceEl?.cloneNode?.(true) || null;
        this.renderer._pendingBoardTileTravel = sourceRect && sourceNode ? { tileId: tile.id, sourceRect, sourceNode } : null;
        hand.splice(ti,1);
        this.playSound('place');
        let score=this.board.isEmpty?this.board.placeFirst(tile):this.board.placeTile(tile,oei);
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
        if(hand.length===0){ setTimeout(()=>this.endDeal(pi,false), 400); return;}
        if(this.board.isBlocked(this.hands,this.boneyard)){ setTimeout(()=>this.endDeal(this.findFishWinner(),true), 400); return;}
        
        setTimeout(() => {
            this.turnInProgress=false;
            this.advanceTurn();
        }, sourceRect ? 70 : 300);
        } catch (e) {
            console.error('[playTile] Error:', e);
            this.turnInProgress = false;
        }
    }

    advanceTurn() {
        if(this.board.isBlocked(this.hands,this.boneyard)){this.endDeal(this.findFishWinner(),true);return;}
        this.currentPlayer=(this.currentPlayer+1)%this.playerCount;
        this.renderState();
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
        this.queueAITurnIfNeeded(400);
    }

    queueAITurnIfNeeded(delay) {
        const isAI = this.ais.some(a => a.index === this.currentPlayer);
        if (isAI) {
            setTimeout(() => this.aiTurn(), delay);
        }
    }

    aiTurn() {
        if(!this.gameActive||this.turnInProgress||this.matchOver||this.roundOver) return;
        const pi=this.currentPlayer;
        const ai=this.ais.find(a=>a.index===pi);
        if(!ai) return;

        const hand = this.hands[pi];
        this.turnInProgress = true;
        
        // Thinking delay
        setTimeout(() => {
            // Check Gosha combo for AI
            const combo = this.board.getGoshaCombo(hand);
            if (combo) {
                this.goshaCombo = combo;
                this.turnInProgress = false; // reset so playGosha can take it
                this.playGoshaCombo();
                return;
            }

            // Regular move
            const moves = this.board.getValidMoves(hand);
            const move = ai.chooseMove(this.board, hand, moves, this.scores, this.hands, this.boneyard, this.playerMissingSuits);
            
            if (move) {
                this.turnInProgress = false;
                this.playTile(pi, move.tileIndex, move.openEndIndex);
            } else if (this.boneyard.length > 0) {
                this.turnInProgress = false;
                this.drawFromBoneyard();
                this.queueAITurnIfNeeded(300);
            } else {
                this.turnInProgress = false;
                this.passTurn();
            }
        }, 600 + Math.random() * 400);
    }

    findFishWinner(){
        if(this.isTeamMode){
            const t0=handPoints(this.hands[0])+handPoints(this.hands[2]);
            const t1=handPoints(this.hands[1])+handPoints(this.hands[3]);
            const winningTeam = t0<=t1?0:1;
            const players = winningTeam === 0 ? [0, 2] : [1, 3];
            let minP = Infinity, bestP = players[0];
            for(const pIdx of players) {
                const p = handPoints(this.hands[pIdx]);
                if(p < minP) { minP = p; bestP = pIdx; }
            }
            return bestP;
        }
        let min=Infinity,w=0;for(let i=0;i<this.playerCount;i++){const p=handPoints(this.hands[i]);if(p<min){min=p;w=i;}}return w;
    }
    endDeal(wi,fish){
        this.roundOver=false;
        this.gameActive=false;this.lastDealWinner=wi;this.turnInProgress=false;let bonus=0;
        let displayEntities;
        if(this.isTeamMode){
            const wt=this.getTeam(wi);let os=0;
            for(let i=0;i<4;i++)if(this.getTeam(i)!==wt)os+=handPoints(this.hands[i]);
            if(fish)for(let i=0;i<4;i++)if(this.getTeam(i)===wt)os-=handPoints(this.hands[i]);
            bonus=roundTo5(Math.max(0,os));bonus=this.addScore(wi,bonus);
            displayEntities = [
                {name: `${this.playerNames[0]} & ${this.playerNames[2]}`, isWinner: wt===0, score: this.teamScores[0], handPoints: handPoints(this.hands[0])+handPoints(this.hands[2]), leftoverHands: [this.hands[0], this.hands[2]]},
                {name: `${this.playerNames[1]} & ${this.playerNames[3]}`, isWinner: wt===1, score: this.teamScores[1], handPoints: handPoints(this.hands[1])+handPoints(this.hands[3]), leftoverHands: [this.hands[1], this.hands[3]]}
            ];
        }else{
            let os=0;for(let i=0;i<this.playerCount;i++)if(i!==wi)os+=handPoints(this.hands[i]);
            if(fish)os-=handPoints(this.hands[wi]);
            bonus=roundTo5(Math.max(0,os));bonus=this.addScore(wi,bonus);
            displayEntities = this.playerNames.map((n,i)=>({name:n,isWinner:i===wi,handPoints:handPoints(this.hands[i]),score:this.scores[i], leftoverHands: [this.hands[i]]}));
        }
        sndWin();
        const cs=this.isTeamMode?Math.max(...this.teamScores):Math.max(...this.scores);
        if(cs>=TARGET){const rw=this.isTeamMode?this.teamScores.indexOf(Math.max(...this.teamScores)):this.scores.indexOf(Math.max(...this.scores));this.endRound(this.isTeamMode?(rw===0?0:1):rw);return;}
        this.renderer.renderDealEnd(this.playerNames[wi],displayEntities,fish,bonus);this.deal++;
        void this.syncLocalPresence();
    }
    endRound(wi){
        this.roundOver=true;
        let wins=1;
        let displayEntities;
        if(this.isTeamMode){
            if(this.teamScores[1-this.getTeam(wi)]<this.dlossThreshold)wins=2;this.teamRoundWins[this.getTeam(wi)]+=wins;
            displayEntities = [
                {name: `${this.playerNames[0]} & ${this.playerNames[2]}`, isWinner: this.getTeam(wi)===0, score: this.teamScores[0], roundWins: this.teamRoundWins[0]},
                {name: `${this.playerNames[1]} & ${this.playerNames[3]}`, isWinner: this.getTeam(wi)===1, score: this.teamScores[1], roundWins: this.teamRoundWins[1]}
            ];
        }else{
            for(let i=0;i<this.playerCount;i++)if(i!==wi&&this.scores[i]<this.dlossThreshold){wins=2;break;}this.roundWins[wi]+=wins;
            displayEntities = this.playerNames.map((n,i)=>({name:n,isWinner:i===wi,score:this.scores[i],roundWins:this.roundWins[i]}));
        }
        if(this.matchRound>=MAX_R)this.matchOver=true;
        if (!this.isTeamMode && this.soloEconomyMode === 'coins' && this.currentRoundStakeKey !== 'free') {
            this.pendingSoloSettlement = this.settleSoloRoundStake(wi);
        } else if (this.isTeamMode && this.soloEconomyMode === 'coins' && this.currentRoundStakeKey !== 'free') {
            this.pendingSoloSettlement = this.settleSoloRoundStake(wi);
        }
        this.renderer.renderRoundEnd(this.playerNames[wi],displayEntities,wins,this.matchRound,this.matchOver);this.matchRound++;
        void this.syncLocalPresence();
    }
    showMatchResult(){
        const economySummary = this.network.isMultiplayer
            ? (this.onlineEconomyMode === 'coins' ? { ...this.onlineCoinSummary } : null)
            : (this.soloEconomyMode === 'coins' ? { ...this.coinMatchSummary } : null);
        if(this.isTeamMode){
            const w=this.teamRoundWins[0]>=this.teamRoundWins[1]?0:1;
            this.renderer.renderGameOver(w===0?`${this.playerNames[0]} & ${this.playerNames[2]}`:`${this.playerNames[1]} & ${this.playerNames[3]}`,[{name:this.t('team-a'),roundWins:this.teamRoundWins[0]},{name:this.t('team-b'),roundWins:this.teamRoundWins[1]}], economySummary);
            void this.recordLocalMatchResult(w);
        }
        else{
            let w=0,mx=0;for(let i=0;i<this.playerCount;i++)if(this.roundWins[i]>mx){mx=this.roundWins[i];w=i;}
            this.renderer.renderGameOver(this.playerNames[w],this.playerNames.map((n,i)=>({name:n,roundWins:this.roundWins[i]})), economySummary);
            void this.recordLocalMatchResult(w);
        }
        void this.clearLocalPresence();
        this.clearGameResumeSnapshot();
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
const game=new DominoGame();

// Re-render board on resize for correct scaling (debounced)
let _resizeTimer = null;
window.addEventListener('resize', () => {
    if (!game.gameActive) return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => game.renderState(), 150);
});

