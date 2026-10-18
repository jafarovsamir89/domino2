import {spawn,fork} from 'node:child_process';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const cwd=process.cwd();assert(cwd.includes('/.tmp/remediation-s016/'));const req=createRequire(cwd+'/server/package.json'),Redis=req('ioredis');
const redisProcess=spawn(cwd+'/../../remediation-s010/redis-src/src/redis-server',['--bind','127.0.0.1','--port','56380','--save','','--appendonly','no'],{stdio:['ignore','pipe','inherit']});const redisExit=new Promise(r=>redisProcess.once('exit',r));let server,serverExit,redis;
const timeout=setTimeout(()=>{redisProcess.kill('SIGCONT');redisProcess.kill('SIGKILL');server?.kill('SIGKILL')},20000);
try{
 await new Promise((r,j)=>{redisProcess.stdout.on('data',d=>{if(String(d).includes('Ready to accept connections'))r()});redisProcess.once('exit',c=>j(Error('Redis exit '+c)))});
 redis=new Redis('redis://127.0.0.1:56380/0');
 server=fork(cwd+'/server/index.js',[],{execArgv:['--require',process.argv[2]],env:{...process.env,PORT:'0',REDIS_URI:'redis://127.0.0.1:56380/0',DOMINO_DEBUG_LOGS:'false'},stdio:['ignore','inherit','inherit','ipc']});serverExit=new Promise(r=>server.once('exit',r));
 const ready=await new Promise((r,j)=>{server.on('message',m=>{if(m.ready)r(m)});server.once('exit',c=>j(Error('server exit '+c)))});
 const get=route=>fetch('http://127.0.0.1:'+ready.port+route,{signal:AbortSignal.timeout(1200)});
 assert.equal((await get('/health/ready')).status,200);const saved=await redis.get('domino:custom:'+ready.roomId);
 redisProcess.kill('SIGSTOP');const liveness=[];for(let i=0;i<5;i++){const t=performance.now();assert.equal((await get('/health')).status,200);liveness.push(performance.now()-t)}assert(Math.max(...liveness)<500);
 const t=performance.now();assert.equal((await get('/health/ready')).status,503);const readinessMs=performance.now()-t;assert(readinessMs<1000);
 const more=await Promise.all(Array.from({length:20},()=>get('/health/ready')));assert(more.every(r=>r.status===503));
 redisProcess.kill('SIGCONT');await redis.ping();let recovered=false;for(let i=0;i<10;i++){if((await get('/health/ready')).status===200){recovered=true;break}await new Promise(r=>setTimeout(r,30))}assert(recovered);
 assert.equal(await redis.get('domino:custom:'+ready.roomId),saved);server.send({state:true});const after=await new Promise(r=>{const on=m=>{if(m.state){server.off('message',on);r(m.state)}};server.on('message',on)});assert.equal(after,ready.state);
 console.log(JSON.stringify({livenessMs:liveness,readinessMs,stalledStatus:503,recoveredStatus:200,additionalProbes:20,snapshotUnchanged:true,roomUnchanged:true}));
}finally{redisProcess.kill('SIGCONT');if(server){server.kill('SIGTERM');await serverExit}if(redis)await redis.quit();redisProcess.kill('SIGTERM');await redisExit;clearTimeout(timeout)}
