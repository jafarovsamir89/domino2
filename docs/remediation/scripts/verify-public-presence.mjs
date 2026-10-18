import {fork} from 'node:child_process';import assert from 'node:assert/strict';import crypto from 'node:crypto';
assert(process.cwd().includes('/.tmp/remediation-s015/'));
const child=fork(process.cwd()+'/server/index.js',[],{execArgv:['--require',process.argv[2]],env:{...process.env,PORT:'0',REDIS_URI:'',DOMINO_DEBUG_LOGS:'false'},stdio:['ignore','inherit','inherit','ipc']});
const done=new Promise(r=>child.once('exit',r));const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
const makeToken=userId=>{const payload=Buffer.from(JSON.stringify({userId,playerId:'synthetic-player',displayName:'Synthetic',expiresAt:Date.now()+60000})).toString('base64url');return payload+'.'+crypto.createHmac('sha256',process.env.DOMINO_SERVER_SECRET).update(payload).digest('base64url')};
try{const {port}=await new Promise((r,j)=>{child.on('message',m=>{if(m.ready)r(m)});child.once('exit',c=>j(Error('server exit '+c)))});const get=(route,token)=>fetch('http://127.0.0.1:'+port+route,{headers:token?{Authorization:'Bearer '+token}:{}});
for(const route of ['/api/realtime/summary','/api/realtime/players','/api/realtime/rooms?visibility=all&joinableOnly=false']){const response=await get(route);assert.equal(response.status,200);const text=await response.text();assert(!text.includes('PRIVATE-CODE'));assert(!text.includes('synthetic-session'));assert(!text.includes('synthetic-owner'));}
const legacy=await(await get('/api/realtime/sessions/synthetic-session-closed')).json();assert.equal(legacy.item.roomId,'synthetic-room-closed');assert(!JSON.stringify(legacy).includes('PRIVATE-CODE'));assert(!JSON.stringify(legacy).includes('synthetic-session'));
assert.equal((await(await get('/api/realtime/sessions/synthetic-session-closed',makeToken('other-user'))).json()).item,null);
assert.equal((await(await get('/api/realtime/sessions/synthetic-session-closed',makeToken('synthetic-owner'))).json()).item.roomCode,'PRIVATE-CODE');
assert.equal((await get('/room-code/synthetic-room-closed')).status,404);assert.equal((await get('/room-code/synthetic-room-closed',makeToken('synthetic-owner'))).status,200);
console.log('Actual HTTP public projections, owner-only restore and private code lookup passed');
}finally{child.kill('SIGTERM');await done;clearTimeout(timer);}
