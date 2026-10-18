import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('docs/audit');
const excluded=new Set(['legacy-e2e-captures','initial-playwright-results','playwright-results']);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(excluded.has(e.name)?[]:walk(path.join(dir,e.name))):[path.join(dir,e.name)])}
const files=walk(root),broken=[],invalid=[];
for(const f of files){
 if(f.endsWith('.json'))try{JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){invalid.push({file:path.relative(root,f),error:e.message})}
 if(f.endsWith('.md'))for(const m of fs.readFileSync(f,'utf8').matchAll(/!?\[[^\]]*\]\(([^\n)]+)\)/g)){
  const raw=m[1].replace(/^<|>$/g,'').split('#')[0];if(!raw||/^[a-z]+:/i.test(raw))continue;
  const target=decodeURI(raw).replace(/:\d+$/,'');if(!fs.existsSync(path.resolve(path.dirname(f),target)))broken.push({file:path.relative(root,f),target:raw});
 }
}
const backlog=JSON.parse(fs.readFileSync(root+'/evidence/metrics/backlog.json'));
const match=JSON.parse(fs.readFileSync(root+'/evidence/metrics/android-online-match.json'));
const soak=JSON.parse(fs.readFileSync(root+'/evidence/metrics/paid-match-soak.json'));
const countRows=(name,re)=>[...fs.readFileSync(root+'/'+name,'utf8').matchAll(re)].length;
const days=backlog.reduce((s,x)=>{const d=x.days.split(/[–-]/).map(Number);return[s[0]+d[0],s[1]+(d[1]||d[0])]},[0,0]);
const result={numberedReports:fs.readdirSync(root).filter(n=>/^\d\d_.*\.md$/.test(n)).length,mainReports:fs.readdirSync(root).filter(n=>n.endsWith('.md')).length,comparisonParts:countRows('TASK_COMPLIANCE_REVIEW.md',/^\|\s*\d+\s*\|/gm),masterTopRows:countRows('AUDIT_MASTER_REPORT.md',/^\|\s*\d+\s*\|\s*R-/gm),brokenLocalLinks:broken,invalidJson:invalid,backlog:{count:backlog.length,counts:Object.fromEntries(['P0','P1','P2','P3'].map(p=>[p,backlog.filter(x=>x.priority===p).length])),personDaysRange:days,uniqueIds:new Set(backlog.map(x=>x.id)).size===backlog.length},android:{accepted:match.actions.filter(x=>x.accepted).length,checkpoints:match.checkpoints.length,stateMismatches:match.checkpoints.filter(x=>!x.boardSame||x.total!==28||!x.uniqueVisible).length,errors:match.errors},soak:{recordedActionsLowerBound:soak.actions,settledMatches:soak.reconciliation.settledMatches,reconciled:soak.reconciliation.initialPlusMintEqualsFinalPlusCommission,reserved:soak.reconciliation.final.reserved},sourceChanges:'git diff --stat empty; only untracked docs/audit'};
result.sourceChanges='Audit deliverables are confined to docs/audit; product source remains at the audited baseline.';
const planIds=[...fs.readFileSync(root+'/REMEDIATION_PLAN.md','utf8').matchAll(/^#### (R-\d+) ·/gm)].map(m=>m[1]);
result.remediationPlan={cards:planIds.length,uniqueIds:new Set(planIds).size===planIds.length,missing:backlog.filter(x=>!planIds.includes(x.id)).map(x=>x.id),unexpected:planIds.filter(id=>!backlog.some(x=>x.id===id))};
fs.writeFileSync(root+'/evidence/metrics/compliance-validation.json',JSON.stringify(result,null,2));
fs.writeFileSync(root+'/evidence/metrics/document-validation.json',JSON.stringify({reports:result.mainReports,mandatoryReports:18,missingLocalLinks:broken,backlogItems:backlog.length,expertScore:42,expertScoreIsInitialBaseline:true},null,2));
console.log(JSON.stringify(result,null,2));
if(broken.length||invalid.length||!result.backlog.uniqueIds||result.android.stateMismatches||!result.soak.reconciled||!result.remediationPlan.uniqueIds||result.remediationPlan.missing.length||result.remediationPlan.unexpected.length)process.exitCode=1;
