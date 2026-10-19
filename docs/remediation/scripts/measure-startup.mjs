// Browser timings are deliberately distinct from the deferred physical Android acceptance.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';
assert(process.cwd().includes('/.tmp/remediation-s025/'));const root=path.resolve('../../..'),variant=process.argv[2];assert(['baseline','candidate'].includes(variant));const {chromium}=createRequire(process.cwd()+'/package.json')('@playwright/test');
const server=spawn(process.execPath,['e2e/static-server.cjs'],{env:{...process.env,PORT:'4177'},stdio:['ignore','pipe','inherit']});await new Promise((r,j)=>{server.stdout.once('data',r);server.once('error',j);server.once('exit',()=>j(Error('preview exited')))});
const browser=await chromium.launch(),rows=[];
async function setup(page,mode='healthy'){
 await page.addInitScript(mode=>{localStorage.setItem('domino-lang','ru');const original=fetch.bind(window),json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});window.fetch=async(input,init)=>{const url=String(input?.url||input);if(!url.includes('/api/'))return original(input,init);if(url.includes('game-token')){if(mode==='offline')throw Error('Synthetic offline');return json({token:'synthetic',user:{id:'timing-u',name:'Synthetic',role:'player'},player:{id:'timing-p',displayName:'Synthetic',isGuest:false},wallet:{balance:1000}})}return json({ok:true,items:[],incoming:[],outgoing:[],accepted:[],unreadCount:0,counts:{total:0,connected:0}})}},mode);
}
try{
 for(let block=0;block<(process.argv[3]==='screenshots'?0:3);block++){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await context.routeWebSocket('**/*',s=>s.close());
  const page=await context.newPage();await setup(page);
  for(const state of ['cold','warm']){
   if(state==='cold')await page.goto('http://127.0.0.1:4177/',{waitUntil:'domcontentloaded'});else await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.game?.authResolved);const ready=await page.evaluate(()=>performance.getEntriesByName('domino-ui-ready')[0]?.startTime||performance.now());
   await page.waitForFunction(()=>!document.getElementById('splash-screen'));await page.locator('#open-solo-modal-btn').click();await page.locator('#start-game-btn').waitFor({state:'visible'});
   rows.push({block,state,uiReadyMs:ready,actualModalInteractiveMs:await page.evaluate(()=>performance.now())});
  }
  await context.close();
 }
 if(variant==='candidate')for(const state of ['offline','module-error']){
  const context=await browser.newContext({viewport:{width:320,height:640},serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await context.routeWebSocket('**/*',s=>s.close());const page=await context.newPage();await setup(page,'offline');
  if(state==='module-error')await page.route('**/js/app.js*',r=>r.abort());await page.goto('http://127.0.0.1:4177/',{waitUntil:'domcontentloaded'});
  await page.locator(state==='offline'?'#startup-network-note':'#startup-error').waitFor({state:'visible',timeout:9500});
  await page.waitForTimeout(500);await page.screenshot({path:root+'/docs/remediation/evidence/session-025/'+state+'-320.png'});await context.close();
 }
 const output={variant,scope:'Headless Chromium390x844 synthetic API,3cold/warm pairs; NOT Android/WebView timings. No artificial network throttling. Cold means new browser context, not OS disk-cache purge.',rows};if(rows.length)fs.writeFileSync(root+'/docs/remediation/evidence/session-025/timing-'+variant+'.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
}finally{await browser.close();server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
