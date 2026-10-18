/* Audit-only boundary fixtures. Uses actual room methods; timers and I/O are virtual. */
'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {Board}=require('../../../../server/board');
const model=require('../../../../server/model');
const {getRuleset}=require('../../../../shared/domino-rulesets.cjs');
const output={scope:'Literal expected outcomes plus replay of a real 28-tile fish state. No network or UI execution.',cases:[]};
const harness=require('./full-match-audit.cjs');
async function test(name,fn){try{output.cases.push({name,...await fn()})}catch(e){output.cases.push({name,error:e.stack});process.exitCode=1}}
(async()=>{
 await test('real_blocked_101_state_replay',async()=>{
  const original=JSON.parse(fs.readFileSync('docs/audit/evidence/metrics/full-match-audit.json'));
  const example=original.diagnostics.fishStateMismatch.examples[0];
  const x=example.actual,room=await harness.makeRoom('classic101',x.hands.length,x.team);
  try{
   room.hands=x.hands.map(h=>h.map(id=>new model.Tile(...id.split('-').map(Number))));
   room.boneyard=[];room.internalBoard=Board.fromJSON(x.board);
   room.matchState=JSON.parse(JSON.stringify(example.before));room.syncMatchStateToSchema();room.state.gameActive=true;
   harness.invariant(room);assert.ok(room.internalBoard.isBlocked(room.hands,[]));
   const points=room.hands.map(h=>h.reduce((s,t)=>s+t.total,0));
   const winner=points.indexOf(Math.min(...points));
   const opponent=points.reduce((s,v,i)=>s+(i===winner?0:v),0);
   const beforeScores=room.matchState.sides.map(s=>s.scored);
   assert.equal(room.hands.length,2);assert.equal(winner,0);assert.equal(beforeScores[0],79);assert.equal(opponent,50);
   room.advanceTurn();
   return {tiles:28,blocked:true,rawHandPoints:points,literalExpectedScores:[129,0],literalExpectedFinished:true,actualScores:room.matchState.sides.map(s=>s.scored),actualFinished:room.matchFinished,conforms:room.matchState.sides[0].scored===129&&room.matchFinished};
  }finally{room.onDispose();room.clock.clear()}
 });
 await test('101_initial_deal_without_positive_double',async()=>{
  let seed;
  for(let i=1;i<20000;i++){
   harness.setSeed(i);const deck=model.shuffle(model.createFullSet());
   const opening=getRuleset('classic101').determineFirstPlayer([deck.slice(0,7),deck.slice(7,14)]);
   if(opening.player===-1){seed=i;break}
  }
  assert.ok(seed);
  const run=await harness.playMatch({mode:'classic101',count:2,team:false,seed,difficulties:['medium','medium']});
  const example=harness.results.diagnostics.emptyOpening.examples.at(-1);
  return {seed,run,initial:example?.snapshot,ruleRequiresDrawToOpen:true,conforms:run.ok};
 });
 await test('101_threshold_12_then_1',async()=>{
  const r=getRuleset('classic101');let state=r.createMatchState(2,false);
  const state1=r.resolveRoundEnd({hand:[],hands:[[],[new model.Tile(6,6)]],playerIndex:0,matchState:state}).matchState;
  assert.equal(state1.sides[0].scored,0);assert.equal(state1.sides[0].pending,12);
  const state2=r.resolveRoundEnd({hand:[],hands:[[],[new model.Tile(0,1)]],playerIndex:0,matchState:state1}).matchState;
  assert.equal(state2.sides[0].scored,13);assert.equal(state2.sides[0].pending,0);
  return {conforms:true,first:{scored:0,pending:12},second:{scored:13,pending:0}};
 });
 await test('101_tie_carry_14',async()=>{
  const r=getRuleset('classic101'),b=new Board();b.telephoneEnabled=false;b.scoringEnabled=false;b.placeFirst(new model.Tile(0,0));
  const result=r.resolveBlocked({board:b,hands:[[new model.Tile(1,6)],[new model.Tile(3,4)]],boneyard:[],matchState:r.createMatchState(2,false)});
  assert.equal(result.tie,true);assert.equal(result.matchState.carryPoints,14);assert.equal(result.matchState.thresholdBypassNext,true);
  return {conforms:true,carry:14,thresholdBypassNext:true,note:'Pure ruleset fixture; full-set replay above covers room integration'};
 });
 await test('telefon_instant_flag_named_contract',async()=>{
  const r=getRuleset('telefon'),hand=[new model.Tile(1,2)];
  const off=r.resolveRoundEnd({score:35,hand,instantWinEnabled:false});
  const on=r.resolveRoundEnd({score:35,hand,instantWinEnabled:true});
  assert.equal(off.isInstantWin,false);assert.equal(on.isInstantWin,true);
  return {conforms:true,note:'Correctly named input passes; actual caller mismatch remains R-08'};
 });
 await test('classic101_board_configuration',async()=>{
  const room=await harness.makeRoom('classic101',4,true);
  try{assert.equal(room.internalBoard.telephoneEnabled,false);assert.equal(room.internalBoard.scoringEnabled,false);assert.equal(room.matchState.sides.length,2);return{conforms:true,teamSides:2,telephone:false,scoring:false}}finally{room.onDispose();room.clock.clear()}
 });
})().catch(e=>{output.fatal=e.stack;process.exitCode=1}).finally(()=>{
 harness.restore();fs.writeFileSync('docs/audit/evidence/metrics/gameplay-boundaries.json',JSON.stringify(output,null,2));console.log(output.cases.map(r=>({name:r.name,conforms:r.conforms,error:r.error})));});
