import fs from 'node:fs';
import assert from 'node:assert/strict';
export function summarize(rows){
 const counts={match_recorded:0,settlement_acknowledged:0,reconnect_completed:0}, releases=new Set();let latestBacklog=null;
 for(const row of rows){
  if(!row||row.schemaVersion!==1||!/^([a-f0-9]{7,40}|unknown)$/.test(row.deploySha||''))throw Error('Invalid operational row');
  if(!Number.isFinite(Date.parse(row.at)))throw Error('Invalid event timestamp');
  releases.add(row.deploySha);
  if(Object.hasOwn(counts,row.event))counts[row.event]++;
  else if(row.event==='settlement_backlog'){
   if(!Number.isInteger(row.pending)||row.pending<0||!Number.isInteger(row.failed)||row.failed<0)throw Error('Invalid backlog');
   if(!latestBacklog||Date.parse(row.at)>Date.parse(latestBacklog.at))latestBacklog={at:row.at,pending:row.pending,failed:row.failed};
  }else throw Error('Unknown event');
 }
 const alerts=[];if(latestBacklog?.failed>0)alerts.push('settlement_failed');if(latestBacklog?.pending>=10)alerts.push('settlement_pending_10');if(releases.has('unknown'))alerts.push('missing_deploy_sha');
 return {scope:'local synthetic summary; not production dashboard or delivered operator alert',counts,latestBacklog,releases:[...releases],alerts};
}
if(process.argv.includes('--smoke')){
 const make=(event,extra={})=>({schemaVersion:1,event,at:'2026-10-21T12:00:00Z',deploySha:'abcdef012345',...extra});
 const rows=[make('match_recorded'),make('settlement_acknowledged'),make('reconnect_completed'),make('settlement_backlog',{pending:12,failed:1})];
 const out=summarize(rows);assert.deepEqual(out.alerts,['settlement_failed','settlement_pending_10']);
 assert.deepEqual(summarize([...rows,make('settlement_backlog',{at:'2026-10-21T12:01:00Z',pending:0,failed:0})]).alerts,[]);
 assert.throws(()=>summarize([make('unknown')]));assert.throws(()=>summarize([make('settlement_backlog',{pending:NaN,failed:0})]));
 fs.writeFileSync('docs/remediation/evidence/session-039/local-operations.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
}
