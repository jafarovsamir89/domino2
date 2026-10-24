// Real PostgreSQL integration check, locked to a newly created synthetic database.
import fs from 'node:fs';import assert from 'node:assert/strict';import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {RewardedEntitlement} from '../../../apps/api/dist/src/modules/rewarded/entitlement.js';
const args=process.argv.slice(2),database=args.includes('--database')?args[args.indexOf('--database')+1]:'domino_remediation_s039_rewarded';
assert.match(database||'',/^domino_remediation_s\d{3}_[a-z0-9_]+$/);
const provider=args.includes('--provider')?args[args.indexOf('--provider')+1]:'admob';
assert.ok(['admob','levelplay'].includes(provider));
const output=args.includes('--output')?args[args.indexOf('--output')+1]:'.tmp/rewarded-local-db-result.json';
assert.ok(output&&output.endsWith('.json'));
if(!output.startsWith('.tmp/'))assert.equal(fs.existsSync(output),false,'Preserve existing evidence; choose a fresh output path');
const url=`postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public`;
const db=new PrismaClient({datasources:{db:{url}}}),now=Date.UTC(2026,9,21,12),day='2026-10-21';
const identities=new Map(),syntheticKey='synthetic-only-review-key-0123456789abcdef';
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),config={enabled:true,adUnit:'synthetic-unit',keys:new Map([['7',publicKey.export({type:'spki',format:'pem'}).toString()]])};
const configUsed=provider==='levelplay'?{enabled:true,provider,adUnit:'synthetic-unit',appKey:'synthetic-app',privateKey:syntheticKey,timestampUtcOffsetMinutes:0}:config;
const callback=(id,tx='0123456789abcdef')=>{if(provider==='levelplay'){const t='202610211200',rewards='1';return new URLSearchParams({applicationUserId:id,eventId:tx,rewards,timestamp:t,signature:createHash('md5').update(t+tx+id+rewards+syntheticKey).digest('hex')}).toString();}const p=`ad_network=1&ad_unit=synthetic-unit&custom_data=${id}&reward_amount=99999&reward_item=coins&timestamp=${now}&transaction_id=${tx}`;return p+'&signature='+sign('sha256',Buffer.from(p),privateKey).toString('base64url')+'&key_id=7';};
try{
 assert.equal(await db.player.count(),0,'Require a fresh synthetic database; never reset existing data');
 const tables=await db.$queryRaw`SELECT to_regclass('public."RewardReviewAttempt"')::text AS name`;
 if(!tables[0].name)for(const sql of fs.readFileSync('docs/remediation/review/rewarded-draft.sql','utf8').split(';').filter(s=>s.trim()))await db.$executeRawUnsafe(sql);
 else assert.equal(Number((await db.$queryRaw`SELECT count(*) FROM "RewardReviewAttempt"`)[0].count),0,'Never reuse populated attempts');
 const players=['parallel','rollback','cancel','reused','expired','attempt-cap','legacy-x2','unknown','logout','ban','deleted-user','expired-session','wrong-owner','provider-binding'].map(s=>'s'+database.match(/_s(\d{3})_/)[1]+'-synthetic-'+s);
 for(const id of players){if(provider==='levelplay'){const identity={userId:id+'-user',sessionId:id+'-session'};identities.set(id,identity);await db.user.create({data:{id:identity.userId,name:'Synthetic review',email:id+'@example.invalid',sessions:{create:{id:identity.sessionId,token:id+'-synthetic-local-token',expiresAt:new Date(now+86400000)}}}});}
const legacy=id.endsWith('legacy-x2'),unknown=id.endsWith('unknown'),amount=legacy?400:200;await db.player.create({data:{id,...(provider==='levelplay'?{userId:identities.get(id).userId}:{}),displayName:'Synthetic review',wallet:{create:{balance:amount,reserved:13,lifetimeEarned:amount}},dailyClaims:{create:{claimDate:day,streakDay:1,amount}},...(!unknown?{ledgerEntries:{create:{type:'daily_bonus',amount,balanceBefore:0,balanceAfter:amount,reservedBefore:13,reservedAfter:13,referenceType:'daily_bonus',referenceId:day,idempotencyKey:`daily_bonus:${id}:${day}:initial`,payloadJson:{claimMode:legacy?'rewarded_x2':'normal',multiplier:legacy?2:1,baseReward:200,reward:amount,claimDate:day}}}}:{})}});}
 const total=async()=>{const a=await db.coinWallet.aggregate({_sum:{balance:true,reserved:true}});return a._sum.balance+a._sum.reserved;};
 const before=await total(),actual=new RewardedEntitlement(db,configUsed),service={issue:(id,opt,time)=>actual.issue(id,opt,time,identities.get(id)),consume:(raw,time)=>actual.consume(raw,time),cancel:(id,attempt)=>actual.cancel(id,attempt,identities.get(id),now)},disabled=new RewardedEntitlement(db,{...configUsed,enabled:false});
 await assert.rejects(()=>service.issue(players[6],true,now),/normal_daily_required/);await assert.rejects(()=>service.issue(players[7],true,now),/normal_daily_required/);
 await assert.rejects(()=>disabled.issue(players[0],true,now),/disabled/);await assert.rejects(()=>service.issue(players[0],false,now),/opt_in/);
 const attempt=await service.issue(players[0],true,now),again=await service.issue(players[0],true,now);assert.equal(attempt.attemptId,again.attemptId);
 const replies=await Promise.all(Array.from({length:100},()=>service.consume(callback(attempt.attemptId),now)));
 assert.equal(replies.filter(r=>r.credited).length,1);assert.equal((await db.coinWallet.findUnique({where:{playerId:players[0]}})).balance,400);await assert.rejects(()=>service.issue(players[0],true,now),/frequency_cap/);
 const restarted=new PrismaClient({datasources:{db:{url}}});try{assert.deepEqual(await new RewardedEntitlement(restarted,configUsed).consume(callback(attempt.attemptId),now),{credited:false,duplicate:true});}finally{await restarted.$disconnect();}
 const a2=await service.issue(players[1],true,now),raw2=callback(a2.attemptId,'1111111111111111');
 const failing={$transaction:(fn,opts)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='coinDailyBonusClaim')return new Proxy(target[key],{get(delegate,method){if(method==='update')return ()=>{throw Error('synthetic-mid-transaction-failure');};const value=delegate[method];return typeof value==='function'?value.bind(delegate):value;}});const value=target[key];return typeof value==='function'?value.bind(target):value;}})),opts)};
 await assert.rejects(()=>new RewardedEntitlement(failing,configUsed).consume(raw2,now),/mid-transaction/);
 assert.equal((await db.coinWallet.findUnique({where:{playerId:players[1]}})).balance,200);assert.equal((await db.coinDailyBonusClaim.findUnique({where:{playerId_claimDate:{playerId:players[1],claimDate:day}}})).amount,200);
 assert.equal(Number((await db.$queryRaw`SELECT count(*) FROM "RewardReviewReceipt" WHERE "attemptId"=${a2.attemptId}`)[0].count),0);assert.equal((await db.$queryRaw`SELECT "consumedAt" FROM "RewardReviewAttempt" WHERE "id"=${a2.attemptId}`)[0].consumedAt,null);
 assert.equal((await service.consume(raw2,now)).credited,true);
 const a3=await service.issue(players[2],true,now);await service.cancel(players[2],a3.attemptId);await assert.rejects(()=>service.consume(callback(a3.attemptId,'2222222222222222'),now),/unavailable/);
 const a4=await service.issue(players[3],true,now);await assert.rejects(()=>service.consume(callback(a4.attemptId),now),/transaction_reused/);
 const a5=await service.issue(players[4],true,now-11*60000);await assert.rejects(()=>service.consume(callback(a5.attemptId,'3333333333333333'),now),/expired/);
 for(let i=0;i<3;i++){const a=await service.issue(players[5],true,now+i);await service.cancel(players[5],a.attemptId);}await assert.rejects(()=>service.issue(players[5],true,now+3),/attempt_cap/);

 if(provider==='levelplay'){
  // Replays after the normal grant deadline/session revocation must only acknowledge a durable receipt.
  await db.session.delete({where:{id:identities.get(players[0]).sessionId}});
  assert.deepEqual(await service.consume(callback(attempt.attemptId),now+86400000),{credited:false,duplicate:true});
  const logout=await service.issue(players[8],true,now);await db.session.delete({where:{id:identities.get(players[8]).sessionId}});await assert.rejects(()=>service.consume(callback(logout.attemptId,'4444444444444444'),now),/session_required/);
  const banned=await service.issue(players[9],true,now);await db.playerBan.create({data:{playerId:players[9],reason:'Synthetic review only'}});await assert.rejects(()=>service.consume(callback(banned.attemptId,'5555555555555555'),now),/session_required/);
  const deleted=await service.issue(players[10],true,now);await db.user.delete({where:{id:identities.get(players[10]).userId}});await assert.rejects(()=>service.consume(callback(deleted.attemptId,'6666666666666666'),now),/session_required/);
  const expired=await service.issue(players[11],true,now);await db.session.update({where:{id:identities.get(players[11]).sessionId},data:{expiresAt:new Date(now)}});await assert.rejects(()=>service.consume(callback(expired.attemptId,'7777777777777777'),now),/session_required/);
  await assert.rejects(()=>actual.issue(players[12],true,now,identities.get(players[1])),/session_required/);
  const binding=await service.issue(players[13],true,now);
  await assert.rejects(()=>new RewardedEntitlement(db,{...configUsed,adUnit:'other-unit'}).consume(callback(binding.attemptId,'8888888888888888'),now),/provider_binding/);
  await assert.rejects(()=>new RewardedEntitlement(db,{...configUsed,appKey:'other-app'}).consume(callback(binding.attemptId,'8888888888888888'),now),/provider_binding/);
  const p=`ad_network=1&ad_unit=synthetic-unit&custom_data=${binding.attemptId}&timestamp=${now}&transaction_id=9999999999999999`;
  const forgedProtocol=p+'&signature='+sign('sha256',Buffer.from(p),privateKey).toString('base64url')+'&key_id=7';
  await assert.rejects(()=>new RewardedEntitlement(db,config).consume(forgedProtocol,now),/provider_binding/);
  for(const id of players.slice(8))assert.equal((await db.coinWallet.findUnique({where:{playerId:id}})).balance,200);
  assert.equal(Number((await db.$queryRaw`SELECT count(*) FROM "RewardReviewReceipt"`)[0].count),2);
 }
 const ledger=await db.coinLedgerEntry.findMany({where:{type:'ad_reward'}});assert.equal(ledger.length,2);assert.equal(ledger.reduce((s,r)=>s+r.amount,0),400);assert.equal(await total(),before+400);assert.equal((await db.coinWallet.findMany()).every(w=>w.reserved===13),true);
 const result={provider,signatureTimeZone:provider==='levelplay'?'UTC explicitly chosen for synthetic fixtures; real provider timezone not verified':null,sessionBanDeletionOwnerAndScope:provider==='levelplay'?'pass':'not part of historical AdMob candidate',delayedReceiptReplay:provider==='levelplay'?'acknowledged without credit':'not tested',scope:'Real local PostgreSQL, synthetic identities only; disabled integration candidate, not deployed API/provider acceptance',parallelCallbacks:100,creditedParallel:1,duplicatesParallel:99,restartReplay:'pass',rollbackReceiptWalletDailyAndAttempt:'pass',cancelled:'rejected',reusedTransactionAcrossPlayers:'rejected',expired:'rejected',optInAndKillSwitch:'pass',attemptCap:3,grantCapPerBakuDay:1,totalRewardedLedgerEntries:2,totalRewardedCoins:400,closedLedgerResidual:0,legacyDoubledDaily:'rejected-before-attempt',unknownDailyProof:'rejected-before-attempt',reservedCoinsUnchanged:true,providerAmountIgnored:provider==='levelplay'?'one entitlement, never a coin amount':99999};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await db.$disconnect();}
