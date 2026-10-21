import fs from 'node:fs';
import { test, expect } from './fixtures.mjs';
import { translations } from '../js/translations.js';

const usedKeys = new Set(['index.html', 'js/app.js', 'js/renderer.js', 'js/voice.js'].flatMap(file =>
  [...fs.readFileSync(file, 'utf8').matchAll(/(?:data-i18n="|data-i18n-aria="|(?:this(?:\.app)?|game)\.(?:t|format)\(['"])([^'"\n)]+)['"]/g)].map(match => match[1])));

for (const lang of ['az', 'ru', 'en']) {
  test(`${lang}: every literal UI translation key exists`, () => {
    expect([...usedKeys].filter(key => !translations[lang][key])).toEqual([]);
  });
  for (const prefix of ['', 'www/']) {
    test(`${prefix}${lang}: late-created social UI, names and plurals fit a narrow screen`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 740 });
      await page.addInitScript(lang => {
        localStorage.setItem('domino-lang', lang);
        localStorage.setItem('dominoDebugLogs', 'false');
        const original = fetch.bind(window);
        window.fetch = async (input, init) => {
          const url = String(input?.url || input);
          if (!url.includes('/api/')) return original(input, init);
          const profile = { token: 'synthetic-locale', user: { id: 'locale-u', name: 'Synthetic' }, player: { id: 'locale-p', displayName: 'Synthetic', isGuest: false }, wallet: { balance: 1000, reserved: 0 } };
          return new Response(JSON.stringify(url.includes('/platform/game-token') ? profile : { items: [], incoming: [], sent: [], accepted: [], unreadCount: 0, counts: {} }), { headers: { 'content-type': 'application/json' } });
        };
      }, lang);
      await page.goto('/' + prefix + 'index.html');
      await expect.poll(() => page.evaluate(() => window.game?.authResolved)).toBe(true);
      await page.locator('#open-social-btn').click();
      await page.locator('#social-tab-mail-btn').click();
      await page.evaluate(async lang => {
        await game._inboxLoadInFlight;
        game.stopSocialHubAutoRefresh();
        game.stopGameInviteRefresh();
        game.setLanguage(lang, { persist: true });
        game.socialInboxState = { loading: false, error: '', unreadCount: 1, threads: [], items: [{ id: 'synthetic-reward', type: 'reward', status: 'unread', body: '123', createdAt: new Date().toISOString() }] };
        game.renderSocialInboxPanel();
      }, lang);
      await expect(page.locator('.social-mail-section-kicker')).toHaveText(translations[lang]['system-mail-section']);
      await expect(page.locator('.social-mail-section-kicker')).toBeVisible();
      const card = await page.locator('.system-mail-card').boundingBox();
      for (const action of await page.locator('.system-mail-card .friend-card-actions button').all()) {
        const box = await action.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(card.x);
        expect(box.x + box.width).toBeLessThanOrEqual(Math.min(card.x + card.width, 320) + 1);
      }
      const title = await page.locator('#social-center-modal-title').boundingBox();
      const controls = await page.locator('.social-hub-header-right').boundingBox();
      expect(title.y + title.height).toBeLessThanOrEqual(controls.y + 1);
      await expect(page.locator('#start-lang-select')).toHaveAttribute('aria-label', translations[lang]['language-label']);
      await expect(page.locator('#chat-voice-record-btn')).toHaveAttribute('aria-label', translations[lang]['chat-voice']);
      await expect(page.locator('.voice-record-cancel')).toHaveText(translations[lang]['invite-cancel']);
      const plurals = await page.evaluate(() => [1, 2, 5, 11, 21].map(count => game.format('messages-thread-count', { count })));
      expect(plurals).toEqual(lang === 'ru' ? ['1 диалог', '2 диалога', '5 диалогов', '11 диалогов', '21 диалог']
        : lang === 'en' ? ['1 conversation', '2 conversations', '5 conversations', '11 conversations', '21 conversations']
        : ['1 söhbət', '2 söhbət', '5 söhbət', '11 söhbət', '21 söhbət']);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (!prefix) await page.screenshot({ path: `docs/remediation/evidence/session-038/social-${lang}-320.png` });
    });
  }
}
