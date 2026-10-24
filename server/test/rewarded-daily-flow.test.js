const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const id='a'.repeat(64),other='b'.repeat(64),now=Date.now();
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(setImmediate);
for(const asset of ['js/rewardedDailyFlow.js','www/js/rewardedDailyFlow.js']){
 const module=()=>import(pathToFileURL(path.resolve(__dirname,'../..',asset)).href);
 async function fixture(options={}){
  const {RewardedDailyFlow}=await module(),calls=[],state={status:'pending',id};
  const api={issue:async()=>{calls.push('issue');return {attemptId:state.id,expiresAt:new Date(now+60000).toISOString()};},status:async value=>{calls.push('status');return {attemptId:value,state:state.status};},cancel:async value=>{calls.push('cancel');return {attemptId:value,state:state.status==='credited'?'credited':'cancelled'};}};
  const ads={bindAttempt:async value=>{calls.push('bind');return {bound:true,attemptId:value.attemptId};},show:async()=>{calls.push('show');return {completed:true,reward:99999};}};
  const changes=[],flow=new RewardedDailyFlow({api,ads,enabled:true,now:()=>now,onChange:s=>changes.push(s),...options});
  return {flow,api,ads,calls,state,changes};
 }
 test(`${asset}: disabled flow and missing native adapter make no server/ad calls`,async()=>{
  const f=await fixture({enabled:false});assert.equal((await f.flow.start()).phase,'disabled');assert.deepEqual(f.calls,[]);
  const g=await fixture({ads:{}});assert.equal((await g.flow.start()).phase,'unavailable');assert.deepEqual(g.calls,[]);
 });
 test(`${asset}: SDK success or close is not credit; later server credit is found without a second ad`,async()=>{
  for(const result of [{completed:true,reward:99999},{cancelled:true},undefined]){
   const f=await fixture();f.ads.show=async()=>{f.calls.push('show');return result;};
   assert.equal((await f.flow.start()).phase,'pending');assert.equal(f.calls.includes('cancel'),false);
   f.state.status='credited';assert.equal((await f.flow.start()).phase,'credited');
   assert.equal(f.calls.filter(v=>v==='show').length,1);assert.equal(f.calls.filter(v=>v==='issue').length,1);
   assert.equal(Object.hasOwn(f.flow.snapshot,'amount'),false);assert.equal(Object.hasOwn(f.flow.snapshot,'attemptId'),false);
  }
 });
 test(`${asset}: concurrent clicks/check/cancel share one operation and do not launch a second ad`,async()=>{
  const f=await fixture(),wait=deferred();f.ads.show=async()=>{f.calls.push('show');await wait.promise;};
  const first=f.flow.start(),second=f.flow.start();assert.equal(first,second);await tick();
  assert.equal(f.flow.snapshot.phase,'showing');assert.equal(f.flow.snapshot.canCancel,false);
  assert.equal(f.flow.cancel(),first);assert.equal(f.flow.check(),first);wait.resolve();await first;
  assert.equal(f.calls.filter(v=>v==='issue').length,1);assert.equal(f.calls.filter(v=>v==='show').length,1);assert.equal(f.calls.includes('cancel'),false);
 });
 test(`${asset}: explicit cancellation trusts the server, including a credit/cancel race and lost response`,async()=>{
  const f=await fixture();await f.flow.start();f.state.status='credited';assert.equal((await f.flow.cancel()).phase,'credited');
  const g=await fixture();await g.flow.start();assert.equal((await g.flow.cancel()).phase,'cancelled');
  const h=await fixture();await h.flow.start();h.api.cancel=async()=>{throw Error('private synthetic DB details');};
  assert.equal((await h.flow.cancel()).phase,'unavailable');assert.equal(h.flow.snapshot.canCheck,true);assert.equal(JSON.stringify(h.flow.snapshot).includes('private'),false);
 });
 test(`${asset}: a late issue reply after logout cannot bind/show or update the new account`,async()=>{
  const f=await fixture(),wait=deferred();f.api.issue=()=>wait.promise;
  const pending=f.flow.start();await tick();f.flow.reset();const count=f.changes.length;
  wait.resolve({attemptId:id,expiresAt:new Date(now+60000).toISOString()});await pending;
  assert.equal(f.flow.snapshot.phase,'idle');assert.equal(f.changes.length,count);assert.equal(f.calls.length,0);
 });
 test(`${asset}: native binding survives JS/account reset and cannot silently change to another nonce`,async()=>{
  const f=await fixture(),wait=deferred();f.ads.bindAttempt=async()=>{f.calls.push('bind');return wait.promise;};
  const old=f.flow.start();await tick();assert.equal(f.flow.snapshot.phase,'binding');
  f.flow.reset();f.state.id=other;assert.equal((await f.flow.start()).phase,'blocked');
  assert.equal(f.flow.snapshot.code,'native_binding_conflict');wait.resolve({bound:true,attemptId:id});await old;
  assert.equal(f.calls.filter(v=>v==='bind').length,1);assert.equal(f.calls.includes('show'),false);assert.equal(f.flow.snapshot.phase,'blocked');
 });
 test(`${asset}: wrong native binding, malformed status and already-expired server attempt never show ads`,async()=>{
  const f=await fixture();f.ads.bindAttempt=async()=>({bound:true,attemptId:other});assert.equal((await f.flow.start()).phase,'blocked');assert.equal(f.calls.includes('show'),false);
  const g=await fixture();g.api.status=async()=>({attemptId:other,state:'credited'});assert.equal((await g.flow.start()).code,'invalid_response');assert.equal(g.calls.includes('bind'),false);
  for(const state of ['expired','credited']){const h=await fixture();h.state.status=state;assert.equal((await h.flow.start()).phase,state);assert.equal(h.calls.includes('bind'),false);}
  const j=await fixture();j.api.issue=async()=>({attemptId:id,expiresAt:123});assert.equal((await j.flow.start()).code,'invalid_response');assert.equal(j.calls.includes('bind'),false);
 });
 test(`${asset}: server state wins over an SDK failure; failed status is recoverable without replaying the ad`,async()=>{
  const f=await fixture();f.ads.show=async()=>{f.state.status='credited';throw Error('synthetic-sdk-error');};assert.equal((await f.flow.start()).phase,'credited');
  const g=await fixture();let count=0;g.api.status=async value=>{if(++count===2)throw Error('synthetic-network-loss');return {attemptId:value,state:'pending'};};
  assert.equal((await g.flow.start()).phase,'unavailable');assert.equal((await g.flow.check()).phase,'pending');assert.equal(g.calls.filter(v=>v==='show').length,1);
 });
 test(`${asset}: dispose/reentrant logout stop queued work and observer errors cannot replace server state`,async()=>{
  const f=await fixture();await f.flow.start();const before=f.calls.length,pending=f.flow.check();f.flow.dispose();await pending;assert.equal(f.calls.length,before);assert.equal(f.flow.snapshot.phase,'disabled');
  let flow;const g=await fixture({onChange:s=>{if(s.phase==='starting')flow.reset();}});flow=g.flow;await flow.start();assert.equal(g.calls.length,0);assert.equal(flow.snapshot.phase,'idle');
  const h=await fixture({onChange:()=>{throw Error('synthetic-observer-error');}});assert.equal((await h.flow.start()).phase,'pending');
 });
 test(`${asset}: API helper sends only opt-in/nonce to authenticated transport and rejects path injection`,async()=>{
  const {createRewardedDailyApi}=await module(),calls=[],api=createRewardedDailyApi({platformRequest:(...args)=>{calls.push(args);return Promise.resolve({});}});
  await api.issue();await api.status(id);await api.cancel(id);
  assert.deepEqual(calls,[['/economy/daily-bonus/rewarded/attempt',{method:'POST',body:{optIn:true}}],['/economy/daily-bonus/rewarded/attempt/'+id],['/economy/daily-bonus/rewarded/cancel',{method:'POST',body:{attemptId:id}}]]);
  assert.throws(()=>api.status('../another'));assert.throws(()=>api.cancel(other+'?reward=99999'));assert.equal(calls.length,3);
 });
}
