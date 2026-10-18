// Read-only reconciliation after the driver's already-closed-room leave() wait.
import fs from 'node:fs';
import {PrismaClient} from '@prisma/client';
const u=new URL(process.env.DATABASE_URL||'');
if(u.hostname!=='127.0.0.1'||u.port!=='55439'||u.pathname!=='/domino_audit')throw Error('Local disposable DB only');
const path='docs/audit/evidence/metrics/paid-match-soak.json';
const a=JSON.parse(fs.readFileSync(path));const db=new PrismaClient();
try{
 if(!fs.existsSync('docs/audit/evidence/metrics/paid-match-soak-periodic-snapshot.json'))fs.copyFileSync(path,'docs/audit/evidence/metrics/paid-match-soak-periodic-snapshot.json');
 const wallets=await db.coinWallet.findMany({where:{playerId:{in:a.playerIds}}});
 const stakes=await db.coinMatchStake.findMany({where:{playerId:{in:a.playerIds}}});
 const ledger=await db.coinLedgerEntry.findMany({where:{playerId:{in:a.playerIds}},orderBy:[{createdAt:'asc'},{id:'asc'}]});
 const end=wallets.reduce((s,w)=>({balance:s.balance+w.balance,reserved:s.reserved+w.reserved}),{balance:0,reserved:0});
 const groups=new Map();for(const s of stakes){const k=[s.roomId,s.matchId,s.stakeTableId].join('|');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s)}
 const commissions=[...groups.values()].map(g=>({roomId:g[0].roomId,matchId:g[0].matchId,value:g[0].commissionAmount,consistent:g.every(s=>s.commissionAmount===g[0].commissionAmount),count:g.length,settled:g.every(s=>s.status==='settled')}));
 // API stores the same entire-match commission on every participant stake row.
 const commission=commissions.reduce((s,g)=>s+g.value,0);
 const minted=ledger.filter(e=>['grant','daily_bonus','quest_reward','ad_reward','admin_adjustment'].includes(e.type)&&e.amount>0).reduce((s,e)=>s+e.amount,0);
 a.reconciliation={wallets:wallets.length,initial:a.initialBalance,additionalMinted:minted,final:end,totalCommission:commission,commissionMethod:'One per (roomId, matchId, stakeTableId); identical full-match commission is repeated on participant rows, not summed per row.',initialPlusMintEqualsFinalPlusCommission:a.initialBalance+minted===end.balance+end.reserved+commission,negativeWallets:wallets.filter(w=>w.balance<0||w.reserved<0).length,stakeStatuses:Object.fromEntries([...new Set(stakes.map(s=>s.status))].map(k=>[k,stakes.filter(s=>s.status===k).length])),ledgerEntries:ledger.length,ledgerAmountByType:Object.fromEntries([...new Set(ledger.map(e=>e.type))].map(k=>[k,ledger.filter(e=>e.type===k).reduce((s,e)=>s+e.amount,0)])),settledMatches:commissions.filter(g=>g.settled).length,allFourParticipantSettlements:commissions.every(g=>g.count===4&&g.settled&&g.consistent)};
 a.finalization={method:'Independent read-only DB query after all reserves reached zero; driver interrupted during duplicate leave() of already closed rooms. This is harness cleanup, not a game freeze.',periodicActionsAreLowerBound:true,periodicCompletedMatchRecords:a.completedMatches.length,finalMatchCountFromDb:groups.size,lastSettlementAt:stakes.map(s=>s.settledAt).filter(Boolean).sort((x,y)=>y-x)[0],checkedAt:new Date().toISOString(),groupsCheckpointCountersUnavailable:true};
 a.finishedAt=a.finalization.checkedAt;
 fs.writeFileSync(path,JSON.stringify(a,null,2));
 console.log(JSON.stringify({reconciliation:a.reconciliation,finalization:a.finalization},null,2));
}finally{await db.$disconnect()}
