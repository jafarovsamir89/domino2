const test=require('node:test'),assert=require('node:assert/strict');
const {loadGame}=require('./helpers/client-game.cjs');
function makeGame(asset){const game=loadGame(asset);Object.assign(game,{network:{isMultiplayer:true,room:{roomId:'receipt-room',sessionId:'s0'}},onlineEconomyMode:'coins',accountDetails:{user:{id:'my-user'}},currentRoomState:{roomCode:'CODE'},hands:[],boneyard:[],board:null,cloneMatchRuleState:x=>x});game.resetOnlineCoinSummary();return game;}
function economy(name,returned,winnings){return {receiptVersion:1,roomId:'receipt-room',matchId:name,stakeAmount:200,reservations:[{receiptVersion:1,settlementId:`${name}:my-player`,userId:'my-user',playerId:'my-player',stakeAmount:200,returnedStake:returned,winnings,net:returned+winnings-200,payout:returned===200&&winnings===0?200:winnings}]};}
const {renderSummary}=require('./helpers/client-renderer.cjs');
for(const asset of ['js/app.js','www/js/app.js']){
 for(const [name,returned,winnings,expected] of [['win',200,180,180],['loss',0,0,-200],['draw',200,0,0],['refund',200,0,0],['team-win',200,180,180],['zero-profit-win',200,0,0]]){
  test(`${asset}: ${name} summary uses actual loss/profit and ignores repeated settlement`,()=>{
   const game=makeGame(asset),payload=economy(name,returned,winnings);game.applyOnlineEconomySettlement(payload);
   assert.equal(game.onlineCoinSummary.won-game.onlineCoinSummary.spent,expected);assert.equal(game.onlineCoinSummary.returned,returned);assert.equal(game.onlineCoinSummary.won,winnings);
   const once=JSON.stringify(game.onlineCoinSummary);game.applyOnlineEconomySettlement(JSON.parse(JSON.stringify(payload)));assert.equal(JSON.stringify(game.onlineCoinSummary),once);
   assert(renderSummary(asset,game.onlineCoinSummary).endsWith(`summary-net: ${expected>=0?'+':''}${expected}`));
  });
 }
 test(`${asset}: unrelated room or unknown owner is ignored, and incomplete totals stay hidden`,()=>{
  const game=makeGame(asset),other=economy('other',200,180);other.roomId='another-room';
  assert.equal(game.applyOnlineEconomySettlement(other),false);assert.equal(game.getOnlineCoinSummaryForDisplay(),null);
  game.accountDetails={};assert.equal(game.applyOnlineEconomySettlement(economy('no-owner',200,180)),false);
  game.accountDetails={user:{id:'my-user'}};game.applyOnlineEconomySettlement(economy('good',200,180));assert(game.getOnlineCoinSummaryForDisplay());
  game.applyOnlineEconomySettlement({stakeAmount:200,reservations:[{userId:'my-user',payout:180}]});assert.equal(game.getOnlineCoinSummaryForDisplay(),null);
 });
 test(`${asset}: receipts accumulate across matches and survive a local resume snapshot`,()=>{
  const game=makeGame(asset);game.applyOnlineEconomySettlement(economy('a',200,180));game.applyOnlineEconomySettlement(economy('b',0,0));
  assert.equal(game.onlineCoinSummary.won-game.onlineCoinSummary.spent,-20);
  const snapshot=JSON.parse(JSON.stringify(game.buildGameResumeSnapshot()));const resumed=makeGame(asset);resumed.restoreOnlineCoinSummary(snapshot.onlineCoinSummary);resumed.applyOnlineEconomySettlement(economy('a',200,180));
  assert.equal(resumed.onlineCoinSummary.won-resumed.onlineCoinSummary.spent,-20);assert.equal(resumed.onlineCoinSummary.receiptIds.length,2);
 });
 test(`${asset}: absent own receipt and malformed math never change monetary totals`,()=>{
  const game=makeGame(asset);game.applyOnlineEconomySettlement({stakeAmount:200,reservations:[]});assert.equal(game.onlineCoinSummary.spent,0);
  const bad=economy('bad',200,180);bad.reservations[0].net=999;game.applyOnlineEconomySettlement(bad);assert.equal(game.onlineCoinSummary.won,0);
 });
}
