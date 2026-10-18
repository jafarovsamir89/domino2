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
}
