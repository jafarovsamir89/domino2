import fs from 'node:fs';
import {chromium} from '@playwright/test';
const target=process.argv[2]||'desktop';
const browser=target==='android'?await chromium.connectOverCDP('http://127.0.0.1:9222'):await chromium.launch({headless:true});
const context=target==='android'?browser.contexts()[0]:await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
if(target!=='android') await context.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
const page=target==='android'?context.pages().find(p=>p.url().includes('4174'))||context.pages()[0]:await context.newPage();
const out={target,date:new Date().toISOString(),method:'Controlled board animation, not whole-game FPS. Same local HTTP fixture; debug WebView for Android; no production traffic.',rows:[],errors:[]};page.on('pageerror',e=>out.errors.push(e.message));
const cdp=await context.newCDPSession(page);
try {
 await page.goto('http://127.0.0.1:4174/?audit-device=1');await page.waitForFunction(()=>window.game?.accountProfile?.id);
 await page.locator('#open-solo-modal-btn').click();await page.locator('#player-count-group [data-value="4"]').click();await page.locator('#start-game-btn').click();await page.waitForTimeout(1500);
 await page.evaluate(()=>{window.game.clearTurnTimers();window.game.gameActive=false;});
 const rates=target==='android'?[1]:[1,4,6];
 for(const rate of rates){if(target!=='android')await cdp.send('Emulation.setCPUThrottlingRate',{rate});
  for(const count of [5,10,20,28]){
   await page.evaluate(async({count,fixture})=>{const g=window.game;g.clearTurnTimers();const {Tile}=await import('/js/model.js');const board=new g.board.constructor();for(const t of fixture.slice(0,count)){const tile=new Tile(t.a,t.b);if(board.isEmpty)board.placeFirst(tile);else board.placeTile(tile,t.openEndIndex)}if(board.nodes.length!==count)throw Error('invalid stress fixture');g.board=board;g.renderer.renderBoard(board);window.__auditBoard=board;},{count,fixture:JSON.parse(fs.readFileSync('docs/audit/evidence/metrics/board-fixture.json','utf8'))});
   await page.waitForTimeout(300);
   if(count===28){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
   const result=await page.evaluate(async()=>{const frames=[],cost=[],tasks=[];let last=performance.now(),start=last,n=0;const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));observer.observe({type:'longtask',buffered:false});const g=window.game,board=window.__auditBoard;const timer=setInterval(()=>{const t=performance.now();g.renderer.renderBoard(board);cost.push(performance.now()-t);const k=g.renderer._konvaBoardRenderer;const id=String(board.nodes.at(-1).tile.id);void k?.animateTileTravel(id,{left:180,top:650,width:28,height:54},null);},650);await new Promise(resolve=>{function frame(t){frames.push(t-last);last=t;n++;if(t-start<6500)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)});clearInterval(timer);observer.disconnect();const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))]||0;return {frames:n,elapsedMs:last-start,rafFps:n*1000/(last-start),frameP50:percentile(frames,.5),frameP95:percentile(frames,.95),frameP99:percentile(frames,.99),over25ms:frames.filter(t=>t>25).length,longTasks:tasks,renderP95:percentile(cost,.95),jsHeap:performance.memory?.usedJSHeapSize,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio};});
   if(count===28){const p=await cdp.send('Profiler.stop');fs.writeFileSync(`docs/audit/evidence/traces/${target}-cpu-${rate}.cpuprofile`,JSON.stringify(p.profile));}
   out.rows.push({cpuThrottle:rate,tiles:count,...result});await page.screenshot({path:`docs/audit/evidence/screenshots/perf-${target}-${rate}-${count}.png`});
  }
 }
 await cdp.send('HeapProfiler.collectGarbage');const before=await cdp.send('Runtime.getHeapUsage');
 await page.evaluate(()=>{for(let i=0;i<100;i++)window.game.renderer.renderBoard(window.__auditBoard)});await page.waitForTimeout(500);await cdp.send('HeapProfiler.collectGarbage');const after=await cdp.send('Runtime.getHeapUsage');out.heap100IdenticalRenders={before,after};
}catch(e){out.error=e.stack;process.exitCode=1}
finally{fs.writeFileSync(`docs/audit/evidence/metrics/performance-${target}.json`,JSON.stringify(out,null,2));await browser.close();}
