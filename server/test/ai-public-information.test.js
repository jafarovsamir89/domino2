const test=require('node:test'),assert=require('node:assert/strict');
const {makeRoom}=require('./helpers/classic101-room.cjs');
const {AIPlayer}=require('../ai'),{Tile}=require('../model');

async function fixture(t,takeover,difficulty='medium'){
 const {room}=await makeRoom(t,4,true);
 room.state.gameActive=true;room.state.currentPlayerIndex=0;
 const actor=room.state.players.get('s0');actor.isBot=!takeover;actor.takeoverActive=takeover;actor.controller='bot';
 room.hands=[[new Tile(1,1),new Tile(2,2)],[new Tile(5,5)],[new Tile(3,3)],[new Tile(6,6)]];
 room.boneyard=[new Tile(0,0),new Tile(0,1)];room.playerMissingSuits=[new Set(),new Set(),new Set(),new Set()];
 room.getValidMovesForPlayer=()=>[{tileIndex:0,openEndIndex:0},{tileIndex:1,openEndIndex:0}];
 const bot=new AIPlayer(0,difficulty);
 bot.params={...bot.params,scoreW:0,doubleB:0,totalW:0,futureW:0,goOut:0,handP:0,rand:0,blockW:0};
 bot.simulateMove=(_board,tile)=>({board:{openEnds:[{value:tile.a===1?3:4}]},score:0});
 room.aiPlayers.set(takeover?'takeover:s0':'s0',bot);
 return {room,bot};
}
for(const takeover of [false,true]){
 test(`runBotTurn sends public counts and own hand only (takeover=${takeover})`,async t=>{
  const {room,bot}=await fixture(t,takeover);let calls=0;
  bot.chooseMove=(_board,own,moves,scores,counts,bazaarCount,missing)=>{
   calls++;assert.equal(own,room.hands[0]);assert.deepEqual(counts,[2,1,1,1]);assert.equal(bazaarCount,2);assert.deepEqual(scores,[0,0,0,0]);assert.equal(missing.length,4);return moves[0];
  };
  room.performPlay=()=>{};room.runBotTurn();assert.equal(calls,1);
 });
}
for(const difficulty of ['easy','medium','hard']){
 test(`paired hidden worlds give identical team takeover decisions (${difficulty})`,async t=>{
  const {room}=await fixture(t,true,difficulty);const choices=[];room.performPlay=(_pi,tileIndex)=>choices.push(tileIndex);
  room.runBotTurn();
  room.hands[1]=[new Tile(0,6)];room.hands[2]=[new Tile(4,4)];room.hands[3]=[new Tile(1,5)];room.boneyard=[new Tile(2,5),new Tile(2,6)];
  room.runBotTurn();assert.equal(choices.length,2);assert.equal(choices[0],choices[1]);
 });
}
test('public observed missing suits can change a team decision',async t=>{
 const {room}=await fixture(t,true);const choices=[];room.performPlay=(_pi,tileIndex)=>choices.push(tileIndex);
 room.playerMissingSuits[2]=new Set([4]);room.runBotTurn();
 room.playerMissingSuits[2]=new Set([3]);room.runBotTurn();
 assert.deepEqual(choices,[0,1]);
});
test('AI rejects a raw hidden-hand/bazaar input contract',()=>{
 const ai=new AIPlayer(0);assert.throws(()=>ai.chooseMove({},[new Tile(1,1)],[],[],[[new Tile(1,1)],[new Tile(2,2)]],[]),/public hand counts/);
 assert.equal(ai.chooseMove({},[new Tile(1,1)],[],[],[1,1],0),null);
});
