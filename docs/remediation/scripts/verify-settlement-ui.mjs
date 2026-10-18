// Real synthetic PostgreSQL -> API service -> actual room helper -> client + renderer.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
const cwd=process.cwd(),database=process.argv[2];assert(cwd.includes('/.tmp/remediation-s013/'));assert.match(database||'',/^domino_remediation_s013_[a-z0-9]+$/);
const url=`postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public&connection_limit=12`;
assert.equal(spawnSync('/opt/homebrew/Cellar/postgresql@14/14.20/bin/createdb',['-h','127.0.0.1','-p','55439','-U','domino_remediation',database],{stdio:'inherit'}).status,0,'requires a new DB');
assert.equal(spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--schema','packages/db/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url},stdio:'inherit'}).status,0);
const req=createRequire(cwd+'/package.json'),{PrismaClient}=req('@prisma/client');
const load=name=>import(pathToFileURL(`${cwd}/apps/api/dist/src/modules/${name}.js`));
const {EconomyService}=await load('economy/economy.service'),{createGameToken}=await load('auth/game-token'),{signDominoPayload}=await load('security/domino-proof');
const {settleEconomyRoundForRoom,settleForfeitStakeForRoom}=req('./server/economyService');
const {loadGame}=req('./server/test/helpers/client-game.cjs'),{renderSummary}=req('./server/test/helpers/client-renderer.cjs');
const db=new PrismaClient({datasources:{db:{url}}}),service=new EconomyService(db,{}),originalFetch=global.fetch,results=[];
const signed=(scope,body)=>{const data={...body,integrityScope:'economy.'+scope};return {...data,proof:signDominoPayload(data)}};
try{
 await service.onModuleInit();
 await db.coinStakeTable.create({data:{key:'receipt_200',title:'Synthetic 200',stakeAmount:200,commissionBps:1000,isFree:false,isActive:true}});
 for(const scenario of ['win','draw','refund','team','forfeit','zero-profit-winner']){
  const count=scenario==='team'?4:2,players=[];
  const table=await db.coinStakeTable.findUniqueOrThrow({where:{key:'receipt_200'}});await db.coinStakeTable.update({where:{id:table.id},data:{commissionBps:scenario==='zero-profit-winner'?10000:1000}});
  for(let i=0;i<count;i++){const user=await db.user.create({data:{id:`receipt-${scenario}-${i}`,email:`${scenario}-${i}@example.invalid`,name:'Synthetic'}});players.push(await db.player.create({data:{userId:user.id,displayName:'Synthetic '+i,wallet:{create:{balance:1000}}}}));}
  const token=createGameToken({userId:players[0].userId,playerId:players[0].id,displayName:'Synthetic',role:'player',sessionId:'synthetic-session',provider:'better-auth',issuedAt:Date.now(),expiresAt:Date.now()+600000});
  const context={roomId:'receipt-room-'+scenario,matchId:'receipt-match-'+scenario,stakeKey:'receipt_200'};
  assert.equal((await service.reserveMatchStake(token,signed('reserve',{...context,participants:players.map(p=>({playerId:p.id}))}))).ok,true);
  const before=await Promise.all(players.map(p=>db.coinWallet.findUniqueOrThrow({where:{playerId:p.id}})));
  const order=players.map((_,i)=>'s'+i),identities=new Map(order.map((sid,i)=>[sid,{provider:'platform',userId:players[i].userId,playerId:players[i].id}]));
  const room={roomId:context.roomId,matchRecordId:context.matchId,currentDealMatchId:context.matchId,currentStakeKey:context.stakeKey,currentDealStakeKey:context.stakeKey,currentDealStakeAmount:200,currentDealBankAmount:count*200,identityBySessionId:identities,state:{playerOrder:order,isTeamMode:count===4},getPlatformMatchIdentity:()=>({authToken:token}),resolvePendingEconomySettlement:()=>{},clearEconomySettlementRetryTimer:()=>{}};
  let requests=0,lastApiResponse;
  global.fetch=async(endpoint,options)=>{assert(String(endpoint).startsWith('http://127.0.0.1:4300/'));requests++;lastApiResponse=await service.settleMatchStake(token,JSON.parse(options.body));return new Response(JSON.stringify(lastApiResponse),{status:200,headers:{'content-type':'application/json'}})};
  const summary=scenario==='forfeit'?await settleForfeitStakeForRoom(room,'s1'):await settleEconomyRoundForRoom(room,0,{matchOutcome:scenario==='draw'||scenario==='refund'?scenario:'normal'});
  assert.equal(requests,1);assert.equal(summary.receiptVersion,1);assert.equal(summary.matchId,context.matchId);assert.equal(summary.roomId,context.roomId);
  const rows=[];
  for(let i=0;i<count;i++){
   const after=await db.coinWallet.findUniqueOrThrow({where:{playerId:players[i].id}}),delta=after.balance+after.reserved-before[i].balance-before[i].reserved;
   const receipt=summary.reservations.find(r=>r.playerId===players[i].id);assert.equal(receipt.net,delta);
   const ledger=await db.coinLedgerEntry.findMany({where:{playerId:players[i].id,referenceType:'match_settle',referenceId:context.matchId}});
   const ledgerDelta=ledger.reduce((n,e)=>n+e.balanceAfter+e.reservedAfter-e.balanceBefore-e.reservedBefore,0);assert.equal(ledgerDelta,delta);
   for(const asset of ['js/app.js','www/js/app.js']){
    const game=loadGame(asset);Object.assign(game,{network:{isMultiplayer:true,room:{roomId:context.roomId}},onlineEconomyMode:'coins',accountDetails:{user:{id:players[i].userId}}});game.resetOnlineCoinSummary();
    assert.equal(game.applyOnlineEconomySettlement(summary),true);assert.equal(game.onlineCoinSummary.won-game.onlineCoinSummary.spent,delta);
    const once=JSON.stringify(game.onlineCoinSummary);for(let duplicate=0;duplicate<20;duplicate++)game.applyOnlineEconomySettlement(JSON.parse(JSON.stringify(summary)));assert.equal(JSON.stringify(game.onlineCoinSummary),once);
    assert(renderSummary(asset,game.onlineCoinSummary).endsWith(`summary-net: ${delta>=0?'+':''}${delta}`));
   }
   rows.push({playerIndex:i,stake:receipt.stakeAmount,returned:receipt.returnedStake,profit:receipt.winnings,walletDelta:delta,ledgerDelta,uiDelta:delta});
  }
  const ledgerCount=await db.coinLedgerEntry.count();const replay=await service.settleMatchStake(token,signed('settle',{...context,result:'refund'}));assert.equal(replay.skipped,true);assert.equal(await db.coinLedgerEntry.count(),ledgerCount);
  results.push({scenario,requests,rows,duplicateEventsPerAsset:20});
 }
 console.log(JSON.stringify({database,results},null,2));
}finally{global.fetch=originalFetch;await db.$disconnect();}
