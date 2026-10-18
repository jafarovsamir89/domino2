if(!process.cwd().includes('/.tmp/remediation-s015/'))throw Error('isolated S015 required');
const {createRequire}=require('node:module'),req=createRequire(process.cwd()+'/server/package.json');
const p=req('./livePresence'),r=req('./roomRegistry');
for(const visibility of ['open','closed']){p.upsertLivePlayer('synthetic-session-'+visibility,{roomId:'synthetic-room-'+visibility,roomCode:visibility==='open'?'PUBLIC':'PRIVATE-CODE',roomVisibility:visibility,userId:'synthetic-owner',playerId:'synthetic-player',displayName:'Synthetic',isConnected:true,humanSeats:2,totalPlayers:2,provider:'platform'});void r.rememberRoom(visibility==='open'?'PUBLIC':'PRIVATE-CODE','synthetic-room-'+visibility);}
const http=require('node:http'),listen=http.Server.prototype.listen;
http.Server.prototype.listen=function(...args){this.once('listening',()=>process.send?.({ready:true,port:this.address().port}));return listen.apply(this,args)};
