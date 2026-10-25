import {RewardedDailyFlow} from '/js/rewardedDailyFlow.js';
import {RewardedDailyPanel} from '/js/rewardedDailyPanel.js';
import {translations} from '/js/translations.js';
// Only deterministic local fixtures; no account transport, SDK or fetch.
const root=document.getElementById('daily-rewarded-panel'),language=document.getElementById('fixture-language');
let panel,state='pending',counts;
function counters(){document.getElementById('fixture-counters').textContent=`Тест: создание ${counts.issue}, показ ${counts.show}, отмена ${counts.cancel}`;}
function reset(){
 panel?.destroy();state='pending';counts={issue:0,show:0,cancel:0};
 document.getElementById('fixture-wallet').textContent='Тестовый баланс: 200';root.hidden=false;
 const id='a'.repeat(64),api={issue:async()=>{counts.issue++;counters();return {attemptId:id,expiresAt:new Date(Date.now()+600000).toISOString()};},status:async()=>({attemptId:id,state}),cancel:async()=>{counts.cancel++;counters();return {attemptId:id,state};}};
 const ads={bindAttempt:async({attemptId})=>({bound:true,attemptId}),show:async()=>{counts.show++;counters();return {completed:true};}};
 panel=new RewardedDailyPanel({root,flow:new RewardedDailyFlow({api,ads,enabled:true}),t:key=>translations[language.value][key],onCredit:async()=>{document.getElementById('fixture-wallet').textContent='Тестовый баланс: 400';}});counters();
}
language.onchange=()=>{document.documentElement.lang=language.value;panel.render();};
document.getElementById('fixture-confirm').onclick=()=>{state='credited';};
document.getElementById('fixture-expire').onclick=()=>{state='expired';};
document.getElementById('fixture-reset').onclick=reset;
reset();
