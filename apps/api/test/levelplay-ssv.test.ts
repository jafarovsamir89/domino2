import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyLevelPlaySignature,verifyLevelPlayQuery} from '../src/modules/rewarded/levelplay-ssv.js';
import {RewardedEntitlement} from '../src/modules/rewarded/entitlement.js';
const privateKey='synthetic-only-review-key-0123456789abcdef',attempt='a'.repeat(64);
const now=Date.UTC(2026,9,24,12),opts={privateKey,adUnit:'synthetic-unit',appKey:'synthetic-app',timestampUtcOffsetMinutes:0,now};
function signed(patch:Record<string,string>={}) {
 const data={applicationUserId:attempt,eventId:'0123456789abcdef',rewards:'1',timestamp:'202610241200',...patch};
 const signature=createHash('md5').update(data.timestamp+data.eventId+data.applicationUserId+data.rewards+privateKey).digest('hex');
 return new URLSearchParams({...data,signature}).toString();
}
test('LevelPlay uses the signed fixed-length init UserID and one entitlement, not custom fields or coins',()=>{
 const ad=verifyLevelPlayQuery(signed(),opts);
 assert.equal(ad.attemptId,attempt);assert.equal(ad.timestamp,now);assert.equal(ad.adUnit,opts.adUnit);
 assert.equal(ad.provider,'levelplay');assert.equal(ad.providerScope,opts.appKey);
 assert.equal(Object.isFrozen(ad),true);assert.equal('amount' in ad,false);
});
test('LevelPlay rejects modification of every signed field and wrong/missing private key',()=>{
 for(const [from,to] of [[attempt,'b'.repeat(64)],['0123456789abcdef','1123456789abcdef'],['rewards=1','rewards=2'],['202610241200','202610241201']])assert.throws(()=>verifyLevelPlayQuery(signed().replace(from,to),opts));
 for(const key of ['', 'short', privateKey+'x'])assert.throws(()=>verifyLevelPlayQuery(signed(),{...opts,privateKey:key}));
});
test('LevelPlay rejects duplicate, unknown and malformed parameters, including unsigned dynamic identity',()=>{
 for(const raw of [signed()+'&eventId=other',signed()+'&dynamicUserId='+attempt,signed()+'&custom_attemptId='+attempt,signed()+'&appKey=other','?'+signed(),signed()+'#x',signed().replace('applicationUserId=','%61pplicationUserId='),signed().replace('applicationUserId=a','applicationUserId=%ZZ'),signed().replace('&signature=','&signature=x')])assert.throws(()=>verifyLevelPlayQuery(raw,opts));
});
test('LevelPlay denies ambiguous IDs, non-one rewards and invalid calendar dates even with a valid synthetic signature',()=>{
 for(const patch of ([{applicationUserId:'user@example.invalid'},{applicationUserId:'a'.repeat(63)},{eventId:'bad:id'},{rewards:'200'},{rewards:'01'},{rewards:'1.0'},{timestamp:'202602301200'},{timestamp:'202613011200'},{timestamp:'202610242460'},{timestamp:String(now)}] as Record<string,string>[]))assert.throws(()=>verifyLevelPlayQuery(signed(patch),opts));
});
test('LevelPlay callback time requires explicit offset; minute precision and retry window are separate from grant expiry',()=>{
 assert.throws(()=>verifyLevelPlayQuery(signed(),{...opts,timestampUtcOffsetMinutes:undefined as any}),/clock/);
 assert.throws(()=>verifyLevelPlayQuery(signed(),{...opts,timestampUtcOffsetMinutes:0.5}),/clock/);
 assert.throws(()=>verifyLevelPlayQuery(signed(),{...opts,now:now+9*86400000}),/stale/);
 assert.throws(()=>verifyLevelPlayQuery(signed(),{...opts,now:now-120000}),/stale/);
 assert.equal(verifyLevelPlayQuery(signed({timestamp:'202610241600'}),{...opts,timestampUtcOffsetMinutes:240}).timestamp,now);
 assert.equal(verifyLevelPlayQuery(signed(),{...opts,now:now+7*86400000}).timestamp,now);
});
test('diagnostic signature verification does not invent a timezone or claim freshness',()=>{
 const message=verifyLevelPlaySignature(signed(),privateKey);
 assert.equal(message.callbackTime,'202610241200');assert.equal('timestamp' in message,false);
 assert.equal(message.attemptId,attempt);
});
test('observed dashboard unsigned country/publisherSubId never influence verified identity, coins or scope',()=>{
 const expected=verifyLevelPlayQuery(signed(),opts);
 assert.deepEqual(verifyLevelPlayQuery(signed()+'&publisherSubId=0&country=',opts),expected);
 assert.deepEqual(verifyLevelPlayQuery(signed()+'&country=AZ&publisherSubId=other',opts),expected);
 for(const raw of [signed()+'&country=AZ&country=US',signed()+'&publisherSubId='+ 'a'.repeat(65),signed()+'&country=AZextra'])assert.throws(()=>verifyLevelPlayQuery(raw,opts));
 assert.throws(()=>verifyLevelPlayQuery((signed()+'&country=AZ').replace(attempt,'b'.repeat(64)),opts));
});
test('LevelPlay cannot issue an attempt with incomplete server configuration before any DB access',async()=>{
 const db:any={$transaction:()=>{throw Error('unexpected_database_access');}};
 for(const patch of [{privateKey:''},{privateKey:undefined},{appKey:''},{timestampUtcOffsetMinutes:undefined},{timestampUtcOffsetMinutes:900}]){
  const service=new RewardedEntitlement(db,{...opts,provider:'levelplay',enabled:true,...patch} as any);
  await assert.rejects(()=>service.issue('synthetic-player',true,now),/invalid_provider_configuration/);
 }
});
