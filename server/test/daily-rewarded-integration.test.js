const test=require('node:test'),assert=require('node:assert/strict');
const {loadGame}=require('./helpers/client-game.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
for(const asset of ['js/app.js','www/js/app.js']){
 const setup=()=>{
  const game=loadGame(asset);game.accountProfile={id:'synthetic-a',coins:200};
  game.account={getPlatformAuthToken:()=> 'local-session'};game.hasAuthenticatedAccount=()=>true;
  game.dailyBonusState={status:null};game.t=k=>k;
  for(const name of ['renderDailyBonusCard','syncStartAuthButton','renderAccountModal','startDailyBonusTicker','stopDailyBonusTicker'])game[name]=()=>{};
  return game;
 };
 test(`${asset}: owner flow cannot call the legacy rewarded claim`,async()=>{
  const game=setup();game.dailyBonusState.status={rewardedFlowVersion:'owner_8day_v1'};
  game.account.claimDailyBonus=()=>assert.fail('legacy claim called');
  game.showRewardedAdForDailyBonus=()=>assert.fail('legacy playback called');
  await game.claimDailyBonus('rewarded_x2');
 });
 test(`${asset}: old status response cannot overwrite another account`,async()=>{
  const game=setup(),pending=deferred();game.account.getDailyBonusStatus=()=>pending.promise;
  const operation=game.loadDailyBonusStatus();game.accountProfile={id:'synthetic-b',coins:17};
  game.dailyBonusState={status:{marker:'new-account'},loading:true};
  pending.resolve({wallet:{balance:400},dailyBonus:{marker:'old-account'}});await operation;
  assert.equal(game.accountProfile.coins,17);assert.equal(game.dailyBonusState.status.marker,'new-account');assert.equal(game.dailyBonusState.loading,true);
 });
 test(`${asset}: logout epoch rejects late claim even on same account`,async()=>{
  const game=setup(),pending=deferred();game.account.claimDailyBonus=()=>pending.promise;
  const operation=game.claimDailyBonus('normal');game._dailyBonusAccountEpoch=1;
  game.dailyBonusState={status:{marker:'new-session'},claiming:true};
  pending.resolve({ok:true,wallet:{balance:400},dailyBonus:{marker:'old-session'}});await operation;
  assert.equal(game.accountProfile.coins,200);assert.equal(game.dailyBonusState.status.marker,'new-session');assert.equal(game.dailyBonusState.claiming,true);
 });
 test(`${asset}: latest status request wins`,async()=>{
  const game=setup(),first=deferred(),second=deferred();let count=0;
  game.account.getDailyBonusStatus=()=>++count===1?first.promise:second.promise;
  const a=game.loadDailyBonusStatus(),b=game.loadDailyBonusStatus();
  second.resolve({wallet:{balance:400},dailyBonus:{marker:'latest'}});await b;
  first.resolve({wallet:{balance:200},dailyBonus:{marker:'stale'}});await a;
  assert.equal(game.accountProfile.coins,400);assert.equal(game.dailyBonusState.status.marker,'latest');assert.equal(game.dailyBonusState.loading,false);
 });
}
