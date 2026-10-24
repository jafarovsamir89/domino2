const test=require('node:test'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),path=require('node:path');
const load=()=>import(pathToFileURL(path.resolve(__dirname,'../../docs/remediation/review/rewarded-native-adapter.js')).href);
const id='a'.repeat(64),expiresAt='2026-10-25T00:10:00.000Z';
test('native audit adapter construction never initializes SDK or starts an ad',async()=>{
 const {createRewardedReviewNativeAdapter}=await load();let calls=0;
 createRewardedReviewNativeAdapter({status:()=>{calls++;},bindAttempt:()=>{calls++;},show:()=>{calls++;}});
 assert.equal(calls,0);
});
test('explicit adult/test confirmations and verified native show gate are required before binding',async()=>{
 const {createRewardedReviewNativeAdapter}=await load();let binds=0,status=0;
 const plugin={status:async()=>{status++;return {loadShowEnabled:false};},bindAttempt:()=>{binds++;}};
 for(const confirmed of [{},{adultOwner:true},{adultOwner:'true',testAccepted:true}])await assert.rejects(()=>createRewardedReviewNativeAdapter(plugin,confirmed).bindAttempt({attemptId:id,expiresAt}),/adult_test_confirmation_required/);
 assert.equal(status,0);await assert.rejects(()=>createRewardedReviewNativeAdapter(plugin,{adultOwner:true,testAccepted:true}).bindAttempt({attemptId:id,expiresAt}),/review_show_disabled/);assert.equal(binds,0);
});
test('adapter forwards only the fixed bridge contract, never client amounts or identity overrides',async()=>{
 const {createRewardedReviewNativeAdapter}=await load(),calls=[];
 const plugin={status:async()=>({loadShowEnabled:true}),bindAttempt:async payload=>{calls.push(['bind',payload]);return {bound:true,attemptId:id};},show:async payload=>{calls.push(['show',payload]);return {closed:true};}};
 const adapter=createRewardedReviewNativeAdapter(plugin,{adultOwner:true,testAccepted:true});
 assert.equal((await adapter.bindAttempt({attemptId:id,expiresAt,reward:99999,userId:'other'})).bound,true);
 assert.equal((await adapter.show({attemptId:id,coins:99999})).closed,true);
 assert.deepEqual(calls,[['bind',{attemptId:id,expiresAt,adultOwner:true,testAccepted:true}],['show',{attemptId:id}]]);
 await assert.rejects(()=>adapter.show({attemptId:'../bad'}),/invalid_attempt/);await assert.rejects(()=>adapter.bindAttempt({attemptId:id,expiresAt:123}),/invalid_attempt/);assert.equal(calls.length,2);
});
test('a false or missing native capability cannot be overridden from JavaScript',async()=>{
 const {createRewardedReviewNativeAdapter}=await load();let shows=0;
 for(const nativeStatus of [{loadShowEnabled:false},{loadShowEnabled:'true'},{}]){
  const adapter=createRewardedReviewNativeAdapter({status:async()=>nativeStatus,show:()=>{shows++;}},{adultOwner:true,testAccepted:true});
  await assert.rejects(()=>adapter.show({attemptId:id}),/review_show_disabled/);
 }
 assert.equal(shows,0);
});
