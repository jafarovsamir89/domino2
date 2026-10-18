import fs from 'node:fs';
import { Client } from '@colyseus/sdk';
import { createGameToken } from '../../../../apps/api/dist/src/modules/auth/game-token.js';
const base='http://127.0.0.1:4567';
const result={base,probes:[]};
const rooms=[];
const token=(id)=>createGameToken({userId:`audit-net-${id}`,playerId:`audit-net-p-${id}`,displayName:id,role:'player',sessionId:`audit-session-${id}`,provider:'better-auth',issuedAt:Date.now(),expiresAt:Date.now()+3600000});
const collect=(r)=>{const events=[];r.onMessage('*',(type,payload)=>events.push({type,payload}));rooms.push(r);return events;};
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
try{
 const a=await new Client(base).create('domino',{name:'victim',authToken:token('victim'),playerCount:4,aiCount:0,stakeKey:'free'});
 const ae=collect(a);
 await pause(300);
 const attacker=await new Client(base).joinById(a.roomId,{name:'attacker',authToken:token('attacker'),restoreSessionId:a.sessionId});
 const be=collect(attacker);
 attacker.send('sync_request');await pause(500);
 result.probes.push({name:'foreign_restoreSessionId',victimSession:a.sessionId,attackerSession:attacker.sessionId,roomId:a.roomId,attackerEvents:be,victimEvents:ae});
 result.probes.push({name:'voice_default_config',response:await fetch(base+'/api/voice/config').then(r=>r.json())});
 result.probes.push({name:'public_presence',response:await fetch(base+'/api/realtime/players').then(r=>r.json())});
}catch(e){result.error=e.stack;process.exitCode=1}
finally{fs.writeFileSync('docs/audit/evidence/metrics/network-probes.json',JSON.stringify(result,null,2));await Promise.allSettled(rooms.map(r=>r.leave()));}
