// Matched debug APKs only. Never targets Play or changes Wi-Fi/mobile settings.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {chromium,expect} from '@playwright/test';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
for(const name of ['--serial','--baseline','--candidate','--output'])assert.ok(args.includes(name));
const serial=arg('--serial'),output=arg('--output'),outDir=output.slice(0,output.lastIndexOf('/')),appId='az.simplesoft.dominotelefon.audit';
assert.match(serial,/^[a-zA-Z0-9]+$/);assert.match(output,/^docs\/remediation\/evidence\/session-\d{3}\/[a-z0-9-]+\.json$/);assert.ok(!fs.existsSync(output));
const variants=Object.fromEntries(['baseline','candidate'].map(name=>[name,JSON.parse(fs.readFileSync(arg('--'+name)))]));
for(const meta of Object.values(variants)){
 assert.equal(meta.appId,appId);assert.ok(meta.apk.startsWith('.tmp/mobile-review/artifacts/'));
 assert.equal(createHash('sha256').update(fs.readFileSync(meta.apk)).digest('hex'),meta.sha256);
 assert.equal(meta.rewardedLoadShowEnabled,false);
 const aapt=process.env.ANDROID_HOME+'/build-tools/35.0.0/aapt';
 const badging=execFileSync(aapt,['dump','badging',meta.apk],{encoding:'utf8'});assert.ok(badging.includes(`package: name='${appId}'`));assert.ok(badging.includes('application-debuggable'));
}
assert.ok(variants.baseline.startupBaseline?.sha256);assert.ok(!variants.candidate.startupBaseline);
const adb=(...cmd)=>execFileSync('adb',['-s',serial,...cmd],{encoding:'utf8'});
const playFields=()=>adb('shell','dumpsys','package','az.simplesoft.dominotelefon').split('\n').filter(line=>/versionCode=|versionName=|firstInstallTime=|lastUpdateTime=/.test(line));
const battery=()=>{const value=adb('shell','dumpsys','battery');return {temperatureC:Number(value.match(/temperature:\s*(\d+)/)?.[1])/10,level:Number(value.match(/level:\s*(\d+)/)?.[1])};};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let preview,browser,forward,reverse=false;
let installedSha=null;
const pid=()=>{try{return adb('shell','pidof',appId).trim();}catch(error){if(error.status===1)return '';throw error;}};
const beforePlay=playFields(),rows=[];
const closeBrowser=async()=>{if(browser){await browser.close();browser=null;}if(forward){adb('forward','--remove','tcp:'+forward);forward=null;}};
const connect=async()=>{
 const currentPid=pid();assert.match(currentPid,/^\d+$/);
 forward=adb('forward','tcp:0','localabstract:webview_devtools_remote_'+currentPid).trim();assert.match(forward,/^\d+$/);
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+forward);
 let page;for(let poll=0;poll<30&&!page;poll++){page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://localhost/'));if(!page)await delay(100);}
 assert.ok(page,'Only forwarded audit WebView');await page.waitForLoadState('domcontentloaded');
 assert.equal(await page.evaluate(()=>document.querySelector('meta[name="domino-local-review"]')?.content),'s039');
 assert.equal(await page.evaluate(()=>Object.values(window.DOMINO_ENDPOINTS||{}).every(url=>new URL(url).hostname==='127.0.0.1')),true);
 return {page,pid:currentPid};
};
const start=()=>adb('shell','am','start','-W','-n',appId+'/az.simplesoft.dominotelefon.MainActivity');
const install=meta=>{const result=adb('install','-r',meta.apk);assert.ok(result.includes('Success'));installedSha=meta.sha256;};
const menu=async(page,hostStart=null)=>{
 await page.waitForFunction(()=>Boolean(window.game?.authResolved)&&!document.getElementById('splash-screen'),null,{timeout:12000});
 await page.locator('#open-solo-modal-btn').click();await expect(page.locator('#start-game-btn')).toBeVisible();
 const result=await page.evaluate(()=>({uiReadyMs:performance.getEntriesByName('domino-ui-ready')[0]?.startTime??null,interactiveMarkMs:performance.getEntriesByName('domino-startup-interactive')[0]?.startTime??null,verifiedMenuMs:performance.now(),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio}));
 if(hostStart!==null)result.hostVerifiedMenuMs=performance.now()-hostStart;
 await page.locator('#solo-modal-close').click();return result;
};
try{
 assert.ok(!adb('reverse','--list').includes('tcp:4186'),'Never replace another reverse');
 preview=spawn(process.execPath,['docs/remediation/scripts/device-review-preview.mjs'],{stdio:['ignore','pipe','pipe']});
 await Promise.race([once(preview.stdout,'data'),once(preview,'exit').then(()=>{throw Error('Preview port unavailable');})]);
 adb('reverse','tcp:4186','tcp:4186');reverse=true;
 for(let pair=0;pair<5;pair++)for(const variant of pair%2?['candidate','baseline']:['baseline','candidate']){
  install(variants[variant]);start();let connection=await connect();
  // Exact historical session marker only, not app data/cache. Both variants receive the same setup.
  await connection.page.evaluate(()=>{sessionStorage.removeItem('dominoSplashShown');localStorage.setItem('domino-lang','ru');});
  const priorPid=connection.pid;await closeBrowser();adb('shell','am','force-stop',appId);
  assert.equal(pid(),'');
  const temperatureBefore=battery(),hostStart=performance.now();start();connection=await connect();assert.notEqual(connection.pid,priorPid);
  const cold=await menu(connection.page,hostStart);
  await connection.page.reload({waitUntil:'domcontentloaded'});const warmReload=await menu(connection.page);
  adb('shell','input','keyevent','KEYCODE_HOME');const warmStart=performance.now();start();const warmActivityReturn=await menu(connection.page,warmStart);
  rows.push({pair,variant,cold,warmReload,warmActivityReturn,temperatureBefore,temperatureAfter:battery(),processRecreated:true});
  console.log(JSON.stringify({pair,variant,coldVerifiedMs:Math.round(cold.verifiedMenuMs),warmReloadMs:Math.round(warmReload.verifiedMenuMs)}));
  await closeBrowser();
 }
 // Last pair ends with candidate. All app network is unavailable by stopping only our API.
 assert.equal(rows.at(-1).variant,'candidate');preview.kill('SIGTERM');await once(preview,'exit');preview=null;
 adb('shell','am','force-stop',appId);let started=performance.now();start();let connection=await connect();
 await expect(connection.page.locator('#startup-network-note')).toBeVisible({timeout:10000});
 const offline=await menu(connection.page,started);
 await connection.page.locator('#open-solo-modal-btn').click();await connection.page.locator('#player-name').fill('Local startup review');await connection.page.locator('#start-game-btn').click();
 await expect(connection.page.locator('#game-screen')).toHaveClass(/active/);
 await expect.poll(()=>connection.page.evaluate(()=>{
  const game=window.game;
  return game.gameActive&&game.hands.length>=2&&game.hands.reduce((sum,hand)=>sum+hand.length,0)+game.boneyard.length+game.board.nodes.length===28;
 })).toBe(true);
 const offlineSolo=await connection.page.evaluate(()=>({active:window.game.gameActive,players:window.game.hands.length,totalTiles:window.game.hands.reduce((sum,hand)=>sum+hand.length,0)+window.game.boneyard.length+window.game.board.nodes.length}));
 await connection.page.goto('https://localhost/index.html');await expect(connection.page.locator('#startup-network-note')).toBeVisible({timeout:10000});
 await connection.page.screenshot({path:outDir+'/offline-home.png'});
 preview=spawn(process.execPath,['docs/remediation/scripts/device-review-preview.mjs'],{stdio:['ignore','pipe','pipe']});await once(preview.stdout,'data');
 await Promise.all([connection.page.waitForNavigation({waitUntil:'domcontentloaded'}),connection.page.locator('#startup-network-note button').click()]);
 await expect(connection.page.locator('#startup-network-note')).toHaveCount(0);const retry=await menu(connection.page);
 await connection.page.screenshot({path:outDir+'/healthy-home.png'});
 const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const summary={};for(const variant of ['baseline','candidate']){const selected=rows.filter(v=>v.variant===variant);summary[variant]={samples:selected.length,coldVerifiedMedianMs:median(selected.map(v=>v.cold.verifiedMenuMs)),warmReloadMedianMs:median(selected.map(v=>v.warmReload.verifiedMenuMs)),warmActivityHostMedianMs:median(selected.map(v=>v.warmActivityReturn.hostVerifiedMenuMs))};}
 assert.equal(rows.length,10);assert.ok(summary.baseline.coldVerifiedMedianMs-summary.candidate.coldVerifiedMedianMs>3000,'Must demonstrate removal of the actual delay');
 assert.ok(summary.candidate.coldVerifiedMedianMs<6000);assert.ok(offline.verifiedMenuMs<8500);assert.deepEqual(playFields(),beforePlay);
 const result={scope:'Physical Android, controlled audit debug APK comparison; same current app/native/resources, only old splash differs. Not Play/release/network performance.',device:{model:adb('shell','getprop','ro.product.model').trim(),android:adb('shell','getprop','ro.build.version.release').trim(),webView:adb('shell','dumpsys','webviewupdate').split('\n').find(v=>v.includes('Current WebView package'))?.trim()},artifacts:{baseline:variants.baseline.sha256,candidate:variants.candidate.sha256},cache:'OS/app caches retained; no pm clear. Cold=new audit process, historical session marker reset symmetrically; warm reload retains session marker. Alternating pair order.',metric:'Document navigation start to verified solo-menu opening after splash DOM removal. Upper bound, includes harness polling/click overhead; not earliest possible tap.',rows,summary,offline:{mode:'Bundled assets available, own loopbackAPI stopped and CSP prevents production network; Wi-Fi/mobile settings unchanged. Not a claim of radio-level airplane mode.',...offline,soloStarted:offlineSolo,retry},playMetadataUnchanged:true};
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({summary,offlineVerifiedMs:offline.verifiedMenuMs,offlineSolo}));
}catch(error){
 const partial=output.replace(/\.json$/,'-partial.json');
 fs.writeFileSync(partial,JSON.stringify({complete:false,rows,failure:'device acceptance did not complete'},null,2)+'\n',{flag:'wx'});
 throw error;
}finally{
 await closeBrowser();if(preview){preview.kill('SIGTERM');await once(preview,'exit').catch(()=>{});}if(reverse)adb('reverse','--remove','tcp:4186');
 if(installedSha&&installedSha!==variants.candidate.sha256){install(variants.candidate);start();}
}
