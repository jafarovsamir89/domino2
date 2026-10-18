// Exercise the real service against a fresh, explicitly local migrated database.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const cwd = process.cwd(), database = process.argv[2];
assert.match(cwd, /\/\.tmp\/remediation-s\d{3}\/[^/]+$/);
assert.match(database || '', /^domino_remediation_s\d{3}_[a-z0-9]+$/);
const url = `postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public&connection_limit=12&pool_timeout=30`;
const require = createRequire(path.join(cwd, 'package.json'));
const {PrismaClient} = require('@prisma/client');
const {EconomyService} = await import(pathToFileURL(path.join(cwd, 'apps/api/dist/src/modules/economy/economy.service.js')));
const db = new PrismaClient({datasources: {db: {url}}});
const now = new Date('2026-01-01T10:00:00Z'), rows = [], failures = [];
const profile = async name => {
  const user = await db.user.create({data: {id: `daily-${name}`, name, email: `${name}@example.invalid`}});
  const player = await db.player.create({data: {userId: user.id, displayName: name}});
  return {user, player};
};
const serviceFor = (identity, client = db) => new EconomyService(client, {getCurrentProfile: async () => identity});
const reconcile = async (identity, expected, expectedClaims = 1) => {
  const wallet = await db.coinWallet.findUniqueOrThrow({where: {playerId: identity.player.id}});
  const ledger = await db.coinLedgerEntry.findMany({where: {playerId: identity.player.id}, orderBy: {createdAt: 'asc'}});
  const claims = await db.coinDailyBonusClaim.findMany({where: {playerId: identity.player.id}});
  assert.equal(wallet.balance, expected);
  assert.equal(wallet.lifetimeEarned, expected);
  assert.equal(wallet.reserved, 0);
  assert.equal(ledger.reduce((sum, row) => sum + row.amount, 0), expected);
  assert.equal(claims.reduce((sum, row) => sum + row.amount, 0), expected);
  assert.equal(claims.length, expectedClaims);
  for (const entry of ledger) assert.equal(entry.balanceAfter - entry.balanceBefore, entry.amount);
  const keys = ledger.map(row => row.idempotencyKey);
  assert.ok(keys.every(Boolean), 'Every new daily grant has an idempotency key');
  assert.equal(new Set(keys).size, keys.length);
  return {balance: wallet.balance, ledgerEntries: ledger.length, claims: claims.length};
};
const run = async (name, check) => {
  try { rows.push({name, ok: true, ...await check()}); }
  catch (error) { rows.push({name, ok: false, error: error.message}); failures.push(name); }
};
try {
  assert.equal(await db.player.count(), 0, 'Requires a fresh synthetic database');
  await serviceFor({}).onModuleInit();
  for (const scenario of ['normal', 'directx2', 'upgrade', 'mixed']) {
    await run(scenario, async () => {
      const identity = await profile(scenario);
      // Multiple service objects share no in-process mutex; DB coordination is required.
      const services = Array.from({length: 4}, () => serviceFor(identity));
      if (scenario === 'upgrade') await services[0].claimDailyBonus({}, {claimMode: 'normal'}, now);
      const result = await Promise.allSettled(Array.from({length: 100}, (_, index) => services[index % 4].claimDailyBonus({}, {
        claimMode: scenario === 'normal' || (scenario === 'mixed' && index % 2 === 0) ? 'normal' : 'rewarded_x2'
      }, now)));
      const errors = result.filter(item => item.status === 'rejected');
      const grants = result.filter(item => item.status === 'fulfilled' && item.value.claimed).length;
      const expected = scenario === 'normal' ? 200 : 400;
      const wallet = await db.coinWallet.findUniqueOrThrow({where: {playerId: identity.player.id}});
      const observation = {requests: 100, rejected: errors.length, grants, actualBalance: wallet.balance, expected};
      console.log(JSON.stringify({observation: scenario, ...observation}));
      assert.equal(errors.length, 0, `Retries must not fail: ${errors[0]?.reason?.code || errors[0]?.reason?.message || ''}`);
      if (scenario === 'mixed') assert.ok(grants >= 1 && grants <= 2);
      else assert.equal(grants, 1);
      const amounts = await reconcile(identity, expected);
      for (let index = 0; index < 5; index++) {
        assert.equal((await services[0].claimDailyBonus({}, {claimMode: 'rewarded_x2'}, now)).claimed, scenario === 'normal' && index === 0);
      }
      await reconcile(identity, 400);
      return {...observation, ...amounts, sequentialRetries: 5};
    });
  }

  await run('rollback-and-retry', async () => {
    const identity = await profile('rollback');
    const transaction = db.$transaction.bind(db);
    const failingDb = new Proxy(db, {get(target, key) {
      if (key === '$transaction') return (callback, options) => transaction(async tx => {
        await callback(tx);
        throw new Error('Synthetic rollback after daily grant');
      }, options);
      return Reflect.get(target, key);
    }});
    await assert.rejects(serviceFor(identity, failingDb).claimDailyBonus({}, {claimMode: 'normal'}, now), /Synthetic rollback/);
    assert.equal(await db.coinWallet.count({where: {playerId: identity.player.id}}), 0);
    assert.equal(await db.coinLedgerEntry.count({where: {playerId: identity.player.id}}), 0);
    assert.equal(await db.coinDailyBonusClaim.count({where: {playerId: identity.player.id}}), 0);
    const service = serviceFor(identity);
    await service.claimDailyBonus({}, {claimMode: 'normal'}, now);
    const failingUpgrade = serviceFor(identity, failingDb);
    await assert.rejects(failingUpgrade.claimDailyBonus({}, {claimMode: 'rewarded_x2'}, now), /Synthetic rollback/);
    await reconcile(identity, 200);
    await service.claimDailyBonus({}, {claimMode: 'rewarded_x2'}, now);
    return {rolledBackInitialAndUpgrade: true, ...await reconcile(identity, 400)};
  });

  await run('legacy-claim-without-ledger-key', async () => {
    const identity = await profile('legacy');
    await db.coinWallet.create({data: {playerId: identity.player.id, balance: 200, lifetimeEarned: 200}});
    await db.coinDailyBonusClaim.create({data: {playerId: identity.player.id, claimDate: '2026-01-01', amount: 200, streakDay: 1}});
    const result = await serviceFor(identity).claimDailyBonus({}, {claimMode: 'rewarded_x2'}, now);
    assert.equal(result.claimed, true);
    assert.equal(result.wallet.balance, 400);
    assert.equal((await serviceFor(identity).claimDailyBonus({}, {claimMode: 'rewarded_x2'}, now)).claimed, false);
    const entries = await db.coinLedgerEntry.findMany({where: {playerId: identity.player.id}});
    assert.equal(entries.length, 1);
    assert.equal(entries[0].amount, 200);
    assert.ok(entries[0].idempotencyKey);
    return {balance: result.wallet.balance, upgradeEntries: 1};
  });

  await run('baku-midnight-and-streak-gap', async () => {
    const identity = await profile('dates'), service = serviceFor(identity);
    const first = await service.claimDailyBonus({}, {claimMode: 'normal'}, new Date('2026-01-01T19:59:59Z'));
    const next = await service.claimDailyBonus({}, {claimMode: 'normal'}, new Date('2026-01-01T20:00:00Z'));
    const gap = await service.claimDailyBonus({}, {claimMode: 'normal'}, new Date('2026-01-04T10:00:00Z'));
    assert.equal(first.claim.claimDate, '2026-01-01');
    assert.equal(next.claim.claimDate, '2026-01-02');
    assert.equal(next.reward, 300);
    assert.equal(gap.reward, 200);
    assert.equal(gap.claim.streakDay, 1);
    return await reconcile(identity, 700, 3);
  });
  console.log(JSON.stringify({database, scope: 'Synthetic normal/x2 contract; ad verification R-09 remains open', rows, failures}, null, 2));
  assert.deepEqual(failures, []);
} finally { await db.$disconnect(); }
