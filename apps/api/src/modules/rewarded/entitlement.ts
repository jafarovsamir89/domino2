import {randomBytes} from 'node:crypto';
import {Prisma,PrismaClient} from '@prisma/client';
import {verifyAdMobQuery,rewardEligibility} from './ssv.js';
import {verifyLevelPlayQuery} from './levelplay-ssv.js';
import {ownerSettlementDeadline,ownerSettlementEligibility,OWNER_SETTLEMENT_WINDOW_MS} from './settlement-policy.js';
export function rewardedBakuDay(now:number):string {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baku',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
 const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)!.value;
 return `${value('year')}-${value('month')}-${value('day')}`;
}
type Identity={userId:string;sessionId:string};
type Config={enabled?:boolean;adUnit:string}&({provider?:'admob';keys:ReadonlyMap<string,string>}|{provider:'levelplay';appKey:string;privateKey:string;timestampUtcOffsetMinutes:number;settlementPolicy?:'legacy'|'owner_8day'});
type Attempt={id:string;playerId:string;claimDate:string;baseReward:number;createdAt:Date;expiresAt:Date;consumedAt:Date|null;cancelled:boolean;provider:string;providerScope:string;adUnit:string;userId:string|null;sessionId:string|null};
/** Integration candidate, not registered in Nest/HTTP. Requires the separately reviewed
 * draft DDL, authenticated server caller and trusted provider keys. Off by default.
 * Only upgrades an existing normal daily: normal daily/quest remains the sole initial path.
 */
export class RewardedEntitlement {
 constructor(private db:PrismaClient,private config:Config){}
 get provider(){return this.scope().provider;}
 private enabled(){
  if(this.config.enabled!==true||!this.config.adUnit)throw Error('rewarded_disabled');
  if(this.config.provider==='levelplay'&&(!this.config.appKey||typeof this.config.privateKey!=='string'||this.config.privateKey.length<32||this.config.privateKey.length>512||!Number.isInteger(this.config.timestampUtcOffsetMinutes)||this.config.timestampUtcOffsetMinutes< -720||this.config.timestampUtcOffsetMinutes>840))throw Error('invalid_provider_configuration');
  if(this.config.provider==='levelplay'&&this.config.settlementPolicy!==undefined&&!['legacy','owner_8day'].includes(this.config.settlementPolicy))throw Error('invalid_provider_configuration');
 }
 private ownerPolicy(){return this.config.provider==='levelplay'&&this.config.settlementPolicy==='owner_8day';}
 private scope(){return {provider:this.config.provider??'admob',providerScope:this.config.provider==='levelplay'?this.config.appKey:this.config.adUnit,adUnit:this.config.adUnit};}
 private async access(tx:Prisma.TransactionClient,playerId:string,identity:Identity|undefined,now:number){
  if(!identity?.userId||!identity.sessionId)throw Error('active_session_required');
  // Identity must come from the authenticated server boundary, never arbitrary client IDs.
  const session=await tx.session.findUnique({where:{id:identity.sessionId}});
  const player=await tx.player.findUnique({where:{id:playerId}});
  const ban=await tx.playerBan.findFirst({where:{playerId,revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date(now)}}]}});
  if(!session||session.userId!==identity.userId||session.expiresAt.getTime()<=now||!player||player.userId!==identity.userId||ban)throw Error('active_session_required');
 }
 private async settlementAccount(tx:Prisma.TransactionClient,playerId:string,userId:string|null,now:number){
  if(!userId)throw Error('active_account_required');
  const player=await tx.player.findUnique({where:{id:playerId}});
  const ban=await tx.playerBan.findFirst({where:{playerId,revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date(now)}}]}});
  // Player.userId is a FK; deleting the user nulls it (and the attempt user FK).
  // No old bearer/session is accepted here: the caller authenticated a signed provider event.
  if(!player||player.userId!==userId||ban)throw Error('active_account_required');
 }
 private async lock(tx:Prisma.TransactionClient,playerId:string){await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1464091702,hashtext(${playerId}))`;}
 private async normalDaily(tx:Prisma.TransactionClient,playerId:string,day:string){
  const claim=await tx.coinDailyBonusClaim.findUnique({where:{playerId_claimDate:{playerId,claimDate:day}}});
  const initial=await tx.coinLedgerEntry.findUnique({where:{idempotencyKey:`daily_bonus:${playerId}:${day}:initial`}});
  const payload=initial?.payloadJson;
  const meta=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:null;
  // Historical x2/missing/ambiguous grants must not become a larger normal base.
  // Normal daily remains available; only this optional upgrade is denied.
  if(!claim||!Number.isSafeInteger(claim.amount)||claim.amount<1||claim.amount>10000||
     !initial||initial.playerId!==playerId||initial.type!=='daily_bonus'||initial.amount!==claim.amount||
     initial.referenceType!=='daily_bonus'||initial.referenceId!==day||
     !meta||meta.claimMode!=='normal'||meta.multiplier!==1||meta.baseReward!==claim.amount||
     meta.reward!==claim.amount||meta.claimDate!==day)throw Error('normal_daily_required');
  return claim;
 }
 private view(attempt:Attempt,now:number){
  if(this.ownerPolicy()){
   const deadline=ownerSettlementDeadline(attempt.createdAt.getTime(),attempt.expiresAt.getTime());
   const state=attempt.consumedAt?'credited':now>=deadline?'expired':attempt.cancelled||attempt.expiresAt.getTime()<=now?'awaiting_confirmation':'pending';
   return {attemptId:attempt.id,state,expiresAt:attempt.expiresAt,settlementDeadline:new Date(deadline),claimDate:attempt.claimDate,baseReward:attempt.baseReward};
  }
  const state=attempt.consumedAt?'credited':attempt.cancelled?'cancelled':attempt.expiresAt.getTime()<=now||attempt.claimDate!==rewardedBakuDay(now)?'expired':'pending';
  return {attemptId:attempt.id,state,expiresAt:attempt.expiresAt};
 }
 /** Read-only discovery, no opt-in, issue or wallet mutation. Requires current auth.
  * Eight elapsed days intersect at most nine Baku days, at most 3 attempts/day.
  * Credited siblings replace pending siblings for that day; they cannot grant twice.
  */
 async recover(playerId:string,identity:Identity,now=Date.now()){
  this.enabled();if(!this.ownerPolicy())throw Error('rewarded_disabled');
  if(!playerId||!Number.isSafeInteger(now))throw Error('invalid_request');
  return this.db.$transaction(async tx=>{
   await this.lock(tx,playerId);await this.access(tx,playerId,identity,now);
   const scope=this.scope(),cutoff=new Date(now-OWNER_SETTLEMENT_WINDOW_MS);
   const attempts=await tx.$queryRaw<Attempt[]>`SELECT a.* FROM "RewardReviewAttempt" a WHERE a."playerId"=${playerId} AND a."userId"=${identity.userId} AND a."provider"=${scope.provider} AND a."providerScope"=${scope.providerScope} AND a."adUnit"=${scope.adUnit} AND a."createdAt">=${cutoff} AND a."createdAt"<=${new Date(now)} AND (a."consumedAt" IS NOT NULL OR NOT EXISTS (SELECT 1 FROM "CoinLedgerEntry" l WHERE l."idempotencyKey"='daily_bonus:' || a."playerId" || ':' || a."claimDate" || ':upgrade')) ORDER BY a."createdAt" DESC,a."id" LIMIT 28`;
   if(attempts.length>27)throw Error('invalid_attempt_history');
   const day=rewardedBakuDay(now),key=`daily_bonus:${playerId}:${day}:upgrade`;
   const prior=await tx.coinLedgerEntry.findUnique({where:{idempotencyKey:key}});
   const count=await tx.$queryRaw<{count:bigint}[]>`SELECT count(*) FROM "RewardReviewAttempt" WHERE "playerId"=${playerId} AND "claimDate"=${day}`;
   let canStart=!prior&&Number(count[0].count)<3&&!attempts.some(a=>a.claimDate===day&&!a.cancelled&&!a.consumedAt&&a.expiresAt.getTime()>now);
   if(canStart){try{await this.normalDaily(tx,playerId,day);}catch(error){if(error instanceof Error&&error.message==='normal_daily_required')canStart=false;else throw error;}}
   return {flowVersion:'owner_8day_v1',canStart,attempts:attempts.map(a=>this.view(a,now))};
  },{maxWait:30000,timeout:30000});
 }
 async issue(playerId:string,optIn:boolean,now=Date.now(),identity?:Identity){
  this.enabled();if(!optIn)throw Error('opt_in_required');if(!playerId||!Number.isSafeInteger(now))throw Error('invalid_request');
  return this.db.$transaction(async tx=>{
   await this.lock(tx,playerId);const scope=this.scope();
   if(scope.provider==='levelplay')await this.access(tx,playerId,identity,now);
   const day=rewardedBakuDay(now),upgradeKey=`daily_bonus:${playerId}:${day}:upgrade`;
   if(await tx.coinLedgerEntry.findUnique({where:{idempotencyKey:upgradeKey}}))throw Error('frequency_cap');
   const claim=await this.normalDaily(tx,playerId,day);
   const active=await tx.$queryRaw<Attempt[]>`SELECT * FROM "RewardReviewAttempt" WHERE "playerId"=${playerId} AND "claimDate"=${day} AND "expiresAt">${new Date(now)} AND "cancelled"=false AND "consumedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1`;
   if(active.length){
    const a=active[0];
    if(a.provider!==scope.provider||a.providerScope!==scope.providerScope||a.adUnit!==scope.adUnit||scope.provider==='levelplay'&&(a.userId!==identity?.userId||!this.ownerPolicy()&&a.sessionId!==identity?.sessionId))throw Error('active_attempt_scope_conflict');
    return {attemptId:a.id,expiresAt:a.expiresAt};
   }
   const count=await tx.$queryRaw<{count:bigint}[]>`SELECT count(*) FROM "RewardReviewAttempt" WHERE "playerId"=${playerId} AND "claimDate"=${day}`;
   if(Number(count[0].count)>=3)throw Error('attempt_cap');
   const id=randomBytes(32).toString(scope.provider==='levelplay'?'hex':'base64url'),expiresAt=new Date(now+10*60000);
   await tx.$executeRaw`INSERT INTO "RewardReviewAttempt" ("id","playerId","claimDate","baseReward","expiresAt","createdAt","provider","providerScope","adUnit","userId","sessionId") VALUES (${id},${playerId},${day},${claim.amount},${expiresAt},${new Date(now)},${scope.provider},${scope.providerScope},${scope.adUnit},${identity?.userId??null},${identity?.sessionId??null})`;
   return {attemptId:id,expiresAt};
  },{maxWait:30000,timeout:30000});
 }
 async cancel(playerId:string,attemptId:string,identity?:Identity,now=Date.now()){
  this.enabled();const scope=this.scope();
  await this.db.$transaction(async tx=>{
   await this.lock(tx,playerId);
   if(scope.provider==='levelplay')await this.access(tx,playerId,identity,now);
   await tx.$executeRaw`UPDATE "RewardReviewAttempt" SET "cancelled"=true WHERE "id"=${attemptId} AND "playerId"=${playerId} AND "provider"=${scope.provider} AND "providerScope"=${scope.providerScope} AND "adUnit"=${scope.adUnit} AND "consumedAt" IS NULL`;
  });
 }
 async status(playerId:string,attemptId:string,identity:Identity,now=Date.now()){
  this.enabled();if(!playerId||!attemptId||!Number.isSafeInteger(now))throw Error('invalid_request');
  return this.db.$transaction(async tx=>{
   await this.lock(tx,playerId);await this.access(tx,playerId,identity,now);
   const [attempt]=await tx.$queryRaw<Attempt[]>`SELECT * FROM "RewardReviewAttempt" WHERE "id"=${attemptId} AND "playerId"=${playerId}`;
   const scope=this.scope();
   if(!attempt||attempt.provider!==scope.provider||attempt.providerScope!==scope.providerScope||attempt.adUnit!==scope.adUnit||attempt.userId!==identity.userId||!this.ownerPolicy()&&attempt.sessionId!==identity.sessionId)throw Error('attempt_not_found');
   return this.view(attempt,now);
  },{maxWait:30000,timeout:30000});
 }
 async consume(rawQuery:string,now=Date.now()){
  this.enabled();const scope=this.scope();
  const owner=this.ownerPolicy();
  const ad=this.config.provider==='levelplay'?verifyLevelPlayQuery(rawQuery,{...this.config,now,...(owner?{maxAgeMs:OWNER_SETTLEMENT_WINDOW_MS+60000}:{})}):{...verifyAdMobQuery(rawQuery,{...this.config,now}),...scope};
  return this.db.$transaction(async tx=>{
   const found=await tx.$queryRaw<Attempt[]>`SELECT * FROM "RewardReviewAttempt" WHERE "id"=${ad.attemptId}`;
   if(!found.length)throw Error('attempt_not_found');
   await this.lock(tx,found[0].playerId);
   const [attempt]=await tx.$queryRaw<Attempt[]>`SELECT * FROM "RewardReviewAttempt" WHERE "id"=${ad.attemptId} FOR UPDATE`;
   if(!attempt)throw Error('attempt_not_found');
   if(attempt.provider!==ad.provider||attempt.providerScope!==ad.providerScope||attempt.adUnit!==ad.adUnit)throw Error('wrong_provider_binding');
   const receipt=await tx.$queryRaw<{attemptId:string}[]>`SELECT "attemptId" FROM "RewardReviewReceipt" WHERE "provider"=${ad.provider} AND "providerScope"=${ad.providerScope} AND "transactionId"=${ad.transactionId}`;
   if(receipt.length){if(receipt[0].attemptId!==attempt.id)throw Error('transaction_reused');return {credited:false,duplicate:true};}
   if(ad.provider==='levelplay'){
    if(owner)await this.settlementAccount(tx,attempt.playerId,attempt.userId,now);
    else await this.access(tx,attempt.playerId,attempt.userId&&attempt.sessionId?{userId:attempt.userId,sessionId:attempt.sessionId}:undefined,now);
   }
   const day=owner?attempt.claimDate:rewardedBakuDay(now),key=`daily_bonus:${attempt.playerId}:${day}:upgrade`;
   const prior=await tx.coinLedgerEntry.findUnique({where:{idempotencyKey:key}});
   if(owner)ownerSettlementEligibility({enabled:true,optIn:true,attemptId:attempt.id,attemptPlayerId:attempt.playerId,playerId:found[0].playerId,createdAt:attempt.createdAt.getTime(),expiresAt:attempt.expiresAt.getTime(),now,grantsForOriginalDay:prior?1:0,consumed:Boolean(attempt.consumedAt)},ad);
   else rewardEligibility({enabled:true,optIn:true,attemptId:attempt.id,attemptPlayerId:attempt.playerId,playerId:found[0].playerId,expiresAt:attempt.expiresAt.getTime(),now,day,attemptDay:attempt.claimDate,grantsToday:prior?1:0,cap:1,cancelled:attempt.cancelled,consumed:Boolean(attempt.consumedAt)},ad);
   const claim=await this.normalDaily(tx,attempt.playerId,day);
   if(claim.amount!==attempt.baseReward)throw Error('daily_changed');
   // Lock the wallet row just like normal economy operations, preserving reserved coins.
   const [wallet]=await tx.$queryRaw<{balance:number;reserved:number}[]>`SELECT "balance","reserved" FROM "CoinWallet" WHERE "playerId"=${attempt.playerId} FOR UPDATE`;
   if(!wallet)throw Error('wallet_missing');
   await tx.$executeRaw`INSERT INTO "RewardReviewReceipt" ("provider","providerScope","transactionId","attemptId","eventTimestamp") VALUES (${ad.provider},${ad.providerScope},${ad.transactionId},${attempt.id},${BigInt(ad.timestamp)})`;
   await tx.coinWallet.update({where:{playerId:attempt.playerId},data:{balance:{increment:attempt.baseReward},lifetimeEarned:{increment:attempt.baseReward}}});
   await tx.coinLedgerEntry.create({data:{playerId:attempt.playerId,type:'ad_reward',amount:attempt.baseReward,balanceBefore:wallet.balance,balanceAfter:wallet.balance+attempt.baseReward,reservedBefore:wallet.reserved,reservedAfter:wallet.reserved,referenceType:'daily_rewarded',referenceId:day,idempotencyKey:key}});
   await tx.coinDailyBonusClaim.update({where:{playerId_claimDate:{playerId:attempt.playerId,claimDate:day}},data:{amount:attempt.baseReward*2}});
   await tx.$executeRaw`UPDATE "RewardReviewAttempt" SET "consumedAt"=${new Date(now)} WHERE "id"=${attempt.id}`;
   return {credited:true,duplicate:false,amount:attempt.baseReward};
  },{maxWait:30000,timeout:30000});
 }
}
