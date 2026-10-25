// Read-only policy characterization. No DB, HTTP, SDK, wallet or real credentials.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {rewardEligibility} from '../../../apps/api/dist/src/modules/rewarded/ssv.js';
import {verifyLevelPlayQuery} from '../../../apps/api/dist/src/modules/rewarded/levelplay-ssv.js';

const arg=process.argv.indexOf('--output'),output=arg>=0?process.argv[arg+1]:null;
assert.ok(output&&/^docs\/remediation\/evidence\/session-\d{3}\/[a-z0-9-]+\.json$/.test(output));
assert.equal(fs.existsSync(output),false,'Choose fresh output; never replace historical evidence');
const minute=60000,day=86400000,start=Date.UTC(2026,9,24,12),id='a'.repeat(64),event='0123456789abcdef';
const privateKey='synthetic-only-s048-policy-key-0123456789abcdef';
const baku=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baku',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
const cases=[
 {id:'C01',label:'first callback at nine minutes',delay:9*minute,expected:'ready'},
 {id:'C02',label:'first callback exactly at ten-minute deadline',delay:10*minute,expected:'expired_attempt'},
 {id:'C03',label:'first callback at twelve minutes with fresh valid signature',delay:12*minute,expected:'expired_attempt'},
 {id:'C04',label:'callback crosses Baku midnight while attempt still within ten minutes',start:Date.UTC(2026,9,24,19,59),delay:2*minute,expected:'wrong_owner_or_day'},
 {id:'C05',label:'first valid callback after explicit cancel',delay:2*minute,cancelled:true,expected:'attempt_unavailable'},
 {id:'C06',label:'another event after daily upgrade cap already reached',delay:2*minute,grants:1,expected:'frequency_cap'},
 {id:'C07',label:'invalid provider signature',delay:2*minute,badSignature:true,expected:'invalid_signature'},
 {id:'C08',label:'next-day first callback with newly signed callback timestamp',delay:day+minute,expected:'wrong_owner_or_day'},
 {id:'C09',label:'ungranted original event timestamp retried seven days later',delay:7*day,originalTimestamp:true,expected:'wrong_owner_or_day'},
 {id:'C10',label:'original signed timestamp older than eight-day verifier window',delay:8*day+minute,originalTimestamp:true,expected:'stale_event'}
];
const results=cases.map(row=>{
 const issued=row.start??start,now=issued+row.delay,timestamp=new Date(row.originalTimestamp?issued:now).toISOString().replace(/[-:T]/g,'').slice(0,12),rewards='1';
 const signature=row.badSignature?'0'.repeat(32):createHash('md5').update(timestamp+event+id+rewards+privateKey).digest('hex');
 const raw=new URLSearchParams({applicationUserId:id,eventId:event,rewards,timestamp,signature}).toString();
 let verifierAccepted=false,outcome;
 try{
  const ad=verifyLevelPlayQuery(raw,{privateKey,appKey:'synthetic-app',adUnit:'synthetic-unit',timestampUtcOffsetMinutes:0,now});verifierAccepted=true;
  outcome=rewardEligibility({enabled:true,optIn:true,attemptId:id,attemptPlayerId:'synthetic-player',playerId:'synthetic-player',expiresAt:issued+10*minute,now,day:baku(now),attemptDay:baku(issued),grantsToday:row.grants??0,cap:1,cancelled:row.cancelled??false,consumed:false},ad);
 }catch(error){outcome=error.message;}
 assert.equal(outcome,row.expected,row.id);
 return {id:row.id,label:row.label,verifierAccepted,currentOutcome:outcome};
});
const files=['apps/api/src/modules/rewarded/ssv.ts','apps/api/src/modules/rewarded/levelplay-ssv.ts','apps/api/dist/src/modules/rewarded/ssv.js','apps/api/dist/src/modules/rewarded/levelplay-ssv.js'];
const hashes=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const result={scope:'Current pure policy functions only; synthetic signatures, no DB/session/SDK/provider test and no new policy implementation',cases:results,assertionsPassed:results.length,sourceAndCompiledHashes:hashes};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({assertionsPassed:results.length,mutations:false}));
