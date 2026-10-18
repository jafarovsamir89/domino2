// Normal daily claims on a disposable local database, using the service's explicit test clock.
import fs from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {EconomyService} from '../../../../apps/api/dist/src/modules/economy/economy.service.js';
const u=new URL(process.env.DATABASE_URL||'');
if(u.hostname!=='127.0.0.1'||u.port!=='55439'||u.pathname!=='/domino_audit')throw Error('Local audit DB only');
const db=new PrismaClient();const output={scope:'30 consecutive normal daily claims with explicit now argument; synthetic profile in existing local audit DB. No rewarded upgrades, concurrency or production traffic.',claims:[]};
try{
 const id='audit-schedule-'+Date.now().toString(36);
 const user=await db.user.create({data:{id,name:'Schedule fixture',email:id+'@example.invalid'}});
 const player=await db.player.create({data:{userId:user.id,displayName:'Schedule fixture',wallet:{create:{balance:1000}}}});
 const svc=new EconomyService(db,{getCurrentProfile:async()=>({user,player})});
 await svc.getPublicConfig();
 // Fixture prerequisite only; original fresh-install omission is already separately reported.
 await db.coinQuest.upsert({where:{key:'daily_login'},update:{isActive:true},create:{key:'daily_login',title:'Audit prerequisite',rewardAmount:0,maxProgress:1,isActive:true}});
 for(let day=1;day<=30;day++){
  const now=new Date(Date.UTC(2026,0,day,10));
  const result=await svc.claimDailyBonus({}, {claimMode:'normal'},now);
  const wallet=await db.coinWallet.findUnique({where:{playerId:player.id}});
  output.claims.push({day,claimed:result.claimed,reward:result.reward,baseReward:result.baseReward,streakDay:result.dailyBonus?.streakDay,balance:wallet.balance});
 }
 output.totalDailyMinted=output.claims.reduce((s,r)=>s+r.reward,0);
 const next=await svc.getDailyBonusStatus({},new Date(Date.UTC(2026,1,2,10)));
 output.statusAfterGap={streakDay:next.dailyBonus?.streakDay??next.streakDay};
}catch(e){output.error=e.stack;process.exitCode=1}finally{fs.writeFileSync('docs/audit/evidence/metrics/daily-schedule-check.json',JSON.stringify(output,null,2));await db.$disconnect()}
