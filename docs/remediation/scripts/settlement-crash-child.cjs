// Used only by the local response-loss/restart drill.
const assert=require('node:assert/strict');
assert(process.cwd().includes('/.tmp/remediation-s024/'));
const root=process.cwd(),mode=process.argv[2],context=JSON.parse(process.env.SYNTHETIC_SETTLEMENT_CONTEXT);
if(mode==='submit'){
 const {settleEconomyRoundForRoom}=require(root+'/server/economyService');
 const room={...context,currentStakeKey:context.stakeKey,currentDealStakeKey:context.stakeKey,currentDealStakeAmount:200,currentDealBankAmount:400,matchRecordId:context.matchId,state:{playerOrder:['s0','s1'],isTeamMode:false},identityBySessionId:new Map([['s0',{provider:'platform',userId:context.winnerUserIds[0]}],['s1',{provider:'platform',userId:'other-synthetic'}]]),getPlatformMatchIdentity:()=>({authToken:'synthetic-unused-token'}),scheduleEconomySettlementRetry:()=>{}};
 void settleEconomyRoundForRoom(room,0).then(()=>process.send?.({returned:true}));
}else{
 const {getSettlementOutbox}=require(root+'/server/settlementOutbox');
 void getSettlementOutbox().reconcile().then(result=>{process.send?.({reconciled:result});process.exit(0)}).catch(e=>{console.error(e);process.exit(1)});
}
setInterval(()=>{},1000);
