// Read-only companion to active-network-check.mjs; watches its own test Redis pause.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const result={scope:'Local game4583/Redis56380. HTTP health during the companion harness SIGSTOP. Client deadline1500ms; no production calls.',before:[],during:[],after:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pid=execFileSync('lsof',['-tiTCP:56380','-sTCP:LISTEN']).toString().trim();
if(!/^\d+$/.test(pid))throw Error('Expected one dedicated audit Redis process');
const state=()=>{try{return execFileSync('ps',['-p',pid,'-o','state=']).toString().trim()}catch{return 'gone'}};
async function health(path){const start=performance.now();try{const r=await fetch('http://127.0.0.1:4583'+path,{signal:AbortSignal.timeout(1500)});return{path,ms:performance.now()-start,httpStatus:r.status,body:await r.text()}}catch(e){return{path,ms:performance.now()-start,error:e.name}}}
result.before=await Promise.all(['/health','/health/ready'].map(health));
const began=performance.now();while(!state().includes('T')&&performance.now()-began<180000)await sleep(250);
if(!state().includes('T'))result.error='Did not observe dedicated Redis SIGSTOP';
else{result.during=await Promise.all(['/health','/health/ready'].map(health));while(state().includes('T')&&performance.now()-began<190000)await sleep(150);result.after=await Promise.all(['/health','/health/ready'].map(health));}
fs.writeFileSync('docs/audit/evidence/metrics/redis-readiness-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
