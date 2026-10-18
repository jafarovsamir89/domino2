// Audit-only probes: real, disposable PostgreSQL; no production URLs accepted.
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { EconomyService } from '../../../../apps/api/dist/src/modules/economy/economy.service.js';
import { createGameToken } from '../../../../apps/api/dist/src/modules/auth/game-token.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { signDominoPayload } = require('../../../../server/dominoProof.js');
const url = new URL(process.env.DATABASE_URL || '');
if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/domino_audit') throw new Error('Disposable audit database only');
const db = new PrismaClient();
const run = Date.now().toString(36);
const results = { run, database: '127.0.0.1:55439/domino_audit', probes: [] };
const makePlayer = async (name) => {
  const user = await db.user.create({data:{id:`audit-${run}-${name}`,name,email:`${run}-${name}@audit.invalid`}});
  const player = await db.player.create({data:{userId:user.id,displayName:name,wallet:{create:{balance:10000}}}});
  return {user,player};
};
const signed = (payload) => ({...payload,proof:signDominoPayload(payload)});
try {
  const p = await makePlayer('daily');
  const svc = new EconomyService(db, {getCurrentProfile:async()=>p});
  await svc.getPublicConfig();
  try {
    await svc.claimDailyBonus({}, {claimMode:'normal'});
    results.probes.push({name:'fresh_migration_daily_bonus',error:null});
  } catch(e) {
    results.probes.push({name:'fresh_migration_daily_bonus',error:e.message});
  }
  // Missing quest is seeded only in this isolated DB so remaining probes can run.
  await db.coinQuest.upsert({where:{key:'daily_login'},update:{isActive:true},create:{key:'daily_login',title:'Audit daily fixture',rewardAmount:0,maxProgress:1,isActive:true}});
  const before = await db.coinWallet.findUnique({where:{playerId:p.player.id}});
  const normal = await svc.claimDailyBonus({}, {claimMode:'normal'});
  const batch = await Promise.allSettled(Array.from({length:8},()=>svc.claimDailyBonus({}, {claimMode:'rewarded_x2'})));
  const after = await db.coinWallet.findUnique({where:{playerId:p.player.id}});
  results.probes.push({name:'parallel_daily_x2_without_ad_proof',normalReward:normal.reward,baseReward:normal.baseReward,credited:after.balance-before.balance,expectedMaximum:normal.baseReward*2,results:batch.map(r=>r.status==='fulfilled'?{status:r.status,claimed:r.value.claimed,reward:r.value.reward}:{status:r.status,error:r.reason.message})});
  const single = await makePlayer('unverified');
  const ss = new EconomyService(db,{getCurrentProfile:async()=>single});
  const r = await ss.claimDailyBonus({}, {claimMode:'rewarded_x2'});
  results.probes.push({name:'direct_x2_without_ad',claimed:r.claimed,multiplier:r.multiplier,reward:r.reward,adFlag:process.env.ALLOW_UNVERIFIED_AD_REWARDS||'unset'});
  const a=await makePlayer('stakeA'), b=await makePlayer('stakeB');
  const token=createGameToken({userId:a.user.id,playerId:a.player.id,displayName:'stakeA',role:'player',sessionId:'audit-only',provider:'better-auth',issuedAt:Date.now(),expiresAt:Date.now()+3600000});
  const roomId=`audit-room-${run}`;
  const reserve=await svc.reserveMatchStake(token,signed({roomId,matchId:'current-match-B',stakeKey:'stake_50',participants:[{playerId:a.player.id},{playerId:b.player.id}],integrityScope:'economy.reserve'}));
  const stale=await svc.settleMatchStake(token,signed({roomId,matchId:'old-match-A',stakeKey:'stake_50',winnerPlayerIds:[a.player.id],result:'win',integrityScope:'economy.settle'}));
  results.probes.push({name:'stale_match_settles_new_reservation',reserve,settlement:{ok:stale.ok,settled:stale.settled,commission:stale.commission,payout:stale.payout},rows:await db.coinMatchStake.findMany({where:{roomId},select:{matchId:true,status:true,stakeAmount:true}})});
  await db.coinStakeTable.update({where:{key:'stake_50'},data:{isActive:false,commissionBps:250}});
  await svc.getPublicConfig();
  results.probes.push({name:'bootstrap_overwrites_admin_stake',requested:{isActive:false,commissionBps:250},actual:await db.coinStakeTable.findUnique({where:{key:'stake_50'},select:{isActive:true,commissionBps:true}})});
} finally {
  fs.writeFileSync('docs/audit/evidence/metrics/economy-probes.json', JSON.stringify(results,null,2));
  await db.$disconnect();
}
