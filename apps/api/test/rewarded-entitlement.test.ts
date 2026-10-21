import test from 'node:test';
import assert from 'node:assert/strict';
import {RewardedEntitlement} from '../src/modules/rewarded/entitlement.js';

const now=Date.UTC(2026,9,21,12),playerId='s040-synthetic-daily';
function fixture(kind:'normal'|'legacy-x2'|'unknown') {
  const amount=kind==='legacy-x2'?400:200;
  const claim={playerId,claimDate:'2026-10-21',amount};
  const initial=kind==='unknown'?null:{playerId,type:'daily_bonus',amount,referenceType:'daily_bonus',referenceId:claim.claimDate,payloadJson:{claimMode:kind==='normal'?'normal':'rewarded_x2',multiplier:kind==='normal'?1:2,baseReward:200,reward:amount,claimDate:claim.claimDate}};
  const state={insertedAttempts:0};
  const tx:any={coinLedgerEntry:{findUnique:async({where}:any)=>where.idempotencyKey.endsWith(':upgrade')?null:initial},coinDailyBonusClaim:{findUnique:async()=>claim},$queryRaw:async(strings:TemplateStringsArray)=>strings.join('').includes('count(*)')?[{count:0n}]:[],$executeRaw:async()=>{state.insertedAttempts++;return 1;}};
  const db:any={$transaction:async(fn:any)=>fn(tx)};
  return {service:new RewardedEntitlement(db,{enabled:true,adUnit:'synthetic-unit',keys:new Map()}),state};
}
test('a historical x2 daily must not be used as the base of another rewarded upgrade',async()=>{
  const {service,state}=fixture('legacy-x2');
  await assert.rejects(()=>service.issue(playerId,true,now),/normal_daily_required/);
  assert.equal(state.insertedAttempts,0);
});
test('a daily without its original normal ledger proof must not create an ad attempt',async()=>{
  const {service,state}=fixture('unknown');
  await assert.rejects(()=>service.issue(playerId,true,now),/normal_daily_required/);
  assert.equal(state.insertedAttempts,0);
});
test('a normal initial daily still creates an attempt',async()=>{
  const {service,state}=fixture('normal');const result=await service.issue(playerId,true,now);
  assert.match(result.attemptId,/^[-_A-Za-z0-9]{43}$/);assert.equal(state.insertedAttempts,1);
});

test('rewarded day is an ISO Baku calendar day at midnight and year/leap boundaries',async()=>{
 const {rewardedBakuDay}=await import('../src/modules/rewarded/entitlement.js');
 for(const [utc,expected] of [
  ['2026-10-21T19:59:59.999Z','2026-10-21'],
  ['2026-10-21T20:00:00.000Z','2026-10-22'],
  ['2026-12-31T20:00:00.000Z','2027-01-01'],
  ['2028-02-28T20:00:00.000Z','2028-02-29'],
  ['2028-02-29T20:00:00.000Z','2028-03-01']
 ])assert.equal(rewardedBakuDay(Date.parse(utc)),expected);
});
