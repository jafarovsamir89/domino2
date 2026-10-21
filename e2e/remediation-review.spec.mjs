import fs from 'node:fs';
import {test,expect} from './fixtures.mjs';
import {translations} from '../js/translations.js';
const fixture=JSON.parse(fs.readFileSync('e2e/fixtures/board-quality.json'));
async function guest(page,lang){
 await page.addInitScript(lang=>{localStorage.setItem('domino-lang',lang);localStorage.setItem('dominoDebugLogs','false');localStorage.setItem('dominoKonvaBoard','true');},lang);
 await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({user:null,session:null,items:[],incoming:[],sent:[],accepted:[],unreadCount:0,counts:{}})}));
}
for(const prefix of ['','www/'])for(const lang of ['az','ru','en']){
 test(`${prefix}${lang}: full game 20/28 tile review, menus and accepted invite translation`,async({page})=>{
  await guest(page,lang);await page.goto('/'+prefix+'index.html');await expect.poll(()=>page.evaluate(()=>game?.authResolved)).toBe(true);
  await page.locator('#open-solo-modal-btn').click();await expect(page.locator('#start-game-btn')).toHaveText(translations[lang]['btn-solo-start']);
  await page.locator('#player-name').fill('Synthetic');await page.locator('#start-game-btn').click();await expect(page.locator('#game-screen')).toHaveClass(/active/);
  await expect(page.locator('#menu-btn')).toHaveAttribute('aria-label',translations[lang]['game-pause']);
  await expect(page.locator('#menu-btn')).toHaveAttribute('title',translations[lang]['game-pause']);
  await page.evaluate(()=>{game.pauseSoloGame();game.clearTurnTimers();});
  for(const count of [20,28]){
   await page.evaluate(async({prefix,fixture,count})=>{const {Board}=await import('/'+prefix+'js/board.js'),{Tile}=await import('/'+prefix+'js/model.js');const board=new Board();for(const row of fixture.slice(0,count)){const tile=new Tile(row.a,row.b);if(board.isEmpty)board.placeFirst(tile);else board.placeTile(tile,row.openEndIndex);}game.board=board;game.renderer.renderBoard(board);}, {prefix,fixture,count});
   await expect.poll(()=>page.evaluate(()=>game.renderer._konvaBoardRenderer?.tileGroupsById.size)).toBe(count);
   const bounds=await page.evaluate(()=>{const k=game.renderer._konvaBoardRenderer,host=k.rootEl.getBoundingClientRect();return [...k.tileGroupsById.values()].map(e=>{const r=e.tile.getClientRect({relativeTo:k.stage});return {x:r.x,y:r.y,right:r.x+r.width,bottom:r.y+r.height,w:host.width,h:host.height};});});
   for(const r of bounds){expect(r.x).toBeGreaterThanOrEqual(-2);expect(r.y).toBeGreaterThanOrEqual(-2);expect(r.right).toBeLessThanOrEqual(r.w+2);expect(r.bottom).toBeLessThanOrEqual(r.h+2);}
   await page.getByRole('button',{name:translations[lang]['board-view-in'],exact:true}).click();
   await page.getByRole('button',{name:translations[lang]['board-view-reset'],exact:true}).click();
   expect(await page.evaluate(()=>game.renderer._konvaBoardRenderer.viewZoom)).toBe(1);
   if(!prefix)await page.screenshot({path:`docs/remediation/evidence/session-039/game-${lang}-${count}.png`});
  }
  const cancel=await page.evaluate(()=>{const card=game.createRoomInvitationCard({id:'synthetic-invite',kind:'play',type:'play',status:'accepted',inviter:{id:'synthetic-a',displayName:'Synthetic A'},invitee:{id:'synthetic-b',displayName:'Synthetic B'}},'incoming');return card.querySelector('.cancel-invite-btn')?.textContent;});
  expect(cancel).toBe(translations[lang]['invite-cancel']);
  const states=await page.evaluate(()=>{
   game.getCurrentAccountPlayerId=()=> 'synthetic-b';const result={};
   for(const status of ['pending','accepted','room_created','joined','failed_to_join','declined','cancelled','expired']){
    const invite={id:'synthetic-'+status,kind:'play',status,inviter:{id:'synthetic-a',displayName:'Synthetic A'},invitee:{id:'synthetic-b',displayName:'Synthetic B'},...(status==='room_created'?{roomCode:'ABC123'}:{})};
    const card=game.createRoomInvitationCard(invite,'incoming');result[status]={actions:[...card.querySelectorAll('button')].filter(b=>!b.classList.contains('premium-avatar')).map(b=>b.textContent),status:game.getPlayInviteStatusLabel(invite)};
   }return result;
  });
  const expected={pending:['invites-accept','invites-decline'],accepted:['invite-cancel'],room_created:['invite-join-room'],joined:['invite-joined'],failed_to_join:['invite-failed-join'],declined:['invite-status-declined'],cancelled:['invite-status-cancelled'],expired:['invite-status-expired']};
  for(const [status,keys] of Object.entries(expected))expect(states[status].actions).toEqual(keys.map(k=>translations[lang][k]));
  expect(states.accepted.status).toBe(translations[lang]['invite-waiting-room']);
  expect(states.room_created.status).toBe(translations[lang]['invite-room-ready']);
  // Reuse the same late-created dialog after a locale change.
  await page.evaluate(lang=>{game.setLanguage(lang==='en'?'ru':'en');game.showInsufficientCoinsModal(200,50);game.closeInsufficientCoinsModal();game.setLanguage(lang);game.showInsufficientCoinsModal(200,50);},lang);
  await expect(page.locator('#insufficient-coins-modal-title')).toHaveText(translations[lang]['coins-insufficient-title']);
  await expect(page.locator('#insufficient-coins-modal-message')).toHaveText(translations[lang]['coins-insufficient-message']);
  for(const key of ['coins-check','coins-required','coins-balance','coin-shop-title','modal-close'])await expect(page.locator(`#insufficient-coins-modal [data-i18n="${key}"]`)).toHaveText(translations[lang][key]);

 });
}
test('local review onboarding starts a real free solo; repeated result is counted once',async({page})=>{
 await guest(page,'ru');await page.addInitScript(()=>{localStorage.setItem('domino-review-pilots','true');window.DOMINO_ENDPOINTS={API_BASE:'http://127.0.0.1:4173/api',GAME_HTTP_BASE:'http://127.0.0.1:4173',GAME_WS_URL:'ws://127.0.0.1:4173'};});
 await page.route('**/index.html',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('index.html','utf8').replace('<head>','<head><meta name="domino-local-review" content="s039">')}));
 await page.goto('/index.html');await page.locator('#review-onboarding button').click();await page.locator('#player-name').fill('Synthetic');await page.locator('#start-game-btn').click();
 await expect(page.locator('#game-screen')).toHaveClass(/active/);await page.evaluate(()=>{game.pauseSoloGame();game.clearTurnTimers();game.matchOver=true;game.showMatchResult(0);game.showMatchResult(0);});
 const names=await page.evaluate(()=>JSON.parse(localStorage.getItem('domino-review-events')).map(r=>r.event));expect(names).toEqual(['first_start','match_started','match_completed','first_match']);
});
test('RU listing draft captures actual start, solo and genuine initial game, without review fixtures',async({page})=>{
 await guest(page,'ru');await page.goto('/index.html');await expect.poll(()=>page.evaluate(()=>game?.authResolved)).toBe(true);await expect(page.locator('#splash-screen')).toHaveCount(0);
 await page.screenshot({path:'docs/remediation/evidence/session-039/aso-ru-start-draft.png'});
 await page.locator('#open-solo-modal-btn').click();await page.screenshot({path:'docs/remediation/evidence/session-039/aso-ru-solo-draft.png'});
 await page.locator('#player-name').fill('Synthetic');await page.locator('#start-game-btn').click();await expect(page.locator('#game-screen')).toHaveClass(/active/);
 await expect.poll(()=>page.evaluate(()=>game.gameActive)).toBe(true);
 await page.screenshot({path:'docs/remediation/evidence/session-039/aso-ru-game-draft.png'});
 expect(await page.evaluate(()=>game.reviewPilot.enabled)).toBe(false);
});
