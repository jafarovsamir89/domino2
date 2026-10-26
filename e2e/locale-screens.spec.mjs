import { test, expect } from './fixtures.mjs';
import { translations } from '../js/translations.js';

for (const prefix of ['', 'www/']) for (const language of ['az', 'ru', 'en']) {
  test(`${prefix}${language}: existing profile and support forms survive a language switch`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.route('**/api/**', route => route.fulfill({ json: { user: null, items: [], incoming: [], sent: [], accepted: [], unreadCount: 0, counts: {} } }));
    await page.addInitScript(() => localStorage.setItem('domino-lang', 'en'));
    await page.goto(`/${prefix}index.html`);
    await page.waitForFunction(() => window.game?.authResolved);
    await page.evaluate(() => {
      game.hasAuthenticatedAccount = () => true;
      game.accountProfile = { id: 'synthetic-locale-owner', displayName: 'Synthetic', coins: 1000, rating: 1000 };
      game.accountDetails = { player: game.accountProfile, matches: [] };
      game.authResolved = true;
      game.syncStartAuthGate();
      game.loadAccountProfile = async () => game.accountDetails;
      game.loadTableSkinShop = async () => null;
      game.loadGiftHub = async () => null;
    });
    await page.locator('#account-btn').click();
    await expect(page.locator('#account-modal')).toHaveClass(/active/);
    await page.evaluate(language => game.setLanguage(language), language);
    await expect(page.locator('#account-edit-name-btn')).toHaveAttribute('aria-label', translations[language]['account-edit-name']);
    await expect(page.locator('#account-logout-btn')).toHaveAttribute('aria-label', translations[language]['account-logout']);
    await expect(page.locator('#account-edit-avatar-btn')).toHaveAttribute('aria-label', translations[language]['account-edit-avatar']);
    await expect(page.locator('.account-delete-request-link')).toHaveText(translations[language]['account-delete-request']);
    await page.screenshot({ path: testInfo.outputPath('profile.png') });
    await page.locator('#account-modal-close').click();
    await page.locator('#open-solo-modal-btn').click();
    await expect(page.locator('#solo-modal-close')).toHaveAttribute('aria-label', translations[language]['modal-close']);
    await page.locator('#solo-modal-close').click();
    await page.evaluate(() => { game.showStartModal('online'); game.showOnlineLanding(); });
    await expect(page.locator('#online-modal-close')).toHaveAttribute('aria-label', translations[language]['modal-close']);
    await expect(page.locator('.mode-switcher')).toHaveAttribute('aria-label', translations[language]['label-mode']);
    const counts = await page.evaluate(language => {
      game.setLanguage(language);
      return [1, 2, 5].map(count => [game.format('room-human-count', { count }), game.format('room-bot-count', { count })]);
    }, language);
    expect(counts).toEqual({
      az: [['1 oyunçu', '1 bot'], ['2 oyunçu', '2 bot'], ['5 oyunçu', '5 bot']],
      ru: [['1 игрок', '1 бот'], ['2 игрока', '2 бота'], ['5 игроков', '5 ботов']],
      en: [['1 player', '1 bot'], ['2 players', '2 bots'], ['5 players', '5 bots']]
    }[language]);
    await page.evaluate(() => { game.closeStartModals(); game.setLanguage('en'); game.openFeedbackModal(); });
    await page.locator('#feedback-modal-message').fill('Synthetic draft: do not replace or submit');
    await page.evaluate(language => game.setLanguage(language), language);
    await expect(page.locator('#feedback-modal-message')).toHaveValue('Synthetic draft: do not replace or submit');
    await expect(page.locator('#feedback-modal-message')).toHaveAttribute('placeholder', translations[language]['feedback-message-placeholder']);
    await expect(page.locator('#social-feedback-close')).toHaveAttribute('aria-label', translations[language]['modal-close']);
    await page.screenshot({ path: testInfo.outputPath('feedback.png') });
    await page.evaluate(() => { game.closeFeedbackModal(); game.setLanguage('en'); game.openPlayerReportModal({ id: 'synthetic-other', displayName: 'Synthetic Other' }); });
    await page.evaluate(language => game.setLanguage(language), language);
    await expect(page.locator('#player-report-message')).toHaveAttribute('placeholder', translations[language]['player-report-message-placeholder']);
    await expect(page.locator('#player-report-close')).toHaveAttribute('aria-label', translations[language]['modal-close']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('report.png') });
  });
}

for (const prefix of ['', 'www/']) for (const language of ['az', 'ru', 'en']) {
  test(`${prefix}${language}: main screen sweep at 320px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.addInitScript(language => {
      localStorage.setItem('domino-lang', language);
      window.DOMINO_ENDPOINTS = { API_BASE: 'http://127.0.0.1:4173/api', GAME_HTTP_BASE: 'http://127.0.0.1:4173', GAME_WS_URL: 'ws://127.0.0.1:4173' };
    }, language);
    await page.route('**/api/**', route => route.fulfill({ json: { user: null, items: [], incoming: [], sent: [], accepted: [], unreadCount: 0, counts: {} } }));
    await page.goto(`/${prefix}index.html`);
    await page.waitForFunction(() => window.game?.authResolved);
    await page.evaluate(async prefix => {
      const { translations } = await import('/' + prefix + 'js/translations.js');
      const original = game.t.bind(game); window.localeMissingKeys = [];
      game.t = key => { if (key && !translations[game.currentLang]?.[key]) window.localeMissingKeys.push(key); return original(key); };
      game.hasAuthenticatedAccount = () => true;
      game.accountProfile = { id: 'synthetic-sweep-owner', displayName: 'Synthetic', coins: 1000, rating: 1000 };
      game.accountDetails = { player: game.accountProfile, wallet: { balance: 1000, reserved: 0 }, matches: [] };
      game.loadAccountProfile = async () => game.accountDetails;
      game.authResolved = true; game.syncStartAuthGate(); game.syncStartAuthButton();
    }, prefix);
    const screens = [
      ['start', 'setLanguage', language, '#start-screen'],
      ['solo', 'showStartModal', 'solo', '#solo-modal'],
      ['online', 'showStartModal', 'online', '#online-modal'],
      ['create-room', 'showOnlineCreateFlow', 'closed', '#online-modal'],
      ['join-room', 'showOnlineJoinFlow', null, '#online-modal'],
      ['open-rooms', 'showOpenRoomsModal', null, '#open-rooms-modal'],
      ['leaderboard', 'openLeaderboardModal', null, '#leaderboard-modal'],
      ['coins', 'openCoinShopModal', null, '#coin-shop-modal'],
      ['cosmetics', 'openCosmeticsShopModal', null, '#cosmetics-shop-modal'],
      ['friends', 'openSocialCenterModal', 'friends', '#social-center-modal'],
      ['mail', 'openSocialCenterModal', 'inbox', '#social-center-modal']
    ];
    for (const [name, method, argument, selector] of screens) {
      await page.evaluate(async ({ method, argument, language }) => {
        game.closeStartModals(); game.closeSocialCenterModal(); game.closeCoinShopModal(); game.closeCosmeticsShopModal(); game.closeLeaderboardModal();
        if (method === 'showOnlineCreateFlow' || method === 'showOnlineJoinFlow') game.showStartModal('online');
        await game[method](argument);
        game.stopSocialHubAutoRefresh(); game.stopGameInviteRefresh();
        game.setLanguage(language);
      }, { method, argument, language });
      await expect(page.locator(selector)).toBeVisible();
      const clipped = await page.locator(`${selector} .account-modal-title-wrap h2, ${selector} .start-top-shop-label`).evaluateAll(elements =>
        elements.filter(el => el.getClientRects().length && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)).map(el => el.textContent));
      expect(clipped, `${name}: translated titles and shop labels must remain readable`).toEqual([]);

      if (language !== 'en') for (const aria of ['Close', 'Edit name', 'Language', 'Game mode', 'Player profile actions']) {
        expect(await page.locator(`${selector} [aria-label="${aria}"]`).filter({ visible: true }).count(), `${name}: untranslated accessible name ${aria}`).toBe(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
    }
    await page.evaluate(() => { game.closeSocialCenterModal(); game.closeStartModals(); });
    await expect(page.locator('.start-screen-copyright')).toHaveText(translations[language]['screen-copyright']);
    await page.locator('#open-solo-modal-btn').click();
    await page.locator('#player-name').fill('Synthetic'); await page.locator('#start-game-btn').click();
    await expect(page.locator('#game-screen')).toHaveClass(/active/);
    await page.locator('#menu-btn').click();
    await expect(page.locator('#player-hand')).toHaveAttribute('aria-label', translations[language]['accessibility-your-hand']);
    await expect(page.locator('#menu-resume')).toHaveText(translations[language]['menu-resume']);
    await page.screenshot({ path: testInfo.outputPath('game-pause.png') });
    const missing = await page.evaluate(() => [...new Set(window.localeMissingKeys)]);
    expect(missing).toEqual([]);
    await testInfo.attach('screen-sweep', { body: JSON.stringify({ language, prefix, screens: [...screens.map(s => s[0]), 'game-pause'], missing }), contentType: 'application/json' });
  });
}
