// Explicit owner_8day policy: real local PG + authenticated local HTTP, synthetic clocks.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
assert.ok(args.includes('--database')&&args.includes('--output'));
const database=arg('--database'),output=arg('--output');
assert.match(database,/^domino_remediation_s\d{3}_owner_[a-z0-9_]+$/);
assert.ok(/^docs\/remediation\/evidence\/session-\d{3}\/[a-z0-9-]+\.json$/.test(output)&&!fs.existsSync(output));
const url=`postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public`;
assert.equal(process.env.DATABASE_URL,url);assert.equal(process.env.NODE_ENV,'test');assert.ok(process.env.BETTER_AUTH_SECRET?.startsWith('synthetic-only-'));
const {PrismaClient}=await import('@prisma/client');
const {RewardedEntitlement,rewardedBakuDay}=await import('../../../apps/api/dist/src/modules/rewarded/entitlement.js');
const {OWNER_SETTLEMENT_WINDOW_MS:windowMs}=await import('../../../apps/api/dist/src/modules/rewarded/settlement-policy.js');
const {AuthService}=await import('../../../apps/api/dist/src/modules/auth/auth.service.js');
const {RewardedRequestAccess}=await import('../../../apps/api/dist/src/modules/rewarded/request-access.js');
const {RewardedReviewModule}=await import('../../../apps/api/dist/src/modules/rewarded/rewarded-review.module.js');
const {NestFactory}=await import('@nestjs/core');
const db=new PrismaClient({datasources:{db:{url}}}),base=Date.UTC(2026,9,24,12,0,59,999),privateKey='synthetic-only-s049-levelplay-key-0123456789abcdef';
const config={enabled:true,provider:'levelplay',appKey:'synthetic-app',adUnit:'synthetic-unit',timestampUtcOffsetMinutes:0,privateKey,settlementPolicy:'owner_8day'};
const service=new RewardedEntitlement(db,config),origin='http://127.0.0.1:4186';let app,event=0;
const results={};
const seed=async(label,now=base)=>{
 const playerId=database+'-'+label,userId=playerId+'-user',sessionId=playerId+'-session',token=randomBytes(32).toString('hex'),day=rewardedBakuDay(now);
 await db.user.create({data:{id:userId,name:'Synthetic review',email:playerId+'@example.invalid',sessions:{create:{id:sessionId,token,expiresAt:new Date(now+86400000)}}}});
 await db.player.create({data:{id:playerId,userId,displayName:'Synthetic review',wallet:{create:{balance:200,reserved:13,lifetimeEarned:200}},dailyClaims:{create:{claimDate:day,streakDay:1,amount:200}},ledgerEntries:{create:{type:'daily_bonus',amount:200,balanceBefore:0,balanceAfter:200,reservedBefore:13,reservedAfter:13,referenceType:'daily_bonus',referenceId:day,idempotencyKey:`daily_bonus:${playerId}:${day}:initial`,payloadJson:{claimMode:'normal',multiplier:1,baseReward:200,reward:200,claimDate:day}}}}});
 return {playerId,userId,sessionId,token,day,now};
};
const issue=(who,now=who.now)=>service.issue(who.playerId,true,now,who);
const callback=(id,now,signedAt=now,transactionId=(++event).toString(16).padStart(16,'0'))=>{
 const timestamp=new Date(signedAt).toISOString().replace(/[-:T]/g,'').slice(0,12),rewards='1';
 return new URLSearchParams({applicationUserId:id,eventId:transactionId,rewards,timestamp,signature:createHash('md5').update(timestamp+transactionId+id+rewards+privateKey).digest('hex')}).toString();
};
const balance=async who=>(await db.coinWallet.findUnique({where:{playerId:who.playerId}})).balance;
try{
 assert.equal(await db.player.count(),0,'Fresh synthetic database only; never reset');
 assert.equal((await db.$queryRaw`SELECT to_regclass('public."RewardReviewAttempt"')::text AS name`)[0].name,null);
 for(const sql of fs.readFileSync('docs/remediation/review/rewarded-draft.sql','utf8').split(';').filter(s=>s.trim()))await db.$executeRawUnsafe(sql);

 const late=await seed('late'),a=await issue(late),arrival=base+12*60000,raw=callback(a.attemptId,arrival);
 assert.equal((await service.status(late.playerId,a.attemptId,late,arrival)).state,'awaiting_confirmation');
 assert.equal((await service.consume(raw,arrival)).amount,200);assert.equal(await balance(late),400);
 assert.deepEqual(await service.consume(raw,arrival),{credited:false,duplicate:true});results.firstLateTwelveMinutes='credited once';
 const restarted=new PrismaClient({datasources:{db:{url}}});try{assert.deepEqual(await new RewardedEntitlement(restarted,config).consume(raw,arrival),{credited:false,duplicate:true});}finally{await restarted.$disconnect();}results.freshClientRestartReplay='durable receipt ACK only';

 const recover=await seed('recover'),recoverAttempt=await issue(recover);await db.session.delete({where:{id:recover.sessionId}});
 const recovered={...recover,sessionId:recover.sessionId+'-new'};await db.session.create({data:{id:recovered.sessionId,userId:recover.userId,token:randomBytes(32).toString('hex'),expiresAt:new Date(base+86400000)}});
 assert.equal((await service.issue(recover.playerId,true,base+60000,recovered)).attemptId,recoverAttempt.attemptId);
 assert.equal((await service.status(recover.playerId,recoverAttempt.attemptId,recovered,base+60000)).state,'pending');
 await assert.rejects(()=>service.issue(recover.playerId,true,base+60000,recover),/active_session_required/);
 await assert.rejects(()=>service.issue(recover.playerId,true,base+60000,late),/active_session_required/);
 results.sameAccountReauthentication='fresh same-owner session recovers active nonce/status; stale or foreign identity denied';

 const soft=await seed('soft-cancel'),s=await issue(soft);await service.cancel(soft.playerId,s.attemptId,soft,base+60000);
 assert.equal((await service.status(soft.playerId,s.attemptId,soft,base+60000)).state,'awaiting_confirmation');
 assert.equal((await service.consume(callback(s.attemptId,arrival),arrival)).credited,true);assert.equal(await balance(soft),400);results.softCancelThenVerifiedCompletion='credited once';

 const midnight=await seed('midnight',Date.UTC(2026,9,24,19,59)),m=await issue(midnight),todayTime=midnight.now+2*60000,today=rewardedBakuDay(todayTime);
 await db.coinDailyBonusClaim.create({data:{playerId:midnight.playerId,claimDate:today,streakDay:2,amount:300}});
 await db.coinLedgerEntry.create({data:{playerId:midnight.playerId,type:'daily_bonus',amount:300,balanceBefore:200,balanceAfter:500,reservedBefore:13,reservedAfter:13,referenceType:'daily_bonus',referenceId:today,idempotencyKey:`daily_bonus:${midnight.playerId}:${today}:initial`,payloadJson:{claimMode:'normal',multiplier:1,baseReward:300,reward:300,claimDate:today}}});
 await db.coinWallet.update({where:{playerId:midnight.playerId},data:{balance:{increment:300},lifetimeEarned:{increment:300}}});
 assert.equal((await service.consume(callback(m.attemptId,todayTime),todayTime)).amount,200);assert.equal(await balance(midnight),700);
 assert.equal((await db.coinDailyBonusClaim.findUnique({where:{playerId_claimDate:{playerId:midnight.playerId,claimDate:today}}})).amount,300);
 const current=await issue(midnight,todayTime);assert.equal((await service.consume(callback(current.attemptId,todayTime),todayTime)).amount,300);assert.equal(await balance(midnight),1000);
 const days=await db.coinLedgerEntry.findMany({where:{playerId:midnight.playerId,type:'ad_reward'}});assert.equal(days.length,2);assert.deepEqual(days.map(v=>v.amount).sort((a,b)=>a-b),[200,300]);
 assert.ok(days.some(v=>v.idempotencyKey===`daily_bonus:${midnight.playerId}:${midnight.day}:upgrade`));results.midnightOriginalBaseAndIndependentTodayCap='old200 + today300, separate original-day keys';

 const edge=await seed('deadline-below'),e=await issue(edge);assert.equal((await service.consume(callback(e.attemptId,base+windowMs-1,base),base+windowMs-1)).credited,true);
 for(const offset of [0,1]){const who=await seed('deadline-'+offset),attempt=await issue(who),now=base+windowMs+offset;await assert.rejects(()=>service.consume(callback(attempt.attemptId,now),now),/expired_attempt/);assert.equal(await balance(who),200);const fresh={...who,sessionId:who.sessionId+'-new'};await db.session.create({data:{id:fresh.sessionId,userId:who.userId,token:randomBytes(32).toString('hex'),expiresAt:new Date(now+86400000)}});assert.equal((await service.status(who.playerId,attempt.attemptId,fresh,now)).state,'expired');}
 results.exactEightDayDeadline='just below credited (minute tolerance), exact/above rejected';

 const race=await seed('race'),r=await issue(race),raceRaw=callback(r.attemptId,arrival);
 const replies=await Promise.all([service.cancel(race.playerId,r.attemptId,race,arrival),...Array.from({length:100},()=>service.consume(raceRaw,arrival))]);
 assert.equal(replies.filter(v=>v?.credited).length,1);assert.equal(replies.filter(v=>v?.duplicate).length,99);assert.equal(await balance(race),400);results.cancelRaceAndHundredCallbacks='1credit/99acks, cancel order independent';

 const cap=await seed('cap'),first=await issue(cap);await service.cancel(cap.playerId,first.attemptId,cap,base);const second=await issue(cap,base+1);
 await service.consume(callback(first.attemptId,arrival),arrival);await assert.rejects(()=>service.consume(callback(second.attemptId,arrival),arrival),/frequency_cap/);assert.equal(await balance(cap),400);results.multipleAttemptsOriginalDayCap='one upgrade';

 const rollback=await seed('rollback'),b=await issue(rollback),rollbackRaw=callback(b.attemptId,arrival);
 const broken={$transaction:(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='coinDailyBonusClaim')return new Proxy(target[key],{get(delegate,name){if(name==='update')return ()=>{throw Error('synthetic-rollback');};const value=delegate[name];return typeof value==='function'?value.bind(delegate):value;}});const value=target[key];return typeof value==='function'?value.bind(target):value;}})),options)};
 await assert.rejects(()=>new RewardedEntitlement(broken,config).consume(rollbackRaw,arrival),/synthetic-rollback/);
 assert.equal(await balance(rollback),200);assert.equal(Number((await db.$queryRaw`SELECT count(*) FROM "RewardReviewReceipt" WHERE "attemptId"=${b.attemptId}`)[0].count),0);
 assert.equal((await db.$queryRaw`SELECT "consumedAt" FROM "RewardReviewAttempt" WHERE "id"=${b.attemptId}`)[0].consumedAt,null);
 await service.consume(rollbackRaw,arrival);assert.equal(await balance(rollback),400);results.rollbackReceiptLedgerWalletAttempt='pass with retry';

 for(const kind of ['ban','logout-ban','deleted-user','deleted-player','wrong-owner','daily-changed','forged']){
  const who=await seed(kind),attempt=await issue(who);let expected=/active_account_required/,message=callback(attempt.attemptId,arrival);
  if(kind==='ban')await db.playerBan.create({data:{playerId:who.playerId,reason:'Synthetic review only'}});
  if(kind==='logout-ban'){await db.session.delete({where:{id:who.sessionId}});await db.playerBan.create({data:{playerId:who.playerId,reason:'Synthetic review only'}});}
  if(kind==='deleted-user')await db.user.delete({where:{id:who.userId}});
  if(kind==='deleted-player'){await db.player.delete({where:{id:who.playerId}});expected=/attempt_not_found/;}
  if(kind==='wrong-owner'){const other=who.userId+'-other';await db.user.create({data:{id:other,name:'Synthetic other',email:other+'@example.invalid'}});await db.player.update({where:{id:who.playerId},data:{userId:other}});}
  if(kind==='daily-changed'){await db.coinDailyBonusClaim.update({where:{playerId_claimDate:{playerId:who.playerId,claimDate:who.day}},data:{amount:201}});expected=/normal_daily_required/;}
  if(kind==='forged'){message=message.replace(/signature=[a-f0-9]+/,'signature='+'0'.repeat(32));expected=/invalid_signature/;}
  await assert.rejects(()=>service.consume(message,arrival),expected);if(kind!=='deleted-player')assert.equal(await balance(who),200);
 }
 results.signatureBanDeletionOwnershipDailyProof='all rejected, no grants';

 const live=await seed('logout-http',Date.now());
 const access=new RewardedRequestAccess(db,new AuthService(db),service,{enabled:true,trustedOrigins:[origin]});
 app=await NestFactory.create(RewardedReviewModule.register(access),{logger:false});app.setGlobalPrefix('api');await app.listen(0,'127.0.0.1');const endpoint=await app.getUrl();
 const request=async(path,token,body)=>{const response=await fetch(endpoint+'/api/economy/daily-bonus/rewarded'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
 const issued=await request('/attempt',live.token,{optIn:true});assert.equal(issued.status,200);const lid=issued.body.attemptId;
 await db.session.delete({where:{id:live.sessionId}});
 for(const [path,body] of [['/attempt',{optIn:true}],['/attempt/'+lid,undefined],['/cancel',{attemptId:lid}]])assert.equal((await request(path,live.token,body)).status,401);
 assert.equal(await balance(live),200);const afterLogout=live.now+12*60000,logoutRaw=callback(lid,afterLogout);assert.equal((await service.consume(logoutRaw,afterLogout)).credited,true);assert.equal(await balance(live),400);
 const freshToken=randomBytes(32).toString('hex');await db.session.create({data:{id:live.sessionId+'-new',userId:live.userId,token:freshToken,expiresAt:new Date(Date.now()+86400000)}});
 assert.equal((await request('/attempt/'+lid,freshToken)).body.state,'credited');assert.equal((await request('/attempt/'+lid,late.token)).status,404);
 await db.user.delete({where:{id:live.userId}});assert.deepEqual(await service.consume(logoutRaw,afterLogout),{credited:false,duplicate:true});results.logout='old client credentials401; signed callback credits original account; fresh same-owner status200, other account404; durable duplicate after deletion onlyACK';

 const rewards=await db.coinLedgerEntry.findMany({where:{type:'ad_reward'}});assert.equal(rewards.length,9);assert.equal(rewards.reduce((n,v)=>n+v.amount,0),1900);
 const wallets=await db.coinWallet.findMany();assert.equal(wallets.every(v=>v.reserved===13),true);
 // Every surviving wallet equals its starter/normal ledgers plus confirmed ad ledgers.
 for(const wallet of wallets){const entries=await db.coinLedgerEntry.findMany({where:{playerId:wallet.playerId}});assert.equal(wallet.balance,entries.reduce((n,v)=>n+v.amount,0));}
 fs.writeFileSync(output,JSON.stringify({scope:'Explicit local owner_8day policy, synthetic clocks/signatures/users; real PG and actual Nest/AuthService, no ad SDK/provider/production',results,rewardedLedgerEntries:rewards.length,totalRewardedCoins:1900,reservedCoinsUnchanged:true,closedLedgerResidual:0},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({ownerPolicy:'pass',rewardedLedgerEntries:rewards.length,totalRewardedCoins:1900,closedLedgerResidual:0}));
}finally{if(app)await app.close();await db.$disconnect();}
