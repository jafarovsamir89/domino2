'use strict';
const fs=require('node:fs');
const d=JSON.parse(fs.readFileSync('docs/audit/evidence/metrics/full-match-audit.json'));
let seed=87123;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)];
const rows=[];
for(const t of d.tournament){
 const clusters=new Map();
 for(const run of t.runs){if(!run.ok)continue;const a=run.difficulties[run.winner]===t.pair[0]?1:0;const x=clusters.get(run.seed)||[];x.push(a);clusters.set(run.seed,x)}
 const pairs=[...clusters.values()].filter(x=>x.length===2).map(x=>(x[0]+x[1])/2),boot=[];
 for(let i=0;i<5000;i++){let sum=0;for(let j=0;j<pairs.length;j++)sum+=pairs[Math.floor(rnd()*pairs.length)];boot.push(sum/pairs.length)}
 const r={mode:t.mode,pair:t.pair,validGames:t.winsA+t.winsB,pairedSeeds:pairs.length,winsA:t.winsA,winsB:t.winsB,winRateA:t.winRateA,pairedBootstrap95:[percentile(boot,.025),percentile(boot,.975)],meanActions:t.summary.meanActions,meanDeals:t.summary.meanDeals,meanComputeMs:t.summary.meanComputeMs,modelMinutesAt1_5secPerActionPlus5secPerDeal:(t.summary.meanActions*1.5+(t.summary.meanDeals-1)*5)/60};
 rows.push(r);
}
const all=[...d.matrix.flatMap(r=>r.runs),...d.tournament.flatMap(r=>r.runs)];
const out={scope:'Summary of headless current-engine matches. Paired-seed bootstrap5000resamples; confidence intervals describe this benchmark, not human-player win rates.',attempted:all.length,completed:all.filter(r=>r.ok).length,totalActions:all.reduce((s,r)=>s+(r.actions||0),0),totalDeals:all.reduce((s,r)=>s+(r.deals||0),0),gosha:all.reduce((s,r)=>s+(r.gosha||0),0),matrix:d.matrix.map(r=>({mode:r.mode,count:r.count,team:r.team,...r.summary})),tournament:rows,diagnostics:Object.fromEntries(Object.entries(d.diagnostics).map(([k,v])=>[k,v.count])),caveat:'101 outcomes reflect the current fish-state defect; benchmark is not validation of intended101rules. Model minutes are arithmetic from assumed delays, not observed wall-clock gameplay.'};
fs.writeFileSync('docs/audit/evidence/metrics/full-match-summary.json',JSON.stringify(out,null,2));console.log({attempted:out.attempted,completed:out.completed,actions:out.totalActions,gosha:out.gosha});console.log(rows.map(r=>({mode:r.mode,pair:r.pair,winRateA:r.winRateA,CI:r.pairedBootstrap95})));
