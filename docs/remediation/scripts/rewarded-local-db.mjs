// Real PostgreSQL integration check, locked to a newly created synthetic database.
import fs from 'node:fs';import assert from 'node:assert/strict';import {generateKeyPairSync,sign} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {RewardedEntitlement} from '../../../apps/api/dist/src/modules/rewarded/entitlement.js';
const args=process.argv.slice(2),database=args.includes('--database')?args[args.indexOf('--database')+1]:'domino_remediation_s039_rewarded';
assert.match(database||'',/^domino_remediation_s039_[a-z0-9_]+$/);
const url=`postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public`;
const db=new PrismaClient({datasources:{db:{url}}}),now=Date.UTC(2026,9,21,12),day='2026-10-21';
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),config={enabled:true,adUnit:'synthetic-unit',keys:new Map([['7',publicKey.export({type:'spki',format:'pem'}).toString()]])};
const callback=(id,tx='0123456789abcdef')=>{const p=`ad_network=1&ad_unit=synthetic-unit&custom_data=${id}&reward_amount=99999&reward_item=coins&timestamp=${now}&transaction_id=${tx}`;return p+'&signature='+sign('sha256',Buffer.from(p),privateKey).toString('base64url')+'&key_id=7';};
try{
 assert.equal(await db.player.count(),0,'Require a fresh synthetic database; never reset existing data');
 const tables=await db.$queryRaw`SELECT to_regclass('public."RewardReviewAttempt"')::text AS name`;
 if(!tables[0].name)for(const sql of fs.readFileSync('docs/remediation/review/rewarded-draft.sql','utf8').split(';').filter(s=>s.trim()))await db.$executeRawUnsafe(sql);
 else assert.equal(Number((await db.$queryRaw`SELECT count(*) FROM "RewardReviewAttempt"`)[0].count),0,'Never reuse populated attempts');
 const players=['parallel','rollback','cancel','reused','expired','attempt-cap'].map(s=>'s039-synthetic-'+s);
 for(const id of players){await db.player.create({data:{id,displayName:'Synthetic review',wallet:{create:{balance:200,reserved:13,lifetimeEarned:200}},dailyClaims:{create:{claimDate:day,streakDay:1,amount:200}}}});}
 const total=async()=>{const a=await db.coinWallet.aggregate({_sum:{balance:true,reserved:true}});return a._sum.balance+a._sum.reserved;};
 const before=await total(),service=new RewardedEntitlement(db,config),disabled=new RewardedEntitlement(db,{...config,enabled:false});
 await assert.rejects(()=>disabled.issue(players[0],true,now),/disabled/);await assert.rejects(()=>service.issue(players[0],false,now),/opt_in/);
 const attempt=await service.issue(players[0],true,now),again=await service.issue(players[0],true,now);assert.equal(attempt.attemptId,again.attemptId);
 const replies=await Promise.all(Array.from({length:100},()=>service.consume(callback(attempt.attemptId),now)));
 assert.equal(replies.filter(r=>r.credited).length,1);assert.equal((await db.coinWallet.findUnique({where:{playerId:players[0]}})).balance,400);await assert.rejects(()=>service.issue(players[0],true,now),/frequency_cap/);
 const restarted=new PrismaClient({datasources:{db:{url}}});try{assert.deepEqual(await new RewardedEntitlement(restarted,config).consume(callback(attempt.attemptId),now),{credited:false,duplicate:true});}finally{await restarted.$disconnect();}
 const a2=await service.issue(players[1],true,now),raw2=callback(a2.attemptId,'1111111111111111');
 const failing={$transaction:(fn,opts)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='coinDailyBonusClaim')return new Proxy(target[key],{get(delegate,method){if(method==='update')return ()=>{throw Error('synthetic-mid-transaction-failure');};const value=delegate[method];return typeof value==='function'?value.bind(delegate):value;}});const value=target[key];return typeof value==='function'?value.bind(target):value;}})),opts)};
 await assert.rejects(()=>new RewardedEntitlement(failing,config).consume(raw2,now),/mid-transaction/);
 assert.equal((await db.coinWallet.findUnique({where:{playerId:players[1]}})).balance,200);assert.equal((await db.coinDailyBonusClaim.findUnique({where:{playerId_claimDate:{playerId:players[1],claimDate:day}}})).amount,200);
 assert.equal(Number((await db.$queryRaw`SELECT count(*) FROM "RewardReviewReceipt" WHERE "attemptId"=${a2.attemptId}`)[0].count),0);assert.equal((await db.$queryRaw`SELECT "consumedAt" FROM "RewardReviewAttempt" WHERE "id"=${a2.attemptId}`)[0].consumedAt,null);
 assert.equal((await service.consume(raw2,now)).credited,true);
 const a3=await service.issue(players[2],true,now);await service.cancel(players[2],a3.attemptId);await assert.rejects(()=>service.consume(callback(a3.attemptId,'2222222222222222'),now),/unavailable/);
 const a4=await service.issue(players[3],true,now);await assert.rejects(()=>service.consume(callback(a4.attemptId),now),/transaction_reused/);
 const a5=await service.issue(players[4],true,now-11*60000);await assert.rejects(()=>service.consume(callback(a5.attemptId,'3333333333333333'),now),/expired/);
 for(let i=0;i<3;i++){const a=await service.issue(players[5],true,now+i);await service.cancel(players[5],a.attemptId);}await assert.rejects(()=>service.issue(players[5],true,now+3),/attempt_cap/);
 const ledger=await db.coinLedgerEntry.findMany();assert.equal(ledger.length,2);assert.equal(ledger.reduce((s,r)=>s+r.amount,0),400);assert.equal(await total(),before+400);assert.equal((await db.coinWallet.findMany()).every(w=>w.reserved===13),true);
 const result={scope:'Real local PostgreSQL, synthetic identities only; disabled integration candidate, not deployed API/provider acceptance',parallelCallbacks:100,creditedParallel:1,duplicatesParallel:99,restartReplay:'pass',rollbackReceiptWalletDailyAndAttempt:'pass',cancelled:'rejected',reusedTransactionAcrossPlayers:'rejected',expired:'rejected',optInAndKillSwitch:'pass',attemptCap:3,grantCapPerBakuDay:1,totalRewardedLedgerEntries:2,totalRewardedCoins:400,closedLedgerResidual:0,reservedCoinsUnchanged:true,providerAmountIgnored:99999};fs.writeFileSync('docs/remediation/evidence/session-039/rewarded-local-db.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await db.$disconnect();}
