import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
assert(process.cwd().includes('/.tmp/remediation-s017/'));
const url='postgresql://domino_remediation@127.0.0.1:55439/domino_remediation_s017_drift?schema=public';
const run=args=>{const p=spawnSync(process.execPath,['node_modules/prisma/build/index.js',...args],{env:{...process.env,DATABASE_URL:url},stdio:'inherit'});assert.equal(p.status,0)};
run(['migrate','deploy','--schema','packages/db/prisma/schema.prisma']);
run(['migrate','diff','--from-url',url,'--to-schema-datamodel','packages/db/prisma/schema.prisma','--script']);
