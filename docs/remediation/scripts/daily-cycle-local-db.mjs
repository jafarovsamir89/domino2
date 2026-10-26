// Only a fresh, explicitly loopback synthetic database; never resets existing data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { EconomyService } from '../../../apps/api/dist/src/modules/economy/economy.service.js';
import { grantStarterCoins } from '../../../apps/api/dist/src/modules/economy/economy-starter.js';
const [database, output] = process.argv.slice(2);
assert.match(database || '', /^domino_remediation_s054_cycle_[a-z0-9_]+$/);
assert.ok(output?.endsWith('.json') && !fs.existsSync(output), 'Fresh evidence path required');
const db = new PrismaClient({ datasources: { db: { url: `postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public` } } });
const playerId = 's054-synthetic-cycle', userId = 's054-synthetic-owner';
const profile = { player: { id: playerId }, user: { id: userId } };
const auth = { getCurrentProfile: async () => profile };
const service = new EconomyService(db, auth), rewards = [200, 300, 350, 400, 800, 1000, 2000];
try {
  assert.equal(await db.player.count(), 0);
  await db.user.create({ data: { id: userId, name: 'Synthetic', email: 's054-cycle@example.invalid' } });
  await db.player.create({ data: { id: playerId, userId, displayName: 'Synthetic', wallet: { create: { balance: 0, reserved: 13 } } } });
  await service.onModuleInit();
  await grantStarterCoins(db, playerId, userId, 'Synthetic', 's054_cycle');
  await grantStarterCoins(db, playerId, userId, 'Synthetic', 's054_cycle_retry');
  let minted = 0;
  const checkpoints = [];
  for (let day = 0; day < 90; day++) {
    const now = new Date(Date.UTC(2026, 0, 1 + day, 12));
    const before = await service.getDailyBonusStatus({}, now);
    assert.equal(before.dailyBonus.streakDay, day % 7 + 1);
    assert.equal(before.dailyBonus.todayAmount, rewards[day % 7]);
    const claim = await service.claimDailyBonus({}, now);
    minted += rewards[day % 7];
    assert.equal(claim.reward, rewards[day % 7]);
    assert.equal(claim.wallet.balance, 1000 + minted);
    assert.equal((await service.claimDailyBonus({}, now)).claimed, false);
    if ([6, 29, 89].includes(day)) checkpoints.push({ days: day + 1, minted, balance: claim.wallet.balance });
  }
  assert.deepEqual(checkpoints.map(c => c.minted), [5050, 20700, 63650]);
  const parallelDate = new Date(Date.UTC(2026, 0, 92, 12)); // A skipped day resets the cycle.
  const parallel = await Promise.all(Array.from({ length: 100 }, () => service.claimDailyBonus({}, parallelDate)));
  assert.equal(parallel.filter(r => r.claimed).length, 1);
  assert.equal(parallel.find(r => r.claimed).reward, 200);
  minted += 200;
  const wallet = await db.coinWallet.findUniqueOrThrow({ where: { playerId } });
  const ledger = await db.coinLedgerEntry.findMany({ where: { playerId } });
  assert.equal(ledger.filter(r => r.type === 'daily_bonus').length, 91);
  assert.equal(ledger.reduce((sum, row) => sum + row.amount, 0), wallet.balance);
  assert.equal(wallet.balance, 1000 + minted);
  assert.equal(wallet.reserved, 13);
  const result = { database, scope: 'Real local PostgreSQL + actual EconomyService; synthetic owner only', policy: 'Repeating seven-day cycle, missed day resets, original grants immutable', starter: 1000, starterRetry: 'no second grant', checkpoints, parallelRequests: 100, parallelGrants: 1, dailyLedgerEntries: 91, finalBalance: wallet.balance, reserved: wallet.reserved, ledgerResidual: 0 };
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await db.$disconnect(); }
