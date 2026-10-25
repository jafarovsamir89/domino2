const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const id='a'.repeat(64),second='b'.repeat(64),now=Date.now();
const record=(attemptId=id,patch={})=>({attemptId,state:'awaiting_confirmation',claimDate:'2026-10-24',baseReward:200,expiresAt:new Date(now-600000).toISOString(),settlementDeadline:new Date(now+7*86400000).toISOString(),...patch});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
for(const asset of ['js/rewardedDailyFlow.js','www/js/rewardedDailyFlow.js']){
 async function fixture(){
  const {RewardedDailyFlow}=await import(pathToFileURL(path.resolve(__dirname,'../..',asset)).href),calls=[],state={records:[record()],canStart:false};
  const api={recover:async()=>{calls.push('recover');return {flowVersion:'owner_8day_v1',canStart:state.canStart,attempts:state.records};},issue:async()=>{calls.push('issue');return {attemptId:second,expiresAt:new Date(now+600000).toISOString()};},status:async()=>{calls.push('status');return record(second,{state:'pending',claimDate:'2026-10-25',expiresAt:new Date(now+600000).toISOString()});}};
  const ads={bindAttempt:async({attemptId})=>{calls.push('bind');return {bound:true,attemptId};},show:async()=>{calls.push('show');return {completed:true};}};
  return {flow:new RewardedDailyFlow({api,ads,enabled:true,recoverBeforeStart:true}),api,ads,calls,state};
 }
 test(`${asset}: fresh instance recovers by GET without opt-in/playback or public nonces`,async()=>{
  const f=await fixture();assert.equal(f.flow.snapshot.canStart,false);assert.equal((await f.flow.recover()).phase,'awaiting_confirmation');
  assert.deepEqual(f.calls,['recover']);assert.equal(JSON.stringify(f.flow.snapshot).includes(id),false);
  assert.equal(f.flow.snapshot.claimDate,'2026-10-24');assert.equal(f.flow.snapshot.attempts[0].baseReward,200);
  assert.equal((await f.flow.start()).phase,'awaiting_confirmation');assert.deepEqual(f.calls,['recover','recover']);
 });
 test(`${asset}: eligible empty discovery needs a separate explicit start`,async()=>{
  const f=await fixture();f.state.records=[];f.state.canStart=true;await f.flow.start();assert.deepEqual(f.calls,['recover']);assert.equal(f.flow.snapshot.canStart,true);
  await f.flow.start();assert.deepEqual(f.calls,['recover','issue','status','bind','show','status']);assert.equal(f.flow.snapshot.phase,'pending');
  await f.flow.start();assert.equal(f.calls.filter(v=>v==='issue').length,1);assert.equal(f.calls.filter(v=>v==='show').length,1);
 });
 test(`${asset}: several original days can be selected and checked without showing`,async()=>{
  const f=await fixture();f.state.records.push(record(second,{claimDate:'2026-10-25',baseReward:300,state:'credited'}));
  await f.flow.recover();f.flow.select(1);assert.equal(f.flow.snapshot.phase,'credited');assert.equal(f.flow.snapshot.claimDate,'2026-10-25');
  await f.flow.check();assert.equal(f.flow.snapshot.selectedIndex,1);assert.equal(f.flow.snapshot.phase,'credited');
  f.flow.select(0);assert.equal(f.flow.snapshot.phase,'awaiting_confirmation');assert.deepEqual(f.calls,['recover','recover']);
 });
 test(`${asset}: old-day recovery does not spend today's offer or bind the SDK`,async()=>{
  const f=await fixture();f.state.canStart=true;await f.flow.recover();assert.equal(f.flow.snapshot.canStart,true);assert.deepEqual(f.calls,['recover']);
  await f.flow.start();assert.equal(f.flow.snapshot.phase,'pending');assert.equal(f.flow.snapshot.attempts.length,2);assert.equal(f.calls.filter(v=>v==='show').length,1);
 });
 test(`${asset}: failed/lost discovery or issue can only be retried by discovery first`,async()=>{
  const f=await fixture(),recover=f.api.recover;f.api.recover=async()=>{throw Error('synthetic-outage');};
  await f.flow.recover();assert.equal(f.flow.snapshot.phase,'unavailable');assert.equal(f.flow.snapshot.canStart,false);
  f.api.recover=recover;f.state.records=[];f.state.canStart=true;await f.flow.start();assert.deepEqual(f.calls,['recover']);
  f.api.issue=async()=>{f.calls.push('issue');throw Error('lost-response');};await f.flow.start();assert.equal(f.flow.snapshot.canStart,false);
  f.state.records=[record()];f.state.canStart=false;await f.flow.start();assert.equal(f.flow.snapshot.phase,'awaiting_confirmation');assert.deepEqual(f.calls,['recover','issue','recover']);
 });
 test(`${asset}: late discovery after logout cannot restore attempts or call native code`,async()=>{
  const f=await fixture(),pending=deferred();f.api.recover=()=>pending.promise;
  const operation=f.flow.recover();await new Promise(setImmediate);f.flow.dispose();
  pending.resolve({flowVersion:'owner_8day_v1',canStart:true,attempts:[record()]});await operation;
  assert.equal(f.flow.snapshot.phase,'disabled');assert.equal(f.flow.snapshot.attempts.length,0);assert.deepEqual(f.calls,[]);
 });
 test(`${asset}: malformed/duplicate/oversized discovery cannot authorize a start`,async()=>{
  for(const patch of [{flowVersion:'legacy'},{canStart:'true'},{attempts:[record(),record()]},{attempts:Array(28).fill(record())},{attempts:[record(id,{baseReward:99999})]},{attempts:[record(id,{settlementDeadline:'bad'})]}]){
   const f=await fixture();f.api.recover=async()=>({flowVersion:'owner_8day_v1',canStart:true,attempts:[],...patch});await f.flow.recover();
   assert.equal(f.flow.snapshot.code,'invalid_response');assert.equal(f.flow.snapshot.canStart,false);assert.deepEqual(f.calls,[]);
  }
 });
 test(`${asset}: recovery without a native provider still permits checking an old bonus`,async()=>{
  const f=await fixture();f.flow.ads=null;f.state.canStart=true;await f.flow.recover();assert.equal(f.flow.snapshot.canStart,false);assert.equal(f.flow.snapshot.canCheck,true);
  f.state.records=[record(id,{state:'credited'})];assert.equal((await f.flow.check()).phase,'credited');assert.deepEqual(f.calls,['recover','recover']);
 });
}
