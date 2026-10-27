// Isolated signature/ACK probe. No Prisma, users, wallets, fileserver or grant route.
// Public exposure and copying the new S2S key to LevelPlay require owner's agreement.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {verifyLevelPlaySignature} from '../../../apps/api/dist/src/modules/rewarded/levelplay-ssv.js';

export function createLevelPlayProbe({privateKey,attemptId,expiresAt,stateDir,now=Date.now,limit=240,ackFormat='xml',onRejected=()=>{},onRequest=()=>{}}) {
 if(!/^[a-f0-9]{64}$/.test(attemptId)||!privateKey||privateKey.length<32||!Number.isSafeInteger(expiresAt)||expiresAt<=now()||expiresAt>now()+86400000)throw Error('Invalid probe configuration');
 if(!['xml','plain'].includes(ackFormat))throw Error('Invalid ACK format');
 fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
 const file=path.join(stateDir,'receipts.ndjson'),nonceHash=createHash('sha256').update(attemptId).digest('hex'),receipts=new Map();
 if(fs.existsSync(file)){
  if(fs.statSync(file).size>4*1024*1024)throw Error('Probe receipt limit exceeded');
  for(const line of fs.readFileSync(file,'utf8').split('\n').filter(Boolean)){
   const row=JSON.parse(line);
   if(row.mode!=='signature-probe'||!/^[a-zA-Z0-9]{16,128}$/.test(row.eventId)||!/^[a-f0-9]{64}$/.test(row.nonceHash))throw Error('Invalid probe receipt');
   receipts.set(row.eventId,row.nonceHash);
  }
 }
 let windowStart=now(),requests=0;
 return http.createServer({maxHeaderSize:8192,requestTimeout:5000,headersTimeout:5000},(req,res)=>{
  const started=process.hrtime.bigint();
  const rawParts=new URLSearchParams((req.url||'').split('?').slice(1).join('?'));
  const requestShape={method:req.method,callbackPath:(req.url||'').split('?')[0]==='/callback/levelplay',hasQuery:(req.url||'').includes('?'),parameterNames:[...rawParts.keys()].map(n=>/^[a-zA-Z_]{1,40}$/.test(n)?n:'unrecognized'),valueLengths:[...rawParts.values()].map(v=>v.length),originKind:req.headers.origin==='https://platform.ironsrc.com'?'levelplay-ui':req.headers.origin?'other':'none',browserUserAgent:/Mozilla\//.test(req.headers['user-agent']||''),receivedAt:new Date(now()).toISOString()};
  res.once('finish',()=>{try{onRequest({...requestShape,status:res.statusCode,responseMs:Number(process.hrtime.bigint()-started)/1e6});}catch{}});
  // Keep the tiny provider ACK byte-for-byte intact through an HTTPS proxy.
  res.setHeader('Cache-Control','no-store, no-transform');res.setHeader('Content-Type','text/plain; charset=utf-8');
  const send=(status,body)=>{res.setHeader('Content-Length',Buffer.byteLength(body));res.writeHead(status);res.end(body);};
  if(now()-windowStart>=60000){windowStart=now();requests=0;}
  if(++requests>limit){res.setHeader('Retry-After','60');send(429,'Rate limited');return;}
  if(req.method!=='GET'){send(405,'Method not allowed');return;}
  if(req.url==='/health'){send(200,'signature-probe; walletEnabled=false');return;}
  if(!req.url?.startsWith('/callback/levelplay?')){send(404,'Not found');return;}
  if(now()>=expiresAt){send(410,'Probe expired');return;}
  if(req.headers['content-length']&&req.headers['content-length']!=='0'||req.headers['transfer-encoding']){send(400,'Invalid request');return;}
  let message;
  const raw=req.url.slice('/callback/levelplay?'.length);
  try{message=verifyLevelPlaySignature(raw,privateKey);}catch(error){
   // No raw URL, values, nonce, signature or key is included in diagnostics.
   const params=new URLSearchParams(raw),names=[...params.keys()];
   try{onRejected({reason:error.message,parameterNames:names.map(n=>/^[a-zA-Z_]{1,40}$/.test(n)?n:'unrecognized'),valueLengths:[...params.values()].map(v=>v.length),knownUserMatches:params.get('applicationUserId')===attemptId,timestamp12Digits:/^\d{12}$/.test(params.get('timestamp')||''),eventIdAlphanumeric:/^[a-zA-Z0-9]{16,128}$/.test(params.get('eventId')||''),oneEntitlement:params.get('rewards')==='1'});}catch{}
   send(403,'Invalid callback');return;
  }
  if(message.attemptId!==attemptId){send(403,'Unknown probe identity');return;}
  const prior=receipts.get(message.transactionId);
  if(prior&&prior!==nonceHash){send(409,'Event conflict');return;}
  if(!prior){
   if(receipts.size>=10000){send(503,'Probe full');return;}
   const row={mode:'signature-probe',eventId:message.transactionId,nonceHash,callbackTime:message.callbackTime,receivedAt:new Date(now()).toISOString(),walletEnabled:false};
   let fd;
   try{
    fd=fs.openSync(file,'a',0o600);fs.writeSync(fd,JSON.stringify(row)+'\n');fs.fsyncSync(fd);
   }catch{send(503,'Receipt unavailable');return;}
   finally{if(fd!==undefined)fs.closeSync(fd);}
   receipts.set(message.transactionId,nonceHash);
  }
  if(ackFormat==='xml')res.setHeader('Content-Type','application/xml; charset=utf-8');
  send(200,ackFormat==='xml'?'<status>'+message.transactionId+':OK</status>':message.transactionId+':OK');
 });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dir=path.resolve('.tmp/levelplay-callback-probe'),configFile=path.join(dir,'private-config.json');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(process.argv.includes('--prepare')){
  // Dashboard Test rejected64 hex characters (381);32 passed. Keep nonce256-bit.
  const config={privateKey:randomBytes(16).toString('hex'),attemptId:randomBytes(32).toString('hex'),expiresAt:Date.now()+24*3600000};
  fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Prepared ignored private probe configuration; no credentials printed, server not started.');
 }else{
  const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
  const diagnosticFile=path.join(dir,'rejected-shapes.ndjson');
  const onRejected=shape=>{if(!fs.existsSync(diagnosticFile)||fs.statSync(diagnosticFile).size<1024*1024)fs.appendFileSync(diagnosticFile,JSON.stringify(shape)+'\n',{mode:0o600});};
  const requestFile=path.join(dir,'request-shapes.ndjson');
  const onRequest=shape=>{if(!fs.existsSync(requestFile)||fs.statSync(requestFile).size<1024*1024)fs.appendFileSync(requestFile,JSON.stringify(shape)+'\n',{mode:0o600});};
  const server=createLevelPlayProbe({...config,stateDir:dir,onRejected,onRequest,ackFormat:process.argv.includes('--plain-ack')?'plain':'xml'});
  server.listen(4188,'127.0.0.1',()=>console.log('Signature-only probe on127.0.0.1:4188; no public tunnel, DB or wallet.'));
  for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>server.close());
 }
}
