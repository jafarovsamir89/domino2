import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {createLevelPlayProbe} from './levelplay-probe.mjs';
const privateKey='synthetic-only-review-key-0123456789abcdef',attemptId='a'.repeat(64),fixed=Date.UTC(2026,9,24,12);
const signed=(id='0123456789abcdef',nonce=attemptId)=>{const t='202610241200',r='1';return new URLSearchParams({applicationUserId:nonce,eventId:id,rewards:r,timestamp:t,signature:createHash('md5').update(t+id+nonce+r+privateKey).digest('hex')}).toString();};
async function fixture(t,patch={}){
 fs.mkdirSync('.tmp/s042-levelplay',{recursive:true});
 const stateDir=fs.mkdtempSync('.tmp/s042-levelplay/probe-test-');let server;
 const start=async()=>{server=createLevelPlayProbe({privateKey,attemptId,expiresAt:fixed+3600000,stateDir,now:()=>fixed,...patch});server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;};
 let url=await start();const stop=()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 t.after(async()=>{await stop();fs.rmSync(stateDir,{recursive:true});});
 return {get url(){return url;},stateDir,restart:async()=>{await stop();url=await start();}};
}
test('probe exposes no filesystem/API/wallet or arbitrary method; forged/unknown nonce gets no ACK',async t=>{
 const f=await fixture(t);
 for(const p of ['/','/.env','/api','/wallet','/callback/levelplay','/callback/levelplayevil?'+signed()])assert.equal((await fetch(f.url+p)).status,404);
 assert.equal((await fetch(f.url+'/health',{method:'POST'})).status,405);
 for(const q of [signed().replace('signature=','signature=x'),signed('0123456789abcdef','b'.repeat(64))]){
  const r=await fetch(f.url+'/callback/levelplay?'+q);assert.equal(r.status,403);assert.equal((await r.text()).includes(':OK'),false);
 }
 assert.equal(fs.existsSync(path.join(f.stateDir,'receipts.ndjson')),false);
});
test('probe ACKs only after durable receipt; duplicates and restart write one row, no grant',async t=>{
 const f=await fixture(t),send=()=>fetch(f.url+'/callback/levelplay?'+signed());
 for(const r of await Promise.all(Array.from({length:20},send))){assert.equal(r.status,200);assert.equal(await r.text(),'<status>0123456789abcdef:OK</status>');}
 await f.restart();assert.equal((await send()).status,200);
 const rows=fs.readFileSync(path.join(f.stateDir,'receipts.ndjson'),'utf8').trim().split('\n');assert.equal(rows.length,1);
 const row=JSON.parse(rows[0]);assert.equal(row.walletEnabled,false);assert.equal('privateKey' in row,false);assert.equal('attemptId' in row,false);
});
test('probe never ACKs failed persistence and permits a successful retry',async t=>{
 const f=await fixture(t),file=path.join(f.stateDir,'receipts.ndjson');fs.mkdirSync(file);
 const url=f.url+'/callback/levelplay?'+signed();const fail=await fetch(url);assert.equal(fail.status,503);assert.equal((await fail.text()).includes(':OK'),false);
 fs.rmdirSync(file);assert.equal((await fetch(url)).status,200);
});
test('probe has an expiry and bounded request rate',async t=>{
 let now=fixed;const f=await fixture(t,{now:()=>now,limit:2});
 assert.equal((await fetch(f.url+'/health')).status,200);assert.equal((await fetch(f.url+'/health')).status,200);assert.equal((await fetch(f.url+'/health')).status,429);
 now+=3600000;const r=await fetch(f.url+'/callback/levelplay?'+signed());assert.equal(r.status,410);assert.equal((await r.text()).includes(':OK'),false);
});
test('probe request/rejection diagnostics contain shapes only, never signing key, nonce or signature',async t=>{
 const rows=[],f=await fixture(t,{onRejected:r=>rows.push(r),onRequest:r=>rows.push(r)});
 const raw=signed().replace('signature=','signature=x');
 assert.equal((await fetch(f.url+'/callback/levelplay?'+raw)).status,403);
 assert.equal(rows.length,2);assert.equal(rows[0].knownUserMatches,true);assert.equal(rows[1].status,403);
 assert.equal(rows[0].timestamp12Digits,true);assert.equal(rows[0].oneEntitlement,true);
 const text=JSON.stringify(rows);assert.equal(text.includes(privateKey),false);assert.equal(text.includes(attemptId),false);assert.equal(text.includes(new URLSearchParams(raw).get('signature')),false);
});
