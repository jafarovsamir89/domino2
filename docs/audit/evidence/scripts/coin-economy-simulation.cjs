/* Scenario model, not product execution. Configuration is extracted from current sources.
   All behaviour/skill/activity/top-up inputs are assumptions. No real wallets are used. */
'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const economy=fs.readFileSync('apps/api/src/modules/economy/economy.service.ts','utf8');
const starter=fs.readFileSync('apps/api/src/modules/economy/economy-starter.ts','utf8');
const social=fs.readFileSync('apps/api/src/modules/social/social.service.ts','utf8');
const scalar=(s,key)=>Number(s.match(new RegExp('(?:const|export const) '+key+' = ([0-9]+)'))[1]);
const config={starter:scalar(starter,'STARTER_COINS'),dailyRewards:JSON.parse(economy.match(/const DEFAULT_DAILY_REWARDS = (\[[^\]]+\])/)[1]),skinPrice:scalar(economy,'TABLE_SKIN_COIN_PRICE'),giftPrice:scalar(social,'DEFAULT_GIFT_COIN_COST'),giftExchangeRateBps:7000,skinsAvailable:8,minimumStake:50,commissionBps:1000};
const profiles=[
 {key:'novice',name:'Новичок',activeProbability:.60,settlementsPerActiveDay:4,players:2,winProbability:.35,stake:50,giftEveryActiveDays:7,cosmeticEveryActiveDays:7,bankrollFloorStakes:5,topUpCoinsPer30Days:0},
 {key:'regular',name:'Обычный',activeProbability:.80,settlementsPerActiveDay:10,players:4,winProbability:.25,stake:100,giftEveryActiveDays:4,cosmeticEveryActiveDays:7,bankrollFloorStakes:5,topUpCoinsPer30Days:0},
 {key:'active',name:'Активный',activeProbability:.95,settlementsPerActiveDay:30,players:4,winProbability:.30,stake:500,giftEveryActiveDays:2,cosmeticEveryActiveDays:7,bankrollFloorStakes:5,topUpCoinsPer30Days:0},
 {key:'payer_future',name:'Покупатель — будущая монетизация',activeProbability:.90,settlementsPerActiveDay:20,players:4,winProbability:.25,stake:1000,giftEveryActiveDays:1,cosmeticEveryActiveDays:7,bankrollFloorStakes:5,topUpCoinsPer30Days:12000}
];
const scenarios=['current_saturating_7','counterfactual_repeating_7'];
const trials=5000,horizons=[7,30,90],rows=[];
let state=0x800cafe;const randomAt=(day,index,stream)=>{let x=(state^Math.imul(day,0x9e3779b1)^Math.imul(index+1,0x85ebca6b)^Math.imul(stream+1,0xc2b2ae35))>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return((x^(x>>>16))>>>0)/2**32};
const percentile=(a,p)=>{const b=[...a].sort((a,b)=>a-b);return b[Math.floor((b.length-1)*p)]};
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
for(const policy of scenarios)for(let profileIndex=0;profileIndex<profiles.length;profileIndex++){
 const p=profiles[profileIndex],byHorizon=new Map(horizons.map(d=>[d,[]]));
 for(let trial=0;trial<trials;trial++){
  state=(0x800cafe+trial*131+profileIndex*713)>>>0;
  let balance=config.starter,previousClaim=0,streak=0,activeDays=0,skinCount=0,firstSkinAffordable=null,firstGiftAffordable=null,firstSkinBought=null,preferredBlocked=false,minimumBlocked=false;
  const flows={daily:0,topUps:0,winnings:0,losses:0,skins:0,gifts:0,settlements:0,unplayedPreferred:0};
  for(let day=1;day<=90;day++){
   if(day===1||randomAt(day,0,0)<p.activeProbability){
    activeDays++;
    streak=previousClaim===day-1?streak+1:1;previousClaim=day;
    if(policy==='current_saturating_7')streak=Math.min(7,streak);
    const reward=config.dailyRewards[(streak-1)%7];balance+=reward;flows.daily+=reward;
    if(p.topUpCoinsPer30Days&&[1,31,61].includes(day)){balance+=p.topUpCoinsPer30Days;flows.topUps+=p.topUpCoinsPer30Days}
    for(let n=0;n<p.settlementsPerActiveDay;n++){
     if(balance<p.stake){preferredBlocked=true;flows.unplayedPreferred+=p.settlementsPerActiveDay-n;break}
     // One losing player's whole stake is lost. A winner earns other stakes less 10% commission.
     const win=randomAt(day,n,1)<p.winProbability;
     if(win){const gain=(p.players-1)*p.stake*(1-config.commissionBps/10000);balance+=gain;flows.winnings+=gain}
     else{balance-=p.stake;flows.losses+=p.stake}
     flows.settlements++;
     if(balance<config.minimumStake)minimumBlocked=true;
     assert.ok(balance>=0&&Number.isFinite(balance));
    }
    if(firstSkinAffordable===null&&balance>=config.skinPrice)firstSkinAffordable=day;
    if(firstGiftAffordable===null&&balance>=config.giftPrice)firstGiftAffordable=day;
    const floor=p.bankrollFloorStakes*p.stake;
    if(activeDays%p.cosmeticEveryActiveDays===0&&skinCount<config.skinsAvailable&&balance-config.skinPrice>=floor){balance-=config.skinPrice;flows.skins+=config.skinPrice;skinCount++;firstSkinBought??=day}
    if(activeDays%p.giftEveryActiveDays===0&&balance-config.giftPrice>=floor){balance-=config.giftPrice;flows.gifts+=config.giftPrice}
   }
   assert.equal(balance,config.starter+flows.daily+flows.topUps+flows.winnings-flows.losses-flows.skins-flows.gifts,'cash-flow identity');
   if(horizons.includes(day))byHorizon.get(day).push({balance,activeDays,skinCount,firstSkinAffordable,firstGiftAffordable,firstSkinBought,preferredBlocked,minimumBlocked,...flows});
  }
 }
 for(const [day,data]of byHorizon){
  const item={policy,profile:p.key,day,trials,balanceP10:percentile(data.map(x=>x.balance),.1),balanceMedian:percentile(data.map(x=>x.balance),.5),balanceP90:percentile(data.map(x=>x.balance),.9),meanActiveDays:mean(data.map(x=>x.activeDays)),preferredStakeBlockedProbability:mean(data.map(x=>Number(x.preferredBlocked))),belowMinimumStakeEverProbability:mean(data.map(x=>Number(x.minimumBlocked))),meanSkinsOwned:mean(data.map(x=>x.skinCount))};
  for(const key of Object.keys(data[0]).filter(k=>['daily','topUps','winnings','losses','skins','gifts','settlements','unplayedPreferred'].includes(k)))item['mean_'+key]=mean(data.map(x=>x[key]));
  for(const key of ['firstSkinAffordable','firstGiftAffordable','firstSkinBought']){
   const found=data.map(x=>x[key]).filter(x=>x!==null&&x<=day);item[key]={reachedProbability:found.length/data.length,medianDayConditional:found.length?percentile(found,.5):null};
  }
  item.meanDailyMintPerActiveDay=item.mean_daily/item.meanActiveDays;
  item.meanNetGamePerActiveDay=(item.mean_winnings-item.mean_losses)/item.meanActiveDays;
  rows.push(item);
 }
}
const pureSchedules=scenarios.map(policy=>{let balance=config.starter,firstSkin=null,allSkins=null,dailyMint=0;for(let day=1;day<=90;day++){const reward=config.dailyRewards[policy==='current_saturating_7'?Math.min(day,7)-1:(day-1)%7];dailyMint+=reward;balance+=reward;if(firstSkin===null&&balance>=config.skinPrice)firstSkin=day;if(allSkins===null&&balance>=config.skinsAvailable*config.skinPrice)allSkins=day;if(day===30)return{policy,dailyMint30:dailyMint,balance30:balance,firstSkinAffordable:firstSkin,allSkinsAffordable:allSkins}}});
const output={scope:'Monte Carlo cash-flow model for four assumed player behaviours. Not an integration test, production population, retention forecast or closed-world money-supply model. Payer is prospective because IAP is disabled.',config,profiles,trialsPerProfile:trials,seed:'Integer-mixed indexed random variables from seed0x800cafe; fixed activity/outcome draws for each profile/trial/day/round across policy variants',policies:{current_saturating_7:'Actual observed policy: cap streak at day7 until an inactivity gap.',counterfactual_repeating_7:'Unimplemented proposed sensitivity only:7-day repeating cycle.'},constraints:['Gift cost is sender outflow; recipient may later exchange70%, so full price is not global monetary destruction.','Wins/losses use assumed probabilities against unmodelled opponents. Do not add profile cash flows into an economy-wide inflation rate.','No reward abuse, ads or incoming gifts included. Fresh daily quest fixture is assumed present.','A blocked preferred stake is different from cash below minimum50. No automatic fallback table is simulated.','Eligibility/activity is a behaviour assumption; not measured user retention.'],pureSchedules,rows};
fs.writeFileSync('docs/audit/evidence/metrics/coin-economy-simulation.json',JSON.stringify(output,null,2));
console.log('Saved',rows.length,'scenario/horizon cells;',profiles.length*trials*scenarios.length,'trajectories');
console.log(pureSchedules);
for(const r of rows.filter(r=>r.day===30))console.log(r.policy,r.profile,{median:r.balanceMedian,min50:r.belowMinimumStakeEverProbability,preferred:r.preferredStakeBlockedProbability,skins:r.meanSkinsOwned});
