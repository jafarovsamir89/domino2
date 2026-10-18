import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const cwd = process.cwd(), database = process.argv[2];
assert.match(cwd, /\/\.tmp\/remediation-s\d{3}\/[^/]+$/);
assert.match(database || '', /^domino_remediation_s\d{3}_[a-z0-9]+$/);
const require = createRequire(path.join(cwd, 'package.json'));
const {PrismaClient} = require('@prisma/client');
const load = name => import(pathToFileURL(path.join(cwd, `apps/api/dist/src/modules/${name}.js`)));
const {EconomyService} = await load('economy/economy.service');
const {createGameToken} = await load('auth/game-token');
const {signDominoPayload} = await load('security/domino-proof');
const db = new PrismaClient({datasources: {db: {url: `postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public&connection_limit=12&pool_timeout=30`}}});
const service = new EconomyService(db, {}), results = [];
const signed = (scope, data) => { const body = {...data, integrityScope: `economy.${scope}`}; return {...body, proof: signDominoPayload(body)}; };
const fixture = async (name, balance = 1000) => {
  const players = [];
  for (const suffix of ['a', 'b']) {
    const user = await db.user.create({data: {id: `${name}-${suffix}`, name: suffix, email: `${name}-${suffix}@example.invalid`}});
    players.push(await db.player.create({data: {userId: user.id, displayName: suffix, wallet: {create: {balance}}}}));
  }
  const token = createGameToken({userId: players[0].userId, playerId: players[0].id, displayName: name, role: 'player', sessionId: name, provider: 'better-auth', issuedAt: Date.now(), expiresAt: Date.now() + 600_000});
  const payload = matchId => ({roomId: name, matchId, stakeKey: 'stake_50'});
  return {players, token, payload,
    reserve: (matchId, reversed = false) => service.reserveMatchStake(token, signed('reserve', {...payload(matchId), participants: (reversed ? [...players].reverse() : players).map(player => ({playerId: player.id}))})),
    settle: (matchId, result = 'win', winners = [players[0].id], target = service) => target.settleMatchStake(token, signed('settle', {...payload(matchId), result, winnerPlayerIds: winners})),
    snapshot: async () => ({wallets: await db.coinWallet.findMany({where: {playerId: {in: players.map(p => p.id)}}, orderBy: {playerId: 'asc'}}), stakes: await db.coinMatchStake.findMany({where: {roomId: name}, orderBy: {id: 'asc'}}), ledger: await db.coinLedgerEntry.findMany({where: {playerId: {in: players.map(p => p.id)}}, orderBy: {id: 'asc'}})})
  };
};
const run = async (name, check) => {
  try { results.push({name, ok: true, ...await check()}); }
  catch (error) { results.push({name, ok: false, error: error.message}); }
};
try {
  assert.equal(await db.player.count(), 0, 'Requires a fresh synthetic database');
  await service.onModuleInit();
  await run('late-result-and-refund', async () => {
    const f = await fixture('late'); await f.reserve('B'); const before = await f.snapshot();
    for (const result of ['win', 'refund']) {
      assert.equal((await f.settle('A', result)).settled, 0);
      assert.deepEqual(await f.snapshot(), before);
    }
    return {newMatchUntouched: true};
  });
  await run('active-other-match', async () => {
    const f = await fixture('conflict'); await f.reserve('B'); const before = await f.snapshot();
    const response = await f.reserve('A');
    assert.equal(response.ok, false);
    assert.equal(response.reason, 'reservation_match_conflict');
    assert.deepEqual(await f.snapshot(), before);
    return {rejectedWithoutWrites: true};
  });
  await run('missing-match', async () => {
    const f = await fixture('missing'), before = await f.snapshot();
    assert.equal((await f.reserve(undefined)).reason, 'missing_match');
    assert.equal((await f.settle(undefined, 'refund')).reason, 'missing_match');
    assert.deepEqual(await f.snapshot(), before);
    return {rejectedWithoutWrites: true};
  });
  await run('concurrent-reserve-and-settle', async () => {
    const f = await fixture('parallel', 50);
    const reserve = await Promise.all(Array.from({length: 100}, (_, i) => f.reserve('A', Boolean(i % 2))));
    assert.ok(reserve.every(response => response.ok && response.reserved === 100), JSON.stringify(reserve.filter(r => !r.ok).slice(0, 2)));
    const reserved = await f.snapshot();
    assert.equal(reserved.ledger.length, 2);
    assert.ok(reserved.wallets.every(wallet => wallet.balance === 0 && wallet.reserved === 50));
    const settlement = await Promise.all(Array.from({length: 30}, () => f.settle('A')));
    assert.equal(settlement.filter(response => response.settled === 2).length, 1);
    assert.ok(settlement.every(response => response.ok));
    const after = await f.snapshot();
    assert.equal(after.ledger.length, 5);
    assert.equal(after.wallets.reduce((sum, wallet) => sum + wallet.balance, 0), 95);
    assert.ok(after.wallets.every(wallet => wallet.reserved === 0));
    return {reserveRequests: 100, settleRequests: 30, bank: 100, finalBalanceSum: 95, commission: 5};
  });
  await run('replay-and-next-match', async () => {
    const f = await fixture('replay'); await f.reserve('A'); await f.settle('A', 'refund'); await f.reserve('B');
    let before = await f.snapshot();
    assert.equal((await f.settle('A')).settled, 0);
    assert.equal((await f.reserve('A')).ok, false);
    assert.deepEqual(await f.snapshot(), before);
    await f.settle('B', 'refund'); before = await f.snapshot();
    assert.equal((await f.reserve('A')).reason, 'match_already_settled');
    assert.deepEqual(await f.snapshot(), before);
    assert.equal((await f.reserve('C')).reserved, 100);
    await f.settle('C', 'refund');
    const after = await f.snapshot();
    assert.ok(after.wallets.every(wallet => wallet.balance === 1000 && wallet.reserved === 0));
    assert.equal(after.ledger.filter(entry => entry.type === 'reserve').length, 6);
    return {completedMatches: 3, oldRequestsHarmless: true};
  });
  await run('winner-must-participate', async () => {
    const f = await fixture('winner'); await f.reserve('A'); const before = await f.snapshot();
    const result = await f.settle('A', 'win', ['not-a-participant']);
    assert.equal(result.ok, false); assert.equal(result.reason, 'winner_not_reserved');
    assert.deepEqual(await f.snapshot(), before);
    return {invalidWinnerRejected: true};
  });
  await run('participant-set-and-global-replay', async () => {
    const f = await fixture('participants'); await f.reserve('A');
    const before = await f.snapshot();
    const reduced = signed('reserve', {...f.payload('A'), participants: [{playerId: f.players[0].id}]});
    assert.equal((await service.reserveMatchStake(f.token, reduced)).reason, 'reservation_participants_conflict');
    assert.deepEqual(await f.snapshot(), before);
    await f.settle('A', 'refund'); await f.reserve('B'); await f.settle('B', 'refund');
    const other = await fixture('other-players');
    const replay = signed('reserve', {...f.payload('A'), participants: other.players.map(p => ({playerId: p.id}))});
    assert.equal((await service.reserveMatchStake(f.token, replay)).reason, 'match_already_settled');
    assert.ok((await other.snapshot()).wallets.every(wallet => wallet.balance === 1000 && wallet.reserved === 0));
    return {changedParticipantsRejected: true, oldMatchCannotUseNewPlayers: true};
  });
  await run('rollback-settlement', async () => {
    const f = await fixture('rollback'); await f.reserve('A'); const before = await f.snapshot();
    const failingDb = new Proxy(db, {get(target, key) {
      if (key === '$transaction') return (callback, options) => target.$transaction(async tx => {await callback(tx); throw Error('Synthetic settlement rollback')}, options);
      return Reflect.get(target, key);
    }});
    await assert.rejects(f.settle('A', 'win', [f.players[0].id], new EconomyService(failingDb, {})), /Synthetic settlement rollback/);
    assert.deepEqual(await f.snapshot(), before);
    assert.equal((await f.settle('A')).settled, 2);
    assert.equal((await f.settle('A')).settled, 0);
    return {rollbackAndRetry: true};
  });
  await run('legacy-unidentified-reserve', async () => {
    const f = await fixture('legacy-null'); await f.reserve('A');
    await db.coinMatchStake.updateMany({where: {roomId: 'legacy-null'}, data: {matchId: null}});
    const before = await f.snapshot();
    assert.equal((await f.settle('A', 'refund')).settled, 0);
    assert.equal((await f.reserve('B')).reason, 'reservation_match_conflict');
    assert.deepEqual(await f.snapshot(), before);
    return {unidentifiedFundsNotReassigned: true};
  });
  await run('frozen-stake-and-commission', async () => {
    const f = await fixture('config'); await f.reserve('A');
    await db.coinStakeTable.update({where: {key: 'stake_50'}, data: {stakeAmount: 900, commissionBps: 5000}});
    assert.equal((await f.reserve('A')).reserved, 100);
    await db.coinStakeTable.update({where: {key: 'stake_50'}, data: {isActive: false}});
    const result = await f.settle('A');
    assert.equal(result.bank, 100); assert.equal(result.commission, 5); assert.equal(result.payout, 45);
    assert.ok((await f.snapshot()).wallets.every(wallet => wallet.reserved === 0));
    return {originalBank: 100, originalCommission: 5};
  });
  console.log(JSON.stringify({database, results}, null, 2));
  assert.ok(results.every(result => result.ok), 'Some reservation scenarios failed');
} finally { await db.$disconnect(); }
