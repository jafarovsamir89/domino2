const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const stream=()=>{const track={readyState:'live',enabled:true,stop(){this.readyState='ended';}};return {track,getAudioTracks:()=>[track],getTracks:()=>[track]};};
function fixture(asset){
 const pending=[],signals=[],messages=[],listeners={},nativeListeners=[];
 const document={hidden:false,getElementById:()=>null,querySelectorAll:()=>[],addEventListener:(n,f)=>{listeners[n]=f},removeEventListener:(n)=>{delete listeners[n]}};
 const window={isSecureContext:true,addEventListener:(n,f)=>{listeners[n]=f},removeEventListener:(n)=>{delete listeners[n]},Capacitor:{isNativePlatform:()=>true,isPluginAvailable:()=>true,Plugins:{DominoAudio:{addListener:async(n,f)=>{nativeListeners.push(f);return {remove:async()=>{nativeListeners.splice(nativeListeners.indexOf(f),1)}};}}}}};
 const source=fs.readFileSync(path.resolve(__dirname,'../..',asset),'utf8').replace('export class VoiceChatManager','class VoiceChatManager');
 const Voice=vm.runInNewContext(source+'\nVoiceChatManager',{window,document,navigator:{mediaDevices:{getUserMedia:()=>{const wait=deferred();pending.push(wait);return wait.promise;}}},RTCPeerConnection:class{},RTCIceCandidate:class{},RTCSessionDescription:class{},console});
 const game={network:{room:{sessionId:'synthetic-room-session'},sendVoiceSignal:value=>signals.push(value)},renderer:{showMessage:value=>messages.push(value)},t:key=>key};
 return {voice:new Voice(game),game,pending,signals,messages,listeners,nativeListeners,document};
}
for(const asset of ['js/voice.js','www/js/voice.js']){
 for(const action of ['disable','reset','destroy','replace-room'])test(`${asset}: late microphone result after ${action} is stopped and never announces enabled`,async()=>{
  const f=fixture(asset),operation=f.voice.enableVoice(),captured=stream();
  if(action==='disable')await f.voice.disableVoice();else if(action==='reset')f.voice.resetRoom();else if(action==='destroy')f.voice.destroy();else f.game.network.room={sessionId:'another-room'};
  f.pending[0].resolve(captured);await operation;
  assert.equal(captured.track.readyState,'ended');assert.equal(f.voice.localStream,null);assert.equal(f.signals.some(s=>s.enabled===true),false);
 });
 test(`${asset}: leaving a room stops an already live stream and the manager can be used in a new room`,async()=>{
  const f=fixture(asset),one=f.voice.enableVoice(),first=stream();f.pending[0].resolve(first);await one;
  f.voice.resetRoom();assert.equal(first.track.readyState,'ended');assert.equal(f.voice.localStream,null);
  f.game.network.room={sessionId:'new-room'};const two=f.voice.enableVoice(),second=stream();f.pending[1].resolve(second);await two;
  assert.equal(f.voice.localStream,second);assert.equal(f.voice.isEnabled,true);f.voice.destroy();
 });
 test(`${asset}: final destroy prevents new microphone requests`,async()=>{
  const f=fixture(asset);f.voice.destroy();const operation=f.voice.enableVoice();assert.equal(f.pending.length,0);await operation;
 });
 test(`${asset}: an old rejection cannot disable a fresh microphone request`,async()=>{
  const f=fixture(asset),old=f.voice.enableVoice();await f.voice.disableVoice();const current=f.voice.enableVoice(),second=stream();
  f.pending[1].resolve(second);await current;f.pending[0].reject(Error('old-denial'));await old;
  assert.equal(f.voice.isEnabled,true);assert.equal(f.voice.localStream,second);assert.equal(f.messages.length,0);f.voice.destroy();
 });
 test(`${asset}: repeated enable calls share one capture request`,async()=>{
  const f=fixture(asset),one=f.voice.enableVoice(),two=f.voice.enableVoice(),captured=stream();assert.equal(f.pending.length,1);f.pending[0].resolve(captured);await Promise.all([one,two]);f.voice.destroy();
 });
 test(`${asset}: transport failure cannot prevent microphone cleanup`,async()=>{
  const f=fixture(asset),one=f.voice.enableVoice(),captured=stream();f.pending[0].resolve(captured);await one;
  f.game.network.sendVoiceSignal=()=>{throw Error('synthetic-transport-down');};await f.voice.disableVoice();assert.equal(captured.track.readyState,'ended');assert.equal(f.voice.localStream,null);
 });
 test(`${asset}: native background stops capture, pause for a permission dialog does not cancel it`,async()=>{
  const f=fixture(asset);await new Promise(setImmediate);const operation=f.voice.enableVoice(),captured=stream();
  for(const notify of f.nativeListeners)notify({foreground:false,background:false,active:false});
  f.pending[0].resolve(captured);await operation;assert.equal(f.voice.isEnabled,true);
  for(const notify of f.nativeListeners)notify({foreground:false,background:true,active:false});
  assert.equal(captured.track.readyState,'ended');assert.equal(f.voice.isEnabled,false);f.voice.destroy();
 });
 test(`${asset}: mute preserves the remote roster for a later explicit enable`,async()=>{
  const f=fixture(asset),remote='remote-one',connections=[];f.voice.roomState={players:[{sessionId:remote,isBot:false}]};f.voice.voiceEnabledBySessionId.set(remote,true);f.voice.connectPeer=id=>connections.push(id);
  const one=f.voice.enableVoice();f.pending[0].resolve(stream());await one;await f.voice.disableVoice();
  const two=f.voice.enableVoice();f.pending[1].resolve(stream());await two;assert.deepEqual(connections,[remote,remote]);f.voice.destroy();
 });
 test(`${asset}: hidden page and stopSpeaking release capture without automatically restarting`,async()=>{
  const f=fixture(asset),one=f.voice.enableVoice(),captured=stream();f.pending[0].resolve(captured);await one;
  f.document.hidden=true;f.listeners.visibilitychange();assert.equal(captured.track.readyState,'ended');
  f.document.hidden=false;f.listeners.visibilitychange();assert.equal(f.voice.isEnabled,false);
  const two=f.voice.enableVoice(),fresh=stream();f.pending[1].resolve(fresh);await two;await f.voice.stopSpeaking();assert.equal(fresh.track.readyState,'ended');f.voice.destroy();
 });
 test(`${asset}: a microphone ended by the system stops the voice state`,async()=>{
  const f=fixture(asset),operation=f.voice.enableVoice(),captured=stream();f.pending[0].resolve(captured);await operation;
  captured.track.readyState='ended';captured.track.onended();assert.equal(f.voice.isEnabled,false);assert.equal(f.voice.localStream,null);assert.equal(f.signals.at(-1).enabled,false);f.voice.destroy();
 });
}
