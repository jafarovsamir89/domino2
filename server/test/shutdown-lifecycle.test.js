const test=require('node:test');
const assert=require('node:assert/strict');
const {makeRoom}=require('./helpers/classic101-room.cjs');
const {loadCustomStateSnapshotForRestore:load}=require('../roomRestoreLookup');

test('shutdown saves once before disposal and does not turn departure into forfeit',async t=>{
 const {room}=await makeRoom(t);
 room.state.gameActive=true;room.state.currentPlayerIndex=1;room.state.turnDeadlineAt=Date.now()+19000;
 room.matchRecordId='shutdown-lifecycle-match';room.hands=[[{a:1,b:2}],[{a:3,b:4}]];
 let saves=0,disconnects=0,forfeits=0,snapshot;
 room.settleForfeitStake=async()=>{forfeits++;};
 room.saveCustomStateToRedis=async()=>{saves++;snapshot=JSON.parse(JSON.stringify(room.buildCustomStateSnapshot()));return true;};
 room.disconnect=async()=>{disconnects++;await room.onLeave({sessionId:'s0'},true);await room.onDispose();};
 await Promise.all([room.onBeforeShutdown(),room.onBeforeShutdown()]);
 assert.equal(saves,1);assert.equal(disconnects,1);assert.equal(forfeits,0);
 assert.equal(snapshot.state.gameActive,true);assert.equal(snapshot.state.currentPlayerIndex,1);
 assert.equal(snapshot.snapshotVersion,1);assert(snapshot.shutdownTurnRemainingMs>18000);
 assert.deepEqual(snapshot.hands,[[{a:1,b:2}],[{a:3,b:4}]]);
});

test('shutdown disconnects even when snapshot storage is unavailable',async t=>{
 const {room}=await makeRoom(t);let disconnects=0;
 room.saveCustomStateToRedis=async()=>false;room.disconnect=async()=>{disconnects++;};
 await room.onBeforeShutdown();assert.equal(disconnects,1);
});

test('restore rejects unknown snapshot versions and stale room/match context',async()=>{
 const valid={snapshotVersion:1,roomId:'r',roomCode:'CODE',matchRecordId:'m'};
 for(const [patch,options] of [[{snapshotVersion:2},{}],[{roomId:'other'},{}],[{matchRecordId:'old'},{restoreMatchId:'m'}]]){
  const redis={status:'ready',get:async()=>JSON.stringify({...valid,...patch})};
  assert.equal(await load({redis,options:{restoreRoomId:'r',restoreRoomCode:'CODE',...options}}),null);
 }
 const redis={status:'ready',get:async()=>JSON.stringify(valid)};
 assert.deepEqual(await load({redis,options:{restoreRoomId:'r',restoreMatchId:'m'}}),valid);
});
