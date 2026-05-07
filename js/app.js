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
        this.playerCount=2; this.onlinePlayerCount=2; this.onlineAiCount=0; this.playerName=''; this.difficulty='medium';
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
        this.currentLang = 'az';
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
        this.setLanguage('az');
        document.documentElement.lang = 'az';
        this.setupStartScreen(); this.setupGameControls(); this.setupMenu();
        this.bootstrapAccount();

        // Watchdog for turn freeze
        setInterval(() => {
            if (this.turnInProgress && Date.now() - this.lastTurnStartTime > 6000) {
                this.log("Watchdog: Resetting stuck turn");
                this.turnInProgress = false;
            }
        }, 2000);
    }
    setupStartScreen() {
        const openSoloBtn = document.getElementById('open-solo-modal-btn');
        const openOnlineBtn = document.getElementById('open-online-modal-btn');
        const accountBtn = document.getElementById('account-btn');
        const soloModalClose = document.getElementById('solo-modal-close');
        const onlineModalClose = document.getElementById('online-modal-close');
        const accountModalClose = document.getElementById('account-modal-close');

        if (openSoloBtn) openSoloBtn.addEventListener('click', () => this.showStartModal('solo'));
        if (openOnlineBtn) openOnlineBtn.addEventListener('click', () => {
            this.resetMultiplayerPanels(false);
            this.syncMultiplayerOptions();
            this.showStartModal('online');
        });
        if (accountBtn) accountBtn.addEventListener('click', async () => {
            await this.openAccountModal();
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
            });
        });
        document.getElementById('start-game-btn').addEventListener('click', async () => {
            const name = this.requirePlayerName('solo');
            if (!name) return;
            await this.ensureGuestAccount(name, { allowOfflineFallback: true });
            this.playerName = name;
            this.isTeamMode = false;
            this.syncMultiplayerOptions();
            this.myHand = null;
            this.startNewGame();
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
            const name = this.requirePlayerName('online');
            if (!name) return;
            const profile = await this.ensureGuestAccount(name);
            if (!profile) {
                this.setJoinStatus(this.t('account-server-unavailable'));
                return;
            }
            this.playerName = name;

            const btn = document.getElementById('connect-btn');
            btn.disabled = true;
            this.setJoinStatus(this.t('online-room-status-connecting'));

            this.network.joinGame(code, () => {
                this.setJoinStatus(this.t('online-room-status-joined'));
            }, (err) => {
                this.setJoinStatus(`${this.t('online-room-status-error')}: ${err}`);
                btn.disabled = false;
            });
        });

        document.getElementById('join-code-input').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                document.getElementById('connect-btn').click();
            }
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
            this.showStartModal(null);
            this.resetMultiplayerPanels(true);
        });
        document.getElementById('join-cancel-btn').addEventListener('click', () => {
            this.showStartModal(null);
            this.resetMultiplayerPanels(true);
        });

        const loginTabBtn = document.getElementById('login-tab-btn');
        const registerTabBtn = document.getElementById('register-tab-btn');
        const loginForm = document.getElementById('account-login-form');
        const registerForm = document.getElementById('account-register-form');
        const guestAccountBtn = document.getElementById('guest-account-btn');
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
        if (refreshAccountBtn) refreshAccountBtn.addEventListener('click', async () => {
            await this.loadAccountProfile();
        });
        if (logoutAccountBtn) logoutAccountBtn.addEventListener('click', async () => {
            await this.account.logout();
            this.accountProfile = null;
            this.accountDetails = null;
            this.accountOnline = false;
            this.setAccountMode('login');
            this.setAccountStatus('');
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
                    name: this.sanitizeName(name || 'Player', 'Player'),
                    isGuest: true
                };
            }
            return null;
        }
    }

    async loadAccountProfile() {
        if (!this.account.getRoomAuthToken()) {
            this.accountOnline = false;
            this.accountDetails = null;
            this.renderAccountModal();
            return null;
        }
        try {
            const details = await this.account.getProfileDetails();
            this.accountDetails = details;
            this.accountProfile = details?.profile || details?.user || this.accountProfile;
            this.accountOnline = true;
            if (this.accountProfile) this.accountMode = 'profile';
            this.prefillAccountNames();
            this.renderAccountModal();
            this.syncStartAuthButton();
            this.setAccountStatus(this.t('account-online'));
            return details;
        } catch (err) {
            this.accountOnline = false;
            this.setAccountStatus(err.message || this.t('account-server-unavailable'));
            this.renderAccountModal();
            this.syncStartAuthButton();
            return null;
        }
    }

    async openAccountModal() {
        this.closeStartModals();
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
        const loginURL = new URL("/login", authOrigin);
        loginURL.searchParams.set("callbackURL", callbackURL);
        loginURL.searchParams.set("autogoogle", "1");
        window.location.assign(loginURL.toString());
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
                item.innerHTML = `<span>#${row.rank} ${row.name}</span><strong>${row.rating}</strong>`;
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
        const pointsValue = document.getElementById('account-points-value');
        const winsValue = document.getElementById('account-wins-value');
        const matchesValue = document.getElementById('account-matches-value');
        const historyList = document.getElementById('account-history-list');
        const refreshButton = document.getElementById('account-refresh-btn');
        const logoutButton = document.getElementById('account-logout-btn');
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
        if (title) title.textContent = isAuthenticated ? this.t('account-profile') : this.t('account-auth-title');
        if (profilePanel) profilePanel.classList.toggle('is-hidden', !isAuthenticated);
        if (authPanel) authPanel.classList.toggle('is-hidden', isAuthenticated);
        if (historyPanel) historyPanel.classList.add('is-hidden');
        if (leaderboardPanel) leaderboardPanel.classList.add('is-hidden');
        if (loginForm) loginForm.classList.toggle('active', !isAuthenticated && this.accountMode !== 'register');
        if (registerForm) registerForm.classList.toggle('active', !isAuthenticated && this.accountMode === 'register');
        if (loginTabBtn) loginTabBtn.classList.toggle('active', this.accountMode !== 'register');
        if (registerTabBtn) registerTabBtn.classList.toggle('active', this.accountMode === 'register');
        if (loginEmailInput && !isAuthenticated && !loginEmailInput.value.trim() && profile?.email) loginEmailInput.value = profile.email;
        if (loginPasswordInput && isAuthenticated) loginPasswordInput.value = '';
        if (registerPasswordInput && isAuthenticated) registerPasswordInput.value = '';
        if (refreshButton) refreshButton.disabled = !this.account.getRoomAuthToken();
        if (logoutButton) logoutButton.disabled = !this.account.getRoomAuthToken();
        if (avatar) avatar.textContent = (profile?.name || 'D').slice(0, 1).toUpperCase();
        if (profileName) profileName.textContent = profile?.name || 'Domino Player';
        if (profileMeta) {
            profileMeta.textContent = profile
                ? (profile.isGuest ? this.t('account-guest-meta') : `${this.t('account-rating')}: ${profile.rating}`)
                : this.t('account-profile-empty');
        }
        if (ratingValue) ratingValue.textContent = String(profile?.rating ?? 1000);
        if (pointsValue) pointsValue.textContent = String(profile?.points ?? 0);
        if (winsValue) winsValue.textContent = String(profile?.wins ?? 0);
        if (matchesValue) matchesValue.textContent = String(profile?.matchesPlayed ?? 0);
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
        const hasSession = Boolean(this.account?.getRoomAuthToken?.());
        const labelKey = hasSession ? 'account-profile' : 'account-login';
        const label = this.t(labelKey);
        button.dataset.i18n = labelKey;
        button.textContent = label;
        button.setAttribute('aria-label', label);
        button.title = label;
        button.classList.toggle('is-authenticated', hasSession);
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

        const aiInput = document.getElementById('online-ai-count');
        if (aiInput) {
            const maxAi = this.isTeamMode ? 2 : Math.max(0, this.onlinePlayerCount - 1);
            aiInput.max = String(maxAi);
            aiInput.value = String(Math.min(this.onlineAiCount, maxAi));
            this.onlineAiCount = parseInt(aiInput.value, 10) || 0;
            const summary = document.getElementById('online-player-summary');
            if (summary) {
                const humans = Math.max(1, this.onlinePlayerCount - this.onlineAiCount);
                summary.textContent = this.format('online-room-summary', { humans, bots: this.onlineAiCount, total: this.onlinePlayerCount });
            }
        }
    }

    showMultiplayerPanel(panelName) {
        document.getElementById('multi-host-ui').classList.toggle('active', panelName === 'host');
        document.getElementById('multi-join-ui').classList.toggle('active', panelName === 'join');
    }

    showStartModal(modalName) {
        this.closeReactionPicker();
        const solo = document.getElementById('solo-modal');
        const online = document.getElementById('online-modal');
        if (solo) solo.classList.toggle('active', modalName === 'solo');
        if (online) online.classList.toggle('active', modalName === 'online');
        if (!modalName) this.resetMultiplayerPanels(false);
    }

    resetMultiplayerPanels(leaveRoom = false) {
        if (leaveRoom && this.network) {
            this.network.leaveRoom();
        }
        this.showMultiplayerPanel(null);
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
        this.myHand = null;
        this.gameActive = false;
        this.showStartModal(null);
        this.resetMultiplayerPanels(false);
        document.getElementById('menu-screen').classList.remove('active');
        document.getElementById('round-end-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.remove('active');
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('start-screen').classList.add('active');
        this.setJoinStatus(reason);
        this.setHostStatus(reason);
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
                if (this.roundOver) this.startRound();
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
        document.getElementById('menu-resume').addEventListener('click', () => document.getElementById('menu-screen').classList.remove('active'));
        document.getElementById('menu-newgame').addEventListener('click', () => { document.getElementById('menu-screen').classList.remove('active'); this.startNewGame(); });
        document.getElementById('menu-quit').addEventListener('click', () => {
            document.getElementById('menu-screen').classList.remove('active');
            document.getElementById('game-screen').classList.remove('active');
            document.getElementById('start-screen').classList.add('active');
            this.showStartModal(null);
            if (this.network.isMultiplayer && this.network.room) {
                this.network.leaveRoom();
                this.myHand = null;
            }
            this.resetMultiplayerPanels(false);
        });
    }

    startNewGame() {
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

        // Single-player local game
        if (this.isTeamMode) this.playerCount = 4;
        this.playerNames = [this.playerName];
        for (let i=1;i<this.playerCount;i++) {
            this.playerNames.push(`${this.currentLang==='az'?'Komp':'AI'} ${i}`);
        }
        this.roundWins = new Array(this.playerCount).fill(0);
        this.teamScores=[0,0]; this.teamRoundWins=[0,0];
        this.matchRound=1; this.matchOver=false; this.roundOver=false; this.lastDealWinner=null;
        
        // Settings
        this.instantWinEnabled = document.getElementById('instant-win-setting').checked;
        const dlossInput = parseInt(document.getElementById('dloss-setting').value, 10);
        this.dlossThreshold = isNaN(dlossInput) ? 255 : dlossInput;

        this.ais=[]; 
        for(let i=1;i<this.playerCount;i++) {
            this.ais.push(new AIPlayer(i,this.difficulty));
        }
        console.log('[startNewGame] Starting round...');
        this.startRound();
    }
    startRound() { 
        console.log('[startRound] playerCount:', this.playerCount);
        this.roundOver=false; this.scores=new Array(this.playerCount).fill(0); if(this.isTeamMode) this.teamScores=[0,0]; this.deal=1; 
        this.startDeal(); 
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
        this.renderer.renderInfo(this.matchRound, this.deal, this.boneyard.length, this.board.getOpenEndsScore());
        
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

    setLanguage(lang) {
        const nextLang = translations[lang] ? lang : (translations[this.currentLang] ? this.currentLang : 'az');
        this.currentLang = nextLang;
        const t = translations[nextLang] || translations.az;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if (t[key]) {
                if (el.tagName === 'INPUT') el.placeholder = t[key];
                else {
                    el.textContent = t[key];
                    if (el.id === 'menu-btn') el.title = t[key];
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
    }

    t(key) {
        return translations[this.currentLang][key] || key;
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
    onNetworkReaction(payload) {
        if (!payload) return;
        this.showReactionBurst(payload.type || payload.reaction || 'spark', payload.name || '');
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
            return;
        }

        this.matchOver = data.isMatchOver;

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
        const tiles=sorted.map(m=>hand[m.tileIndex]);
        for(const m of sorted) hand.splice(m.tileIndex,1);
        const bySorted=[...matches].sort((a,b)=>b.openEndIndex-a.openEndIndex);
        let score=0;
        for(const m of bySorted){
            const tile=tiles.find(t=>t.isDouble&&t.a===this.board.openEnds[m.openEndIndex].value);
            score=this.board.placeTile(tile,m.openEndIndex);
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
        const currentScore = this.isTeamMode ? this.teamScores[this.getTeam(pi)] : this.scores[pi];
        if (currentScore >= TARGET) return 0;
        this.scores[pi]+=score; if(this.isTeamMode)this.teamScores[this.getTeam(pi)]+=score;
        this.playSound('score'); this.renderer.showScorePopup(score);
        this.broadcastMsg(`${this.playerNames[pi]} +${score}!`,2000);
        return score;
    }
    checkEnd(pi,score){
        if(this.instantWinEnabled && score>=IWIN){
            this.gameActive=false; this.playSound('win');
            if(this.isTeamMode)this.teamRoundWins[this.getTeam(pi)]+=2;else this.roundWins[pi]+=2;
            this.matchOver=true; this.renderState(); 
            setTimeout(() => this.renderer.showInstantWin(this.playerNames[pi],score), 800);
            return true;
        }
        return false;
    }

    playTile(pi,ti,oei) {
        if(this.turnInProgress) return;
        this.turnInProgress=true;
        const hand=this.hands[pi],tile=hand && hand[ti];
        if(!tile){this.turnInProgress=false;return;}
        if(!this.board.isEmpty && !this.board.openEnds[oei]){this.turnInProgress=false;return;}
        hand.splice(ti,1);
        this.playSound('place');
        let score=this.board.isEmpty?this.board.placeFirst(tile):this.board.placeTile(tile,oei);
        this.selectedTileIndex=-1;
        this.log(`Play pi=${pi} ti=${ti}`);
        this.renderState(); // Update UI immediately so animation plays
        
        if(score>0){this.addScore(pi,score);if(this.checkEnd(pi,score))return;}
        if(hand.length===0){ setTimeout(()=>this.endDeal(pi,false), 400); return;}
        if(this.board.isBlocked(this.hands,this.boneyard)){ setTimeout(()=>this.endDeal(this.findFishWinner(),true), 400); return;}
        
        // Short delay for animation to finish before next turn
        setTimeout(() => {
            this.turnInProgress=false;
            this.advanceTurn();
        }, 300);
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
            const move = ai.chooseMove(this.board, hand, moves, this.scores, this.hands, this.boneyard);
            
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
        this.renderer.renderRoundEnd(this.playerNames[wi],displayEntities,wins,this.matchRound,this.matchOver);this.matchRound++;
    }
    showMatchResult(){
        if(this.isTeamMode){
            const w=this.teamRoundWins[0]>=this.teamRoundWins[1]?0:1;
            this.renderer.renderGameOver(w===0?`${this.playerNames[0]} & ${this.playerNames[2]}`:`${this.playerNames[1]} & ${this.playerNames[3]}`,[{name:this.t('team-a'),roundWins:this.teamRoundWins[0]},{name:this.t('team-b'),roundWins:this.teamRoundWins[1]}]);
            void this.recordLocalMatchResult(w);
        }
        else{
            let w=0,mx=0;for(let i=0;i<this.playerCount;i++)if(this.roundWins[i]>mx){mx=this.roundWins[i];w=i;}
            this.renderer.renderGameOver(this.playerNames[w],this.playerNames.map((n,i)=>({name:n,roundWins:this.roundWins[i]})));
            void this.recordLocalMatchResult(w);
        }
    }

    async recordLocalMatchResult(winnerIndex) {
        if (this.network.isMultiplayer) return;
        if (!this.account?.storedToken) return;
        try {
            const participants = this.playerNames.map((name, index) => ({
                isSelf: index === this.humanPlayerIndex,
                name,
                teamIndex: this.isTeamMode ? (index % 2) : null,
                winnerKey: this.isTeamMode ? `team:${winnerIndex}` : `player:${winnerIndex}`,
                points: this.isTeamMode ? (this.teamScores[index % 2] || 0) : (this.scores[index] || 0),
                roundWins: this.isTeamMode ? (this.teamRoundWins[index % 2] || 0) : (this.roundWins[index] || 0)
            }));
            await this.account.recordMatch({
                mode: this.isTeamMode ? 'team' : 'solo',
                isTeamMode: this.isTeamMode,
                winnerKey: this.isTeamMode ? `team:${winnerIndex}` : `player:${winnerIndex}`,
                participants
            });
        } catch (err) {
            console.warn('[Account] Failed to record local match:', err);
        }
    }
}
const game=new DominoGame();

// Re-render board on resize for correct scaling (no network sync needed)
window.addEventListener('resize', () => {
    if (game.gameActive) game.renderState(false);
});
