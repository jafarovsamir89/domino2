import {test,expect} from './fixtures.mjs';
for(const asset of ['', '/www'])for(const language of ['ru','az','en']){
 test(`rewarded panel ${asset||'root'} ${language}: close, delayed credit, no duplicate playback`,async({page},testInfo)=>{
  await page.route('**/api/**',route=>route.fulfill({json:{}}));
  await page.goto(`${asset}/index.html`);
  await page.waitForFunction(()=>Boolean(window.game?.account));
  await page.evaluate(async language=>{
   const {translations}=await import('./js/translations.js');
   const game=window.game;game.stopDailyBonusTicker();game.disposeDailyRewardedPanel();
   game.hasAuthenticatedAccount=()=>true;game.accountProfile={id:'synthetic-local-panel',coins:200};
   game.t=key=>translations[language][key]||key;
   game.syncStartAuthButton=()=>{};game.renderAccountModal=()=>{};
   const status={rewardedFlowVersion:'owner_8day_v1',rewardedAvailable:true,claimedToday:true,doubleClaimAvailable:true,canClaim:false,todayReward:200,streakDay:1,maxStreak:1};
   window.panelFixture={issue:0,bind:0,show:0,cancel:0,state:'pending',failWallet:false};
   const fixture=window.panelFixture,id='b'.repeat(64);
   const record=()=>({attemptId:id,state:fixture.state,claimDate:'2026-10-25',baseReward:200,expiresAt:new Date(Date.now()+600000).toISOString(),settlementDeadline:new Date(Date.now()+8*86400000).toISOString()});
   window.__dominoRewardedAdProvider={bindAttempt:async({attemptId})=>{fixture.bind++;return {bound:true,attemptId};},show:async()=>{fixture.show++;return {completed:true};}};
   game.account.getDailyBonusStatus=async()=>{if(fixture.failWallet)throw Error('local_fixture_unavailable');return {dailyBonus:status,wallet:{balance:fixture.state==='credited'?400:200}};};
   game.account.platformRequest=async(path,options)=>{
    if(path.endsWith('/recovery'))return {flowVersion:'owner_8day_v1',canStart:fixture.issue===0,attempts:fixture.issue?[record()]:[]};
    if(path.endsWith('/cancel')){fixture.cancel++;throw Error('unexpected_cancel');}
    if(path.endsWith('/attempt')&&options?.method==='POST'){fixture.issue++;return {attemptId:id,expiresAt:new Date(Date.now()+600000).toISOString()};}
    return record();
   };
   game.authResolved=true;game.syncStartAuthGate();
   game.dailyBonusState={status};game.renderDailyBonusCard();
  },language);
  const panel=page.locator('#daily-rewarded-panel');
  await expect(panel).toBeHidden(); // Real production flag remains disabled.
  if(!asset&&language==='ru'){
   await page.evaluate(()=>{window.game.isRewardedAdsEnabled=()=>true;delete window.game.dailyBonusState.status.rewardedFlowVersion;window.game.renderDailyBonusCard();});
   await expect(panel).toBeHidden();expect(await page.evaluate(()=>window.game._dailyRewardedFlow||null)).toBeNull();
   await page.evaluate(()=>{window.game.dailyBonusState.status.rewardedFlowVersion='owner_8day_v1';});
  }
  await page.evaluate(()=>{window.game.isRewardedAdsEnabled=()=>true;window.game.renderDailyBonusCard();});
  const buttons=panel.locator('button');
  await expect(panel).toBeVisible();
  expect(await page.evaluate(()=>window.panelFixture.issue)).toBe(0);
  await buttons.nth(0).click();
  await expect(buttons.nth(1)).toBeEnabled();
  expect(await page.evaluate(()=>window.game.accountProfile.coins)).toBe(200);
  await buttons.nth(2).click();await expect(panel.locator('p')).toBeHidden();
  expect(await page.evaluate(()=>window.panelFixture.cancel)).toBe(0);
  await buttons.nth(1).click();await expect(panel.locator('p')).toBeVisible();
  await expect(buttons.nth(1)).toBeEnabled();
  if(!asset&&language==='ru')await panel.screenshot({path:testInfo.outputPath('panel-pending.png')});
  await page.evaluate(()=>{window.panelFixture.state='credited';window.panelFixture.failWallet=true;});
  await buttons.nth(1).click();
  await expect.poll(()=>page.evaluate(()=>window.game._dailyRewardedPanel.syncFailed)).toBe(true);
  expect(await page.evaluate(()=>window.game.accountProfile.coins)).toBe(200);
  await page.evaluate(()=>{window.panelFixture.failWallet=false;});
  await buttons.nth(1).click();
  await expect.poll(()=>page.evaluate(()=>window.game.accountProfile.coins)).toBe(400);
  await expect.poll(()=>page.evaluate(()=>window.game._dailyRewardedPanel.syncFailed)).toBe(false);
  await buttons.nth(1).click();
  expect(await page.evaluate(()=>({issue:window.panelFixture.issue,bind:window.panelFixture.bind,show:window.panelFixture.show,cancel:window.panelFixture.cancel}))).toEqual({issue:1,bind:1,show:1,cancel:0});
  if(!asset&&language==='ru')await panel.screenshot({path:testInfo.outputPath('panel-credited.png')});
  await page.evaluate(()=>{window.game._rewardedLogoutPending=true;window.game.renderDailyBonusCard();});
  await expect(panel).toBeHidden();expect(await page.evaluate(()=>window.game._dailyRewardedFlow)).toBeNull();
 });
}
test('rewarded panel review fixture: expiry preserves regular bonus',async({page})=>{
 await page.route('**/review/rewarded-panel-fixture.js',async route=>{
  const response=await route.fetch({url:route.request().url().replace('/review/','/docs/remediation/review/')});await route.fulfill({response});
 });
 await page.goto('/docs/remediation/review/rewarded-panel.html');
 const panel=page.locator('#daily-rewarded-panel'),buttons=panel.locator('button');
 await buttons.nth(0).click();await expect(buttons.nth(1)).toBeEnabled();
 await page.locator('#fixture-expire').click();await buttons.nth(1).click();
 await expect(panel.locator('p')).toContainText('Срок ожидания истёк');
 await expect(page.locator('#fixture-wallet')).toContainText('200');
});
