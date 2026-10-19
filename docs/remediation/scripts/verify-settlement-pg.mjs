// Owned localhost PostgreSQL + actual API controller/DTO/service + killed game process.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {spawnSync,fork} from 'node:child_process';
const cwd=process.cwd(),database=process.argv[2];assert(cwd.includes('/.tmp/remediation-s024/'));assert.match(database||'',/^domino_remediation_s024_[a-z0-9]+$/);const root=path.resolve('../../..'),req=createRequire(cwd+'/package.json');
const url=`postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public&connection_limit=12`;
assert.equal(spawnSync('/opt/homebrew/Cellar/postgresql@14/14.20/bin/createdb',['-h','127.0.0.1','-p','55439','-U','domino_remediation',database],{stdio:'inherit'}).status,0);
assert.equal(spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--schema','packages/db/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url},stdio:'inherit'}).status,0);
const load=n=>import(pathToFileURL(`${cwd}/apps/api/dist/src/modules/${n}.js`));
const {PrismaClient}=req('@prisma/client'),db=new PrismaClient({datasources:{db:{url}}});
const {EconomyService}=await load('economy/economy.service'),{EconomyController}=await load('economy/economy.controller'),{createGameToken}=await load('auth/game-token'),{signDominoPayload}=await load('security/domino-proof'),{EconomySettleMatchDto}=await load('validation/validation.dto');
const {ValidationPipe}=req('@nestjs/common'),service=new EconomyService(db,{}),controller=new EconomyController(service),pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
const {default:express}=await import(pathToFileURL(cwd+'/node_modules/express/index.js'));const app=express();app.use(express.json());let resolveRequest,mode,requests=0;
app.post(['/api/economy/matches/settle','/api/economy/matches/reconcile'],async(q,s)=>{try{requests++;const body=await pipe.transform(q.body,{type:'body',metatype:EconomySettleMatchDto});if((mode==='before-commit'||mode==='timeout')&&q.path.endsWith('/settle')){resolveRequest();return;}const result=q.path.endsWith('/reconcile')?await controller.reconcileMatchStake(body):await controller.settleMatchStake(q.headers.authorization,body);if(mode==='after-commit'&&q.path.endsWith('/settle')){resolveRequest();return;}s.json(result);}catch(e){s.status(500).json({ok:false,reason:e.message})}});
const server=await new Promise(r=>{const s=app.listen(4300,'127.0.0.1',()=>r(s))}),results=[];
const signed=(scope,body)=>{const p={...body,integrityScope:scope};return {...p,proof:signDominoPayload(p)}};
async function child(mode,context,dir){const p=fork(root+'/docs/remediation/scripts/settlement-crash-child.cjs',[mode],{env:{...process.env,ECONOMY_OUTBOX_DIR:dir,SYNTHETIC_SETTLEMENT_CONTEXT:JSON.stringify(context)},stdio:['ignore','inherit','inherit','ipc']});const exited=new Promise((r,j)=>{p.once('exit',(c,s)=>c===0||s==='SIGKILL'?r():j(Error('child exit '+c)));p.once('error',j)});return {p,exited};}
try{
 await service.onModuleInit();await db.coinStakeTable.create({data:{key:'outbox_200',title:'Synthetic outbox',stakeAmount:200,commissionBps:1000,isFree:false,isActive:true}});
 for(const fault of ['before-commit','after-commit','timeout']){
  const players=[];for(let i=0;i<2;i++){const u=await db.user.create({data:{id:`outbox-${fault}-${i}`,email:`${fault}-${i}@example.invalid`,name:'Synthetic'}});players.push(await db.player.create({data:{userId:u.id,displayName:'Synthetic',wallet:{create:{balance:1000}}}}))}
  const token=createGameToken({userId:players[0].userId,playerId:players[0].id,displayName:'Synthetic',role:'player',sessionId:'expired-after-crash',provider:'better-auth',issuedAt:Date.now(),expiresAt:Date.now()+60000});
  const context={roomId:'outbox-room-'+fault,matchId:'outbox-match-'+fault,stakeKey:'outbox_200',winnerUserIds:[players[0].userId]};
  assert.equal((await service.reserveMatchStake(token,signed('economy.reserve',{...context,participants:players.map(p=>({playerId:p.id}))}))).ok,true);
  const dir=path.resolve('../outbox-pg-'+database+'-'+fault);fs.mkdirSync(dir);mode=fault;const received=new Promise(r=>resolveRequest=r);
  // The old endpoint verifies a synthetic valid token; the replay uses no player token.
  const original=controller.settleMatchStake.bind(controller);controller.settleMatchStake=(_auth,body)=>original('Bearer '+token,body);
  const game=await child('submit',context,dir);let deadline=setTimeout(()=>game.p.kill('SIGKILL'),12000);
  await Promise.race([received,game.exited.then(()=>{throw Error('game exited before request')})]);if(fault==='timeout'){await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('request did not time out')),7000);game.p.on('message',m=>{if(m.returned){clearTimeout(timer);r()}})});}game.p.kill('SIGKILL');await game.exited;clearTimeout(deadline);
  assert.equal(fs.readdirSync(dir).filter(n=>n.endsWith('.intent.json')).length,1);
  mode='recover';
  // Real game-server entrypoint must reconcile with zero live rooms and no bearer.
  const worker=fork(cwd+'/server/index.js',[],{env:{...process.env,PORT:'0',ECONOMY_OUTBOX_DIR:dir,REDIS_URI:''},stdio:['ignore','inherit','inherit','ipc']});
  const workerExit=new Promise((r,j)=>{worker.once('exit',c=>c===0?r():j(Error('worker exit '+c)));worker.once('error',j)});
  try{
   const until=Date.now()+12000;
   while(!fs.readdirSync(dir).some(n=>n.endsWith('.receipt.json'))){assert(Date.now()<until,'startup worker did not acknowledge');assert(worker.exitCode===null,'worker stopped early');await new Promise(r=>setTimeout(r,80));}
   worker.kill('SIGTERM');await workerExit;
  }finally{if(worker.exitCode===null)worker.kill('SIGKILL');}

  assert.equal(fs.readdirSync(dir).filter(n=>n.endsWith('.receipt.json')).length,1);
  const wallets=await Promise.all(players.map(p=>db.coinWallet.findUniqueOrThrow({where:{playerId:p.id}})));
  assert.deepEqual(wallets.map(w=>({balance:w.balance,reserved:w.reserved})),[{balance:1180,reserved:0},{balance:800,reserved:0}]);
  const count=await db.coinLedgerEntry.count({where:{referenceType:'match_settle',referenceId:context.matchId}});assert(count>0);
  const snapshot=JSON.stringify(wallets),replays=await Promise.all(Array.from({length:20},()=>service.reconcileMatchStake(signed('economy.reconcile',context))));
  assert(replays.every(r=>r.ok&&r.skipped));assert.equal(await db.coinLedgerEntry.count({where:{referenceType:'match_settle',referenceId:context.matchId}}),count);
  assert.equal(JSON.stringify(await Promise.all(players.map(p=>db.coinWallet.findUniqueOrThrow({where:{playerId:p.id}})))),snapshot);
  // A delayed A replay may not touch reserves for a new B in the same room.
  const newer={...context,matchId:context.matchId+'-new'};assert.equal((await service.reserveMatchStake(token,signed('economy.reserve',{...newer,participants:players.map(p=>({playerId:p.id}))}))).ok,true);
  const newSnapshot=JSON.stringify(await db.coinWallet.findMany({where:{playerId:{in:players.map(p=>p.id)}},orderBy:{playerId:'asc'}}));
  await service.reconcileMatchStake(signed('economy.reconcile',context));assert.equal(JSON.stringify(await db.coinWallet.findMany({where:{playerId:{in:players.map(p=>p.id)}},orderBy:{playerId:'asc'}})),newSnapshot);
  results.push({fault,wallets:wallets.map(w=>({balance:w.balance,reserved:w.reserved})),settlementLedgerEntries:count,duplicateReplays:20,newMatchUntouched:true,intentAndReceiptRetained:true});
 }
 console.log(JSON.stringify({database,requests,results},null,2));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await db.$disconnect();}
