// Fresh migrations -> API initialization -> normal daily, without a manual quest seed.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const cwd = process.cwd(), database = process.argv[2];
assert.match(cwd, /\/\.tmp\/remediation-s\d{3}\/[^/]+$/);
assert.match(database || '', /^domino_remediation_s\d{3}_[a-z0-9]+$/);
const url = `postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public`;
const require = createRequire(path.join(cwd, 'package.json'));
const {PrismaClient} = require('@prisma/client');
const {EconomyService} = await import(pathToFileURL(path.join(cwd, 'apps/api/dist/src/modules/economy/economy.service.js')));
const db = new PrismaClient({datasources: {db: {url}}});
try {
  for (const model of ['coinEconomyConfig', 'coinQuest', 'player', 'coinWallet', 'coinDailyBonusClaim']) {
    assert.equal(await db[model].count(), 0, `${model}: requires an empty synthetic database`);
  }
  const user = await db.user.create({data: {id: 'remediation-daily', name: 'Daily fixture', email: 'daily@example.invalid'}});
  const player = await db.player.create({data: {userId: user.id, displayName: 'Daily fixture', wallet: {create: {balance: 1000}}}});
  const service = new EconomyService(db, {getCurrentProfile: async () => ({user, player})});
  await service.onModuleInit();
  const first = await service.claimDailyBonus({}, {claimMode: 'normal'}, new Date('2026-01-01T10:00:00Z'));
  assert.equal(first.claimed, true);
  assert.equal(first.reward, 200);
  assert.equal(first.wallet.balance, 1200);
  const repeat = await service.claimDailyBonus({}, {claimMode: 'normal'}, new Date('2026-01-01T11:00:00Z'));
  assert.equal(repeat.claimed, false);
  assert.equal(repeat.wallet.balance, 1200);
  const second = await service.claimDailyBonus({}, {claimMode: 'normal'}, new Date('2026-01-02T10:00:00Z'));
  assert.equal(second.claimed, true);
  assert.equal(second.reward, 300);
  assert.equal(second.wallet.balance, 1500);
  assert.equal(await db.coinDailyBonusClaim.count(), 2);
  const ledger = await db.coinLedgerEntry.findMany();
  assert.equal(ledger.length, 2);
  assert.ok(ledger.every(row => row.type === 'daily_bonus'));
  const quest = await db.coinQuest.findUniqueOrThrow({where: {key: 'daily_login'}});
  assert.equal(quest.rewardAmount, 0);
  assert.equal(quest.period, 'daily');
  const progress = await db.coinQuestProgress.findUniqueOrThrow({where: {playerId_questId: {playerId: player.id, questId: quest.id}}});
  assert.equal(progress.state, 'completed');
  const ownerQuest = await db.coinQuest.update({where: {key: 'daily_login'}, data: {title: 'Owner title', description: 'Owner description', rewardAmount: 17, maxProgress: 3, isActive: false}});
  await service.onModuleInit();
  assert.deepEqual(await db.coinQuest.findUniqueOrThrow({where: {key: 'daily_login'}}), ownerQuest);
  assert.equal(await db.coinQuest.count(), 1);
  console.log(JSON.stringify({database, manualQuestSeed: false, firstReward: first.reward, repeatClaimed: repeat.claimed, nextDayReward: second.reward, balance: second.wallet.balance, claimCount: 2, ledgerCount: 2, additionalQuestReward: 0, questProgress: progress.state, restartPreservesOwnerQuest: true}, null, 2));
} catch (error) {
  console.error(JSON.stringify({database, error: error.message}));
  throw error;
} finally {
  await db.$disconnect();
}
