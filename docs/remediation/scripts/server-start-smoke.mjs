// Run from the isolated server checkout through run-check.mjs.
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const child=spawn(process.execPath,['index.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),REDIS_URI:'',PLATFORM_API_URL:'http://127.0.0.1:4300',SENTRY_DSN:'',SENTRY_DSN_GAME:''},stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',x=>{stdout+=x});child.stderr.on('data',x=>{stderr+=x});
try{
  let health;
  for(let n=0;n<80;n++){
    if(child.exitCode!==null)throw Error('Server exited before ready: '+stderr);
    try{health=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(500)});if(health.ok)break}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(health?.status,200,'Local game server did not become healthy');
  const ready=await fetch(`http://127.0.0.1:${port}/health/ready`,{signal:AbortSignal.timeout(1000)});
  assert.equal(ready.status,200);
  const payload=await ready.json();assert.equal(payload.service,'domino2-server');
  console.log(JSON.stringify({node:process.version,health:health.status,ready:ready.status,readiness:payload,mode:'local in-memory, API loopback, no production credentials'}));
}finally{
  child.kill('SIGTERM');
  await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(resolve,3000))]);
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  console.log('LOCAL_SERVER_STDOUT\n'+stdout);if(stderr)console.error('LOCAL_SERVER_STDERR\n'+stderr);
}
