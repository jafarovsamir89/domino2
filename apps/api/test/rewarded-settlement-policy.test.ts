import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ownerSettlementDeadline,ownerSettlementEligibility,OWNER_SETTLEMENT_WINDOW_MS as windowMs} from '../src/modules/rewarded/settlement-policy.js';
import {verifyLevelPlayQuery} from '../src/modules/rewarded/levelplay-ssv.js';
import {RewardedEntitlement} from '../src/modules/rewarded/entitlement.js';

const createdAt=Date.UTC(2026,9,24,19,59,59,999),id='a'.repeat(64),privateKey='synthetic-only-s049-policy-key-0123456789abcdef';
const input={enabled:true,optIn:true,attemptId:id,attemptPlayerId:'synthetic-player',playerId:'synthetic-player',createdAt,expiresAt:createdAt+600000,now:createdAt,consumed:false,grantsForOriginalDay:0};
const ad={attemptId:id,transactionId:'0123456789abcdef',timestamp:createdAt,adUnit:'synthetic-unit'};
test('explicit owner settlement covers the original attempt for exactly eight elapsed days, across midnight',()=>{
 assert.equal(ownerSettlementDeadline(input.createdAt,input.expiresAt),createdAt+windowMs);
 for(const delay of [0,9*60000,12*60000,86400000,7*86400000,windowMs-1])assert.equal(ownerSettlementEligibility({...input,now:createdAt+delay},ad),'ready');
 for(const now of [createdAt-1,createdAt+windowMs,createdAt+windowMs+1,NaN])assert.throws(()=>ownerSettlementEligibility({...input,now},ad),/expired_attempt/);
});
test('longer settlement preserves ownership, original-day cap, one consumption and explicit opt-in',()=>{
 for(const [patch,reason] of [[{enabled:false},/disabled/],[{optIn:false},/opt_in/],[{playerId:'other'},/owner/],[{attemptId:'b'.repeat(64)},/owner/],[{consumed:true},/unavailable/],[{grantsForOriginalDay:1},/frequency_cap/],[{grantsForOriginalDay:-1},/frequency_cap/]] as const)assert.throws(()=>ownerSettlementEligibility({...input,...patch},ad),reason);
 for(const expiresAt of [createdAt,createdAt+600001,NaN])assert.throws(()=>ownerSettlementDeadline(createdAt,expiresAt),/invalid_attempt_clock/);
});
test('one-minute signature tolerance does not change the legacy verifier default or the exact settlement deadline',()=>{
 const timestamp='202610241959',eventId=ad.transactionId,rewards='1';
 const raw=new URLSearchParams({applicationUserId:id,eventId,rewards,timestamp,signature:createHash('md5').update(timestamp+eventId+id+rewards+privateKey).digest('hex')}).toString();
 const options={privateKey,appKey:'synthetic-app',adUnit:'synthetic-unit',timestampUtcOffsetMinutes:0,now:createdAt+windowMs-1};
 assert.throws(()=>verifyLevelPlayQuery(raw,options),/stale_event/);
 const checked=verifyLevelPlayQuery(raw,{...options,maxAgeMs:windowMs+60000});assert.equal(ownerSettlementEligibility({...input,now:options.now},checked),'ready');
 assert.throws(()=>ownerSettlementEligibility({...input,now:createdAt+windowMs},checked),/expired_attempt/);
 for(const maxAgeMs of [0,NaN,windowMs+60001])assert.throws(()=>verifyLevelPlayQuery(raw,{...options,maxAgeMs}),/clock_policy/);
});
test('unknown settlement policy fails before DB access; old default remains independently available',async()=>{
 const config:any={enabled:true,provider:'levelplay',appKey:'synthetic-app',adUnit:'synthetic-unit',privateKey,timestampUtcOffsetMinutes:0,settlementPolicy:'unknown'};
 const service=new RewardedEntitlement({} as any,config);await assert.rejects(()=>service.issue('synthetic-player',true,createdAt,{userId:'u',sessionId:'s'}),/invalid_provider_configuration/);
});
