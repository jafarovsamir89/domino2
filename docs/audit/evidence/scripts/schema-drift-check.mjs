// Read-only verification against the disposable migrated database. Does not apply the diff.
import fs from 'node:fs';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import {PrismaClient} from '@prisma/client';
const raw=process.env.DATABASE_URL||'',url=new URL(raw);if(url.hostname!=='127.0.0.1'||url.port!=='55439'||url.pathname!=='/domino_audit')throw Error('Audit database only');
const db=new PrismaClient();const result={scope:'18 repository migrations applied; daily_login data fixture exists, no schema repair applied. Read-only schema and API probes; synthetic accounts.',migrationFiles:[]};
try{
 for(const folder of fs.readdirSync('packages/db/prisma/migrations')){const p='packages/db/prisma/migrations/'+folder+'/migration.sql';if(fs.existsSync(p))result.migrationFiles.push({name:folder,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')})}
 result.applied=await db.$queryRaw`SELECT migration_name, finished_at IS NOT NULL AS applied FROM _prisma_migrations ORDER BY migration_name`;
 result.chatColumns=await db.$queryRaw`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('DirectMessage','direct_message_thread','fcm_token') ORDER BY table_name,column_name`;
 result.sql=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-url',raw,'--to-schema-datamodel','packages/db/prisma/schema.prisma','--script'],{encoding:'utf8'});fs.writeFileSync('docs/audit/evidence/metrics/schema-drift.sql',result.sql);
 const fixtures=JSON.parse(fs.readFileSync('.tmp/audit-device-profiles.json'));const r=await fetch('http://127.0.0.1:4300/api/social/messages/'+fixtures[0].player.id,{headers:{Authorization:'Bearer '+fixtures[1].token}});result.readMessages={httpStatus:r.status,body:await r.json()};
 result.missing={clientMessageId:!result.chatColumns.some(c=>c.table_name==='DirectMessage'&&c.column_name==='clientMessageId'),directMessageThread:!result.chatColumns.some(c=>c.table_name==='direct_message_thread'),fcmTokenTable:!result.chatColumns.some(c=>c.table_name==='fcm_token')};
 console.log({migrationFiles:result.migrationFiles.length,applied:result.applied.length,missing:result.missing,readStatus:r.status});
}finally{fs.writeFileSync('docs/audit/evidence/metrics/schema-drift-check.json',JSON.stringify(result,null,2));await db.$disconnect()}
