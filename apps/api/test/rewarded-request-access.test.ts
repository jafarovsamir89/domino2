import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameToken} from '../src/modules/auth/game-token.js';
import {RewardedRequestAccess} from '../src/modules/rewarded/request-access.js';
import {RewardedEntitlement} from '../src/modules/rewarded/entitlement.js';

const playerId='s044-synthetic-player',userId='s044-synthetic-user',sessionId='s044-synthetic-session',attemptId='a'.repeat(64),origin='http://127.0.0.1:4186';
function fixture(){
 const now=Date.now(),calls:any[]=[],lookups:any[]=[],state:any={session:{id:sessionId,userId,expiresAt:new Date(now+60000)},player:{id:playerId,userId},ban:null,verified:{user:{id:userId},session:{id:sessionId}},provider:'levelplay'};
 const db:any={session:{findUnique:async()=>state.session},player:{findUnique:async()=>state.player},playerBan:{findFirst:async()=>state.ban}};
 const auth:any={getSession:async(headers:any)=>{lookups.push(headers);return state.verified;}};
 const entitlement:any={get provider(){return state.provider;},issue:async(...args:any[])=>{calls.push(['issue',...args]);return {attemptId,expiresAt:new Date(now+60000)};},recover:async(...args:any[])=>{calls.push(['recover',...args]);return {flowVersion:'owner_8day_v1',canStart:false,attempts:[]};},status:async(...args:any[])=>{calls.push(['status',...args]);return {attemptId,state:'pending',expiresAt:new Date(now+60000)};},cancel:async(...args:any[])=>{calls.push(['cancel',...args]);}};
 const service=new RewardedRequestAccess(db,auth,entitlement,{enabled:true,trustedOrigins:[origin]});
 const token=(patch={})=>createGameToken({playerId,userId,sessionId,displayName:'Synthetic',role:'player',provider:'better-auth',issuedAt:now,expiresAt:now+60000,...patch});
 return {now,calls,lookups,state,db,auth,entitlement,service,token};
}
test('rewarded request gate is off by default and never accepts another provider accidentally',async()=>{
 const f=fixture();
 await assert.rejects(()=>new RewardedRequestAccess(f.db,f.auth,f.entitlement).issue({}, {optIn:true}),/rewarded_disabled/);
 f.state.provider='admob';await assert.rejects(()=>f.service.issue({}, {optIn:true}),/invalid_provider_configuration/);
 assert.equal(f.lookups.length+f.calls.length,0);
});
test('signed game credentials derive the identity and never return credentials or accept a client-selected player',async()=>{
 const f=fixture(),result=await f.service.issue({authorization:'Bearer '+f.token()},{optIn:true},f.now);
 assert.equal(result.attemptId,attemptId);assert.equal(f.lookups.length,0);
 assert.deepEqual(f.calls[0],['issue',playerId,true,f.now,{playerId,userId,sessionId}]);
 assert.deepEqual(Object.keys(result).sort(),['attemptId','expiresAt']);
 for(const body of [{optIn:true,playerId:'another'},{optIn:true,userId},{optIn:true,reward:99999},{optIn:'true'},[],null])await assert.rejects(()=>f.service.issue({authorization:'Bearer '+f.token()},body,f.now));
 assert.equal(f.calls.length,1);
});
test('opaque bearer is authenticated alone, without falling back to an accompanying cookie',async()=>{
 const f=fixture();await f.service.issue({authorization:'Bearer synthetic-opaque-token',cookie:'synthetic-cookie',origin},{optIn:true},f.now);
 assert.deepEqual(f.lookups,[{authorization:'Bearer synthetic-opaque-token'}]);
 f.state.verified=null;
 await assert.rejects(()=>f.service.issue({authorization:'Bearer bad-token',cookie:'synthetic-valid-cookie',origin},{optIn:true},f.now),/active_session_required/);
 assert.equal(f.calls.length,1);
});
test('cookie authentication requires a trusted exact Origin for writes, including mixed bearer/cookie requests',async()=>{
 const f=fixture();
 for(const headers of [{cookie:'synthetic-cookie'},{cookie:'synthetic-cookie',origin:'null'},{cookie:'synthetic-cookie',origin:origin+'.evil.invalid'},{cookie:'synthetic-cookie',origin:'https://example.invalid',authorization:'Bearer '+f.token()}])await assert.rejects(()=>f.service.issue(headers,{optIn:true},f.now),/untrusted_origin/);
 assert.equal(f.lookups.length+f.calls.length,0);
 await f.service.issue({cookie:'synthetic-cookie',origin},{optIn:true},f.now);
 assert.deepEqual(f.lookups,[{cookie:'synthetic-cookie'}]);
});
test('missing, malformed, forged, expired and suffixed credentials never reach entitlement',async()=>{
 const f=fixture();f.state.verified=null;
 for(const headers of [{},{authorization:'s044-synthetic-user'},{authorization:'Bearer x, y'},{authorization:['Bearer x'] as any},{authorization:'Bearer '+f.token({expiresAt:f.now-1})},{authorization:'Bearer '+f.token()+'.suffix'},{authorization:'Bearer '+f.token().replace(/.$/,'!')},{authorization:'Bearer '+'x'.repeat(8193)}])await assert.rejects(()=>f.service.issue(headers,{optIn:true},f.now),/active_session_required/);
 assert.equal(f.calls.length,0);
});
test('credentials are rechecked against logout, session ownership, expiry, deleted player and ban',async()=>{
 for(const patch of [{session:null},{session:{userId:'another',expiresAt:new Date(Date.now()+60000)}},{session:{userId,expiresAt:new Date(0)}},{player:null},{player:{id:playerId,userId:'another'}},{player:{id:'another-player',userId}},{ban:{id:'synthetic-ban'}}]){
  const f=fixture();Object.assign(f.state,patch);
  for(const run of [()=>f.service.issue({authorization:'Bearer '+f.token()},{optIn:true},f.now),()=>f.service.status({authorization:'Bearer '+f.token()},attemptId,f.now),()=>f.service.cancel({authorization:'Bearer '+f.token()},{attemptId},f.now),()=>f.service.recover({authorization:'Bearer '+f.token()},f.now)])await assert.rejects(run,/active_session_required/);
  assert.equal(f.calls.length,0);
 }
});
test('recovery derives the current owner from credentials without client IDs or a write',async()=>{
 const f=fixture();assert.deepEqual(await f.service.recover({authorization:'Bearer '+f.token()},f.now),{flowVersion:'owner_8day_v1',canStart:false,attempts:[]});
 assert.deepEqual(f.calls,[['recover',playerId,{playerId,userId,sessionId},f.now]]);
 f.state.verified=null;await assert.rejects(()=>f.service.recover({},f.now),/active_session_required/);
 assert.equal(f.calls.length,1);
});
test('read failure propagates without issuing an attempt or cancelling anything',async()=>{
 const f=fixture();f.db.session.findUnique=async()=>{throw Error('synthetic-db-outage');};
 await assert.rejects(()=>f.service.issue({authorization:'Bearer '+f.token()},{optIn:true},f.now),/synthetic-db-outage/);assert.equal(f.calls.length,0);
});
test('cancel checks owned status before mutation and returns the actual post-cancel state',async()=>{
 const f=fixture();await f.service.cancel({authorization:'Bearer '+f.token()},{attemptId},f.now);
 assert.deepEqual(f.calls.map(c=>c[0]),['status','cancel','status']);
 f.calls.length=0;f.entitlement.status=async()=>{throw Error('attempt_not_found');};
 await assert.rejects(()=>f.service.cancel({authorization:'Bearer '+f.token()},{attemptId},f.now),/attempt_not_found/);assert.equal(f.calls.length,0);
 for(const body of [{attemptId,playerId},{attemptId,reward:200},{attemptId:'not-a-nonce'}])await assert.rejects(()=>f.service.cancel({authorization:'Bearer '+f.token()},body,f.now),/invalid_request/);
});
test('status does not mutate and distinguishes pending, cancelled, expired and committed credit',async()=>{
 const now=Date.now(),attempt:any={id:attemptId,playerId,userId,sessionId,provider:'levelplay',providerScope:'synthetic-app',adUnit:'synthetic-unit',claimDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baku',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),expiresAt:new Date(now+60000),cancelled:false,consumedAt:null};
 const tx:any={session:{findUnique:async()=>({userId,expiresAt:new Date(now+86400000)})},player:{findUnique:async()=>({userId})},playerBan:{findFirst:async()=>null},$queryRaw:async(sql:TemplateStringsArray)=>sql.join('').includes('RewardReviewAttempt')?[attempt]:[],$executeRaw:()=>assert.fail('status must never write')};
 const service=new RewardedEntitlement({$transaction:async(fn:any)=>fn(tx)} as any,{enabled:true,provider:'levelplay',appKey:'synthetic-app',adUnit:'synthetic-unit',privateKey:'synthetic-only-key-0123456789abcdef',timestampUtcOffsetMinutes:0});
 for(const [patch,state] of [[{},'pending'],[{cancelled:true},'cancelled'],[{cancelled:false,expiresAt:new Date(now)},'expired'],[{consumedAt:new Date(now)},'credited']] as const){Object.assign(attempt,patch);assert.equal((await service.status(playerId,attemptId,{userId,sessionId},now)).state,state);}
 for(const patch of [{userId:'other'},{sessionId:'other'},{providerScope:'other'},{adUnit:'other'}]){const old={...attempt};Object.assign(attempt,patch);await assert.rejects(()=>service.status(playerId,attemptId,{userId,sessionId},now),/attempt_not_found/);Object.assign(attempt,old);}
});
