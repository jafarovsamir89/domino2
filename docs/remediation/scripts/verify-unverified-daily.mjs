// Fresh synthetic real-PG test; never loads application .env.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
const cwd=process.cwd(),database=process.argv[2];assert(cwd.includes('/.tmp/remediation-s011/'));assert.match(database||'',/^domino_remediation_s011_[a-z0-9]+$/);
const url=`postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public&connection_limit=12`;
const create=spawnSync('/opt/homebrew/Cellar/postgresql@14/14.20/bin/createdb',['-h','127.0.0.1','-p','55439','-U','domino_remediation',database],{stdio:'inherit'});assert.equal(create.status,0,'requires new database');
const migrate=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--schema','packages/db/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url},stdio:'inherit'});assert.equal(migrate.status,0);
const require=createRequire(cwd+'/package.json'),{PrismaClient}=require('@prisma/client');const {EconomyService}=await import(pathToFileURL(cwd+'/apps/api/dist/src/modules/economy/economy.service.js'));const db=new PrismaClient({datasources:{db:{url}}});
const day=new Date('2026-01-01T10:00:00Z');const results=[];
try{
 await new EconomyService(db,{}).onModuleInit();
 for(const mode of ['normal','directx2','upgrade','mixed']){
  const user=await db.user.create({data:{id:'s011-'+mode,name:mode,email:mode+'@example.invalid'}}),player=await db.player.create({data:{userId:user.id,displayName:mode}});
  const services=Array.from({length:4},()=>new EconomyService(db,{getCurrentProfile:async()=>({user,player})}));
  if(mode==='upgrade')await services[0].claimDailyBonus({}, {claimMode:'normal'},day);
  const attempts=await Promise.allSettled(Array.from({length:100},(_,i)=>services[i%4].claimDailyBonus({}, {claimMode:mode==='normal'||(mode==='mixed'&&i%2===0)?'normal':'rewarded_x2',completed:true},day)));
  const rejected=attempts.filter(r=>r.status==='rejected');assert.equal(rejected.length,mode==='normal'?0:mode==='mixed'?50:100);assert(rejected.every(r=>/rewarded_daily_unavailable/.test(String(r.reason))));
  let wallet=await db.coinWallet.findUnique({where:{playerId:player.id}}),claims=await db.coinDailyBonusClaim.findMany({where:{playerId:player.id}}),ledger=await db.coinLedgerEntry.findMany({where:{playerId:player.id}});
  if(mode==='directx2'){assert.equal(wallet,null);assert.equal(claims.length,0);assert.equal(ledger.length,0);await services[0].claimDailyBonus({}, {claimMode:'normal'},day);wallet=await db.coinWallet.findUnique({where:{playerId:player.id}});}
  assert.equal(wallet.balance,200);assert.equal(wallet.reserved,0);
  const repeat=await services[0].claimDailyBonus({}, {claimMode:'normal'},day);assert.equal(repeat.claimed,false);assert.equal(repeat.dailyBonus.canClaim,false);assert.equal(repeat.dailyBonus.doubleClaimAvailable,false);assert.equal(repeat.dailyBonus.rewardedAvailable,false);
  claims=await db.coinDailyBonusClaim.findMany({where:{playerId:player.id}});ledger=await db.coinLedgerEntry.findMany({where:{playerId:player.id}});assert.equal(claims.length,1);assert.equal(claims[0].amount,200);assert.equal(ledger.length,1);assert.equal(ledger[0].amount,200);
  results.push({mode,requests:100,rejected:rejected.length,balance:wallet.balance,claims:1,ledgerEntries:1});
 }
 console.log(JSON.stringify({database,results,scope:'unverified rewarded path disabled; external SSV deferred'},null,2));
}finally{await db.$disconnect();}
