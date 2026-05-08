export class Renderer {
    constructor(app) {
        this.app = app;
        this.boardEl = document.getElementById('board');
        this.handEl = document.getElementById('player-hand');
        this.scoresEl = document.getElementById('scores-bar');
        this.messageEl = document.getElementById('message-area');
        this.roundInfoEl = document.getElementById('round-info');
        this.stakeInfoEl = document.getElementById('stake-info');
        this.boneyardInfoEl = document.getElementById('boneyard-info');
        this.boneyardVisual = document.getElementById('boneyard-visual');
        this.drawBtn = document.getElementById('draw-btn');
        this.passBtn = document.getElementById('pass-btn');
    }

    pipLayout(v, orient = 'horizontal') {
        const layouts = {
            0: [],
            1: [4],
            2: [2, 6],
            3: [2, 4, 6],
            4: [0, 2, 6, 8],
            5: [0, 2, 4, 6, 8],
            6: orient === 'vertical' ? [0, 2, 3, 5, 6, 8] : [0, 1, 2, 6, 7, 8],
        };
        return layouts[v] || [];
    }

    createTileEl(a, b, orient = 'horizontal', small = false, id = null) {
        const el = document.createElement('div');
        el.className = `tile ${orient}${small ? ' small' : ''}`;
        if (id) el.dataset.tileId = id;

        let halfIdx = 0;
        for (const v of [a, b]) {
            const half = document.createElement('div');
            half.className = 'tile-half';
            const pos = this.pipLayout(v, orient);
            for (let i = 0; i < 9; i++) {
                const p = document.createElement('div');
                p.className = pos.includes(i) ? 'pip' : 'pip hidden';
                half.appendChild(p);
            }
            el.appendChild(half);
            if (halfIdx === 0) {
                const d = document.createElement('div');
                d.className = 'tile-divider';
                el.appendChild(d);
            }
            halfIdx++;
        }
        return el;
    }

    renderOpponentHands(hands, hi, names, cur = -1) {
        document.getElementById('opp-top').innerHTML = '';
        document.getElementById('opp-left').innerHTML = '';
        document.getElementById('opp-right').innerHTML = '';
        document.getElementById('opp-top').classList.remove('active-turn');
        document.getElementById('opp-left').classList.remove('active-turn');
        document.getElementById('opp-right').classList.remove('active-turn');

        for (let i = 0; i < hands.length; i++) {
            if (i === hi) continue;
            const g = document.createElement('div');
            g.style.cssText = 'display:flex;align-items:center;gap:4px;';
            const l = document.createElement('span');
            l.className = 'opp-label';
            l.textContent = `${names[i]}:`;
            g.appendChild(l);
            for (let j = 0; j < hands[i].length; j++) {
                const t = document.createElement('div');
                t.className = 'opp-tile';
                g.appendChild(t);
            }

            if (hands.length === 4) {
                if (i === 1) {
                    g.style.flexDirection = 'column';
                    const cont = document.getElementById('opp-left');
                    cont.appendChild(g);
                    if (i === cur) cont.classList.add('active-turn');
                } else if (i === 2) {
                    const cont = document.getElementById('opp-top');
                    cont.appendChild(g);
                    if (i === cur) cont.classList.add('active-turn');
                } else if (i === 3) {
                    g.style.flexDirection = 'column';
                    const cont = document.getElementById('opp-right');
                    cont.appendChild(g);
                    if (i === cur) cont.classList.add('active-turn');
                }
            } else {
                g.style.margin = '0 10px';
                const cont = document.getElementById('opp-top');
                cont.appendChild(g);
                if (i === cur) cont.classList.add('active-turn');
            }
        }
    }

    renderBoneyard(count) {
        if (!this.boneyardVisual) return;
        this.boneyardVisual.innerHTML = '';
        if (!count) return;

        const stack = document.createElement('div');
        stack.className = 'boneyard-stack';
        for (let i = 0; i < Math.min(count, 4); i++) {
            const t = document.createElement('div');
            t.className = 'stack-tile';
            t.style.cssText = `top:${i * 2}px;left:${i}px;`;
            stack.appendChild(t);
        }
        const lbl = document.createElement('div');
        lbl.className = 'boneyard-count';
        lbl.textContent = count;
        this.boneyardVisual.appendChild(stack);
        this.boneyardVisual.appendChild(lbl);
    }

    renderBoard(board) {
        this.boardEl.innerHTML = '';
        const bc = document.getElementById('board-container');
        if (!board.nodes.length) {
            const ph = document.createElement('div');
            ph.style.cssText = 'color:var(--text-dim);font-size:0.85rem;text-align:center;padding:40px;width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
            ph.textContent = this.app.t('board-empty');
            this.boardEl.appendChild(ph);
            return;
        }

        let mnX = Infinity;
        let mxX = -Infinity;
        let mnY = Infinity;
        let mxY = -Infinity;

        for (const n of board.nodes) {
            const hw = (n.orientation === 'horizontal' ? 66 : 34) / 2;
            const hh = (n.orientation === 'horizontal' ? 34 : 66) / 2;
            mnX = Math.min(mnX, n.x - hw);
            mxX = Math.max(mxX, n.x + hw);
            mnY = Math.min(mnY, n.y - hh);
            mxY = Math.max(mxY, n.y + hh);
        }

        const pad = 20;
        const lw = (mxX - mnX) + pad * 2;
        const lh = (mxY - mnY) + pad * 2;
        const bcRect = bc.getBoundingClientRect();
        const sideReserve = 50;
        const vw = Math.max(bcRect.width - (board.nodes.length > 5 ? sideReserve * 2 : 0), 100);
        const vh = Math.max(bcRect.height - 20, 100);
        const scale = Math.min(vw / lw, vh / lh, 1.1);

        this._lastScale = scale;

        const container = document.createElement('div');
        container.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(${scale});transform-origin:center center;`;

        const ox = (mxX + mnX) / 2;
        const oy = (mxY + mnY) / 2;
        this._lastOx = ox;
        this._lastOy = oy;

        const last = board.nodes.length - 1;
        for (let i = 0; i < board.nodes.length; i++) {
            const n = board.nodes[i];
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `position:absolute;left:${n.x - ox}px;top:${n.y - oy}px;`;

            const el = this.createTileEl(n.displayA, n.displayB, n.orientation, false, n.tile.id);
            el.classList.add('board-tile');
            if (i === last && board.nodes.length > 1) el.classList.add('just-played');
            if (i === board.crossNodeId && board.crossSidesClosed >= 2) {
                el.classList.add('telephone-highlight');
            }

            wrapper.appendChild(el);
            container.appendChild(wrapper);
        }

        this.boardEl.appendChild(container);

        if (board.openEnds.length) {
            const info = document.createElement('div');
            info.style.cssText = 'position:absolute;bottom:4px;left:50%;transform:translateX(-50%);display:flex;gap:5px;font-size:0.68rem;color:var(--text-dim);z-index:5;';
            for (const oe of board.openEnds) {
                const c = document.createElement('span');
                c.style.cssText = 'background:rgba(240,192,64,0.15);border:1px solid rgba(240,192,64,0.3);border-radius:8px;padding:1px 6px;';
                c.textContent = oe.value;
                info.appendChild(c);
            }
            this.boardEl.style.position = 'relative';
            this.boardEl.appendChild(info);
        }
    }

    showArrowChoices(board, matchingEnds, onChoose, onCancel) {
        this.removeArrows();
        const gs = document.getElementById('game-screen');
        const arrowSymbols = { left: '←', right: '→', top: '↑', bottom: '↓' };
        const tapEvent = window.PointerEvent ? 'pointerup' : 'click';
        const overlay = document.createElement('div');
        overlay.id = 'arrow-overlay';
        overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:100;background:rgba(0,0,0,0.1);';

        overlay.addEventListener(tapEvent, (e) => {
            if (e.target === overlay) {
                this.removeArrows();
                onCancel();
            }
        });

        for (const ei of matchingEnds) {
            const oe = board.openEnds[ei];
            const node = board.nodes[oe.nodeId];
            const btn = document.createElement('button');
            btn.className = 'arrow-btn';
            btn.textContent = arrowSymbols[oe.side] || '?';
            btn.title = this.app.format('arrow-place-to', { value: oe.value });

            const boardEl = this.boardEl.querySelector('div');
            if (boardEl) {
                const rect = boardEl.getBoundingClientRect();
                const gsRect = gs.getBoundingClientRect();
                const cx = rect.left + rect.width / 2 - gsRect.left;
                const cy = rect.top + rect.height / 2 - gsRect.top;
                const scale = this._lastScale || 1;
                const px = cx + (node.x - this._lastOx) * scale;
                const py = cy + (node.y - this._lastOy) * scale;
                const offset = 45 * scale;
                let ax = px;
                let ay = py;
                if (oe.side === 'right') ax += offset;
                else if (oe.side === 'left') ax -= offset;
                else if (oe.side === 'top') ay -= offset;
                else ay += offset;
                btn.style.cssText += `position:absolute;left:${ax}px;top:${ay}px;transform:translate(-50%,-50%);`;
            }

            btn.addEventListener(tapEvent, (e) => {
                e.stopPropagation();
                this.removeArrows();
                onChoose(ei);
            });
            overlay.appendChild(btn);
        }
        gs.appendChild(overlay);
    }

    removeArrows() {
        const ov = document.getElementById('arrow-overlay');
        if (ov) ov.remove();
    }

    renderHand(hand, validMoves = [], sel = -1, isCurrent = false) {
        this.handEl.innerHTML = '';
        if (isCurrent) this.handEl.parentElement.classList.add('active-turn');
        else this.handEl.parentElement.classList.remove('active-turn');

        for (let i = 0; i < hand.length; i++) {
            const t = hand[i];
            const el = this.createTileEl(t.a, t.b, 'vertical', false, t.id);
            if (validMoves.some(m => m.tileIndex === i)) {
                el.classList.add('playable');
                el.dataset.handIndex = i;
            }
            if (i === sel) el.classList.add('selected');
            this.handEl.appendChild(el);
        }
    }

    renderScores(players, cur) {
        this.scoresEl.innerHTML = '';
        for (const p of players) {
            const it = document.createElement('div');
            it.className = 'score-item';
            if (p.index === cur) it.classList.add('current-player');
            const teamTag = p.team ? `<span style="font-size:0.6rem;color:var(--text-dim)">[${p.team}]</span> ` : '';
            it.innerHTML = `${teamTag}<span class="score-name">${p.name}:</span> <span class="score-value">${p.score}</span><span class="score-wins"> ${p.roundWins}</span>`;
            this.scoresEl.appendChild(it);
        }
    }

    renderInfo(mr, deal, by, sum, stakeLabel = '') {
        const rText = this.app.t('label-round-short');
        const sText = this.app.t('label-deal-short');
        this.roundInfoEl.textContent = `${rText}${mr}/3 · ${sText}${deal}`;
        if (!this.stakeInfoEl) this.stakeInfoEl = document.getElementById('stake-info');
        if (this.stakeInfoEl) {
            this.stakeInfoEl.textContent = stakeLabel ? `${this.app.t('label-stake-short')}: ${stakeLabel}` : '';
            this.stakeInfoEl.classList.toggle('is-hidden', !stakeLabel);
        }
        this.boneyardInfoEl.textContent = `${this.app.t('label-boneyard-short')}: ${sum}`;
        this.renderBoneyard(by);
    }

    showGoshaBtn(combo, onGoshaClick) {
        let btn = document.getElementById('gosha-btn');
        if (!combo) {
            if (btn) btn.remove();
            return;
        }
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'gosha-btn';
            btn.className = 'btn btn-gosha';
            document.querySelector('.action-bar').appendChild(btn);
        }
        btn.textContent = this.app.format('gosha-button', { count: combo.matches.length, score: combo.score });
        btn.onclick = () => {
            if (onGoshaClick) onGoshaClick();
        };
    }

    showMessage(t, dur = 0) {
        this.messageEl.textContent = t;
        if (dur > 0) {
            setTimeout(() => {
                if (this.messageEl.textContent === t) this.messageEl.textContent = '';
            }, dur);
        }
    }

    clearMessage() {
        this.messageEl.textContent = '';
    }

    showScorePopup(pts) {
        const p = document.createElement('div');
        p.className = 'score-pop';
        p.textContent = `+${pts}`;
        p.style.cssText = 'left:50%;top:35%;';
        document.getElementById('game-screen').appendChild(p);
        setTimeout(() => p.remove(), 1500);
    }

    setDrawEnabled(e) {
        this.drawBtn.disabled = !e;
    }

    setPassEnabled(e) {
        this.passBtn.disabled = !e;
    }

    renderDealEnd(wn, players, fish, bonus) {
        document.getElementById('round-end-title').textContent = fish ? this.app.t('msg-fish') : `${wn} ${this.app.t('out-suffix')}`;
        const d = document.getElementById('round-end-details');
        d.innerHTML = '';

        for (const p of players) {
            const r = document.createElement('div');
            r.className = 'detail-row';
            r.style.flexDirection = 'column';
            r.style.alignItems = 'flex-start';
            r.style.gap = '6px';

            const top = document.createElement('div');
            top.style.display = 'flex';
            top.style.justifyContent = 'space-between';
            top.style.width = '100%';
            let v = `${this.app.t('label-hand-points')}: ${p.handPoints}`;
            if (p.isWinner) v += ` · ${this.app.t('label-bonus')}: +${bonus}`;
            v += ` · ${this.app.t('label-total')}: ${p.score}`;
            top.innerHTML = `<span>${p.name}</span><span class="detail-value">${v}</span>`;
            r.appendChild(top);

            if (p.leftoverHands) {
                const handsDiv = document.createElement('div');
                handsDiv.style.display = 'flex';
                handsDiv.style.flexWrap = 'wrap';
                handsDiv.style.gap = '4px';
                for (const h of p.leftoverHands) {
                    for (const t of h) {
                        const tel = this.createTileEl(t.a, t.b, 'vertical', true);
                        handsDiv.appendChild(tel);
                    }
                }
                if (handsDiv.children.length > 0) r.appendChild(handsDiv);
            }
            d.appendChild(r);
        }

        document.getElementById('next-round-btn').textContent = this.app.t('next-deal');
        document.getElementById('round-end-screen').classList.add('active');
    }

    renderRoundEnd(wn, players, wins, mr, over) {
        document.getElementById('round-end-title').textContent = wins >= 2 ? `${wn} ×2!` : `${wn} ${this.app.t('label-rounds').toLowerCase()}!`;
        const d = document.getElementById('round-end-details');
        d.innerHTML = '';

        for (const p of players) {
            const r = document.createElement('div');
            r.className = 'detail-row';
            let v = `${this.app.t('label-score')}: ${p.score} · ${this.app.t('label-rounds')}: ${p.roundWins}`;
            if (p.isWinner) v += ` (+${wins})`;
            r.innerHTML = `<span>${p.name}</span><span class="detail-value">${v}</span>`;
            d.appendChild(r);
        }

        document.getElementById('next-round-btn').textContent = over ? this.app.t('summary-title') : this.app.t('next-round');
        document.getElementById('round-end-screen').classList.add('active');
    }

    showInstantWin(pn, s) {
        document.getElementById('round-end-title').textContent = this.app.format('instant-win-title', { player: pn, score: s });
        document.getElementById('round-end-details').innerHTML = `<div class="detail-row"><span>${this.app.t('instant-win-body')}</span></div>`;
        document.getElementById('next-round-btn').textContent = this.app.t('summary-title');
        document.getElementById('round-end-screen').classList.add('active');
    }

    renderGameOver(wn, players, economySummary = null) {
        document.getElementById('game-over-title').textContent = `${wn} ${this.app.t('won-suffix')}`;
        const d = document.getElementById('game-over-details');
        d.innerHTML = '';
        if (economySummary) {
            const summary = document.createElement('div');
            summary.className = 'detail-row';
            const spent = Math.max(0, Number(economySummary.spent || 0));
            const won = Math.max(0, Number(economySummary.won || 0));
            const net = won - spent;
            summary.innerHTML = `<span>Coins</span><span class="detail-value">Won: ${won} · Lost: ${spent} · Net: ${net >= 0 ? '+' : ''}${net}</span>`;
            d.appendChild(summary);
        }
        for (const p of [...players].sort((a, b) => b.roundWins - a.roundWins)) {
            const r = document.createElement('div');
            r.className = 'detail-row';
            r.innerHTML = `<span>${p.name}</span><span class="detail-value">${p.roundWins} ${this.app.t('label-rounds').toLowerCase()}</span>`;
            d.appendChild(r);
        }
        document.getElementById('game-over-screen').classList.add('active');
    }
}
