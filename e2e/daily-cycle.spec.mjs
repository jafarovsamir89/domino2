import { test, expect } from './fixtures.mjs';

for (const prefix of ['', 'www/']) test(`${prefix}daily cycle rolls the card from claimed day 7 to claimable day 1`, async ({ page }, testInfo) => {
  await page.route('**/api/**', route => route.fulfill({ json: { user: null, items: [], incoming: [], sent: [], accepted: [], counts: {} } }));
  await page.goto(`/${prefix}index.html`);
  await page.waitForFunction(() => window.game?.authResolved);
  await page.evaluate(() => {
    game.hasAuthenticatedAccount = () => true;
    game.accountProfile = { id: 'synthetic-cycle-ui', displayName: 'Synthetic', coins: 6050 };
    game.authResolved = true; game.syncStartAuthGate(); game.setLanguage('ru');
    game.dailyBonusState = { loading: false, claiming: false, error: '', status: {
      claimedToday: true, canClaim: false, streakDay: 7, maxStreak: 7,
      todayAmount: 2000, tomorrowAmount: 200, streakPolicy: 'cycle', rewardedAvailable: false,
      rewardSchedule: [200, 300, 350, 400, 800, 1000, 2000].map((amount, i) => ({ day: i + 1, amount }))
    } };
    game.renderDailyBonusCard();
  });
  const card = page.locator('#daily-bonus-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.daily-bonus-day-box')).toHaveCount(7);
  await expect(card.locator('.daily-bonus-day-box').last()).toContainText('+2000');
  await expect(page.locator('#daily-bonus-amount')).toHaveText('+2000');
  await expect(card.locator('.daily-bonus-day-box.is-claimed')).toHaveCount(7);
  await expect(page.locator('#daily-bonus-claim-btn')).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('day-7.png') });
  await page.evaluate(() => {
    Object.assign(game.dailyBonusState.status, { claimedToday: false, canClaim: true, streakDay: 1, todayAmount: 200, tomorrowAmount: 300 });
    game.renderDailyBonusCard();
  });
  await expect(card.locator('.daily-bonus-day-box').first()).toContainText('+200');
  await expect(page.locator('#daily-bonus-amount')).toHaveText('+200');
  await expect(card.locator('.daily-bonus-day-box.is-claimed')).toHaveCount(0);
  await expect(card.locator('.daily-bonus-day-box.is-active')).toHaveCount(1);
  await expect(card.locator('.daily-bonus-day-box').first()).toHaveClass(/is-active/);
  await expect(page.locator('#daily-bonus-claim-btn')).toBeEnabled();
  await expect(page.locator('#daily-bonus-rewarded-btn')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('day-1.png') });
  // The new field is optional to old clients: the existing status fields still render.
  await page.evaluate(() => { delete game.dailyBonusState.status.streakPolicy; game.renderDailyBonusCard(); });
  await expect(page.locator('#daily-bonus-amount')).toHaveText('+200');
  await expect(page.locator('#daily-bonus-claim-btn')).toBeEnabled();
});
