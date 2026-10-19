import {test,expect} from './fixtures.mjs';
async function setup(page,mode='healthy'){
 await page.addInitScript(mode=>{
  localStorage.setItem('domino-lang','ru');
  const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  const original=fetch.bind(window);
  window.fetch=async(input,init={})=>{
   const url=String(input?.url||input);
   if(!url.includes('/api/'))return original(input,init);
   if(url.includes('/platform/game-token')){
    if(mode==='hang')return new Promise((resolve,reject)=>init.signal?.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError')),{once:true}));
    if(mode==='offline'&&!sessionStorage.getItem('startup-test-recovered'))throw new TypeError('Synthetic offline');
    const delay=Number(sessionStorage.getItem('startup-test-delay')||0);if(delay)await new Promise(r=>setTimeout(r,delay));
    return response({token:'synthetic-startup',user:{id:'startup-u',name:'Synthetic',role:'player'},player:{id:'startup-p',displayName:'Synthetic',isGuest:false},wallet:{balance:1000,reserved:0}});
   }
   return response({ok:true,items:[],incoming:[],outgoing:[],accepted:[],unreadCount:0,counts:{total:0,connected:0}});
  };
 },mode);
}
for(const prefix of ['', 'www/']){
 test(`${prefix}cold/warm startup becomes interactive without minimum delay or window load`,async({page})=>{
  await setup(page);await page.route('**/startup-stalled.png',()=>new Promise(()=>{}));
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const image=new Image();image.src='/startup-stalled.png';document.body.append(image);window.addEventListener('load',()=>window.startupLoadFired=true)}));
  await page.goto('/'+prefix+'index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#splash-screen')).toHaveCount(0,{timeout:3000});
  expect(await page.evaluate(()=>window.startupLoadFired)).toBeFalsy();
  await page.locator('#open-solo-modal-btn').click();await expect(page.locator('#start-game-btn')).toBeVisible();
  await page.evaluate(()=>sessionStorage.setItem('startup-test-delay','600'));
  await page.reload({waitUntil:'domcontentloaded'});
  expect(await page.locator('#splash-screen').count()).toBe(1);
  await expect(page.locator('#splash-screen')).toHaveCount(0,{timeout:3000});
  await page.locator('#open-solo-modal-btn').click();await expect(page.locator('#start-game-btn')).toBeVisible();
 });
 test(`${prefix}offline bootstrap shows a readable notice and retry`,async({page})=>{
  await page.setViewportSize({width:320,height:640});
  await setup(page,'offline');await page.goto('/'+prefix+'index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#splash-screen')).toHaveCount(0,{timeout:3000});
  await expect(page.locator('#startup-network-note')).toBeVisible();
  await expect(page.locator('#startup-network-note button')).toHaveAccessibleName('Повторить');
  const notice=await page.locator('#startup-network-note').boundingBox(),login=await page.locator('#auth-landing-card').boundingBox();
  expect(notice.y+notice.height).toBeLessThanOrEqual(login.y);
  expect(notice.x).toBeGreaterThanOrEqual(0);expect(notice.x+notice.width).toBeLessThanOrEqual(320);
  await page.evaluate(()=>sessionStorage.setItem('startup-test-recovered','1'));
  await page.locator('#startup-network-note button').click();await expect(page.locator('#startup-network-note')).toHaveCount(0);
  await expect(page.locator('#splash-screen')).toHaveCount(0,{timeout:3000});
  await page.locator('#open-solo-modal-btn').click();await expect(page.locator('#start-game-btn')).toBeVisible();
 });
 test(`${prefix}hung account request is bounded and cannot leave auth spinner forever`,async({page})=>{
  await setup(page,'hang');await page.goto('/'+prefix+'index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#splash-screen')).toHaveCount(0,{timeout:7500});
  expect(await page.evaluate(()=>game.authResolved)).toBe(true);
  await expect(page.locator('#startup-network-note')).toBeVisible();
 });
 test(`${prefix}missing app module exposes retry without hiding failed startup`,async({page})=>{
  await page.route('**/js/app.js*',r=>r.abort());await page.goto('/'+prefix+'index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#startup-error')).toBeVisible({timeout:9000});
  await expect(page.locator('#startup-error button')).toHaveAccessibleName(/Повторить|Retry|Yenidən/);
  await expect(page.locator('#splash-screen')).toBeVisible();
  await page.unroute('**/js/app.js*');await setup(page);
  await page.locator('#startup-error button').click();
  await expect(page.locator('#splash-screen')).toHaveCount(0,{timeout:3000});
  await page.locator('#open-solo-modal-btn').click();await expect(page.locator('#start-game-btn')).toBeVisible();
 });
 test(`${prefix}stalled critical module reaches recoverable deadline`,async({page})=>{
  await page.route('**/js/app.js*',()=>new Promise(()=>{}));
  await page.goto('/'+prefix+'index.html',{waitUntil:'commit'});
  await expect(page.locator('#startup-error')).toBeVisible({timeout:9500});
  expect(await page.evaluate(()=>performance.getEntriesByName('domino-startup-error')[0].startTime)).toBeLessThan(9000);
 });
}
