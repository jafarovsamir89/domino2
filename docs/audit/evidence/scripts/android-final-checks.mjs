// One physical Android, disposable audit package and localhost only.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
const adb=process.env.ADB||'adb';
const pkg='az.simplesoft.dominotelefon.audit';
const component=pkg+'/az.simplesoft.dominotelefon.MainActivity';
const root='docs/audit/evidence/';
const out={scope:'Five cold force-stop launches and five HOME returns of debug audit WebView on one charging Android. Local USB reverse. UI proxy is splash gone + initialized game/profile, not measured human first interaction or Play release TTI.',launches:[],errors:[]};
const save=()=>fs.writeFileSync(root+'metrics/android-final-checks.json',JSON.stringify(out,null,2));
const shell=(...args)=>execFileSync(adb,['shell',...args],{maxBuffer:30*1024*1024}).toString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser,phone;
async function connect(){
 const pid=shell('pidof',pkg).trim();
 execFileSync(adb,['forward','tcp:9222','localabstract:webview_devtools_remote_'+pid]);
 for(let n=0;n<50;n++){
  try{const tabs=await fetch('http://127.0.0.1:9222/json/list').then(r=>r.json());if(tabs.some(t=>t.type==='page'))break}catch{}
  await sleep(100);
 }
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
 phone=browser.contexts()[0].pages().find(p=>p.url().includes('4174'))||browser.contexts()[0].pages()[0];
 await phone.waitForFunction(()=>window.game?.accountProfile?.id&&!document.querySelector('#splash-screen'),null,{timeout:20000});
 return pid;
}
function photo(name){fs.writeFileSync(root+'screenshots/'+name+'.png',execFileSync(adb,['exec-out','screencap','-p'],{maxBuffer:30*1024*1024}))}
try{
 fs.writeFileSync(root+'metrics/android-final-battery-before.txt',shell('dumpsys','battery'));
 fs.writeFileSync(root+'metrics/android-final-thermal-before.txt',shell('dumpsys','thermalservice'));
 for(let n=0;n<5;n++){
  await browser?.close();browser=null;
  shell('am','force-stop',pkg);const began=performance.now();
  const launch=shell('am','start','-W','-n',component);const pid=await connect();
  out.launches.push({kind:'cold_force_stop',sample:n+1,pid,nativeLaunchMs:Number(launch.match(/TotalTime: (\d+)/)?.[1]||0),observedReadyMs:performance.now()-began,documentMs:await phone.evaluate(()=>performance.now()),launch});save();
 }
 for(let n=0;n<5;n++){
  shell('input','keyevent','KEYCODE_HOME');await sleep(1000);const began=performance.now();
  const launch=shell('am','start','-W','-n',component);
  await phone.waitForFunction(()=>document.visibilityState==='visible'&&window.game?.accountProfile?.id);
  out.launches.push({kind:'warm_home_return',sample:n+1,nativeLaunchMs:Number(launch.match(/TotalTime: (\d+)/)?.[1]||0),observedReadyMs:performance.now()-began,launch});save();
 }
 await phone.evaluate(()=>game.returnToMainMenu({settleForfeit:false}));
 await phone.locator('#open-solo-modal-btn').click();await phone.locator('#player-count-group [data-value="4"]').click();await phone.locator('#start-game-btn').click();await phone.waitForFunction(()=>game.gameActive&&game.currentPlayer===game.humanPlayerIndex&&!game.turnInProgress&&!game.isInputBlockedByStage());
 // Quiescent fixture for accessibility inspection; not a pause-behavior test.
 await phone.evaluate(()=>game.clearTurnTimers());
 photo('device-39-accessibility-table');
 shell('uiautomator','dump','/sdcard/domino-audit-window.xml');
 fs.writeFileSync(root+'metrics/android-game-accessibility.xml',shell('cat','/sdcard/domino-audit-window.xml'));
 const cdp=await phone.context().newCDPSession(phone);
 const ax=await cdp.send('Accessibility.getFullAXTree');
 out.accessibility={fixture:'4-player solo, timer cleared only for stable inspection; no TalkBack speech/listening test',webAx:ax.nodes.filter(n=>!n.ignored).map(n=>({role:n.role?.value,name:n.name?.value})),dom:await phone.evaluate(()=>({hand:[...document.querySelector('#player-hand').children].map(e=>({tag:e.tagName,role:e.getAttribute('role'),label:e.getAttribute('aria-label'),tabIndex:e.tabIndex,text:e.textContent,value:e.dataset.id})),canvas:[...document.querySelectorAll('canvas')].map(e=>({label:e.getAttribute('aria-label'),role:e.getAttribute('role')})),controls:[...document.querySelectorAll('#game-screen button')].filter(e=>e.getBoundingClientRect().width).map(e=>({id:e.id,label:e.getAttribute('aria-label'),text:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))}))};
 out.accessibility.tabSequence=[];
 for(let n=0;n<18;n++){await phone.keyboard.press('Tab');out.accessibility.tabSequence.push(await phone.evaluate(()=>({id:document.activeElement.id,tag:document.activeElement.tagName,role:document.activeElement.getAttribute('role')})))}
 // Observe generated nodes, without microphone capture or recording.
 out.audio=await phone.evaluate(async()=>{
  const sound=await import('./js/sounds.js?v=social-live-1');const originalMuted=sound.isMuted();
  const proto=AudioContext.prototype,create=proto.createOscillator;let generated=0;
  proto.createOscillator=function(...args){generated++;return create.apply(this,args)};
  try{if(!sound.isMuted())sound.toggleMute();sound.sndScore();await new Promise(r=>setTimeout(r,400));return {muted:sound.isMuted(),scoreOscillatorsCreated:generated,originalMuted,note:'Generated Web Audio nodes only; no claim of acoustic loudness, focus behavior or licensed content.'}}
  finally{proto.createOscillator=create;if(sound.isMuted()!==originalMuted)sound.toggleMute()}
 });
 await phone.evaluate(async()=>{
  const sound=await import('./js/sounds.js?v=social-live-1');sound.stopMusic();
  const p=HTMLMediaElement.prototype,play=p.play;window.__auditMedia=[];
  p.play=function(...args){window.__auditMedia.push(this);return play.apply(this,args)};
  try{sound.startGameMusic()}finally{p.play=play}
 });
 const media=()=>phone.evaluate(()=>({visibility:document.visibilityState,tracks:(window.__auditMedia||[]).map(a=>({paused:a.paused,time:a.currentTime,volume:a.volume}))}));
 await sleep(700);out.audio.foreground=await media();shell('input','keyevent','KEYCODE_HOME');await sleep(2000);out.audio.background=await media();shell('am','start','-W','-n',component);await sleep(700);out.audio.returned=await media();
 out.audio.lifecycleNote='HTMLMediaElement state/time proxy only. Native focus interruption/call/Bluetooth and acoustic output not measured.';
 fs.writeFileSync(root+'metrics/android-final-meminfo.txt',shell('dumpsys','meminfo',pkg));
 fs.writeFileSync(root+'metrics/android-final-battery-after.txt',shell('dumpsys','battery'));
 fs.writeFileSync(root+'metrics/android-final-thermal-after.txt',shell('dumpsys','thermalservice'));
 out.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({launches:out.launches.map(({kind,nativeLaunchMs,observedReadyMs,documentMs})=>({kind,nativeLaunchMs,observedReadyMs,documentMs})),hand:out.accessibility.dom.hand,audio:out.audio,errors:out.errors}));
}catch(e){out.errors.push(e.stack);process.exitCode=1;save()}
finally{await browser?.close();save()}
