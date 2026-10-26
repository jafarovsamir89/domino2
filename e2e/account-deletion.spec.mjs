import { test, expect } from './fixtures.mjs';
import { translations } from '../js/translations.js';

const caps = { available: true, policyVersion: 'owner30_v1', confirmation: 'session-version-v1', waitingDays: 30, backupDaysAfterDeletion: 30, cancellation: 'explicit' };
async function setup(page, language, options = {}) {
  const fixture = { authenticated: true, state: 'none', account: 'synthetic-owner', version: 0, posts: [], reads: 0, ...options };
  await page.addInitScript(({ language, native }) => {
    localStorage.setItem('domino-lang', language);
    window.DOMINO_ENDPOINTS = { API_BASE: 'http://127.0.0.1:4173/api' };
    if (native) window.Capacitor = { isNativePlatform: () => true };
  }, { language, native: options.native });
  const record = () => ({ state: fixture.state, accountLabel: fixture.account + '@example.invalid', canCancel: fixture.state === 'pending', deleteAfter: '2026-11-26T12:00:00.000Z', confirmationToken: `synthetic-request-${fixture.account}-${fixture.version}`, cancelConfirmationToken: `synthetic-cancel-${fixture.account}-${fixture.version}` });
  await page.route('**/api/account/deletion**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path.endsWith('/capabilities')) return route.fulfill({ status: options.oldBackend ? 404 : 200, json: options.capabilities || caps });
    if (!fixture.authenticated) return route.fulfill({ status: 401, json: { message: 'Unauthorized' } });
    if (req.method() === 'GET') { fixture.reads++; return route.fulfill({ json: record() }); }
    const body = req.postDataJSON(), cancel = path.endsWith('/cancel'); fixture.posts.push({ path, body });
    if (body.confirmationToken !== (cancel ? record().cancelConfirmationToken : record().confirmationToken)) return route.fulfill({ status: 403, json: { message: 'account_changed_refresh_required' } });
    fixture.state = cancel ? 'none' : 'pending'; fixture.version++;
    const response = record();
    if (!cancel) { fixture.authenticated = false; response.canCancel = false; }
    await route.fulfill({ status: 201, json: response });
  });
  return fixture;
}

for (const prefix of ['', 'www/']) for (const language of ['az', 'ru', 'en']) {
  test(`${prefix}${language}: deletion requires typed confirmation; fresh login and explicit cancel`, async ({ page }, testInfo) => {
    const f = await setup(page, language);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/${prefix}delete-account.html#request`);
    await expect(page.locator('#account-deletion-management')).toBeVisible();
    await expect(page.locator('#deletion-status')).toHaveText(translations[language]['deletion-none']);
    await expect(page.locator('#request')).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('[data-deletion-legacy]:visible')).toHaveCount(0);
    await expect(page.locator('[data-deletion-i18n=deletion-privacy-link]')).toHaveText(translations[language]['deletion-privacy-link']);
    await expect(page.locator('#deletion-account')).toContainText('synthetic-owner@example.invalid');
    const input = page.locator('#deletion-confirm'), request = page.locator('#deletion-request');
    await expect(request).toBeDisabled();
    await input.fill('delete'); await expect(request).toBeDisabled();
    await input.fill('DELETE'); await expect(request).toBeEnabled();
    expect(f.posts).toHaveLength(0);
    await request.click();
    await expect(page.locator('#deletion-status')).toContainText(translations[language]['deletion-pending'].split('{date}')[0]);
    await expect(page.locator('#deletion-login')).toBeVisible();
    await expect(page.locator('#deletion-cancel')).toBeHidden();
    expect(f.posts).toHaveLength(1);
    expect(f.posts[0].body).toEqual({ confirm: 'DELETE', confirmationToken: 'synthetic-request-synthetic-owner-0' });
    await page.locator('#deletion-check').click(); // Status only; unauthenticated reply is not an automatic cancellation.
    expect(f.posts).toHaveLength(1);
    f.authenticated = true;
    await page.locator('#deletion-check').click();
    await expect(page.locator('#deletion-cancel')).toBeVisible();
    expect(f.state).toBe('pending'); expect(f.posts).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath('pending.png') });
    await page.locator('#deletion-cancel').click();
    await expect(page.locator('#deletion-status')).toHaveText(translations[language]['deletion-none']);
    expect(f.posts).toHaveLength(2);
    expect(f.posts[1].body.confirm).toBe('CANCEL_DELETION');
    await expect(request).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('cancelled.png') });
  });
}

test('old or incompatible backend keeps email request visible and never exposes new deletion actions', async ({ page }) => {
  await setup(page, 'ru', { capabilities: { ...caps, waitingDays: 31 } });
  await page.goto('/delete-account.html');
  await expect(page.locator('#request')).toBeVisible();
  await expect(page.locator('#account-deletion-management')).toBeHidden();
});

test('native WebView offers the canonical website and never starts local OAuth or deletion', async ({ page }) => {
  const f = await setup(page, 'ru', { native: true });
  await page.goto('/delete-account.html');
  await expect(page.locator('#deletion-browser-link')).toBeVisible();
  await expect(page.locator('#deletion-browser-link')).toHaveAttribute('href', 'https://gamed.simplesoft.az/delete-account.html#request');
  await expect(page.locator('#deletion-login')).toBeHidden();
  await expect(page.locator('#deletion-request')).toBeHidden();
  expect(f.posts).toHaveLength(0); expect(f.reads).toBe(0);
});

test('changing the observed account clears previously typed deletion confirmation', async ({ page }) => {
  const f = await setup(page, 'ru');
  await page.goto('/delete-account.html');
  await expect(page.locator('#deletion-status')).toHaveText(translations.ru['deletion-none']);
  await page.locator('#deletion-confirm').fill('DELETE');
  f.account = 'synthetic-other-owner';
  await page.locator('#deletion-check').click();
  await expect(page.locator('#deletion-account')).toContainText('synthetic-other-owner@example.invalid');
  await expect(page.locator('#deletion-confirm')).toHaveValue('');
  await expect(page.locator('#deletion-request')).toBeDisabled();
  expect(f.posts).toHaveLength(0);
});
