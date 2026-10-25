// Explicit physical audit-app checks. No recording, peer audio, production or radio changes.
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {chromium,expect} from '@playwright/test';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
assert.ok(args.includes('--serial')&&args.includes('--output'));const serial=arg('--serial'),output=arg('--output'),directory=output.slice(0,output.lastIndexOf('/')),pkg='az.simplesoft.dominotelefon.audit',permission='android.permission.RECORD_AUDIO';
assert.match(serial,/^[A-Za-z0-9]+$/);assert.match(output,/^docs\/remediation\/evidence\/session-\d{3}\/[a-z0-9-]+\.json$/);assert.ok(!fs.existsSync(output));
const adb=(...cmd)=>execFileSync('adb',['-s',serial,...cmd],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),results={};let browser,forward,page;
const close=async()=>{if(browser){await browser.close();browser=null;}page=null;if(forward){adb('forward','--remove','tcp:'+forward);forward=null;}};
const recordPermission=()=>adb('shell','dumpsys','package',pkg).split('\n').find(line=>line.includes(permission+': granted='))?.trim();
const originalPermission=recordPermission();
assert.ok(originalPermission?.includes('granted=false')&&!/\bUSER_SET\b|\bUSER_FIXED\b/.test(originalPermission),'Refuse to change an audit permission state other than the documented denied/no-user-flags baseline');
const noGrant=()=>{adb('shell','pm','revoke',pkg,permission);adb('shell','pm','clear-permission-flags',pkg,permission,'user-set','user-fixed');adb('shell','am','force-stop',pkg);};
async function connect(){
 adb('shell','am','start','-n',pkg+'/az.simplesoft.dominotelefon.MainActivity');let pid='';
 for(let n=0;n<40;n++){try{pid=adb('shell','pidof',pkg).trim();if(/^\d+$/.test(pid))break;}catch(error){if(error.status!==1)throw error;}if(n===10)adb('shell','am','start','-n',pkg+'/az.simplesoft.dominotelefon.MainActivity');await delay(100);}assert.match(pid,/^\d+$/);
 forward=adb('forward','tcp:0','localabstract:webview_devtools_remote_'+pid).trim();
 for(let n=0;n<40&&!browser;n++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+forward);}catch{await delay(100);}}assert.ok(browser,'Audit WebView debugger unavailable');
 for(let n=0;n<40&&!page;n++){page=browser.contexts().flatMap(context=>context.pages()).find(p=>p.url().startsWith('https://localhost/'));if(!page)await delay(100);}assert.ok(page,'Only the forwarded audit WebView');
 const session=await page.context().newCDPSession(page);await session.send('Network.setCacheDisabled',{cacheDisabled:true});
 await page.goto('https://localhost/review-audio.html');await page.waitForFunction(()=>!!window.dominoMediaReview);return pid;
}
const snapshot=()=>page.evaluate(()=>({enabled:dominoMediaReview.voice.isEnabled,local:!!dominoMediaReview.voice.localStream,track:dominoMediaReview.voice.localStream?.getAudioTracks()[0]?.readyState??null,status:dominoMediaReview.voice.statusText,background:dominoMediaReview.voice._nativeBackground}));
const live=async()=>{await page.locator('#mic').click();await expect.poll(async()=>(await snapshot()).track).toBe('live');};
async function dialog(action){
 let focus='';for(let retry=0;retry<30;retry++){focus=adb('shell','dumpsys','window');if(focus.split('\n').some(line=>line.includes('mCurrentFocus=')&&line.includes('com.google.android.permissioncontroller/')))break;await delay(100);}
 assert.ok(focus.split('\n').some(line=>line.includes('mCurrentFocus=')&&line.includes('com.google.android.permissioncontroller/')),'Expected audit microphone permission dialog');
 adb('shell','uiautomator','dump','/sdcard/domino-audit-permission.xml');const xml=adb('shell','cat','/sdcard/domino-audit-permission.xml');assert.ok(xml.includes('Domino Review'));
 // Resource IDs were first observed in a native hierarchy from this phone; use fresh bounds.
 const id=action==='deny'||action==='inspect'?'permission_deny_button':'permission_allow_foreground_only_button';
 const node=[...xml.matchAll(/<node\s+[^>]*>/g)].map(value=>value[0]).find(value=>value.includes(`resource-id="com.android.permissioncontroller:id/${id}"`));assert.ok(node);
 const coords=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);
 const current=adb('shell','dumpsys','window');assert.ok(current.split('\n').some(line=>line.includes('mCurrentFocus=')&&line.includes('com.google.android.permissioncontroller/')),'Dialog changed; refuse stale tap');
 if(!fs.existsSync(directory+'/android-permission-dialog.png'))fs.writeFileSync(directory+'/android-permission-dialog.png',execFileSync('adb',['-s',serial,'exec-out','screencap','-p']));
 if(action!=='inspect')adb('shell','input','tap',String(Math.floor((coords[0]+coords[2])/2)),String(Math.floor((coords[1]+coords[3])/2)));
 return {buttonId:id,appLabelVerified:true};
}
try{
 if(args.includes('--pending-only')){
  noGrant();await connect();await page.locator('#mic').click();await dialog('inspect');
  adb('shell','input','keyevent','KEYCODE_HOME');await expect.poll(async()=>(await snapshot()).enabled).toBe(false);assert.equal((await snapshot()).local,false);
  adb('shell','am','start','-n',pkg+'/az.simplesoft.dominotelefon.MainActivity');
  const focus=adb('shell','dumpsys','window');if(focus.split('\n').some(line=>line.includes('mCurrentFocus=')&&line.includes('com.google.android.permissioncontroller/')))await dialog('allow');
  await expect.poll(async()=>(await snapshot()).background).toBe(false);assert.equal((await snapshot()).enabled,false);
  results.homeDuringPrompt={oldRequestEnabled:false,local:false,lateGrantDoesNotEnable:true};
  await page.locator('#mic').click();if(!recordPermission().includes('granted=true'))await dialog('allow');await expect.poll(async()=>(await snapshot()).track).toBe('live');await page.locator('#end').click();
  console.log('HOME during native prompt, no auto capture, explicit retry: pass');
  await close();noGrant();await connect();await page.locator('#mic').click();await dialog('inspect');
  await page.goto('http://127.0.0.1:4186/review-audio.html');await page.waitForFunction(()=>!!window.dominoMediaReview);
  const afterNavigation=adb('shell','dumpsys','window');if(afterNavigation.split('\n').some(line=>line.includes('mCurrentFocus=')&&line.includes('com.google.android.permissioncontroller/')))await dialog('allow');
  assert.equal((await snapshot()).local,false);await page.locator('#mic').click();await expect.poll(async()=>(await snapshot()).status).toBe('voice-denied');assert.equal((await snapshot()).local,false);
  results.originChangeDuringPrompt={currentOrigin:'http://127.0.0.1:4186',oldRequestNotAttached:true,newCaptureDenied:true};
  fs.writeFileSync(output,JSON.stringify({scope:'Actual Android permission dialogs and product VoiceChatManager, local audit pages only; no recording or transmission',results},null,2)+'\n',{flag:'wx'});console.log('Origin switch while native permission pending: pass');
 }else{
 await close();noGrant();await connect();await page.locator('#mic').click();const denial=await dialog('deny');await expect.poll(async()=>(await snapshot()).enabled).toBe(false);assert.equal((await snapshot()).local,false);results.nativeDeny={...denial,state:await snapshot()};console.log('Native deny: pass');
 await page.locator('#mic').click();const allow=await dialog('allow');await expect.poll(async()=>(await snapshot()).track).toBe('live');results.nativeAllow={...allow,state:await snapshot()};await page.locator('#end').click();assert.equal((await snapshot()).local,false);console.log('Native allow/stop: pass');
 // Real getUserMedia stream, deliberately delay only its JS delivery to reproduce the product race.
 await page.evaluate(()=>{
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.mediaRace={original,captured:null};
  navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);mediaRace.captured=stream;return new Promise(resolve=>{mediaRace.release=()=>resolve(stream);});};
  dominoMediaReview.signals.length=0;mediaRace.operation=dominoMediaReview.voice.enableVoice();
 });
 await page.waitForFunction(()=>!!window.mediaRace?.captured);await page.locator('#end').click();
 const race=await page.evaluate(async()=>{mediaRace.release();await mediaRace.operation;const value={track:mediaRace.captured.getAudioTracks()[0].readyState,local:!!dominoMediaReview.voice.localStream,enabledSignals:dominoMediaReview.signals.filter(v=>v.enabled).length};navigator.mediaDevices.getUserMedia=mediaRace.original;return value;});
 assert.deepEqual(race,{track:'ended',local:false,enabledSignals:0});results.lateResult=race;console.log('Actual late stream after stop: pass');
 await live();await page.evaluate(()=>{window.beforeHomeTrack=dominoMediaReview.voice.localStream.getAudioTracks()[0];});adb('shell','input','keyevent','KEYCODE_HOME');
 await expect.poll(()=>page.evaluate(()=>window.beforeHomeTrack.readyState)).toBe('ended');const background=await snapshot();assert.equal(background.enabled,false);assert.equal(background.background,true);
 adb('shell','am','start','-n',pkg+'/az.simplesoft.dominotelefon.MainActivity');await expect.poll(async()=>(await snapshot()).background).toBe(false);assert.equal((await snapshot()).enabled,false);await live();await page.locator('#end').click();results.background={state:background,explicitRestart:true};console.log('Native HOME capture stop/restart: pass');
 // Audio sources/callbacks are real; timer delivery is controlled, no acoustic recording.
 const effects=await page.evaluate(async()=>{
  const review=dominoMediaReview,settings=review.audio.getAudioSettings(),originalTimeout=window.setTimeout,originalCreate=AudioContext.prototype.createOscillator;let nodes=0,immediateStops=0,held=[];
  review.audio.updateAudioSettings({masterMuted:false,musicVolume:0,effectsVolume:.03});
  await new Promise(resolve=>setTimeout(resolve,200));
  AudioContext.prototype.createOscillator=function(...args){nodes++;const source=originalCreate.apply(this,args),originalStop=source.stop.bind(source);source.stop=(...values)=>{if(values.length===0)immediateStops++;return originalStop(...values);};return source;};
  window.setTimeout=(fn,delay,...args)=>[30,80].includes(delay)?(held.push(()=>fn(...args)),-1):originalTimeout(fn,delay,...args);
  try{
   review.audio.sndPlace();const before=nodes;
   review.audio.updateAudioSettings({masterMuted:true});review.audio.updateAudioSettings({masterMuted:false});held.splice(0).forEach(fn=>fn());assertNoExtra();
   function assertNoExtra(){if(nodes!==before)throw Error('Stale effect played after mute');}
   review.audio.sndScore();if(nodes!==before+3)throw Error('New effect must still work');const stopsBefore=immediateStops;review.audio.updateAudioSettings({masterMuted:true});if(immediateStops-stopsBefore!==3)throw Error('Scheduled score notes were not cancelled');return {oldDelayedNodesAfterMute:0,freshScoreNodes:3,scheduledScoreNotesStopped:3};
  }finally{window.setTimeout=originalTimeout;AudioContext.prototype.createOscillator=originalCreate;review.audio.updateAudioSettings(settings);review.audio.stopMusic();}
 });results.effects=effects;console.log('Real sound callback cancellation/new sound: pass');
 // Current HTTP loopback page is secure for WebRTC but intentionally not a trusted app origin.
 await page.goto('http://127.0.0.1:4186/review-audio.html');await page.waitForFunction(()=>!!window.dominoMediaReview);await page.locator('#mic').click();await expect.poll(async()=>(await snapshot()).status).toBe('voice-denied');assert.equal((await snapshot()).local,false);results.foreignOrigin={origin:'http://127.0.0.1:4186',denied:true};
 await page.goto('https://localhost/review-audio.html');await page.waitForFunction(()=>!!window.dominoMediaReview);await live();const pidBefore=adb('shell','pidof',pkg).trim();await close();noGrant();let after='';try{after=adb('shell','pidof',pkg).trim();}catch(error){if(error.status!==1)throw error;}assert.equal(after,'');results.systemRevoke={priorProcessTerminated:true,permission:recordPermission(),oldCaptureClientGone:true};console.log('System revoke terminates audit capture: pass');
 await connect();await page.locator('#mic').click();
 // Dismiss the observed permission window without granting, then wait for rejection.
 let focus=adb('shell','dumpsys','window');for(let n=0;n<30&&!focus.includes('com.google.android.permissioncontroller/');n++){await delay(100);focus=adb('shell','dumpsys','window');}assert.ok(focus.includes('com.google.android.permissioncontroller/'));
 adb('shell','input','keyevent','KEYCODE_BACK');await expect.poll(async()=>(await snapshot()).enabled).toBe(false);assert.equal((await snapshot()).local,false);results.nativeCancel={enabled:false,local:false};
 fs.writeFileSync(output,JSON.stringify({scope:'Actual physical Android audit-only microphone and product VoiceChatManager/sounds, no recording/peer transmission or acoustic measurement',results,callBluetooth:'not available per owner; not accepted',natTurn:'not tested; external requirement remains'},null,2)+'\n',{flag:'wx'});console.log('Media permission/lifecycle checks complete.');
 }
}catch(error){fs.writeFileSync(output.replace(/\.json$/,'-partial.json'),JSON.stringify({complete:false,results},null,2)+'\n',{flag:'wx'});throw error;}
finally{
 try{if(page&&!page.isClosed())await page.evaluate(()=>{window.dominoMediaReview?.voice.destroy();window.dominoMediaReview?.audio.stopMusic();}).catch(()=>{});}finally{await close();noGrant();adb('shell','rm','-f','/sdcard/domino-audit-permission.xml');}
}
