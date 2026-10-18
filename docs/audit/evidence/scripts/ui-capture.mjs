import fs from 'node:fs';
import { chromium } from '@playwright/test';
const fixture=JSON.parse(fs.readFileSync('.tmp/audit-profile.json','utf8'));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',deviceScaleFactor:1});
await context.route('**/*',route=>{let host;try{host=new URL(route.request().url()).hostname}catch{}return ['127.0.0.1','localhost'].includes(host)?route.continue():route.abort()});
await context.addInitScript(()=>{window.DOMINO_PLATFORM_API_URL='http://127.0.0.1:4300/api';localStorage.setItem('dominoLanguage','ru');});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const records=[];
const shot=async(name)=>{await page.waitForTimeout(500);const file=`docs/audit/evidence/screenshots/${name}.png`;await page.screenshot({path:file,fullPage:true});records.push({name,file,url:page.url(),text:(await page.locator('body').innerText()).slice(0,12000),metrics:await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,smallControls:[...document.querySelectorAll('button,input,select')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'&&(r.width<44||r.height<44)}).map(e=>({id:e.id,text:e.innerText||e.getAttribute('aria-label'),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})).slice(0,35)}))});};
try{
 await page.goto('http://127.0.0.1:4174');await page.waitForTimeout(1800);await page.locator('#start-lang-select').selectOption('ru');await shot('01-login-mobile');
 await context.addInitScript(f=>{localStorage.setItem('dominoPlatformGameToken',f.token);localStorage.setItem('dominoPlatformProfile',JSON.stringify({...f.player,isGuest:false}));localStorage.setItem('dominoAuthProfile',JSON.stringify({...f.player,name:f.player.displayName,isGuest:false}));},fixture);
 await page.reload();await page.waitForFunction(()=>window.game?.accountProfile?.id);await page.locator('#start-lang-select').selectOption('ru');await shot('02-main-menu');
 const paths=[['03-solo-settings','#open-solo-modal-btn','#solo-modal-close'],['04-profile-history','#account-btn','#account-modal-close'],['05-social','#open-social-btn','#social-center-modal-close'],['06-coin-shop','#start-coin-shop-btn','#coin-shop-modal-close'],['07-cosmetics','#start-cosmetics-shop-btn','#cosmetics-shop-modal-close'],['08-leaderboard','#open-leaderboard-btn','#leaderboard-modal-close']];
 for(const [name,open,close] of paths){try{await page.locator(open).click({timeout:3000});await shot(name);await page.locator(close).click({timeout:3000});}catch(e){records.push({name,error:e.message});await page.reload();await page.waitForTimeout(1500)}}
 await page.locator('#open-online-group-btn').click();await page.locator('#open-online-modal-btn').click();await shot('09-online-settings');await page.reload();await page.waitForTimeout(1000);
 await page.locator('#open-online-group-btn').click();await page.locator('#open-rooms-btn').click();await shot('10-open-rooms');await page.reload();await page.waitForTimeout(1000);
 await page.locator('#open-solo-modal-btn').click();await page.locator('#player-name').fill('Аудит');await page.locator('#player-count-group [data-value="4"]').click();await page.locator('#start-game-btn').click();await page.waitForTimeout(1800);await shot('11-table-four-players');
 await page.locator('#menu-btn').click();await shot('12-pause');
 await page.setViewportSize({width:320,height:568});await shot('13-small-screen-pause');
}catch(e){records.push({fatal:e.message})}
finally{fs.writeFileSync('docs/audit/evidence/metrics/ui-capture.json',JSON.stringify({records,errors},null,2));await browser.close()}
