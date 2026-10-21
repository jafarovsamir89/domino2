const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function load(asset,store=new Map(),native={}){
 const counts={oscillators:0,sources:0,contexts:0,plays:0},audio=[],timers=[],listeners={};
 const param=()=>({value:1,setValueAtTime(v){this.value=v},exponentialRampToValueAtTime(v){this.value=v}});
 const node=()=>({gain:param(),frequency:param(),connect(){return this},start(){},stop(){}});
 class Context{constructor(){counts.contexts++;this.currentTime=0;this.sampleRate=100;this.state='running';this.destination={}}createGain(){return node()}createBiquadFilter(){return node()}createOscillator(){counts.oscillators++;return node()}createBufferSource(){counts.sources++;return node()}createBuffer(){return {getChannelData:()=>new Float32Array(200)}}resume(){return Promise.resolve()}suspend(){return Promise.resolve()}}
 class Audio{constructor(src){this.src=src;this.paused=true;audio.push(this)}play(){counts.plays++;this.paused=false;return Promise.resolve()}pause(){this.paused=true}}
 const document={hidden:false,addEventListener:(name,fn)=>{listeners[name]=fn}};
 const source=fs.readFileSync(path.resolve(__dirname,'../..',asset),'utf8').replace(/export /g,'');
 const api=vm.runInNewContext(source+'\n({sndPlace,sndScore,sndDraw,sndPass,sndWin,sndGosha,startMenuMusic,toggleMute,isMuted,getAudioSettings:typeof getAudioSettings==="function"?getAudioSettings:null,updateAudioSettings:typeof updateAudioSettings==="function"?updateAudioSettings:null})',{window:{AudioContext:Context,performance:{now:()=>0},...native,addEventListener:(name,fn)=>{listeners[name]=fn}},Audio,document,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setTimeout:fn=>timers.push(fn),console});
 return {api,counts,audio,timers,store,document,listeners};
}
for(const asset of ['js/sounds.js','www/js/sounds.js']){
 test(`${asset}: master mute prevents all procedural nodes including a delayed bounce`,()=>{const {api,counts,timers}=load(asset);api.toggleMute();for(const name of ['sndPlace','sndScore','sndDraw','sndPass','sndWin','sndGosha'])api[name]();while(timers.length)timers.shift()();assert.equal(counts.contexts,0);assert.equal(counts.oscillators,0);assert.equal(counts.sources,0);api.toggleMute();api.sndPlace();const before=counts.oscillators;api.toggleMute();while(timers.length)timers.shift()();assert.equal(counts.oscillators,before);});
 test(`${asset}: legacy mute preference also silences effects`,()=>{const {api,counts}=load(asset,new Map([['domino_music_muted','true']]));assert.equal(api.isMuted(),true);api.sndScore();assert.equal(counts.oscillators,0);});
 test(`${asset}: music/effects levels are independent and persist with the master state`,()=>{const {api,counts,audio,store}=load(asset);api.updateAudioSettings({musicVolume:0.35,effectsVolume:0});api.startMenuMusic();assert.equal(audio[0].volume,0.35);api.sndScore();assert.equal(counts.oscillators,0);api.toggleMute();assert.equal(audio[0].paused,true);const restored=load(asset,store).api.getAudioSettings();assert.equal(restored.masterMuted,true);assert.equal(restored.musicVolume,0.35);assert.equal(restored.effectsVolume,0);});
 test(`${asset}: hidden page suspends playback and cannot create new effects`,()=>{const {api,counts,document,listeners,audio}=load(asset);api.startMenuMusic();document.hidden=true;listeners.visibilitychange();api.sndScore();assert.equal(counts.oscillators,0);assert.equal(audio[0].paused,true);document.hidden=false;listeners.visibilitychange();assert.equal(audio[0].paused,false);});
 test(`${asset}: native lifecycle gates both engines without changing preferences`,async()=>{
  let notify;const plugin={addListener:async(name,fn)=>{notify=fn},configure:async()=>({active:true})};
  const f=load(asset,new Map(),{Capacitor:{isNativePlatform:()=>true,isPluginAvailable:()=>true,Plugins:{DominoAudio:plugin}}});
  await new Promise(r=>setImmediate(r));f.api.startMenuMusic();assert.equal(f.audio[0].paused,false);
  notify({active:false,foreground:false});const before=f.counts.oscillators;f.api.sndScore();assert.equal(f.counts.oscillators,before);assert.equal(f.audio[0].paused,true);assert.equal(f.api.isMuted(),false);
  notify({active:true,foreground:true});assert.equal(f.audio[0].paused,false);
  f.api.toggleMute();notify({active:true,foreground:true});assert.equal(f.audio[0].paused,true);assert.equal(f.api.isMuted(),true);
 });
 test(`${asset}: a delayed native configure result cannot unmute after the Activity paused`,async()=>{
  let notify,finish;const plugin={addListener:async(name,fn)=>{notify=fn},configure:()=>new Promise(resolve=>{finish=resolve})};
  const f=load(asset,new Map(),{Capacitor:{isNativePlatform:()=>true,isPluginAvailable:()=>true,Plugins:{DominoAudio:plugin}}});
  await new Promise(r=>setImmediate(r));f.api.startMenuMusic();
  notify({active:false,foreground:false});finish({active:true,foreground:true});
  await new Promise(r=>setImmediate(r));
  assert.equal(f.audio[0].paused,true,'older configuration must not override the newer pause event');
  f.api.sndScore();assert.equal(f.counts.oscillators,0);
  notify({active:true,foreground:true});assert.equal(f.audio[0].paused,false);
 });

}
