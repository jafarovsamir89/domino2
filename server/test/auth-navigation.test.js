const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadGame}=require('./helpers/client-game.cjs');
for(const prefix of ['', 'www/']){
 test(`${prefix}OAuth requests and native token adoption retain their contract`,async()=>{
  const calls=[],store=new Map(),storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const Account=vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../..',prefix+'js/account.js'),'utf8').replace('export class AccountClient','class AccountClient')+'\nAccountClient',{window:{DOMINO_PLATFORM_API_URL:'http://127.0.0.1:4300/api',localStorage:storage,location:{hostname:'127.0.0.1'}},DOMINO_ENDPOINTS:{API_BASE:'http://127.0.0.1:4300/api'},AbortController,setTimeout,clearTimeout,console,fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.endsWith('mobile-google-sign-in')?{token:'synthetic-game',sessionToken:'synthetic-session',user:{id:'local-user',name:'Local'},player:{id:'local-player',userId:'local-user',displayName:'Local'}}:{url:'http://127.0.0.1:4300/provider/authorize',redirect:true}};}});
  const account=new Account(()=> 'http://127.0.0.1:4301');const callback='http://127.0.0.1:4175/mobile-auth-complete.html';
  for(const provider of ['google','apple']){const result=await account[provider==='google'?'startGoogleSignIn':'startAppleSignIn'](callback);assert.equal(result.redirect,true);assert.deepEqual(calls.at(-1),{url:'http://127.0.0.1:4300/api/auth/sign-in/social',body:{provider,callbackURL:callback}});}
  await assert.rejects(()=>account.signInWithGoogleIdToken(''),/required/);assert.equal(calls.length,2);
  const result=await account.signInWithGoogleIdToken('synthetic-id-token',{gameMode:'classic'});assert.equal(result.token,'synthetic-game');assert.equal(store.get('dominoPlatformGameToken'),'synthetic-game');assert.equal(store.get('dominoPlatformSessionToken'),'synthetic-session');assert.deepEqual(calls.at(-1).body,{idToken:'synthetic-id-token',gameMode:'classic'});
 });
 test(`${prefix}navigation preserves web return and native browser plugin paths`,async()=>{
  const assigned=[],opened=[],window={location:{hostname:'127.0.0.1',origin:'http://127.0.0.1:4175',pathname:'/',search:'?local=1',assign:url=>assigned.push(url)}};
  const game=loadGame(prefix+'js/app.js',{window,DOMINO_ENDPOINTS:{GAME_HTTP_BASE:'http://127.0.0.1:4175'}});game.t=k=>k;game.setAccountStatus=()=>{};
  assert.equal(game.getAuthCallbackUrl(),'http://127.0.0.1:4175/?local=1');await game.openExternalAuthUrl('http://127.0.0.1:4300/authorize');assert.equal(assigned.length,1);
  window.Capacitor={Plugins:{DominoBrowser:{open:async value=>opened.push(value.url)}}};assert.equal(game.getAuthCallbackUrl(),'http://127.0.0.1:4175/mobile-auth-complete.html');await game.openExternalAuthUrl('http://127.0.0.1:4300/authorize');assert.equal(opened.length,1);assert.equal(game.mobileAuthPending,true);assert.equal(assigned.length,1);
 });
}
