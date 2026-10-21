// Navigation exists only in the synthetic review package/preview.
if(document.querySelector('meta[name="domino-local-review"]')?.content==='s039'&&['localhost','127.0.0.1'].includes(location.hostname)){
 const mount=()=>{const start=document.getElementById('start-screen');if(!start||document.getElementById('review-entry'))return;const button=document.createElement('button');button.id='review-entry';button.type='button';button.textContent='Проверка игры';button.style.cssText='position:absolute;left:12px;bottom:10px;z-index:20;font:15px system-ui;padding:10px;background:#193b2b;color:white;border:1px solid #a4c7af;border-radius:10px';button.onclick=()=>location.assign('/review/index.html');start.append(button);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
}
