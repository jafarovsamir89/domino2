import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {NestFactory} from '@nestjs/core';
import {RewardedReviewModule} from '../src/modules/rewarded/rewarded-review.module.js';
import {RewardedRequestAccess} from '../src/modules/rewarded/request-access.js';

const path='/api/economy/daily-bonus/rewarded',id='a'.repeat(64);
async function fixture(t:any,access?:any){
 const app=await NestFactory.create(access?RewardedReviewModule.register(access):RewardedReviewModule,{logger:false});
 app.setGlobalPrefix('api');await app.listen(0,'127.0.0.1');t.after(()=>app.close());
 const base=await app.getUrl();
 const request=async(url:string,body?:unknown)=>{
  const response=await fetch(base+path+url,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer synthetic-only-token','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};
 };
 return {request};
}
test('review module exposes no routes unless explicitly composed, and disabled access fails closed over HTTP',async t=>{
 const empty=await fixture(t);assert.equal((await empty.request('/attempt',{optIn:true})).status,404);
 const disabled=new RewardedRequestAccess({} as any,{} as any,{} as any);
 const mounted=await fixture(t,disabled),response=await mounted.request('/attempt',{optIn:true});
 assert.deepEqual(response,{status:503,cache:'no-store',body:{error:'rewarded_disabled'}});
});
test('real Nest HTTP routing preserves opt-in, raw credentials and owned status/cancel without adding client grant routes',async t=>{
 const calls:any[]=[],expiresAt=new Date(Date.now()+60000);
 const f=await fixture(t,{issue:async(headers:any,body:any)=>{calls.push(['issue',headers.authorization,body]);return {attemptId:id,expiresAt};},status:async(headers:any,attemptId:string)=>{calls.push(['status',headers.authorization,attemptId]);return {attemptId,state:'pending',expiresAt};},cancel:async(headers:any,body:any)=>{calls.push(['cancel',headers.authorization,body]);return {attemptId:body.attemptId,state:'cancelled',expiresAt};}});
 assert.deepEqual(await f.request('/attempt',{optIn:true}),{status:200,cache:'no-store',body:{attemptId:id,expiresAt:expiresAt.toISOString()}});
 assert.equal((await f.request('/attempt/'+id)).body.state,'pending');
 assert.equal((await f.request('/cancel',{attemptId:id})).body.state,'cancelled');
 assert.deepEqual(calls,[['issue','Bearer synthetic-only-token',{optIn:true}],['status','Bearer synthetic-only-token',id],['cancel','Bearer synthetic-only-token',{attemptId:id}]]);
 for(const route of ['/complete','/grant','/callback','/consume'])assert.equal((await f.request(route,{attemptId:id,reward:99999})).status,404);
});
test('known request errors have stable HTTP codes; unknown database/configuration errors reveal no details',async t=>{
 let message='';const fail=async()=>{throw Error(message);},f=await fixture(t,{issue:fail,status:fail,cancel:fail});
 for(const [code,status] of Object.entries({active_session_required:401,untrusted_origin:403,attempt_not_found:404,invalid_request:400,opt_in_required:400,normal_daily_required:409,frequency_cap:409,attempt_cap:409,active_attempt_scope_conflict:409})){
  message=code;const r=await f.request('/attempt',{optIn:true});assert.deepEqual(r,{status,cache:'no-store',body:{error:code}});
 }
 for(const detail of ['invalid_provider_configuration','synthetic SQL with privateKey=DO_NOT_RETURN','__proto__','constructor']){
  message=detail;const r=await f.request('/attempt/'+id);assert.deepEqual(r,{status:503,cache:'no-store',body:{error:'rewarded_unavailable'}});assert.equal(JSON.stringify(r).includes(detail),false);
 }
});
