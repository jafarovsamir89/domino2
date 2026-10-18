/* Audit-only. Executes real DominoRoom gameplay methods with virtual scheduling.
   No server, API, wallet, OAuth or production endpoints are called. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.DOMINO_DEBUG_LOGS = 'false';
process.env.BETTER_AUTH_SECRET = 'audit-local-only-not-a-production-secret-2026';
process.env.DOMINO_SERVER_SECRET = process.env.BETTER_AUTH_SECRET;
delete process.env.REDIS_URI;
const DominoRoom = require('../../../../server/DominoRoom');
const { Player } = require('../../../../server/schema/GameState');
const { AIPlayer } = require('../../../../server/ai');
const { Tile } = require('../../../../server/model');
const { getRuleset } = require('../../../../shared/domino-rulesets.cjs');
const outPath = path.resolve(__dirname, '../metrics/full-match-audit.json');
const saved = { randomInt: crypto.randomInt, timeout: global.setTimeout, clear: global.clearTimeout, log: console.log };
let deckState = 1, aiState = 2, serial = 0;
function random(which) {
  if (which === 'ai') { aiState = (Math.imul(aiState, 1664525) + 1013904223) >>> 0; return aiState / 2 ** 32; }
  deckState = (Math.imul(deckState, 1664525) + 1013904223) >>> 0; return deckState / 2 ** 32;
}
crypto.randomInt = function(min, max) {
  if (max === undefined) { max = min; min = 0; }
  return min + Math.floor(random(max === 1_000_000 ? 'ai' : 'deck') * (max - min));
};
global.setTimeout = (fn, delay) => ({ auditVirtualTimer: true, fn, delay, unref() {} });
global.clearTimeout = timer => { if (!timer?.auditVirtualTimer) saved.clear(timer); };
console.log = () => {};
const results = {
  scope: 'Real DominoRoom onCreate/startDeal/performPlay/Draw/Pass/Gosha/endDeal/endRound. Timer scheduling is virtual; seats are fixtures, I/O is replaced. Not network/client UI/real timing/wallet integration.',
  seedMethod: 'LCG deck and AI streams are separate; deck seed shared for paired seat permutations. Full parameters and seeds are recorded.',
  sourceCommit: '508932ebeb45cde744e3e1dbd92bc5592ca66093',
  matrix: [], tournament: [], golden: [], failures: [], diagnostics: { fishStateMismatch: { count: 0, examples: [] }, emptyOpening: { count: 0, examples: [] } }
};
function snapshot(room) {
  return { mode: room.gameMode, team: room.state.isTeamMode, hands: room.hands.map(h => h.map(t => t.id)), boneyard: room.boneyard.map(t => t.id), board: room.internalBoard.toJSON(), matchState: JSON.parse(JSON.stringify(room.matchState)), currentPlayer: room.state.currentPlayerIndex, scores: [...room.state.playerOrder].map(s => room.state.players.get(s).score) };
}
function invariant(room) {
  const tiles = [...room.hands.flat(), ...room.boneyard, ...room.internalBoard.nodes.map(n => n.tile)];
  assert.equal(tiles.length, 28, 'tile count');
  assert.equal(new Set(tiles.map(t => t.id)).size, 28, 'unique tiles');
  assert.ok(tiles.every(t => t.a >= 0 && t.b <= 6), 'tile values');
  assert.ok(room.hands.every(h => Array.isArray(h)), 'hands');
  for (const s of room.state.players.values()) assert.ok(Number.isFinite(s.score) && s.score >= 0, 'score finite/nonnegative');
  if (room.state.isTeamMode) for (let team = 0; team < 2; team++) {
    if (room.gameMode === 'telefon') {
      const individual = [...room.state.playerOrder].reduce((sum, sid, i) => sum + (i % 2 === team ? room.state.players.get(sid).score : 0), 0);
      assert.equal(room.state.teamScores[team], individual, 'Telefon team score equals member scores');
    }
  }
}
async function makeRoom(mode, count, team) {
  const room = new DominoRoom();
  room.roomId = `audit-full-${++serial}`;
  room.broadcast = (type, payload) => {
    room.auditEvents[type] = (room.auditEvents[type] || 0) + 1;
    if (type === 'deal_end' && payload.fish) room.auditFishDeals++;
    if (type === 'round_end') room.auditFinal = JSON.parse(JSON.stringify(payload));
  };
  room.auditEvents = {};
  room.auditFishMismatches = 0;
  room.auditFishDeals = 0;
  room.scheduleTurnTimer = () => {};
  room.recordMatchResult = () => { room.matchRecorded = true; };
  await room.onCreate({ gameMode: mode, playerCount: count, roomMode: team ? 'team' : 'ffa', aiCount: 0, stakeKey: 'free', instantWinEnabled: true });
  clearInterval(room.presenceInterval); room.presenceInterval = null;
  for (let i = 0; i < count; i++) {
    const player = new Player(); player.name = `Audit ${i}`; player.seatIndex = i; player.isConnected = true;
    room.state.players.set(`s${i}`, player); room.state.playerOrder.push(`s${i}`);
  }
  room.scheduleNextDeal = () => { room.pendingAdvanceKind = 'deal'; };
  room.scheduleNextRound = () => { room.pendingAdvanceKind = 'round'; };
  const originalEndDeal = room.endDeal.bind(room);
  room.endDeal = (winner, fish) => {
    let expected, before;
    if (mode === 'classic101' && fish) {
      before = JSON.parse(JSON.stringify(room.matchState));
      expected = getRuleset(mode).resolveBlocked({ board: room.internalBoard, hands: room.hands, boneyard: room.boneyard, isTeamMode: team, matchState: before, getTeamMembers: room.getTeamMembers.bind(room) });
    }
    const ret = originalEndDeal(winner, fish);
    if (expected && JSON.stringify(expected.matchState) !== JSON.stringify(room.matchState)) {
      room.auditFishMismatches++;
      const d = results.diagnostics.fishStateMismatch; d.count++;
      if (d.examples.length < 8) d.examples.push({ seed: room.auditSeed, before, expectedState: expected.matchState, expectedScoreboard: expected.scoreboard, actual: snapshot(room) });
    }
    return ret;
  };
  return room;
}
async function playMatch({ mode, count, team, seed, difficulties }) {
  deckState = seed >>> 0; aiState = (seed ^ 0xa5a5f00d) >>> 0;
  const room = await makeRoom(mode, count, team); room.auditSeed = seed;
  const bots = difficulties.map((d, i) => new AIPlayer(i, d));
  let actions = 0, deals = 1, draws = 0, passes = 0, gosha = 0, aiMs = 0;
  let immediatePointsMissed = 0, immediateChoiceSamples = 0, opening = null;
  const started = performance.now();
  try {
    await room.startDeal();
    while (!room.matchFinished && actions < 18000 && deals < 250) {
      invariant(room);
      if (!room.state.gameActive) {
        deals++;
        if (room.pendingAdvanceKind === 'round') await room.startRound(); else await room.startDeal();
        continue;
      }
      const pi = room.state.currentPlayerIndex;
      if (pi < 0 || !room.hands[pi]) {
        const d = results.diagnostics.emptyOpening; d.count++;
        if (d.examples.length < 4) d.examples.push({ seed, snapshot: snapshot(room) });
        return { ok: false, reason: 'opening_player_missing', seed, actions, deals, difficulties, count, team, mode };
      }
      const hand = room.hands[pi];
      const moves = room.getValidMovesForPlayer(pi);
      const combo = mode === 'telefon' ? room.internalBoard.getGoshaCombo(hand) : null;
      if (room.internalBoard.isEmpty && !opening) opening = { player: pi, required: room.getOpeningMoveRequirement() };
      const beforeNodes = room.internalBoard.nodes.length;
      let accepted;
      if (combo) { accepted = room.performGosha(pi, combo, true); gosha++; }
      else if (moves.length) {
        const t = performance.now();
        const move = bots[pi].chooseMove(room.internalBoard, hand, moves, [], room.hands, room.boneyard, room.playerMissingSuits, null);
        aiMs += performance.now() - t;
        assert.ok(move && moves.some(m => m.tileIndex === move.tileIndex && m.openEndIndex === move.openEndIndex), 'AI move legal');
        if (mode === 'telefon' && moves.length > 1) {
          const pointFor = m => {
            const { score } = bots[pi].simulateMove(room.internalBoard, hand[m.tileIndex], m.openEndIndex); return Number(score || 0);
          };
          const best = Math.max(...moves.map(pointFor));
          if (pointFor(move) < best) immediatePointsMissed++;
          immediateChoiceSamples++;
        }
        accepted = room.performPlay(pi, move.tileIndex, move.openEndIndex, true);
      } else if (room.boneyard.length) { accepted = room.performDraw(pi, true); draws++; }
      else { accepted = room.performPass(pi, true); passes++; }
      assert.equal(accepted, true, 'legal action accepted'); actions++;
      invariant(room);
      assert.ok(room.internalBoard.nodes.length >= beforeNodes, 'board not removed during transition');
      await Promise.resolve();
    }
    assert.ok(room.matchFinished, 'full match terminates within bounds');
    assert.ok(room.auditFinal?.isMatchOver, 'round_end announces finality');
    const winner = room.auditFinal.winnerIndex;
    return { ok: true, seed, mode, count, team, difficulties, winner, winnerTeam: team ? winner % 2 : null, actions, deals, draws, passes, gosha, aiMs, computeMs: performance.now() - started, fishDeals: room.auditFishDeals, fishStateMismatches: room.auditFishMismatches, finalScores: [...room.state.playerOrder].map(s => room.state.players.get(s).score), instant: room.auditFinal.isInstantWin, immediatePointsMissed, immediateChoiceSamples, opening };
  } finally { room.onDispose(); room.clock.clear(); }
}
function wilson(wins, n) {
  if (!n) return [0, 1]; const z = 1.959963984540054, p = wins / n, den = 1 + z*z/n;
  const c = (p + z*z/(2*n))/den, h = z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))/den;
  return [c-h,c+h];
}
function aggregate(runs) {
  const ok = runs.filter(r => r.ok), sum = k => ok.reduce((s, r) => s + r[k], 0);
  const values = k => ok.map(r => r[k]).sort((a,b) => a-b);
  return { attempted: runs.length, completed: ok.length, rejectedOpenings: runs.filter(r => r.reason === 'opening_player_missing').length, meanActions: sum('actions')/ok.length, maxActions: Math.max(...values('actions')), meanDeals: sum('deals')/ok.length, gosha: sum('gosha'), draws: sum('draws'), passes: sum('passes'), meanComputeMs: sum('computeMs')/ok.length, meanAiMsPerMatch: sum('aiMs')/ok.length, immediatePointsMissed: sum('immediatePointsMissed'), immediateChoiceSamples: sum('immediateChoiceSamples'), fishStateMismatches: sum('fishStateMismatches') };
}
const flush = () => fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
if (require.main === module) {
(async () => {
  const trials = Number(process.argv[2] || 40), tournamentSeeds = Number(process.argv[3] || 80);
  for (const mode of ['telefon', 'classic101']) for (const [count, team] of [[2,false],[3,false],[4,false],[4,true]]) {
    const runs=[];
    for (let i=0;i<trials;i++) {
      const seed = (0x704123 + i*9973) >>> 0;
      try { runs.push(await playMatch({mode,count,team,seed,difficulties:Array(count).fill('medium')})); }
      catch(e) { results.failures.push({mode,count,team,seed,message:e.message,stack:e.stack}); if(results.failures.length>8) throw e; }
    }
    results.matrix.push({mode,count,team,summary:aggregate(runs),runs});flush();saved.log(`Matrix ${mode}/${count}/${team}: ${runs.filter(r=>r.ok).length}/${runs.length}`);
  }
  for(const mode of ['telefon','classic101'])for(const pair of [['easy','medium'],['easy','hard'],['medium','hard']]){
    const runs=[];let winsA=0,winsB=0,excluded=0;
    for(let i=0;i<tournamentSeeds;i++)for(const swap of [false,true]){
      const ds=swap?[pair[1],pair[0]]:pair;
      const seed=(0x32500+i*3911)>>>0;
      const result=await playMatch({mode,count:2,team:false,seed,difficulties:ds});runs.push(result);
      if(!result.ok){excluded++;continue;}
      if(ds[result.winner]===pair[0])winsA++;else winsB++;
    }
    results.tournament.push({mode,pair,winsA,winsB,excluded,winRateA:winsA/(winsA+winsB),wilson95A:wilson(winsA,winsA+winsB),note:'Paired seat permutations are correlated. Wilson interval treats games as independent and is descriptive only; paired bootstrap should be preferred for inference.',summary:aggregate(runs),runs});flush();saved.log(`Tournament ${mode}/${pair}: ${winsA}:${winsB}, excluded ${excluded}`);
  }
})().catch(e=>{results.fatal=e.stack;process.exitCode=1}).finally(()=>{
  flush();crypto.randomInt=saved.randomInt;global.setTimeout=saved.timeout;global.clearTimeout=saved.clear;console.log=saved.log;
  saved.log('Saved full-match audit. Failures:',results.failures.length,'fish state mismatches:',results.diagnostics.fishStateMismatch.count,'missing openings:',results.diagnostics.emptyOpening.count);
});

} else {
  module.exports = { playMatch, makeRoom, snapshot, invariant, results, setSeed(seed) { deckState = seed >>> 0; aiState = (seed ^ 0xa5a5f00d) >>> 0; }, restore() { crypto.randomInt = saved.randomInt; global.setTimeout = saved.timeout; global.clearTimeout = saved.clear; console.log = saved.log; } };
}
