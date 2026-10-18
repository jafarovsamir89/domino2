const {loadGame}=require('./client-game.cjs');
function makeAsyncGame(asset='js/app.js',extra={}){
 let resolve,reject;const animation=new Promise((r,j)=>{resolve=r;reject=j});const counters={score:0,advance:0,cancel:0,frames:[]};
 const game=loadGame(asset,{setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame:cb=>cb(),LAST_MOVE_REVEAL_DELAY_MS:1200,CLASSIC101_BOT_DRAW_STEP_DELAY_MS:5,...extra});
 const tile={id:'played',a:1,b:2,total:3,hasValue:()=>true};
 Object.assign(game,{network:{isMultiplayer:false},mode:'telefon',currentPlayer:0,humanPlayerIndex:0,_turnCycleId:1,gameActive:true,roundOver:false,matchOver:false,postMoveWindowActive:false,hands:[[tile,{id:'kept'}],[{id:'opponent'}]],boneyard:[],renderer:{handEl:{children:[{getBoundingClientRect:()=>({left:0,top:0,width:10,height:20}),cloneNode:()=>({})}]},animateTileTravel:()=>animation,cancelActiveTileTravel:()=>{counters.cancel++;}},board:{isEmpty:false,openEnds:[{value:1}],placeTile:()=>10},ruleset:{resolveRoundEnd:()=>({}),scoreDuringPlay:()=>10},updateTurnTimerHud:()=>{},playSound:()=>{},log:()=>{},renderState:()=>{},getOpeningScoreContext:()=>0,getTeamMembers:()=>[],addScore:()=>{counters.score++;},checkEnd:()=>false,scheduleTurnAdvance:()=>{counters.advance++;}});
 return {game,resolve,reject,counters};
}
module.exports={makeAsyncGame};
