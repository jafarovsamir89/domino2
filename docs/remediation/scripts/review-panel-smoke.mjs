import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from '@playwright/test';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4186/');await page.locator('#review-entry').click();await page.locator('#cards article').last().waitFor();assert.equal(await page.locator('#cards article').count(),15);
 await page.locator('#notes').fill('Synthetic smoke; not an owner decision');
 const download=page.waitForEvent('download');await page.locator('#export').click();const file=await download;const bytes=await fs.promises.readFile(await file.path());const out=JSON.parse(bytes);assert.equal(out.scope,'owner-review-not-canonical-closure');assert.equal(out.decisions.notes,'Synthetic smoke; not an owner decision');
 await page.screenshot({path:'docs/remediation/evidence/session-039/review-panel-390.png',fullPage:true});
 await page.locator('#enable').click();await page.locator('#review-onboarding button').waitFor();await page.locator('#review-onboarding button').click();await page.locator('#start-game-btn').waitFor({state:'visible'});
 await page.goto('http://127.0.0.1:4186/index.html?reviewBoard=28');await page.waitForFunction(()=>window.game?.renderer?._konvaBoardRenderer?.tileGroupsById.size===28);assert.equal(await page.evaluate(()=>game.reviewPilot.enabled),false);
 await page.screenshot({path:'docs/remediation/evidence/session-039/native-layout-fixture-browser.png'});
 await page.goto('http://127.0.0.1:4186/review-audio.html');await page.locator('#mute').check();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('domino_audio_settings')).masterMuted),true);
 await page.screenshot({path:'docs/remediation/evidence/session-039/audio-panel-390.png'});
 const dims=await page.evaluate(async()=>{const rows=[];for(const path of ['/assets/cosmetics/table/table_skin_04.webp','/assets/cosmetics/table/table_skin_07.webp']){const img=new Image();img.src=path;await img.decode();rows.push({path,width:img.naturalWidth,height:img.naturalHeight,rgbaBytes:img.naturalWidth*img.naturalHeight*4});}return rows;});assert.ok(dims.reduce((s,d)=>s+d.rgbaBytes,0)<=32*1024*1024);
 assert.deepEqual(errors,[]);const result={cards:15,decisionExport:'pass',realOnboarding:'pass',fullBoardFixture28:'pass',frozenFixtureNotCountedAsMatch:true,audioSettings:'pass',pageErrors:errors,textureDimensions:dims,textureScope:'Browser decode dimensions/nominal RGBA bytes only; not actual GPU/native memory measurement'};
 fs.writeFileSync('docs/remediation/evidence/session-039/review-panel-smoke.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
