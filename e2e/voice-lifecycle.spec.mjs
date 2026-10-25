import {test,expect} from './fixtures.mjs';
for(const prefix of ['', '/www'])test(`voice capture ${prefix||'root'}: cancel and return-to-menu permit a later explicit capture`,async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:{}}));
 await page.goto(prefix+'/index.html');await page.waitForFunction(()=>Boolean(window.game?.authResolved)&&!document.getElementById('splash-screen'));
 const result=await page.evaluate(async()=>{
  const game=window.game,voice=game.voice,signals=[],context=new AudioContext();
  game.network.room={sessionId:'synthetic-no-transport'};game.network.sendVoiceSignal=value=>signals.push(value);game.hasAuthenticatedAccount=()=>false;
  let release;const first=context.createMediaStreamDestination().stream;
  navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{release=()=>resolve(first);});
  const pending=voice.enableVoice();await voice.disableVoice();release();await pending;
  const late={track:first.getAudioTracks()[0].readyState,local:!!voice.localStream,enabled:signals.filter(value=>value.enabled).length};
  const second=context.createMediaStreamDestination().stream;navigator.mediaDevices.getUserMedia=async()=>second;await voice.enableVoice();
  await game.returnToMainMenu();const afterMenu={track:second.getAudioTracks()[0].readyState,destroyed:voice.destroyed};
  game.network.room={sessionId:'synthetic-next-room'};const third=context.createMediaStreamDestination().stream;navigator.mediaDevices.getUserMedia=async()=>third;await voice.enableVoice();
  const next={enabled:voice.isEnabled,track:third.getAudioTracks()[0].readyState};voice.destroy();await context.close();
  return {late,afterMenu,next};
 });
 expect(result).toEqual({late:{track:'ended',local:false,enabled:0},afterMenu:{track:'ended',destroyed:false},next:{enabled:true,track:'live'}});
});
