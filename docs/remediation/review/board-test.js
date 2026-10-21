// Frozen full-screen layout fixture, exclusively in the isolated s039 review app.
const count=Number(new URLSearchParams(location.search).get('reviewBoard'));
if([20,28].includes(count)&&document.querySelector('meta[name="domino-local-review"]')?.content==='s039'&&['localhost','127.0.0.1'].includes(location.hostname)){
 let tries=0;const timer=setInterval(async()=>{
  if(++tries>100){clearInterval(timer);return;}
  if(!window.game?.authResolved||document.querySelector('#splash-screen'))return;
  clearInterval(timer);document.querySelector('#review-onboarding')?.close();
  const [{Board},{Tile},fixture]=await Promise.all([import('/js/board.js'),import('/js/model.js'),fetch('/review/board-quality.json').then(r=>r.json())]);
  game.reviewPilot={enabled:false,event(){},start(){},complete(){},rematch(){}};
  game.playerName='Synthetic';game.network.isMultiplayer=false;game.soloEconomyMode='free';await game.startNewGame();game.pauseSoloGame();game.clearTurnTimers();
  // Frozen layout is not a legal deal and must never become a resume snapshot.
  game.clearGameResumeSnapshot();game.persistGameResumeSnapshot=()=>{};
  const board=new Board();for(const row of fixture.slice(0,count)){const tile=new Tile(row.a,row.b);if(board.isEmpty)board.placeFirst(tile);else board.placeTile(tile,row.openEndIndex);}
  game.board=board;game.renderer.renderBoard(board);
  const notice=document.createElement('p');notice.textContent=`Макет ${count} костяшек · игра приостановлена · следующую настоящую партию начните заново`;
  notice.style.cssText='position:fixed;left:4px;right:4px;bottom:0;padding:6px;background:#173025;color:white;z-index:1000;font:12px system-ui;pointer-events:none';document.body.append(notice);
 },100);
}
