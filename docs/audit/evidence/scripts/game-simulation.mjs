import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
globalThis.window={performance,crypto:globalThis.crypto};
const require=createRequire(import.meta.url);
const model=require('../../../../shared/domino-model-core.cjs');
const {Board}=require('../../../../shared/domino-board-core.cjs');
const {getRuleset}=require('../../../../shared/domino-rulesets.cjs');
const {AIPlayer}=require('../../../../server/ai.js');
const {Board:ClientBoard}=await import('../../../../js/board.js');
let seed=0xabcdef;const rnd=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/2**32);
const rows=[];const failures=[];const starts=performance.now();let movesChecked=0;
for(const mode of ['telefon','classic101'])for(const count of [2,3,4]){
 const stats={mode,count,deals:0,winsByDifficulty:{easy:0,medium:0,hard:0},steps:0,fish:0,maxSteps:0};
 for(let trial=0;trial<300;trial++){
  try{
   const deck=model.createFullSet();for(let i=deck.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
   const hands=Array.from({length:count},()=>deck.splice(0,7));const b=new Board(),c=new ClientBoard();
   b.telephoneEnabled=c.telephoneEnabled=mode==='telefon';b.scoringEnabled=c.scoringEnabled=mode==='telefon';
   const rules=getRuleset(mode);let op=rules.determineFirstPlayer(hands),p=op.player>=0?op.player:0;
   const diff=Array.from({length:count},(_,i)=>['easy','medium','hard'][(i+trial)%3]);
   const bots=diff.map((d,i)=>new AIPlayer(i,d));let ended=false;
   for(let step=0;step<180;step++){
    const all=[...hands.flat(),...deck,...b.nodes.map(n=>n.tile)];assert.equal(all.length,28);assert.equal(new Set(all.map(t=>t.id)).size,28);
    const mv=b.getValidMoves(hands[p]);assert.deepEqual(mv,c.getValidMoves(hands[p]));
    if(mv.length){
     let m=bots[p].chooseMove(b,hands[p],mv,[],hands,deck);
     if(b.isEmpty&&op.player>=0)m={tileIndex:op.tileIndex,openEndIndex:-1};
     assert.ok(mv.some(v=>v.tileIndex===m.tileIndex&&v.openEndIndex===m.openEndIndex));
     const t=hands[p].splice(m.tileIndex,1)[0];let s1,s2;
     if(b.isEmpty){s1=b.placeFirst(t);s2=c.placeFirst(t)}else{s1=b.placeTile(t,m.openEndIndex);s2=c.placeTile(t,m.openEndIndex)}
     assert.equal(s1,s2);assert.deepEqual(b.toJSON(),c.toJSON());movesChecked++;
     if(!hands[p].length){stats.winsByDifficulty[diff[p]]++;stats.steps+=step+1;stats.maxSteps=Math.max(stats.maxSteps,step+1);ended=true;break}
    }else if(deck.length){hands[p].push(deck.pop());continue}
    else if(b.isBlocked(hands,deck)){stats.fish++;stats.steps+=step+1;ended=true;break}
    p=(p+1)%count;
   }
   assert.ok(ended,'turn loop >180');stats.deals++;
  }catch(e){failures.push({mode,count,trial,message:e.message});if(failures.length>10)break}
 }
 rows.push(stats);
}
const flagResult=getRuleset('telefon').resolveRoundEnd({score:35,hand:[new model.Tile(1,2)],isInstantWinEnabled:false});
fs.writeFileSync('docs/audit/evidence/metrics/game-simulation.json',JSON.stringify({seed:'0xabcdef (deck only; AI uses crypto random)',scope:'1800 standalone deals; board/scoring parity and tile invariants; not full matches, sockets, regional rule correctness or population win rate',durationMs:performance.now()-starts,movesChecked,rows,failures,disabledInstantWinStillWins:flagResult.isInstantWin},null,2));
