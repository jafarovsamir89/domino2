import * as audio from '/js/sounds.js';
import {VoiceChatManager} from '/js/voice.js';
// Real product manager/microphone, synthetic room without peers or a network transport.
// No MediaRecorder, audio sampling, recording, upload or peer transmission.
const state=document.querySelector('#state');
const log=text=>{state.textContent=`${new Date().toISOString()} ${text}\n`+state.textContent.slice(0,3500);};
const signals=[];
const voice=new VoiceChatManager({network:{room:{sessionId:'local-microphone-review'},sendVoiceSignal:value=>signals.push({enabled:value.enabled})},t:key=>key,renderer:{showMessage:message=>log(message)}});
window.dominoMediaReview={voice,audio,signals};
const mute=document.querySelector('#mute'),music=document.querySelector('#music'),effects=document.querySelector('#effects'),settings=audio.getAudioSettings();
mute.checked=settings.masterMuted;music.value=settings.musicVolume;effects.value=settings.effectsVolume;
for(const id of ['mute','music','effects'])document.getElementById(id).oninput=()=>log(JSON.stringify(audio.updateAudioSettings({masterMuted:mute.checked,musicVolume:Number(music.value),effectsVolume:Number(effects.value)})));
document.querySelector('#play').onclick=()=>audio.startMenuMusic();document.querySelector('#sfx').onclick=()=>audio.sndScore();document.querySelector('#stop').onclick=()=>audio.stopMusic();
document.querySelector('#mic').onclick=async()=>{await voice.enableVoice();log(`Микрофон: ${voice.localStream?.getAudioTracks().map(track=>track.readyState).join(', ')||'выключен'}`);};
document.querySelector('#end').onclick=async()=>{await voice.disableVoice();log('Микрофон остановлен');};
window.addEventListener('pagehide',()=>{voice.destroy();audio.stopMusic();});
document.addEventListener('visibilitychange',()=>log(`Видимость: ${document.visibilityState}`));
log(JSON.stringify({origin:location.origin,settings,native:window.Capacitor?.getPlatform?.()||'browser'}));
