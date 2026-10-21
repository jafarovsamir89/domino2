// Local-only experiment instrumentation. No network, identifiers, or production activation.
export function createReviewPilot(env=globalThis) {
    const disabled=Object.freeze({enabled:false,event(){},start(){},complete(){},rematch(){}});
    try {
        const {document:doc,location:loc,localStorage:storage}=env;
        if(doc?.querySelector('meta[name="domino-local-review"]')?.content!=='s039' ||
           !['localhost','127.0.0.1'].includes(loc?.hostname) || storage?.getItem('domino-review-pilots')!=='true' ||
           !Object.values(env.DOMINO_ENDPOINTS||{}).length || !Object.values(env.DOMINO_ENDPOINTS).every(url=>new URL(url).hostname==='127.0.0.1')) return disabled;
        let rows=[];try{rows=JSON.parse(storage.getItem('domino-review-events')||'[]');if(!Array.isArray(rows))rows=[];}catch{}
        let sequence=0,current=null;
        const event=name=>{
            if(!['first_start','match_started','first_match','match_completed','rematch_clicked','invite_sent','invite_accepted'].includes(name)) return;
            const row={schemaVersion:1,event:name,at:Date.now(),variant:'guided-solo-v1',scope:'local-review'};
            rows.push(row);rows=rows.slice(-500);
            try{storage.setItem('domino-review-events',JSON.stringify(rows));}catch{}
            doc.dispatchEvent(new env.CustomEvent('domino-review-event',{detail:row}));
        };
        if(!storage.getItem('domino-review-first-start')) {event('first_start');storage.setItem('domino-review-first-start','true');}
        if(!storage.getItem('domino-review-guide-seen')) {
            const mount=()=>{
                const lang=storage.getItem('domino-lang')||'az';
                const copy={ru:['Попробуйте бесплатную игру','Для одиночной игры с ботами аккаунт и монеты не нужны. Выберите правила и сложность.','Выбрать игру'],az:['Pulsuz oyunu sınayın','Botlarla tək oyun üçün hesab və sikkə lazım deyil. Qaydaları və çətinliyi seçin.','Oyunu seç'],en:['Try a free game','Solo with bots needs no account or coins. Choose the rules and difficulty.','Choose a game']}[lang]||['Try a free game','Solo with bots needs no account or coins.','Choose a game'];
                const dialog=doc.createElement('dialog'),title=doc.createElement('h2'),text=doc.createElement('p'),button=doc.createElement('button');
                dialog.id='review-onboarding';dialog.style.cssText='max-width:min(420px,80vw);background:#183a29;color:white;border:2px solid #95cbaa;border-radius:16px;padding:22px';
                title.textContent=copy[0];text.textContent=copy[1];button.textContent=copy[2];button.style.cssText='font:inherit;padding:12px';
                button.onclick=()=>{storage.setItem('domino-review-guide-seen','true');dialog.close();dialog.remove();doc.getElementById('open-solo-modal-btn')?.click();};
                dialog.append(title,text,button);doc.body.append(dialog);dialog.showModal();
            };
            // Wait for the actual app to finish its splash/auth bootstrap.
            let attempts=0;const timer=env.setInterval?.(()=>{if(++attempts>100){env.clearInterval(timer);return;}if(env.game?.authResolved&&!doc.querySelector('#splash-screen')){env.clearInterval(timer);mount();}},100);
        }
        return {enabled:true,event,start(){current={id:++sequence,done:false};event('match_started');},complete(){if(!current||current.done)return;current.done=true;event('match_completed');if(!storage.getItem('domino-review-first-match')){event('first_match');storage.setItem('domino-review-first-match','true');}},rematch(){event('rematch_clicked');}};
    }catch{return disabled;}
}
