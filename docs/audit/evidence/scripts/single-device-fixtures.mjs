// Disposable local identities only. No real accounts or production credentials.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {createGameToken} from '../../../../apps/api/dist/src/modules/auth/game-token.js';
const url=new URL(process.env.DATABASE_URL||'');
if(url.hostname!=='127.0.0.1'||url.port!=='55439'||url.pathname!=='/domino_audit')throw Error('Audit database only');
process.env.BETTER_AUTH_SECRET='audit-local-only-not-a-production-secret-2026';
const db=new PrismaClient(),profiles=[],run=Date.now().toString(36);
try{
 for(const name of ['AuditPhone','AuditPeer','AuditThird','AuditFourth']){
  const user=await db.user.create({data:{id:`audit-device-${run}-${name}`,name,email:`${run}-${name}@audit.invalid`}});
  const player=await db.player.create({data:{userId:user.id,displayName:name,wallet:{create:{balance:10000}}}});
  const expiresAt=Date.now()+24*3600000;
  const session=await db.session.create({data:{id:crypto.randomUUID(),token:crypto.randomUUID(),userId:user.id,expiresAt:new Date(expiresAt)}});
  const token=createGameToken({userId:user.id,playerId:player.id,displayName:name,role:'player',sessionId:session.id,provider:'better-auth',issuedAt:Date.now(),expiresAt});
  profiles.push({player,token});
 }
 fs.writeFileSync('.tmp/audit-profile.json',JSON.stringify(profiles[0]));
 fs.writeFileSync('.tmp/audit-device-profiles.json',JSON.stringify(profiles));
 console.log('Created4local synthetic users/sessions/wallets; fixture tokens saved only in ignored .tmp');
}finally{await db.$disconnect()}
