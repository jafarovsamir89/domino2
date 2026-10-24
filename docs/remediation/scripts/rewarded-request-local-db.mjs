// Local HTTP + real PostgreSQL acceptance. Never imports a .env or starts the API.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash,randomBytes} from 'node:crypto';

const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
assert.ok(args.includes('--database')&&args.includes('--output'),'Explicit fresh database/output required');
const database=arg('--database'),output=arg('--output'),useNest=args.includes('--nest-controller'),useClient=args.includes('--client-flow');
assert.ok(!useClient||useNest,'Client integration requires the real Nest controller');
assert.match(database,/^domino_remediation_s\d{3}_request_[a-z0-9_]+$/);
assert.ok(output.startsWith('docs/remediation/evidence/session-')&&output.endsWith('.json')&&!fs.existsSync(output),'Preserve historical evidence');
const url=`postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public`;
assert.equal(process.env.DATABASE_URL,url,'All Prisma clients, including Better Auth, must use this exact local URL');
assert.equal(process.env.NODE_ENV,'test');
assert.ok(process.env.BETTER_AUTH_SECRET?.startsWith('synthetic-only-'),'Explicit synthetic auth secret required');
const {PrismaClient}=await import('@prisma/client');
const {AuthService}=await import('../../../apps/api/dist/src/modules/auth/auth.service.js');
const {createGameToken}=await import('../../../apps/api/dist/src/modules/auth/game-token.js');
const {RewardedEntitlement,rewardedBakuDay}=await import('../../../apps/api/dist/src/modules/rewarded/entitlement.js');
const {RewardedRequestAccess}=await import('../../../apps/api/dist/src/modules/rewarded/request-access.js');
const db=new PrismaClient({datasources:{db:{url}}}),now=Date.now(),day=rewardedBakuDay(now),privateKey='synthetic-only-levelplay-key-0123456789abcdef';
const config={enabled:true,provider:'levelplay',appKey:'synthetic-app',adUnit:'synthetic-unit',privateKey,timestampUtcOffsetMinutes:0};
const entitlements=new RewardedEntitlement(db,config),origin='http://127.0.0.1:4186';
const access=new RewardedRequestAccess(db,new AuthService(db),entitlements,{enabled:true,trustedOrigins:[origin]});
const identities=new Map(),tokens=new Map();let server,app;
try{
 assert.equal(await db.player.count(),0,'Never reuse/reset populated databases');
 assert.equal((await db.$queryRaw`SELECT to_regclass('public."RewardReviewAttempt"')::text AS name`)[0].name,null,'Require fresh draft tables');
 for(const sql of fs.readFileSync('docs/remediation/review/rewarded-draft.sql','utf8').split(';').filter(v=>v.trim()))await db.$executeRawUnsafe(sql);
 for(const label of ['one','two','logout','ban',...(useNest?['cookie']:[]),...(useClient?['client']:[])]){
  const playerId='s'+database.match(/_s(\d{3})_/)[1]+'-synthetic-'+label,userId=playerId+'-user',sessionId=playerId+'-session',token=randomBytes(32).toString('hex');
  identities.set(label,{playerId,userId,sessionId});tokens.set(label,token);
  await db.user.create({data:{id:userId,name:'Synthetic review',email:playerId+'@example.invalid',sessions:{create:{id:sessionId,token,expiresAt:new Date(now+86400000)}}}});
  await db.player.create({data:{id:playerId,userId,displayName:'Synthetic review',wallet:{create:{balance:200,reserved:13,lifetimeEarned:200}},dailyClaims:{create:{claimDate:day,streakDay:1,amount:200}},ledgerEntries:{create:{type:'daily_bonus',amount:200,balanceBefore:0,balanceAfter:200,reservedBefore:13,reservedAfter:13,referenceType:'daily_bonus',referenceId:day,idempotencyKey:`daily_bonus:${playerId}:${day}:initial`,payloadJson:{claimMode:'normal',multiplier:1,baseReward:200,reward:200,claimDate:day}}}}});
 }
 const gameToken=label=>createGameToken({...identities.get(label),displayName:'Synthetic',role:'player',provider:'better-auth',issuedAt:now,expiresAt:now+60000});
 if(useNest){
  await import('reflect-metadata');
  const {NestFactory}=await import('@nestjs/core');
  const {RewardedReviewModule}=await import('../../../apps/api/dist/src/modules/rewarded/rewarded-review.module.js');
  app=await NestFactory.create(RewardedReviewModule.register(access),{logger:false});
  app.setGlobalPrefix('api');await app.listen(0,'127.0.0.1');server=app.getHttpServer();
 }else{
 server=http.createServer(async(req,res)=>{
  try{
   let size=0,body='';for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('invalid_request');body+=chunk;}
   let result;
   if(req.method==='POST'&&req.url==='/issue')result=await access.issue(req.headers,JSON.parse(body));
   else if(req.method==='POST'&&req.url==='/cancel')result=await access.cancel(req.headers,JSON.parse(body));
   else if(req.method==='GET'&&req.url?.startsWith('/status/'))result=await access.status(req.headers,req.url.slice('/status/'.length));
   else{res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(result));
  }catch(error){const text=error instanceof Error?error.message:'unexpected';res.writeHead(text==='active_session_required'?401:text==='attempt_not_found'?404:400,{'Content-Type':'application/json'}).end(JSON.stringify({error:text}));}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 }
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,label,body,headers={})=>{const route=useNest?'/api/economy/daily-bonus/rewarded'+(path==='/issue'?'/attempt':path.startsWith('/status/')?'/attempt/'+path.slice('/status/'.length):path):path;const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(label?{authorization:'Bearer '+tokens.get(label)}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});if(useNest&&r.status!==404)assert.equal(r.headers.get('cache-control'),'no-store');return {status:r.status,body:await r.json()};};
 const count=async()=>Number((await db.$queryRaw`SELECT count(*) FROM "RewardReviewAttempt"`)[0].count);
 assert.equal((await request('/issue',null,{optIn:true})).status,401);
 assert.equal((await request('/issue','one',{optIn:true,playerId:identities.get('two').playerId})).status,400);assert.equal(await count(),0);
 const one=await request('/issue','one',{optIn:true});assert.equal(one.status,200,'Real Better Auth bearer must resolve');assert.match(one.body.attemptId,/^[a-f0-9]{64}$/);
 const retry=await request('/issue','one',{optIn:true},{authorization:'Bearer '+gameToken('one')});assert.equal(retry.status,200);assert.equal(retry.body.attemptId,one.body.attemptId);assert.equal(await count(),1);
 const id=one.body.attemptId;
 assert.equal((await request('/status/'+id,'one')).body.state,'pending');
 assert.equal((await request('/status/'+id,'two')).status,404);
 assert.equal((await request('/cancel','two',{attemptId:id})).status,404);
 assert.equal((await request('/status/'+id,'one')).body.state,'pending');
 // A second valid login for the same player cannot take over an already-issued SDK nonce.
 const extraSession=identities.get('one').sessionId+'-other',extraToken=randomBytes(32).toString('hex');
 await db.session.create({data:{id:extraSession,userId:identities.get('one').userId,token:extraToken,expiresAt:new Date(now+86400000)}});
 assert.equal((await request('/status/'+id,null,undefined,{authorization:'Bearer '+extraToken})).status,404);
 assert.equal((await request('/cancel',null,{attemptId:id},{authorization:'Bearer '+extraToken})).status,404);
 assert.equal((await request('/issue',null,{optIn:true},{authorization:'Bearer '+extraToken})).status,useNest?409:400);
 // Only a provider-signed server message may credit; status and cancel have no grant action.
 const timestamp=new Date(now).toISOString().replace(/[-:T]/g,'').slice(0,12),eventId='0123456789abcdef',rewards='1';
 const callback=new URLSearchParams({applicationUserId:id,eventId,rewards,timestamp,signature:createHash('md5').update(timestamp+eventId+id+rewards+privateKey).digest('hex')}).toString();
 assert.equal((await entitlements.consume(callback)).credited,true);
 assert.equal((await request('/status/'+id,'one')).body.state,'credited');
 assert.equal((await request('/cancel','one',{attemptId:id})).body.state,'credited','Cancel cannot undo a committed grant or pretend it was cancelled');
 assert.deepEqual(await entitlements.consume(callback),{credited:false,duplicate:true});
 const two=await request('/issue','two',{optIn:true});assert.equal(two.status,200);
 assert.equal((await request('/cancel','two',{attemptId:two.body.attemptId})).body.state,'cancelled');
 const pending=await request('/issue','logout',{optIn:true});assert.equal(pending.status,200);
 await db.session.delete({where:{id:identities.get('logout').sessionId}});
 assert.equal((await request('/status/'+pending.body.attemptId,'logout')).status,401);
 assert.equal((await request('/cancel','logout',{attemptId:pending.body.attemptId},{authorization:'Bearer '+gameToken('logout')})).status,401);
 await db.playerBan.create({data:{playerId:identities.get('ban').playerId,reason:'Synthetic review only'}});
 assert.equal((await request('/issue','ban',{optIn:true})).status,401);
 if(useNest){
  const {auth}=await import('../../../apps/api/dist/src/modules/auth/auth.instance.js');
  const {getBetterAuthConfig}=await import('../../../apps/api/dist/src/modules/auth/better-auth.config.js');
  const who=identities.get('cookie'),password='synthetic-only-s045-password';
  await db.account.create({data:{id:who.userId+'-credential',userId:who.userId,accountId:who.userId,providerId:'credential',password:await getBetterAuthConfig().hashPassword(password)}});
  const signIn=await auth.api.signInEmail({body:{email:who.playerId+'@example.invalid',password},headers:new Headers({origin}),asResponse:true});
  assert.equal(signIn.status,200,'Synthetic email/password sign-in must succeed');
  const cookie=signIn.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');assert.ok(cookie,'Expected signed session cookie');
  // Cookie bytes/tokens stay only in memory; no screenshots, logs or evidence values.
  const cookieAttempt=await request('/issue',null,{optIn:true},{cookie,origin});assert.equal(cookieAttempt.status,200);
  const cid=cookieAttempt.body.attemptId;
  assert.equal((await request('/status/'+cid,null,undefined,{cookie})).body.state,'pending');
  assert.equal((await request('/cancel',null,{attemptId:cid},{cookie})).status,403);
  assert.equal((await request('/cancel',null,{attemptId:cid},{cookie,origin:origin+'.evil.invalid'})).status,403);
  assert.equal((await request('/cancel',null,{attemptId:cid},{cookie,origin})).body.state,'cancelled');
  assert.equal((await request('/grant','one',{attemptId:id,reward:99999})).status,404);
  assert.equal((await request('/complete','one',{attemptId:id})).status,404);
 }
 let clientResult;
 if(useClient){
  const {RewardedDailyFlow,createRewardedDailyApi}=await import('../../../js/rewardedDailyFlow.js');
  let shows=0,binds=0,clientAttempt;const phases=[];
  const api=createRewardedDailyApi({platformRequest:async(path,options={})=>{
   const r=await fetch(base+'/api'+path,{method:options.method??'GET',headers:{'Content-Type':'application/json',authorization:'Bearer '+tokens.get('client')},...(options.body?{body:JSON.stringify(options.body)}:{})});
   const body=await r.json();if(!r.ok)throw Error(body.error||'synthetic-http-failure');return body;
  }});
  const flow=new RewardedDailyFlow({api,enabled:true,onChange:s=>phases.push(s.phase),ads:{bindAttempt:async value=>{binds++;clientAttempt=value.attemptId;return {bound:true,attemptId:clientAttempt};},show:async()=>{shows++;return {completed:true,reward:99999};}}});
  assert.equal((await flow.start()).phase,'pending','SDK completion alone must never credit');
  const getWallet=()=>db.coinWallet.findUnique({where:{playerId:identities.get('client').playerId}});
  assert.equal((await getWallet()).balance,200);assert.equal((await flow.start()).phase,'pending');assert.equal(shows,1);
  const transactionId='1123456789abcdef';
  const clientCallback=new URLSearchParams({applicationUserId:clientAttempt,eventId:transactionId,rewards,timestamp,signature:createHash('md5').update(timestamp+transactionId+clientAttempt+rewards+privateKey).digest('hex')}).toString();
  assert.equal((await entitlements.consume(clientCallback)).credited,true);
  assert.equal((await flow.check()).phase,'credited');assert.equal((await getWallet()).balance,400);
  assert.deepEqual(await entitlements.consume(clientCallback),{credited:false,duplicate:true});
  assert.equal((await flow.cancel()).phase,'credited');assert.equal(shows,1);assert.equal(binds,1);assert.equal((await getWallet()).reserved,13);
  assert.equal(JSON.stringify(flow.snapshot).includes(clientAttempt),false);flow.dispose();
  clientResult={adapter:'actual browser module/helper over real Nest/PG, FAKE native adapter',sdkSuccessBeforeCallback:'pending, balance unchanged',lateSyntheticCallback:'credited only after server transaction',repeatedStart:'status only, one ad show',shows,binds,cancelAfterCredit:'credited',duplicateCallback:'no new coins',publicSnapshotContainsNonce:false,phases:[...new Set(phases)]};
 }
 const wallet=await db.coinWallet.findUnique({where:{playerId:identities.get('one').playerId}});assert.equal(wallet.balance,400);assert.equal(wallet.reserved,13);
 const expectedGrants=useClient?2:1;
 assert.equal((await db.coinLedgerEntry.findMany({where:{type:'ad_reward'}})).length,expectedGrants);
 for(const label of ['two','logout','ban',...(useNest?['cookie']:[])])assert.equal((await db.coinWallet.findUnique({where:{playerId:identities.get(label).playerId}})).balance,200);
 const result={scope:'Synthetic local HTTP and PostgreSQL, actual Better Auth opaque-bearer lookup and signed game credentials; no production route or real ad',httpAdapter:useNest?'actual Nest controller':'plain local review harness',...(useNest?{cookieFromRealLocalSignIn:'pass through server HTTP, not browser cookie-domain policy',cookieOriginProtection:'missing/foreign rejected, exact accepted',clientGrantAndCompleteRoutes:'not present',cachePolicy:'no-store'}:{}),...(clientResult?{clientFlow:clientResult}:{}),opaqueBearer:'pass',gameBearer:'pass',clientChosenIdentity:'rejected-before-attempt',unauthenticated:'rejected',idempotentIssue:'same nonce',crossPlayerReadCancel:'rejected',otherSessionReadCancel:'rejected',otherSessionIssue:'scope conflict',statusLifecycle:'pending/credited/cancelled',logoutOpaqueAndGameBearer:'rejected',activeBan:'rejected',providerSignedSyntheticGrant:expectedGrants,duplicateGrant:0,cancelAfterCredit:'remains credited',rewardedLedgerEntries:expectedGrants,totalRewardedCoins:expectedGrants*200,reservedCoinsUnchanged:true};
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{
 if(app)await app.close();
 else if(server){await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
 await db.$disconnect();
}
