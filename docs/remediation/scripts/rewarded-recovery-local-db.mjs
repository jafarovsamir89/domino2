// Fresh local PG, actual Nest/Auth/Economy and actual main UI. Never loads .env.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {chromium,expect} from '@playwright/test';
import 'reflect-metadata';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
assert.ok(args.includes('--database')&&args.includes('--output'));
const database=arg('--database'),output=arg('--output'),phone=args.includes('--phone'),serial=phone?arg('--serial'):null;
assert.match(database,/^domino_remediation_s\d{3}_recovery_[a-z0-9_]+$/);
assert.ok(/^docs\/remediation\/evidence\/session-\d{3}\/[a-z0-9-]+\.json$/.test(output)&&!fs.existsSync(output));
assert.ok(!phone||args.includes('--serial')&&/^[a-zA-Z0-9]+$/.test(serial));
const url=`postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public`,outDir=output.slice(0,output.lastIndexOf('/'));
assert.equal(process.env.DATABASE_URL,url);assert.equal(process.env.NODE_ENV,'test');assert.ok(process.env.BETTER_AUTH_SECRET?.startsWith('synthetic-only-'));
const {PrismaClient}=await import('@prisma/client');
const {RewardedEntitlement,rewardedBakuDay}=await import('../../../apps/api/dist/src/modules/rewarded/entitlement.js');
const {AuthService}=await import('../../../apps/api/dist/src/modules/auth/auth.service.js');
const {EconomyService}=await import('../../../apps/api/dist/src/modules/economy/economy.service.js');
const {RewardedRequestAccess}=await import('../../../apps/api/dist/src/modules/rewarded/request-access.js');
const {RewardedReviewModule}=await import('../../../apps/api/dist/src/modules/rewarded/rewarded-review.module.js');
const {NestFactory}=await import('@nestjs/core');
const {Module,Controller,Get,Req,Res}=await import('@nestjs/common');
const {RewardedDailyFlow,createRewardedDailyApi}=await import('../../../js/rewardedDailyFlow.js');
const db=new PrismaClient({datasources:{db:{url}}}),now=Date.now(),privateKey='synthetic-only-s051-recovery-key-0123456789abcdef';
const config={enabled:true,provider:'levelplay',appKey:'synthetic-app',adUnit:'synthetic-unit',privateKey,timestampUtcOffsetMinutes:0,settlementPolicy:'owner_8day'};
const service=new RewardedEntitlement(db,config),auth=new AuthService(db),access=new RewardedRequestAccess(db,auth,service,{enabled:true,trustedOrigins:['http://127.0.0.1:4175','https://localhost']});
let app,browser,staticServer,forward,reverse=false,event=0,issueRequests=0,cancelRequests=0;
const adb=(...cmd)=>execFileSync('adb',['-s',serial,...cmd],{encoding:'utf8'});
const seed=async(label,days=[0])=>{
 const playerId=database+'-'+label,userId=playerId+'-user',sessionId=playerId+'-session',token=randomBytes(32).toString('hex');
 await db.user.create({data:{id:userId,name:'Synthetic recovery',email:playerId+'@example.invalid',sessions:{create:{id:sessionId,token,expiresAt:new Date(now+86400000)}}}});
 await db.player.create({data:{id:playerId,userId,displayName:'Synthetic recovery',wallet:{create:{balance:200*days.length,reserved:13,lifetimeEarned:200*days.length}}}});
 for(const offset of days){const day=rewardedBakuDay(now-offset*86400000);await db.coinDailyBonusClaim.create({data:{playerId,claimDate:day,streakDay:1,amount:200}});await db.coinLedgerEntry.create({data:{playerId,type:'daily_bonus',amount:200,balanceBefore:0,balanceAfter:200,reservedBefore:13,reservedAfter:13,referenceType:'daily_bonus',referenceId:day,idempotencyKey:`daily_bonus:${playerId}:${day}:initial`,payloadJson:{claimMode:'normal',multiplier:1,baseReward:200,reward:200,claimDate:day}}});}
 return {playerId,userId,sessionId,token};
};
const issue=(who,at=now)=>service.issue(who.playerId,true,at,who);
const callback=(id,at=Date.now())=>{const timestamp=new Date(at).toISOString().replace(/[-:T]/g,'').slice(0,12),eventId=(++event).toString(16).padStart(16,'0'),rewards='1';return new URLSearchParams({applicationUserId:id,eventId,rewards,timestamp,signature:createHash('md5').update(timestamp+eventId+id+rewards+privateKey).digest('hex')}).toString();};
try{
 assert.equal(await db.player.count(),0,'Fresh local database required; never reset');
 assert.equal((await db.$queryRaw`SELECT to_regclass('public."RewardReviewAttempt"')::text AS name`)[0].name,null);
 for(const sql of fs.readFileSync('docs/remediation/review/rewarded-draft.sql','utf8').split(';').filter(v=>v.trim()))await db.$executeRawUnsafe(sql);
 const economy=new EconomyService(db,auth);await economy.onModuleInit();
 const owner=await seed('owner',[0,1]),other=await seed('other'),old=await issue(owner,now-86400000),today=await issue(owner);
 // Real AuthService legitimately grants the initial1000 once. Account for it explicitly.
 await auth.getCurrentProfile({authorization:'Bearer '+owner.token});
 const starter=await db.coinLedgerEntry.findUnique({where:{idempotencyKey:'starter-coins:'+owner.userId}});
 assert.equal(starter?.amount,1000);assert.equal(starter?.type,'grant');
 await service.cancel(owner.playerId,old.attemptId,owner,now);
 const beforeAttempts=Number((await db.$queryRaw`SELECT count(*) FROM "RewardReviewAttempt"`)[0].count);
 const initial=await access.recover({authorization:'Bearer '+owner.token});assert.equal(initial.attempts.length,2);assert.equal(initial.canStart,false);
 assert.equal(initial.attempts.find(v=>v.attemptId===old.attemptId).state,'awaiting_confirmation');
 assert.deepEqual((await access.recover({authorization:'Bearer '+other.token})).attempts,[]);
 assert.equal(Number((await db.$queryRaw`SELECT count(*) FROM "RewardReviewAttempt"`)[0].count),beforeAttempts,'Discovery must not create attempts');
 // Actual daily service supplies wallet/status; only this explicit local composition overlays capability.
 class LocalDailyStatus{async get(req,res){res.setHeader('Cache-Control','no-store');const recovery=await access.recover(req.headers);const status=await economy.getDailyBonusStatus(req.headers);return {...status,dailyBonus:{...status.dailyBonus,rewardedFlowVersion:recovery.flowVersion,rewardedAvailable:true,doubleClaimAvailable:recovery.canStart}};}}
 Controller('economy/daily-bonus')(LocalDailyStatus);Get('status')(LocalDailyStatus.prototype,'get',Object.getOwnPropertyDescriptor(LocalDailyStatus.prototype,'get'));Req()(LocalDailyStatus.prototype,'get',0);Res({passthrough:true})(LocalDailyStatus.prototype,'get',1);
 class LocalReview{}Module({imports:[RewardedReviewModule.register(access)],controllers:[LocalDailyStatus]})(LocalReview);
 app=await NestFactory.create(LocalReview,{logger:false});app.setGlobalPrefix('api');app.enableCors({origin:['http://127.0.0.1:4175','https://localhost'],credentials:true});
 app.use((req,res,next)=>{if(req.method==='POST'&&req.path.endsWith('/attempt'))issueRequests++;if(req.method==='POST'&&req.path.endsWith('/cancel'))cancelRequests++;next();});
 await app.listen(phone?4186:0,'127.0.0.1');const endpoint=await app.getUrl();
 const request=async(path,token=owner.token)=>{const r=await fetch(endpoint+'/api/economy/daily-bonus/rewarded'+path,{headers:token?{authorization:'Bearer '+token}:{}});assert.equal(r.headers.get('cache-control'),'no-store');return {status:r.status,body:await r.json()};};
 assert.equal((await request('/recovery',null)).status,401);assert.equal((await request('/recovery')).status,200);
 const api=createRewardedDailyApi({platformRequest:async path=>{const r=await fetch(endpoint+'/api'+path,{headers:{authorization:'Bearer '+owner.token}});const value=await r.json();if(!r.ok)throw Error(value.error);return value;}});
 let nativeCalls=0;const flow=new RewardedDailyFlow({api,enabled:true,recoverBeforeStart:true,ads:{bindAttempt:()=>{nativeCalls++;throw Error('unexpected_native');},show:()=>{nativeCalls++;throw Error('unexpected_native');}}});
 await flow.recover();assert.equal(flow.snapshot.attempts.length,2);await flow.start();assert.equal(nativeCalls,0);flow.dispose();
 let page;
 if(phone){
  const existing=adb('reverse','--list');assert.ok(!existing.includes('tcp:4186'),'Do not replace an existing reverse');adb('reverse','tcp:4186','tcp:4186');reverse=true;
  adb('shell','am','start','-n','az.simplesoft.dominotelefon.audit/az.simplesoft.dominotelefon.MainActivity');
  const pid=adb('shell','pidof','az.simplesoft.dominotelefon.audit').trim();assert.match(pid,/^\d+$/);
  forward=adb('forward','tcp:0','localabstract:webview_devtools_remote_'+pid).trim();assert.match(forward,/^\d+$/);
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+forward);page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://localhost/'));assert.ok(page,'Only the forwarded audit WebView');
  const cdp=await page.context().newCDPSession(page);await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 }else{
  staticServer=spawn(process.execPath,['e2e/static-server.cjs'],{env:{...process.env,PORT:'4175'},stdio:['ignore','pipe','pipe']});await once(staticServer.stdout,'data');
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await page.addInitScript(base=>{window.DOMINO_ENDPOINTS={API_BASE:base+'/api',GAME_HTTP_BASE:base,GAME_WS_URL:base.replace('http:','ws:')};window.DOMINO_PLATFORM_API_URL=base+'/api';window.DOMINO_SERVER_URL=base;},endpoint);
 }
 const navigate=async token=>{
  await page.goto(phone?'https://localhost/index.html?review=s051':'http://127.0.0.1:4175/index.html');
  await page.waitForFunction(()=>Boolean(window.game?.account&&window.game.authResolved));
  await page.evaluate(async({token,playerId})=>{
   const game=window.game;game.stopDailyBonusTicker();game.disposeDailyRewardedPanel();game.hasAuthenticatedAccount=()=>true;game.accountProfile={id:playerId,coins:0};game.account.getPlatformAuthToken=()=>token;
   game.isRewardedAdsEnabled=()=>true;game.authResolved=true;game.syncStartAuthGate();
   window.recoveryNativeCalls=0;window.__dominoRewardedAdProvider={bindAttempt:()=>{window.recoveryNativeCalls++;throw Error('unexpected_native');},show:()=>{window.recoveryNativeCalls++;throw Error('unexpected_native');}};
   const {translations}=await import('/js/translations.js');game.t=key=>translations.ru[key]||key;
   const banner=document.createElement('p');banner.textContent='ТЕСТ: локальная база, без настоящей рекламы и монет';banner.style.cssText='background:#fff;color:#000;padding:10px';document.querySelector('#daily-bonus-card').prepend(banner);
   await game.loadDailyBonusStatus();
  },{token,playerId:owner.playerId});
  await expect.poll(()=>page.evaluate(()=>window.game._dailyRewardedFlow?.snapshot.attempts.length)).toBe(2);
  await expect.poll(()=>page.evaluate(()=>window.game._dailyRewardedFlow?.snapshot.busy)).toBe(false);
 };
 await navigate(owner.token);assert.equal(await page.evaluate(()=>window.game.accountProfile.coins),1400);
 const panel=page.locator('#daily-rewarded-panel');await expect(panel).toBeVisible();
 const oldIndex=await page.evaluate(()=>window.game._dailyRewardedFlow.snapshot.attempts.find(v=>v.claimDate!==window.game.dailyBonusState.status.claimDate).index);
 await panel.locator('select').selectOption(String(oldIndex));await expect(panel.locator('p')).toContainText('Ждём подтверждения');
 await panel.locator('button').nth(2).click();await expect(panel.locator('p')).toBeHidden();await panel.locator('button').nth(1).click();await expect(panel.locator('p')).toBeVisible();
 await navigate(owner.token);assert.equal(await page.evaluate(()=>window.recoveryNativeCalls),0); // True document reload, no storage token/nonce.
 await db.session.delete({where:{id:owner.sessionId}});assert.equal((await request('/recovery')).status,401);
 const raw=callback(old.attemptId);assert.equal((await service.consume(raw)).credited,true);assert.deepEqual(await service.consume(raw),{credited:false,duplicate:true});
 const freshToken=randomBytes(32).toString('hex'),freshSession=owner.sessionId+'-fresh';await db.session.create({data:{id:freshSession,userId:owner.userId,token:freshToken,expiresAt:new Date(now+86400000)}});
 await navigate(freshToken);assert.equal(await page.evaluate(()=>window.game.accountProfile.coins),1600);
 await panel.locator('select').selectOption(String(oldIndex));await expect(panel.locator('p')).toContainText('Дополнительный бонус начислен');
 assert.equal((await request('/recovery',other.token)).body.attempts.length,0);
 const rawToday=callback(today.attemptId);assert.equal((await service.consume(rawToday)).credited,true);
 const todayIndex=await page.evaluate(()=>window.game._dailyRewardedFlow.snapshot.attempts.find(v=>v.claimDate===window.game.dailyBonusState.status.claimDate).index);
 await panel.locator('select').selectOption(String(todayIndex));await panel.locator('button').nth(1).click();
 await expect.poll(()=>page.evaluate(()=>window.game.accountProfile.coins)).toBe(1800);assert.equal(await page.evaluate(()=>window.recoveryNativeCalls),0);
 await panel.screenshot({path:outDir+(phone?'/phone-main-recovered.png':'/browser-main-recovered.png')});
 const stored=await page.evaluate(()=>Object.values(localStorage).join(' '));assert.equal(stored.includes(freshToken)||stored.includes(old.attemptId)||stored.includes(today.attemptId),false);
 assert.equal(issueRequests,0);assert.equal(cancelRequests,0);
 // Real SQL scope/window/ban/cap checks, independently seeded; no UI side effects.
 const bound=await seed('window',[0,1,7,8,9]);
 for(const day of [1,7,8,9])await issue(bound,now-day*86400000);
 const windowResult=await service.recover(bound.playerId,bound,now);assert.equal(windowResult.attempts.length,3);assert.equal(windowResult.attempts.find(a=>a.claimDate===rewardedBakuDay(now-8*86400000)).state,'expired');assert.equal(windowResult.canStart,true);
 await db.playerBan.create({data:{playerId:bound.playerId,reason:'Synthetic recovery proof'}});await assert.rejects(()=>service.recover(bound.playerId,bound,now),/active_session_required/);
 const siblings=await seed('siblings'),first=await issue(siblings);await service.cancel(siblings.playerId,first.attemptId,siblings);const second=await issue(siblings);await service.consume(callback(first.attemptId));
 const winner=await service.recover(siblings.playerId,siblings);assert.equal(winner.attempts.length,1);assert.equal(winner.attempts[0].attemptId,first.attemptId);assert.equal(winner.attempts[0].state,'credited');assert.equal(winner.canStart,false);assert.notEqual(second.attemptId,first.attemptId);
 const deleted=await seed('deleted');await issue(deleted);await db.user.delete({where:{id:deleted.userId}});await assert.rejects(()=>service.recover(deleted.playerId,deleted),/active_session_required/);
 const wallets=await db.coinWallet.findMany();for(const wallet of wallets){assert.equal(wallet.reserved,13);const ledger=await db.coinLedgerEntry.findMany({where:{playerId:wallet.playerId}});assert.equal(wallet.balance,ledger.reduce((n,v)=>n+v.amount,0));}
 const rewarded=await db.coinLedgerEntry.findMany({where:{type:'ad_reward'}});assert.equal(rewarded.length,3);assert.equal(rewarded.reduce((n,v)=>n+v.amount,0),600);
 assert.equal(await db.coinLedgerEntry.count({where:{idempotencyKey:'starter-coins:'+owner.userId}}),1,'Reload/login must not repeat starter grant');
 fs.writeFileSync(output,JSON.stringify({scope:'Synthetic local accounts, signed synthetic provider messages; actual Nest/Auth/Economy/PG and main UI; no SDK/ad or production',surface:phone?'physical Android audit WebView':'headless browser main app',sameAccountReload:'2 original-day records recovered with zero issue/show/cancel',freshLoginAfterLogout:'old credentials401; confirmed old-day bonus found by new session; another account empty',originalDays:'yesterday200 and today200 settle independently',uiWallet:[1400,1600,1800],starterGrant:'1000 once; separate ledger verified, no repeat on reload/new login',nativeCalls:0,issueRequests,cancelRequests,clientNonceOrTokenPersisted:false,sqlWindow:'1/7/8days included; exact8day expired;9day excluded',sqlSiblingCap:'credited winner only, no duplicate pending siblings',banDeletion:'rejected',rewardedLedgerEntries:3,totalRewardedCoins:600,reservedUnchanged:true,closedLedgerResidual:0},null,2)+'\n',{flag:'wx'});
 console.log('Recovery integration passed: real local auth/DB, actual UI reload/new session, no SDK calls, 3 synthetic grants/600coins, residual0.');
}finally{
 if(browser)await browser.close();if(staticServer){staticServer.kill('SIGTERM');await once(staticServer,'exit').catch(()=>{});}
 if(forward)adb('forward','--remove','tcp:'+forward);if(reverse)adb('reverse','--remove','tcp:4186');
 if(app)await app.close();await db.$disconnect();
}
