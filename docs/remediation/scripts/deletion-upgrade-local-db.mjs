// Upgrade a CLONE of S054's populated synthetic 19-migration proof, never a live DB.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
const [database, output] = process.argv.slice(2);
assert.match(database || '', /^domino_remediation_s054_upgrade_[a-z0-9_]+$/);
assert.ok(output?.endsWith('.json') && !fs.existsSync(output), 'Fresh output required');
const source = 'domino_remediation_s054_cycle_2';
const url = name => `postgresql://domino_remediation@127.0.0.1:55439/${name}?schema=public`;
const sourceDb = new PrismaClient({ datasources: { db: { url: url(source) } } });
let targetDb;
async function snapshot(db) {
  const tables = await db.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
  const result = {};
  for (const { tablename } of tables) {
    if (['_prisma_migrations', 'AccountDeletion'].includes(tablename)) continue;
    assert.match(tablename, /^[A-Za-z0-9_]+$/);
    const rows = await db.$queryRawUnsafe(`SELECT to_jsonb(t) - 'deletionRequestedAt' - 'deletionVersion' AS row FROM "${tablename}" t`);
    const canonical = rows.map(r => JSON.stringify(r.row)).sort();
    result[tablename] = { count: rows.length, sha256: createHash('sha256').update(JSON.stringify(canonical)).digest('hex') };
  }
  return result;
}
try {
  const migrations = await sourceDb.$queryRawUnsafe('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL');
  assert.equal(migrations[0].count, 19);
  const before = await snapshot(sourceDb);
  assert.equal(before.CoinLedgerEntry.count, 92);
  await sourceDb.$disconnect(); // PostgreSQL refuses template cloning with this reader still connected.
  execFileSync('/opt/homebrew/opt/postgresql@14/bin/createdb', ['-h', '127.0.0.1', '-p', '55439', '-U', 'domino_remediation', '--template', source, database]);
  targetDb = new PrismaClient({ datasources: { db: { url: url(database) } } });
  const env = { ...process.env, DATABASE_URL: url(database) };
  const schema = 'packages/db/prisma/schema.prisma';
  const deployLog = execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy', '--schema', schema], { env, encoding: 'utf8' });
  const after = await snapshot(targetDb);
  assert.deepEqual(after, before, 'Every pre-existing data row remains unchanged');
  const players = await targetDb.player.findMany();
  assert.ok(players.every(p => p.deletionRequestedAt === null && p.deletionVersion === 0));
  assert.equal(await targetDb.accountDeletion.count(), 0);
  const diff = execFileSync('node_modules/.bin/prisma', ['migrate', 'diff', '--from-url', url(database), '--to-schema-datamodel', schema, '--exit-code'], { env, encoding: 'utf8' });
  const wallet = await targetDb.coinWallet.findUniqueOrThrow({ where: { playerId: 's054-synthetic-cycle' } });
  assert.equal(wallet.balance, 64850); assert.equal(wallet.reserved, 13);
  const result = { scope: 'Local populated synthetic DB clone, no production reads/writes', source, database, migrated: '19 -> 20 additive', comparedTables: Object.keys(before).length, allExistingRowsUnchanged: true, originalTableHashes: before, wallet: { balance: wallet.balance, reserved: wallet.reserved }, deletionQueue: 0, drift: diff.trim(), deployLog };
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ ...result, originalTableHashes: '[see JSON]' }));
} finally { await sourceDb.$disconnect(); await targetDb?.$disconnect(); }
