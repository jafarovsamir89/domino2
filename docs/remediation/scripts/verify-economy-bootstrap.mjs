// Destructive fixtures are forbidden: require a fresh, explicitly local test DB.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const cwd = process.cwd(), database = process.argv[2];
assert.match(cwd, /\/\.tmp\/remediation-s\d{3}\/[^/]+$/);
assert.match(database || '', /^domino_remediation(?:_s\d{3}_[a-z0-9]+)?$/);
const url = `postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public`;
const require = createRequire(path.join(cwd, 'package.json'));
const {PrismaClient} = require('@prisma/client');
const {Module} = require('@nestjs/common');
const {NestFactory} = require('@nestjs/core');
const load = name => import(pathToFileURL(path.join(cwd, `apps/api/dist/src/modules/${name}.js`)));
const {EconomyService} = await load('economy/economy.service');
const {PrismaService} = await load('prisma/prisma.service');
const {AuthService} = await load('auth/auth.service');
const queries = [];
const db = new PrismaClient({datasources: {db: {url}}, log: [{emit: 'event', level: 'query'}]});
db.$on('query', event => queries.push(event.query));
const auth = {getSession: async () => ({user: {id: 'synthetic-admin', role: 'admin'}})};
class FixtureModule {}
Module({providers: [EconomyService, {provide: PrismaService, useValue: db}, {provide: AuthService, useValue: auth}]})(FixtureModule);
const contexts = [];
const start = async () => {
  const context = await NestFactory.createApplicationContext(FixtureModule, {logger: false, abortOnError: false});
  contexts.push(context);
  return context.get(EconomyService);
};
const snapshot = async () => ({
  config: await db.coinEconomyConfig.findMany({orderBy: {key: 'asc'}}),
  stakes: await db.coinStakeTable.findMany({orderBy: {key: 'asc'}}),
  products: await db.catalogProduct.findMany({orderBy: {key: 'asc'}}),
  prices: await db.catalogPrice.findMany({orderBy: {id: 'asc'}})
});
try {
  for (const model of ['coinEconomyConfig', 'coinStakeTable', 'catalogProduct', 'catalogPrice', 'coinWallet', 'coinLedgerEntry']) {
    assert.equal(await db[model].count(), 0, `${model}: requires an empty test database`);
  }
  const failingDb = new Proxy(db, {get(target, key) {
    if (key === '$transaction') return (run, options) => target.$transaction(async tx => {
      await run(tx);
      throw new Error('Synthetic startup failure');
    }, options);
    return Reflect.get(target, key);
  }});
  await assert.rejects(new EconomyService(failingDb, auth).onModuleInit(), /Synthetic startup failure/);
  for (const model of ['coinEconomyConfig', 'coinStakeTable', 'catalogProduct', 'catalogPrice']) {
    assert.equal(await db[model].count(), 0, `${model}: failed startup rolls back defaults`);
  }
  const services = await Promise.all(Array.from({length: 4}, start));
  const fresh = await snapshot();
  assert.equal(fresh.config.length, 1);
  assert.equal(fresh.products.length, 8);
  assert.equal(fresh.prices.length, 8);
  assert.ok(fresh.prices.every(row => row.amountMinor === 1500 && row.isActive));
  assert.equal(new Set(fresh.prices.map(row => row.productId)).size, 8);
  await db.coinEconomyConfig.update({where: {key: 'default'}, data: {matchCommissionBps: 250, dailyRewards: [11, 22]}});
  await db.coinStakeTable.update({where: {key: 'stake_50'}, data: {title: 'Owner table', stakeAmount: 75, commissionBps: 250, isActive: false, sortOrder: 99}});
  const product = await db.catalogProduct.update({where: {key: 'table_skin_02'}, data: {name: 'Owner skin', description: 'Owner description', isActive: false}});
  await db.catalogPrice.updateMany({where: {productId: product.id}, data: {amountMinor: 4242, isActive: false}});
  const before = await snapshot();
  queries.length = 0;
  const config = await services[0].getPublicConfig();
  const stakes = await services[0].listPublicStakes();
  await services[0].listCatalog({});
  await services[0].getPublicConfig();
  const readQueries = [...queries];
  assert.equal(readQueries.filter(sql => /\b(INSERT|UPDATE|DELETE)\b/i.test(sql)).length, 0);
  assert.equal(config.stakes.some(row => row.key === 'stake_50'), false);
  assert.equal(stakes.some(row => row.key === 'stake_50'), false);
  assert.deepEqual(await snapshot(), before, 'reads preserve rows, including timestamps');
  await Promise.all(Array.from({length: 4}, start));
  assert.deepEqual(await snapshot(), before, 'concurrent restarts preserve all owner settings');
  assert.equal(await db.coinWallet.count(), 0);
  assert.equal(await db.coinLedgerEntry.count(), 0);
  console.log(JSON.stringify({database, startupFailureRollsBack: true, concurrentFreshInstances: 4, concurrentRestarts: 4, freshConfig: 1, freshStakes: fresh.stakes.length, freshProducts: 8, freshPrices: 8, readQueryCount: readQueries.length, configurationWritesOnRead: 0, settingsAndTimestampsPreserved: true, walletCount: 0, ledgerCount: 0}, null, 2));
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await db.$disconnect();
}
