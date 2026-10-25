import test from 'node:test';
import assert from 'node:assert/strict';
import {RewardedEntitlement} from '../src/modules/rewarded/entitlement.js';
const now=Date.UTC(2026,9,25,12),identity={userId:'synthetic-user',sessionId:'fresh-session'},playerId='synthetic-player';
function fixture(){
 const state:any={rows:[],prior:null,count:0,ban:null,normal:false,outage:false};
 const claim={amount:200},day='2026-10-25';
 const tx:any={session:{findUnique:async()=>({userId:identity.userId,expiresAt:new Date(now+60000)})},player:{findUnique:async()=>({userId:identity.userId})},playerBan:{findFirst:async()=>state.ban},coinDailyBonusClaim:{findUnique:async()=>state.normal?claim:null},coinLedgerEntry:{findUnique:async({where}:any)=>{if(state.outage)throw Error('synthetic-outage');return where.idempotencyKey.endsWith(':upgrade')?state.prior:state.normal?{playerId,type:'daily_bonus',amount:200,referenceType:'daily_bonus',referenceId:day,payloadJson:{claimMode:'normal',multiplier:1,baseReward:200,reward:200,claimDate:day}}:null;}},$queryRaw:async(sql:TemplateStringsArray)=>sql.join('').includes('count(*)')?[{count:BigInt(state.count)}]:sql.join('').includes('SELECT a.*')?state.rows:[],$executeRaw:()=>assert.fail('recovery must not mutate')};
 const config:any={enabled:true,provider:'levelplay',appKey:'synthetic-app',adUnit:'synthetic-unit',privateKey:'synthetic-only-key-0123456789abcdef',timestampUtcOffsetMinutes:0,settlementPolicy:'owner_8day'};
 return {state,config,service:new RewardedEntitlement({$transaction:async(fn:any)=>fn(tx)} as any,config)};
}
test('recovery is available only in the explicit enabled owner policy',async()=>{
 const f=fixture();f.config.settlementPolicy='legacy';await assert.rejects(()=>f.service.recover(playerId,identity,now),/rewarded_disabled/);
 f.config.settlementPolicy='owner_8day';f.config.enabled=false;await assert.rejects(()=>f.service.recover(playerId,identity,now),/rewarded_disabled/);
});
test('recovery is read-only; original day/base and 8-day deadline survive a fresh login',async()=>{
 const f=fixture();f.state.rows=[{id:'a'.repeat(64),claimDate:'2026-10-24',baseReward:200,createdAt:new Date(now-86400000),expiresAt:new Date(now-86400000+600000),consumedAt:null,cancelled:true,sessionId:'deleted-old-session'}];
 const value=await f.service.recover(playerId,identity,now);assert.equal(value.canStart,false);assert.equal(value.attempts[0].state,'awaiting_confirmation');assert.equal(value.attempts[0].claimDate,'2026-10-24');assert.equal(value.attempts[0].baseReward,200);assert.equal(value.attempts[0].settlementDeadline?.getTime(),now+7*86400000);
 assert.deepEqual(Object.keys(value.attempts[0]).sort(),['attemptId','baseReward','claimDate','expiresAt','settlementDeadline','state']);
});
test('advisory start requires normal proof, no active today, no upgrade and fewer than 3 attempts',async()=>{
 const f=fixture();assert.equal((await f.service.recover(playerId,identity,now)).canStart,false);
 f.state.normal=true;assert.equal((await f.service.recover(playerId,identity,now)).canStart,true);
 f.state.rows=[{id:'a'.repeat(64),claimDate:'2026-10-25',baseReward:200,createdAt:new Date(now),expiresAt:new Date(now+600000),consumedAt:null,cancelled:false}];
 assert.equal((await f.service.recover(playerId,identity,now)).canStart,false);
 f.state.rows=[];f.state.count=3;assert.equal((await f.service.recover(playerId,identity,now)).canStart,false);
 f.state.count=0;f.state.prior={id:'upgrade'};assert.equal((await f.service.recover(playerId,identity,now)).canStart,false);
});
test('ban, corrupt unbounded history and database outage fail closed',async()=>{
 const f=fixture();f.state.ban={id:'ban'};await assert.rejects(()=>f.service.recover(playerId,identity,now),/active_session_required/);
 f.state.ban=null;f.state.rows=Array(28).fill({});await assert.rejects(()=>f.service.recover(playerId,identity,now),/invalid_attempt_history/);
 f.state.rows=[];f.state.outage=true;await assert.rejects(()=>f.service.recover(playerId,identity,now),/synthetic-outage/);
});
