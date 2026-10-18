if(!process.cwd().includes('/.tmp/remediation-s016/'))throw Error('isolated S016 required');
const http=require('node:http'),listen=http.Server.prototype.listen;
http.Server.prototype.listen=function(...args){this.once('listening',async()=>{
 const {createRequire}=require('node:module'),req=createRequire(process.cwd()+'/server/package.json');const {matchMaker}=req('colyseus');
 const listing=await matchMaker.createRoom('domino',{playerCount:2,stakeKey:'free',gameMode:'classic101'});const room=matchMaker.getLocalRoomById(listing.roomId);room.autoDispose=false;
 const {Tile}=req('./model');room.hands=[[new Tile(1,2)],[new Tile(3,4)]];room.boneyard=[new Tile(6,6)];room.matchRecordId='health-synthetic-match';room.state.currentPlayerIndex=1;
 await room.saveCustomStateToRedis();
 const state=()=>JSON.stringify({hands:room.hands,boneyard:room.boneyard,turn:room.state.currentPlayerIndex,match:room.matchRecordId});
 process.on('message',m=>{if(m?.state)process.send?.({state:state()})});process.send?.({ready:true,port:this.address().port,state:state(),roomId:room.roomId});
 });return listen.apply(this,args)};
