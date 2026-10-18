// Synthetic subprocess using the installed Colyseus MatchMaker lifecycle.
const {createRequire}=require('node:module');
const fs=require('node:fs');
if(!process.cwd().includes('/.tmp/remediation-s010/'))throw Error('isolated S010 required');
const req=createRequire(process.cwd()+'/server/package.json');
process.env.REDIS_URI='redis://127.0.0.1:56379/10';
process.env.DOMINO_DEBUG_LOGS='false';
const {matchMaker,LocalPresence,LocalDriver}=req('colyseus');
const DominoRoom=req('./DominoRoom');
const {Player}=req('./schema/GameState');
const {Tile}=req('./model');
(async()=>{
 await matchMaker.setup(new LocalPresence(),new LocalDriver());
 await matchMaker.accept(true);
 matchMaker.defineRoomType('shutdown-fixture',DominoRoom);
 const mode=process.argv[2];
 const opts=mode!=='save'?JSON.parse(fs.readFileSync('../checkpoint.json')).options:{gameMode:'classic101',playerCount:2,stakeKey:'free'};
 const listing=await matchMaker.createRoom('shutdown-fixture',opts);
 const room=matchMaker.getLocalRoomById(listing.roomId);
 room.autoDispose=false;
 if(mode==='cleanup'){await room.disconnect();process.send?.({ready:true});process.exit(0);return;}
 let settlements=0;
 room.settleForfeitStake=async()=>{settlements++;return {result:'win'};};
 const realSettle=room.settleEconomyRound.bind(room);
 room.settleEconomyRound=(...args)=>realSettle(...args);
 room.getPlatformMatchIdentity=()=>({authToken:'synthetic-shutdown-only'});
 global.fetch=async(url,options)=>{if(!String(url).startsWith('http://127.0.0.1:4300/'))throw Error('nonlocal request blocked');const body=JSON.parse(options.body);if(body.matchId!=='shutdown-match')throw Error('wrong settlement identity');settlements++;return new Response(JSON.stringify({result:'win',stakeAmount:200,bankAmount:400,payoutAmount:180,reservations:[]}),{status:200,headers:{'content-type':'application/json'}});};
 if(mode==='save'){
  for(let i=0;i<2;i++) {const p=new Player();p.userId='shutdown-user-'+i;p.name='Synthetic '+i;p.seatIndex=i;p.isConnected=true;room.state.players.set('s'+i,p);room.state.playerOrder.push('s'+i);room.identityBySessionId.set('s'+i,{userId:p.userId,playerId:'shutdown-player-'+i,provider:'platform'});}
  room.hands=[[new Tile(1,2),new Tile(2,3)],[new Tile(4,5)]];
  room.currentStakeKey='coins_200';room.currentDealStakeKey='coins_200';room.currentDealStakeAmount=200;room.economyReservationMade=true;
  room.boneyard=[new Tile(6,6)];room.matchRecordId='shutdown-match';room.currentDealMatchId=room.matchRecordId;
  room.state.gameActive=true;room.state.currentPlayerIndex=1;room.state.turnVersion=17;room.state.turnDeadlineAt=Date.now()+20000;
  const before=room.buildCustomStateSnapshot();
  fs.writeFileSync('../checkpoint.json',JSON.stringify({before,options:{restoreRoomId:room.roomId,restoreRoomCode:room.roomCode,restoreMatchId:room.matchRecordId}}));
 }else{
  const before=JSON.parse(fs.readFileSync('../checkpoint.json')).before;
  const assert=require('node:assert/strict');
  assert.deepEqual(JSON.parse(JSON.stringify(room.hands)),before.hands);
  assert.deepEqual(JSON.parse(JSON.stringify(room.boneyard)),before.boneyard);
  assert.equal(room.state.currentPlayerIndex,before.state.currentPlayerIndex);
  assert.equal(room.state.turnVersion,before.state.turnVersion);
  assert.equal(room.matchRecordId,before.matchRecordId);
  assert.equal(room.findReusableSessionId({...opts,restoreSessionId:'s0'},{provider:'platform',userId:'shutdown-user-0',playerId:'shutdown-player-0'}),'s0');
  assert(room.state.turnDeadlineAt>Date.now()+18000,'server downtime must not consume the saved turn');
  assert.equal(settlements,0);
  room.recordMatchResult=()=>true;room.scheduleNextRound=()=>{};
  await room.endRound(0,true);
  assert.equal(settlements,1);
  console.log(JSON.stringify({restored:true,turn:room.state.currentPlayerIndex,turnVersion:room.state.turnVersion,match:room.matchRecordId,settlements}));
 }
 process.once('SIGTERM',async()=>{await matchMaker.gracefullyShutdown();await new Promise(r=>setTimeout(r,100));console.log(JSON.stringify({shutdown:true,settlements}));process.exit(settlements===(mode==='save'?0:1)?0:2);});
 process.send?.({ready:true});
})().catch(e=>{console.error(e);process.exit(1)});
