import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyAdMobQuery,rewardEligibility} from '../src/modules/rewarded/ssv.js';
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const now=1792530000000, attempt='local_synthetic_attempt_0123456789abc';
const opts={keys:new Map([['7',publicKey.export({type:'spki',format:'pem'}).toString()]]),adUnit:'synthetic-unit',now};
const payload=`ad_network=1&ad_unit=synthetic-unit&custom_data=${attempt}&reward_amount=200&reward_item=coins&timestamp=${now}&transaction_id=0123456789abcdef`;
const signed=(s=payload)=>s+'&signature='+sign('sha256',Buffer.from(s),privateKey).toString('base64url')+'&key_id=7';
const policy={attemptId:attempt,enabled:true,optIn:true,attemptPlayerId:'synthetic-a',playerId:'synthetic-a',expiresAt:now+60000,now,day:'2026-10-20',attemptDay:'2026-10-20',grantsToday:0,cap:1,cancelled:false,consumed:false};
test('valid signed callback binds an opaque attempt; provider amount is not a coin entitlement',()=>{
 const ad=verifyAdMobQuery(signed(),opts);assert.equal(ad.attemptId,attempt);assert.equal(Object.isFrozen(ad),true);assert.equal('rewardAmount' in ad,false);assert.equal(rewardEligibility(policy,ad),'ready');
});
test('tampering, duplicate parameters, unknown key, wrong unit and stale/future event fail',()=>{
 for(const raw of [signed().replace('coins','gems'),signed()+'&ad_unit=other',signed(payload+'&timestamp='+now),signed().replace('key_id=7','key_id=8'),signed(payload.replace('synthetic-unit','other')),signed(payload.replace(String(now),String(now-16*60000))),signed(payload.replace(String(now),String(now+61000))),signed().replace('&signature=','&key_id=7&signature=')]) assert.throws(()=>verifyAdMobQuery(raw,opts));
});
test('off, no opt-in, other player/day, expired/cancelled/replayed and cap cannot grant',()=>{
 const ad=verifyAdMobQuery(signed(),opts);
 for(const patch of [{attemptId:'wrong-attempt'},{enabled:false},{optIn:false},{playerId:'other'},{day:'2026-10-21'},{expiresAt:now},{cancelled:true},{consumed:true},{grantsToday:1},{cap:0},{cap:4},{grantsToday:NaN}]) assert.throws(()=>rewardEligibility({...policy,...patch},ad));
});
