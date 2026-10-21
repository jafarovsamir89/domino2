import {randomBytes} from 'node:crypto';
import {Prisma,PrismaClient} from '@prisma/client';
import {verifyAdMobQuery,rewardEligibility} from './ssv.js';
const bakuDay=(now:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baku',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
type Attempt={id:string;playerId:string;claimDate:string;baseReward:number;expiresAt:Date;consumedAt:Date|null;cancelled:boolean};
/** Integration candidate, not registered in Nest/HTTP. Requires the separately reviewed
 * draft DDL, authenticated server caller and trusted provider keys. Off by default.
 * Only upgrades an existing normal daily: normal daily/quest remains the sole initial path.
 */
export class RewardedEntitlement {
 constructor(private db:PrismaClient,private config:{enabled?:boolean;adUnit:string;keys:ReadonlyMap<string,string>}){}
 private enabled(){if(this.config.enabled!==true||!this.config.adUnit)throw Error('rewarded_disabled');}
 private async lock(tx:Prisma.TransactionClient,playerId:string){await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1464091702,hashtext(${playerId}))`;}
 async issue(playerId:string,optIn:boolean,now=Date.now()){
  this.enabled();if(!optIn)throw Error('opt_in_required');if(!playerId||!Number.isSafeInteger(now))throw Error('invalid_request');
  return this.db.$transaction(async tx=>{
   await this.lock(tx,playerId);const day=bakuDay(now),upgradeKey=`daily_bonus:${playerId}:${day}:upgrade`;
   if(await tx.coinLedgerEntry.findUnique({where:{idempotencyKey:upgradeKey}}))throw Error('frequency_cap');
   const claim=await tx.coinDailyBonusClaim.findUnique({where:{playerId_claimDate:{playerId,claimDate:day}}});
   if(!claim||claim.amount<1||claim.amount>10000)throw Error('normal_daily_required');
   const active=await tx.$queryRaw<Attempt[]>`SELECT * FROM "RewardReviewAttempt" WHERE "playerId"=${playerId} AND "claimDate"=${day} AND "expiresAt">${new Date(now)} AND "cancelled"=false AND "consumedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1`;
   if(active.length)return {attemptId:active[0].id,expiresAt:active[0].expiresAt};
   const count=await tx.$queryRaw<{count:bigint}[]>`SELECT count(*) FROM "RewardReviewAttempt" WHERE "playerId"=${playerId} AND "claimDate"=${day}`;
   if(Number(count[0].count)>=3)throw Error('attempt_cap');
   const id=randomBytes(32).toString('base64url'),expiresAt=new Date(now+10*60000);
   await tx.$executeRaw`INSERT INTO "RewardReviewAttempt" ("id","playerId","claimDate","baseReward","expiresAt","createdAt") VALUES (${id},${playerId},${day},${claim.amount},${expiresAt},${new Date(now)})`;
   return {attemptId:id,expiresAt};
  },{maxWait:30000,timeout:30000});
 }
 async cancel(playerId:string,attemptId:string){
  this.enabled();await this.db.$executeRaw`UPDATE "RewardReviewAttempt" SET "cancelled"=true WHERE "id"=${attemptId} AND "playerId"=${playerId} AND "consumedAt" IS NULL`;
 }
 async consume(rawQuery:string,now=Date.now()){
  this.enabled();const ad=verifyAdMobQuery(rawQuery,{...this.config,now});
  return this.db.$transaction(async tx=>{
   const found=await tx.$queryRaw<Attempt[]>`SELECT * FROM "RewardReviewAttempt" WHERE "id"=${ad.attemptId}`;
   if(!found.length)throw Error('attempt_not_found');
   await this.lock(tx,found[0].playerId);
   const [attempt]=await tx.$queryRaw<Attempt[]>`SELECT * FROM "RewardReviewAttempt" WHERE "id"=${ad.attemptId} FOR UPDATE`;
   if(!attempt)throw Error('attempt_not_found');
   const receipt=await tx.$queryRaw<{attemptId:string}[]>`SELECT "attemptId" FROM "RewardReviewReceipt" WHERE "transactionId"=${ad.transactionId}`;
   if(receipt.length){if(receipt[0].attemptId!==attempt.id)throw Error('transaction_reused');return {credited:false,duplicate:true};}
   const day=bakuDay(now),key=`daily_bonus:${attempt.playerId}:${day}:upgrade`;
   const prior=await tx.coinLedgerEntry.findUnique({where:{idempotencyKey:key}});
   rewardEligibility({enabled:true,optIn:true,attemptId:attempt.id,attemptPlayerId:attempt.playerId,playerId:found[0].playerId,expiresAt:attempt.expiresAt.getTime(),now,day,attemptDay:attempt.claimDate,grantsToday:prior?1:0,cap:1,cancelled:attempt.cancelled,consumed:Boolean(attempt.consumedAt)},ad);
   const claim=await tx.coinDailyBonusClaim.findUnique({where:{playerId_claimDate:{playerId:attempt.playerId,claimDate:day}}});
   if(!claim||claim.amount!==attempt.baseReward)throw Error('daily_changed');
   // Lock the wallet row just like normal economy operations, preserving reserved coins.
   const [wallet]=await tx.$queryRaw<{balance:number;reserved:number}[]>`SELECT "balance","reserved" FROM "CoinWallet" WHERE "playerId"=${attempt.playerId} FOR UPDATE`;
   if(!wallet)throw Error('wallet_missing');
   await tx.$executeRaw`INSERT INTO "RewardReviewReceipt" ("transactionId","attemptId","eventTimestamp") VALUES (${ad.transactionId},${attempt.id},${BigInt(ad.timestamp)})`;
   await tx.coinWallet.update({where:{playerId:attempt.playerId},data:{balance:{increment:attempt.baseReward},lifetimeEarned:{increment:attempt.baseReward}}});
   await tx.coinLedgerEntry.create({data:{playerId:attempt.playerId,type:'ad_reward',amount:attempt.baseReward,balanceBefore:wallet.balance,balanceAfter:wallet.balance+attempt.baseReward,reservedBefore:wallet.reserved,reservedAfter:wallet.reserved,referenceType:'daily_rewarded',referenceId:day,idempotencyKey:key}});
   await tx.coinDailyBonusClaim.update({where:{playerId_claimDate:{playerId:attempt.playerId,claimDate:day}},data:{amount:attempt.baseReward*2}});
   await tx.$executeRaw`UPDATE "RewardReviewAttempt" SET "consumedAt"=${new Date(now)} WHERE "id"=${attempt.id}`;
   return {credited:true,duplicate:false,amount:attempt.baseReward};
  },{maxWait:30000,timeout:30000});
 }
}
