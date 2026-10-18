import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
const cwd=process.cwd();assert(cwd.includes('/.tmp/remediation-s017/'));const suffix=process.argv[2]||'final';assert.match(suffix,/^[a-z0-9]+$/);
const req=createRequire(cwd+'/package.json'),{PrismaClient}=req('@prisma/client');const {SocialService}=await import(pathToFileURL(cwd+'/apps/api/dist/src/modules/social/social.service.js'));
const original=path.join(cwd,'packages/db/prisma'),old=path.resolve(cwd,'../old-'+suffix);fs.mkdirSync(old,{recursive:true});fs.copyFileSync(path.join(original,'schema.prisma'),path.join(old,'schema.prisma'));fs.mkdirSync(path.join(old,'migrations'));for(const name of fs.readdirSync(path.join(original,'migrations'))){if(name.startsWith('20261018_000019'))continue;fs.cpSync(path.join(original,'migrations',name),path.join(old,'migrations',name),{recursive:true});}
const results=[];
for(const mode of ['empty','upgrade']){
 const name=`domino_remediation_s017_${mode}${suffix}`,url=`postgresql://domino_remediation@127.0.0.1:55439/${name}?schema=public`;
 assert.equal(spawnSync('/opt/homebrew/Cellar/postgresql@14/14.20/bin/createdb',['-h','127.0.0.1','-p','55439','-U','domino_remediation',name],{stdio:'inherit'}).status,0);
 const migrate=schema=>{assert.equal(spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--schema',schema],{env:{...process.env,DATABASE_URL:url},stdio:'inherit'}).status,0)};
 migrate(path.join(mode==='upgrade'?old:original,'schema.prisma'));
 const db=new PrismaClient({datasources:{db:{url}}});
 try{
  const players=[];for(let i=0;i<2;i++){const user=await db.user.create({data:{id:`social-${mode}-${i}`,email:`${mode}-${i}@example.invalid`,name:'Synthetic'}});players.push(await db.player.create({data:{id:`player-${i}`,userId:user.id,displayName:'Synthetic '+i,wallet:{create:{balance:777}}}}));}
  let current=players[0];const service=new SocialService(db,{getCurrentProfile:async()=>({player:current})});service.isPlayerOnline=()=>true;service.fcmAvailable=false;
  if(mode==='upgrade'){
   await db.$executeRaw`INSERT INTO "DirectMessage" ("id","senderPlayerId","receiverPlayerId","text","createdAt","readAt") VALUES ('legacy-a',${players[0].id},${players[1].id},'old unread','2026-01-01',NULL),('legacy-z',${players[1].id},${players[0].id},'old read','2026-01-01','2026-01-02')`;
   await assert.rejects(service.getDirectMessages({},players[1].id),e=>e.code==='P2022');
   await assert.rejects(db.fcmToken.findMany(),e=>e.code==='P2021');
  }
  const walletsBefore=JSON.stringify(await db.coinWallet.findMany({orderBy:{playerId:'asc'}}));
  if(mode==='upgrade'){
   migrate(path.join(original,'schema.prisma'));
   const thread=await db.directMessageThread.findFirstOrThrow();assert.equal(thread.lastMessageId,'legacy-z');assert.equal(thread.unreadCountA,0);assert.equal(thread.unreadCountB,1);assert.equal(await db.directMessage.count(),2);
   assert.equal(JSON.stringify(await db.coinWallet.findMany({orderBy:{playerId:'asc'}})),walletsBefore);
  }
  const send=await service.sendDirectMessageForPlayer(players[0],players[1].id,{text:'Synthetic hello',clientMessageId:'synthetic-retry'},{emitEvents:false});
  const retry=await service.sendDirectMessageForPlayer(players[0],players[1].id,{text:'Synthetic hello',clientMessageId:'synthetic-retry'},{emitEvents:false});assert.equal(send.item.id,retry.item.id);
  current=players[1];const messages=await service.getDirectMessages({},players[0].id);assert(messages.items.some(m=>m.id===send.item.id));
  const threads=await service.getMessageThreads({});assert.equal(threads.items.length,1);assert.equal(threads.items[0].unreadCount,mode==='upgrade'?2:1);
  await service.markDirectMessageThreadReadForPlayer(players[1],players[0].id);const read=await service.getMessageThreads({});assert.equal(read.items[0].unreadCount,0);assert.equal(await db.directMessage.count({where:{receiverPlayerId:players[1].id,readAt:null}}),0);
  const fcm=await db.fcmToken.create({data:{playerId:players[0].id,token:'synthetic-local-no-send'}});assert.equal((await db.fcmToken.findUniqueOrThrow({where:{token:fcm.token}})).playerId,players[0].id);await db.fcmToken.update({where:{id:fcm.id},data:{token:'synthetic-updated'}});await db.fcmToken.delete({where:{id:fcm.id}});assert.equal(await db.fcmToken.count(),0);
  migrate(path.join(original,'schema.prisma'));
  const diff=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-url',url,'--to-schema-datamodel',path.join(original,'schema.prisma'),'--exit-code'],{env:{...process.env,DATABASE_URL:url},encoding:'utf8'});assert.equal(diff.status,0,diff.stdout+diff.stderr);
  results.push({mode,database:name,migrations:19,unexpectedSchemaDrift:0,legacyMessagesPreserved:mode==='upgrade'?2:0,directMessageReadSendReadStateRetry:true,fcmCrud:true,walletsUnchanged:true});
 }finally{await db.$disconnect();}
}
console.log(JSON.stringify({results},null,2));
