const test=require('node:test'),assert=require('node:assert/strict');
const {loadGame}=require('./helpers/client-game.cjs');
for(const asset of ['js/app.js','www/js/app.js']){
 for(const capability of [false,undefined]){
  test(`${asset}: absent/disabled server ad capability prevents showing an ad`,async()=>{
   let shown=0;const game=loadGame(asset,{window:{__dominoRewardedAdProvider:{show:async()=>{shown++;return {completed:true};}}}});
   game.isRewardedAdsEnabled=()=>true;game.dailyBonusState={status:{rewardedAvailable:capability}};game.t=k=>k;game.renderDailyBonusCard=()=>{};
   assert.equal(game.getDailyBonusRewardedAdProvider(),null);const result=await game.showRewardedAdForDailyBonus();assert.equal(result.completed,false);assert.equal(shown,0);
  });
 }
 test(`${asset}: ambiguous or failed ad responses never trigger a rewarded claim`,async()=>{
  for(const response of [undefined,null,true,{}, {completed:false}, {rewarded:true}, {completed:true,error:'no_fill'}]){
   let claimed=0;const game=loadGame(asset,{window:{__dominoRewardedAdProvider:{show:async()=>response}}});
   game.isRewardedAdsEnabled=()=>true;game.dailyBonusState={status:{rewardedAvailable:true}};game.t=k=>k;game.renderDailyBonusCard=()=>{};
   game.account={claimDailyBonus:async()=>{claimed++;return {ok:false,reason:'already_claimed'};}};
   await game.claimDailyBonus('rewarded_x2');
   assert.equal(claimed,0,`ambiguous response ${JSON.stringify(response)} must not become completion`);
   assert.equal(game.dailyBonusState.rewardedAdCompletedAt||0,0);
  }
 });
 test(`${asset}: explicit ad completion is only a playback result; cancellation wins over completion`,async()=>{
  for(const response of [{completed:true},{completed:true,cancelled:true},{completed:true,dismissed:true}]){
   const game=loadGame(asset,{window:{__dominoRewardedAdProvider:{show:async()=>response}}});
   game.isRewardedAdsEnabled=()=>true;game.dailyBonusState={status:{rewardedAvailable:true}};game.t=k=>k;game.renderDailyBonusCard=()=>{};
   const result=await game.showRewardedAdForDailyBonus();
   assert.equal(result.completed,!response.cancelled&&!response.dismissed);
   assert.equal(result.cancelled,Boolean(response.cancelled||response.dismissed));
  }
 });
}
