import { KonvaBoardRenderer } from './konvaBoardRenderer.js';

const gsap = window.gsap;
const ARROW_BUTTON_SIZE = 38;
const ARROW_BUTTON_SIZE_SMALL = 36;
const ARROW_BUTTON_GAP = 10;

function isKonvaBoardEnabled() {
    try {
        const url = new URL(window.location.href);
        const queryFlag = url.searchParams.get('konvaBoard');

        if (queryFlag === '1') {
            window.localStorage?.setItem('dominoKonvaBoard', 'true');
            return true;
        }

        if (queryFlag === '0') {
            window.localStorage?.setItem('dominoKonvaBoard', 'false');
            return false;
        }

        const stored = window.localStorage?.getItem('dominoKonvaBoard');
        if (stored === 'false') return false;
        if (stored === 'true') return true;

        if (window.DOMINO_KONVA_BOARD_ENABLED === false) return false;
        return true;
    } catch {
        return true;
    }
}

export class Renderer {
    constructor(app) {
        this.app = app;
        this.boardEl = document.getElementById('board');
        this.boardContainerEl = document.getElementById('board-container');
        this.handEl = document.getElementById('player-hand');
        this.scoresEl = document.getElementById('scores-bar');
        this.messageEl = document.getElementById('message-area');
        this.roundInfoEl = document.getElementById('round-info');
        this.stakeInfoEl = document.getElementById('stake-info');
        this.boneyardInfoEl = document.getElementById('boneyard-info');
        this.boneyardVisual = document.getElementById('boneyard-visual');
        this.roundStageBannerEl = document.getElementById('round-stage-banner');
        this.drawBtn = document.getElementById('draw-btn');
        this.passBtn = document.getElementById('pass-btn');
        this._pendingBoardTileTravel = null;
        this._activeTileTravel = null;
        this._animatedBoardTileIds = new Set();
        this._lastAnimatedBoardTileId = null;
        this._timeoutForfeitCountdownTimer = null;
        this._konvaBoardRenderer = null;
        this._konvaBoardDisabled = false;
        this._konvaBoardMounted = false;
    }

    renderRoundStage(stage = {}) {
        if (!this.roundStageBannerEl) {
            this.roundStageBannerEl = document.getElementById('round-stage-banner');
        }
        if (!this.roundStageBannerEl) return;

        const phase = stage.phase || '';
        const title = stage.title || '';
        const subtitle = stage.subtitle || '';
        const tile = stage.tile;

        this.roundStageBannerEl.className = 'round-stage-overlay';
        if (phase) {
            this.roundStageBannerEl.classList.add(`stage-${phase}`);
        }

        const titleEl = this.roundStageBannerEl.querySelector('.stage-title');
        const subtitleEl = this.roundStageBannerEl.querySelector('.stage-subtitle');
        const graphicEl = this.roundStageBannerEl.querySelector('.stage-tile-graphic');

        if (titleEl) titleEl.textContent = title;
        if (subtitleEl) subtitleEl.textContent = subtitle;

        if (graphicEl) {
            graphicEl.innerHTML = '';
            graphicEl.style.display = 'none';

            if (tile) {
                graphicEl.style.display = '';
                const tileNode = this.createTileEl(tile.a, tile.b, tile.a === tile.b ? 'vertical' : 'horizontal', false, tile.id);
                tileNode.classList.add('domino-tile-stage');
                graphicEl.appendChild(tileNode);
            }
        }

        this.roundStageBannerEl.style.display = 'flex';
        this.roundStageBannerEl.classList.add('visible');

        // Also sync the input-locked class on hand container
        const handContainer = this.handEl?.parentElement || document.querySelector('.hand-container');
        if (handContainer) {
            if (stage.blocksInput || phase === 'final-move' || phase === 'counting') {
                handContainer.classList.add('input-locked');
            } else {
                handContainer.classList.remove('input-locked');
            }
        }
    }

    clearRoundStage() {
        if (!this.roundStageBannerEl) {
            this.roundStageBannerEl = document.getElementById('round-stage-banner');
        }
        if (this.roundStageBannerEl) {
            this.roundStageBannerEl.classList.remove('visible');
            setTimeout(() => {
                if (!this.roundStageBannerEl.classList.contains('visible')) {
                    this.roundStageBannerEl.style.display = 'none';
                }
            }, 300);
        }

        const handContainer = this.handEl?.parentElement || document.querySelector('.hand-container');
        if (handContainer) {
            handContainer.classList.remove('input-locked');
        }
    }

    setTableSkin(assetUrl) {
        const skinValue = assetUrl ? `url("${assetUrl}")` : 'none';
        const target = document.getElementById('game-screen') || document.documentElement;
        target.style.setProperty('--table-skin-image', skinValue);
        if (assetUrl) {
            target.style.setProperty('--table-skin-overlay', 'radial-gradient(circle, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.65) 100%)');
        } else {
            target.style.setProperty('--table-skin-overlay', 'linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0))');
        }
        if (window.DOMINO_DEBUG_RENDERER === true) {
            console.debug('[Renderer] setTableSkin', {
                assetUrl,
                skinValue: target.style.getPropertyValue('--table-skin-image')
            });
        }
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

    getBankIconMarkup() {
        return `
            <span class="stake-info-bank-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M12 2 3 6v2h18V6l-9-4Zm-7 8v8h2v-8H5Zm4 0v8h2v-8H9Zm4 0v8h2v-8h-2Zm4 0v8h2v-8h-2ZM3 20v2h18v-2H3Z"/>
                </svg>
            </span>`;
    }

    renderOpponentHands(hands, hi, playersOrNames, cur = -1) {
        document.getElementById('opp-top').innerHTML = '';
        document.getElementById('opp-left').innerHTML = '';
        document.getElementById('opp-right').innerHTML = '';
        document.getElementById('opp-top').classList.remove('active-turn');
        document.getElementById('opp-left').classList.remove('active-turn');
        document.getElementById('opp-right').classList.remove('active-turn');

        for (let i = 0; i < hands.length; i++) {
            if (i === hi) continue;
            const playerRef = Array.isArray(playersOrNames) ? (playersOrNames[i] || {}) : {};
            const fallbackName = this.app?.playerNames?.[i] || `Player ${i + 1}`;
            const rawLabelText = typeof playerRef === 'string'
                ? playerRef
                : (playerRef?.name || playerRef?.displayName || fallbackName);
            const labelText = this.app?.getFirstNameDisplayName
                ? this.app.getFirstNameDisplayName(rawLabelText, fallbackName)
                : rawLabelText;
            const playerId = typeof playerRef === 'object'
                ? String(playerRef?.playerId || playerRef?.userId || playerRef?.id || '')
                : '';
            const isBot = Boolean(playerRef?.isBot);
            const g = document.createElement('div');
            g.className = 'opp-hand-group';
            g.style.cssText = 'display:flex;align-items:center;gap:4px;pointer-events:auto;position:relative;z-index:3;';
            const l = document.createElement(playerId && !isBot ? 'button' : 'span');
            l.className = playerId && !isBot ? 'opp-label opp-label-button' : 'opp-label';
            l.textContent = labelText;
            l.title = l.textContent;
            if (playerId && !isBot) {
                l.type = 'button';
                l.style.cssText = 'pointer-events:auto;position:relative;z-index:4;cursor:pointer;';
                l.addEventListener('click', () => {
                    this.app.openPlayerProfileModal({ id: playerId, displayName: labelText, playerId });
                });
            }
            g.appendChild(l);
            const pile = document.createElement('div');
            pile.className = 'opp-tile-pile';
            for (let j = 0; j < (hands[i] || []).length; j++) {
                const t = document.createElement('div');
                t.className = 'opp-tile';
                pile.appendChild(t);
            }
            g.appendChild(pile);

            if (this.app?.isBotTakeoverSeat?.(playerRef)) {
                const takeoverBadge = document.createElement('span');
                takeoverBadge.className = 'opp-bot-badge';
                takeoverBadge.textContent = this.app?.t?.('bot-takeover-playing') || 'bot is playing';
                g.appendChild(takeoverBadge);
            }

            if (hands.length === 4) {
                const relativeSeat = (i - hi + hands.length) % hands.length;
                if (relativeSeat === 1) {
                    g.classList.add('side-seat');
                    pile.classList.add('vertical-pile');
                    const cont = document.getElementById('opp-left');
                    cont.appendChild(g);
                    if (i === cur) cont.classList.add('active-turn');
                } else if (relativeSeat === 2) {
                    const cont = document.getElementById('opp-top');
                    cont.appendChild(g);
                    if (i === cur) cont.classList.add('active-turn');
                } else if (relativeSeat === 3) {
                    g.classList.add('side-seat');
                    pile.classList.add('vertical-pile');
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

    getBoardOpenEndChoiceRect(openEnd) {
        if (!openEnd) return null;
        if (this.shouldUseKonvaBoard()) {
            return this._konvaBoardRenderer?.getOpenEndChoiceRect?.(openEnd)
                || this._konvaBoardRenderer?.getOpenEndAnchorRect?.(openEnd)
                || null;
        }
        const wrapper = this.boardEl.querySelector(`.board-layout [data-node-id="${openEnd.nodeId}"]`);
        const rect = wrapper?.getBoundingClientRect?.() || null;
        if (!rect) return null;
        const side = String(openEnd.side || '').trim();
        const offset = Math.max(12, Math.min(26, Math.max(rect.width, rect.height) * 0.38));
        const result = {
            left: rect.left,
            top: rect.top,
            width: 18,
            height: 18
        };
        if (side === 'left') {
            result.left = rect.left - offset;
            result.top = rect.top + rect.height / 2 - 9;
        } else if (side === 'right') {
            result.left = rect.right + offset - 18;
            result.top = rect.top + rect.height / 2 - 9;
        } else if (side === 'top') {
            result.left = rect.left + rect.width / 2 - 9;
            result.top = rect.top - offset;
        } else {
            result.left = rect.left + rect.width / 2 - 9;
            result.top = rect.bottom + offset - 18;
        }
        result.right = result.left + result.width;
        result.bottom = result.top + result.height;
        result.centerX = result.left + result.width / 2;
        result.centerY = result.top + result.height / 2;
        return result;
    }

    getArrowButtonSize() {
        return window.matchMedia?.('(max-width: 390px)')?.matches ? ARROW_BUTTON_SIZE_SMALL : ARROW_BUTTON_SIZE;
    }

    getBoardOpenEndChoicePoint(openEnd, options = {}) {
        if (!openEnd) return null;
        if (this.shouldUseKonvaBoard()) {
            return this._konvaBoardRenderer?.getOpenEndChoicePoint?.(openEnd, options) || null;
        }
        const rect = this.getBoardOpenEndChoiceRect(openEnd);
        if (!rect) return null;
        const buttonSize = Math.max(32, Number(options.buttonSize || this.getArrowButtonSize()));
        const radius = buttonSize / 2;
        const gap = Math.max(6, Number(options.gap || ARROW_BUTTON_GAP));
        const side = String(openEnd.side || '').trim();
        let x = rect.left + rect.width / 2;
        let y = rect.top + rect.height / 2;
        if (side === 'left') {
            x = rect.left - radius - gap;
        } else if (side === 'right') {
            x = rect.right + radius + gap;
        } else if (side === 'top') {
            x = rect.left + rect.width / 2;
            y = rect.top - radius - gap;
        } else {
            x = rect.left + rect.width / 2;
            y = rect.bottom + radius + gap;
        }
        return {
            x,
            y,
            buttonSize,
            radius,
            side,
            rect,
            nodeId: openEnd.nodeId
        };
    }

    collectBoardTileRects() {
        if (this.shouldUseKonvaBoard()) {
            return Array.from(this._konvaBoardRenderer?.getBoardTileRects?.() || []);
        }
        return Array.from(this.boardEl.querySelectorAll('.board-layout [data-tile-id]'))
            .map((el) => el.getBoundingClientRect?.())
            .filter(Boolean);
    }

    rectIntersectsRect(a, b) {
        return Boolean(a && b
            && a.left < b.right
            && a.right > b.left
            && a.top < b.bottom
            && a.bottom > b.top);
    }

    isSameRectApprox(a, b, epsilon = 2) {
        if (!a || !b) return false;
        const acx = Number(a.centerX ?? (Number(a.left || 0) + Number(a.width || 0) / 2));
        const acy = Number(a.centerY ?? (Number(a.top || 0) + Number(a.height || 0) / 2));
        const bcx = Number(b.centerX ?? (Number(b.left || 0) + Number(b.width || 0) / 2));
        const bcy = Number(b.centerY ?? (Number(b.top || 0) + Number(b.height || 0) / 2));
        return Math.abs(acx - bcx) <= epsilon && Math.abs(acy - bcy) <= epsilon;
    }

    filterArrowCollisionRects(tileRects, sourceRect = null) {
        const rects = Array.isArray(tileRects) ? tileRects.filter(Boolean) : [];
        if (!sourceRect) return rects;
        return rects.filter((rect) => !this.isSameRectApprox(rect, sourceRect));
    }

    countArrowCollisions(point, buttonSize, tileRects = []) {
        const radius = buttonSize / 2;
        const arrowRect = {
            left: point.x - radius,
            top: point.y - radius,
            right: point.x + radius,
            bottom: point.y + radius
        };
        return (Array.isArray(tileRects) ? tileRects : []).reduce((count, rect) => count + (this.rectIntersectsRect(arrowRect, rect) ? 1 : 0), 0);
    }

    getArrowViewportBounds(buttonSize) {
        const radius = buttonSize / 2;
        const gameRect = document.getElementById('game-screen')?.getBoundingClientRect?.() || null;
        const minX = gameRect ? gameRect.left + radius + 8 : radius + 8;
        const maxX = gameRect ? gameRect.right - radius - 8 : window.innerWidth - radius - 8;
        const minY = gameRect ? gameRect.top + radius + 8 : radius + 8;
        const maxY = gameRect ? gameRect.bottom - radius - 8 : window.innerHeight - radius - 8;
        return {
            minX,
            maxX: Math.max(minX, maxX),
            minY,
            maxY: Math.max(minY, maxY)
        };
    }

    clampArrowPointToBounds(point, bounds) {
        return {
            x: Math.min(Math.max(point.x, bounds.minX), bounds.maxX),
            y: Math.min(Math.max(point.y, bounds.minY), bounds.maxY)
        };
    }

    scoreArrowCandidate(candidate, rawPoint, buttonSize, tileRects = [], side = '', bounds = null) {
        const safeBounds = bounds || this.getArrowViewportBounds(buttonSize);
        const clamped = this.clampArrowPointToBounds(candidate, safeBounds);
        const collisions = this.countArrowCollisions(clamped, buttonSize, tileRects);
        const horizontalSide = side === 'left' || side === 'right';
        const normalDelta = horizontalSide ? Math.abs(clamped.x - rawPoint.x) : Math.abs(clamped.y - rawPoint.y);
        const perpendicularDelta = horizontalSide ? Math.abs(clamped.y - rawPoint.y) : Math.abs(clamped.x - rawPoint.x);
        const outOfBoundsPenalty = (candidate.x !== clamped.x || candidate.y !== clamped.y) ? 250 : 0;
        return {
            point: clamped,
            collisions,
            score: (collisions * 1000) + (perpendicularDelta * 20) + (normalDelta * 2) + outOfBoundsPenalty,
            normalDelta,
            perpendicularDelta,
            outOfBoundsPenalty
        };
    }

    adjustArrowPointForCollision(point, buttonSize, tileRects = [], side = '') {
        const rawPoint = {
            x: Number(point?.x || 0),
            y: Number(point?.y || 0)
        };
        const rawRect = point?.rect || null;
        const sourceRect = rawRect ? {
            left: Number(rawRect.left || 0),
            top: Number(rawRect.top || 0),
            right: Number(rawRect.right ?? (Number(rawRect.left || 0) + Number(rawRect.width || 0))),
            bottom: Number(rawRect.bottom ?? (Number(rawRect.top || 0) + Number(rawRect.height || 0))),
            width: Number(rawRect.width || Math.max(0, Number(rawRect.right || 0) - Number(rawRect.left || 0))),
            height: Number(rawRect.height || Math.max(0, Number(rawRect.bottom || 0) - Number(rawRect.top || 0))),
            centerX: Number(rawRect.centerX ?? (Number(rawRect.left || 0) + Number(rawRect.width || 0) / 2)),
            centerY: Number(rawRect.centerY ?? (Number(rawRect.top || 0) + Number(rawRect.height || 0) / 2))
        } : null;
        const relevantTileRects = this.filterArrowCollisionRects(tileRects, sourceRect);
        const bounds = this.getArrowViewportBounds(buttonSize);
        const verticalSide = side === 'top' || side === 'bottom';
        const normalSign = side === 'left' || side === 'top' ? -1 : 1;
        const normalSteps = [0, 8, 16, 24, 32, 40, 52];
        const emergencySteps = [-10, 10, -20, 20];
        const rawClamped = this.clampArrowPointToBounds(rawPoint, bounds);
        const rawCollisions = this.countArrowCollisions(rawClamped, buttonSize, relevantTileRects);
        if (rawCollisions === 0 && rawClamped.x === rawPoint.x && rawClamped.y === rawPoint.y) {
            if (window.DOMINO_DEBUG_BOARD_RENDERER === true) {
                console.debug('[ArrowChoiceCoords]', {
                    side,
                    rawPoint,
                    adjustedPoint: rawClamped,
                    sourceRect,
                    relevantTileRectsCount: relevantTileRects.length,
                    rawCollisions,
                    finalCollisions: rawCollisions,
                    usedEmergencyPerpendicular: false,
                    coordinateSpace: 'viewport'
                });
            }
            return rawClamped;
        }

        const clampNormalOnly = (candidate) => {
            const clamped = { x: candidate.x, y: candidate.y };
            if (verticalSide) {
                clamped.y = Math.min(Math.max(clamped.y, bounds.minY), bounds.maxY);
            } else {
                clamped.x = Math.min(Math.max(clamped.x, bounds.minX), bounds.maxX);
            }
            return clamped;
        };

        const tryNormalAxis = () => {
            for (const normalStep of normalSteps) {
                const candidate = verticalSide
                    ? { x: rawPoint.x, y: rawPoint.y + (normalStep * normalSign) }
                    : { x: rawPoint.x + (normalStep * normalSign), y: rawPoint.y };
                const clamped = clampNormalOnly(candidate);
                const collisions = this.countArrowCollisions(clamped, buttonSize, relevantTileRects);
                const axisStable = verticalSide
                    ? Math.abs(clamped.x - rawPoint.x) <= 1
                    : Math.abs(clamped.y - rawPoint.y) <= 1;
                if (collisions === 0 && axisStable) {
                    return clamped;
                }
            }
            return null;
        };

        const normalAxisPoint = tryNormalAxis();
        if (normalAxisPoint) {
            if (window.DOMINO_DEBUG_BOARD_RENDERER === true) {
                console.debug('[ArrowChoiceCoords]', {
                    side,
                    rawPoint,
                    adjustedPoint: normalAxisPoint,
                    sourceRect,
                    relevantTileRectsCount: relevantTileRects.length,
                    rawCollisions,
                    finalCollisions: this.countArrowCollisions(normalAxisPoint, buttonSize, relevantTileRects),
                    usedEmergencyPerpendicular: false,
                    coordinateSpace: 'viewport'
                });
            }
            return normalAxisPoint;
        }

        let best = null;
        let usedEmergencyPerpendicular = true;
        for (const perpendicularStep of emergencySteps) {
            for (const normalStep of normalSteps) {
                const candidate = verticalSide
                    ? { x: rawPoint.x + perpendicularStep, y: rawPoint.y + (normalStep * normalSign) }
                    : { x: rawPoint.x + (normalStep * normalSign), y: rawPoint.y + perpendicularStep };
                const scored = this.scoreArrowCandidate(candidate, rawPoint, buttonSize, relevantTileRects, side, bounds);
                if (!best || scored.score < best.score) {
                    best = scored;
                }
            }
        }

        const adjustedPoint = best?.point || rawClamped;
        if (window.DOMINO_DEBUG_BOARD_RENDERER === true) {
            console.debug('[ArrowChoiceCoords]', {
                side,
                rawPoint,
                adjustedPoint,
                sourceRect,
                relevantTileRectsCount: relevantTileRects.length,
                rawCollisions,
                finalCollisions: this.countArrowCollisions(adjustedPoint, buttonSize, relevantTileRects),
                usedEmergencyPerpendicular,
                coordinateSpace: 'viewport'
            });
        }
        return adjustedPoint;
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

    shouldUseKonvaBoard() {
        return !this._konvaBoardDisabled && isKonvaBoardEnabled() && Boolean(window.Konva);
    }

    ensureKonvaBoardRenderer() {
        if (!this.shouldUseKonvaBoard()) {
            return null;
        }
        if (!this._konvaBoardRenderer) {
            this._konvaBoardRenderer = new KonvaBoardRenderer({
                app: this.app,
                containerEl: this.boardEl,
                boardEl: this.boardEl,
                debug: Boolean(window.DOMINO_DEBUG_BOARD_RENDERER)
            });
        }
        if (!this._konvaBoardMounted) {
            this._konvaBoardRenderer.mount(this.boardEl);
            this._konvaBoardMounted = true;
        }
        return this._konvaBoardRenderer;
    }

    disableKonvaBoardForSession(error) {
        if (this._konvaBoardDisabled) return;
        this._konvaBoardDisabled = true;
        this._konvaBoardMounted = false;
        try {
            this._konvaBoardRenderer?.destroy?.();
        } catch {}
        this._konvaBoardRenderer = null;
        console.warn('[KonvaBoard] Falling back to DOM renderer', error);
    }

    getBoardTileElement(tileId) {
        if (this.shouldUseKonvaBoard()) {
            return this.boardEl.querySelector(`[data-tile-id="${String(tileId)}"]`);
        }
        return this.boardEl.querySelector(`[data-tile-id="${String(tileId)}"]`);
    }

    getBoardOpenEndRect(openEnd) {
        if (this.shouldUseKonvaBoard()) {
            return this._konvaBoardRenderer?.getOpenEndAnchorRect?.(openEnd) || null;
        }
        const wrapper = this.boardEl.querySelector(`.board-layout [data-node-id="${openEnd.nodeId}"]`);
        return wrapper?.getBoundingClientRect?.() || null;
    }

    renderBoard(board) {
        if (this.shouldUseKonvaBoard()) {
            try {
                const renderer = this.ensureKonvaBoardRenderer();
                if (renderer) {
                    renderer.render(board, {
                        pendingTravel: this._pendingBoardTileTravel,
                        animatedBoardTileIds: this._animatedBoardTileIds,
                        lastAnimatedBoardTileId: this._lastAnimatedBoardTileId
                    });
                    this._lastScale = renderer.lastLayout?.scale || this._lastScale;
                    this._lastOx = renderer.lastLayout?.bounds?.originX ?? this._lastOx;
                    this._lastOy = renderer.lastLayout?.bounds?.originY ?? this._lastOy;
                    return;
                }
            } catch (error) {
                this.disableKonvaBoardForSession(error);
            }
        }
        this.renderBoardDom(board);
    }

    renderBoardDom(board) {
        const bc = document.getElementById('board-container');
        if (!board.nodes.length) {
            this.cancelActiveTileTravel();
            this._lastAnimatedBoardTileId = null;
            this._pendingBoardTileTravel = null;
            this._animatedBoardTileIds.clear();
            this.boardEl.innerHTML = '';
            const ph = document.createElement('div');
            ph.className = 'board-empty-placeholder';
            ph.style.cssText = 'color:var(--text-dim);font-size:0.85rem;text-align:center;padding:40px;width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
            ph.textContent = this.app.t('board-empty');
            this.boardEl.appendChild(ph);
            return;
        }

        this.boardEl.querySelector('.board-empty-placeholder')?.remove();

        let container = this.boardEl.querySelector('.board-layout');
        if (!container) {
            container = document.createElement('div');
            container.className = 'board-layout';
            this.boardEl.appendChild(container);
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
        container.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(${scale});transform-origin:center center;`;

        const ox = (mxX + mnX) / 2;
        const oy = (mxY + mnY) / 2;
        this._lastOx = ox;
        this._lastOy = oy;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        const useGsap = !!gsap && !reduceMotion;
        const pendingTravel = this._pendingBoardTileTravel;

        const existingWrappers = new Map();
        for (const wrapper of container.children) {
            const tileId = wrapper.querySelector('[data-tile-id]')?.dataset.tileId;
            if (tileId) {
                existingWrappers.set(tileId, wrapper);
            }
        }

        const last = board.nodes.length - 1;
        for (let i = 0; i < board.nodes.length; i++) {
            const n = board.nodes[i];
            const tileId = String(n.tile.id);
            let wrapper = existingWrappers.get(tileId);
            
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.dataset.nodeId = String(i);
                wrapper.style.cssText = `position:absolute;left:${n.x - ox}px;top:${n.y - oy}px;`;
                
                const el = this.createTileEl(n.displayA, n.displayB, n.orientation, false, n.tile.id);
                el.classList.add('board-tile');
                
                const alreadyAnimated = this._animatedBoardTileIds.has(n.tile.id);
                if (pendingTravel?.tileId === n.tile.id) {
                    el.style.visibility = 'hidden';
                } else if (i === last && board.nodes.length > 1 && !alreadyAnimated) {
                    if (useGsap && this._lastAnimatedBoardTileId !== n.tile.id) {
                        this.animateBoardTileEntry(wrapper);
                        this._lastAnimatedBoardTileId = n.tile.id;
                    } else {
                        el.classList.add('just-played');
                    }
                    this._animatedBoardTileIds.add(n.tile.id);
                }
                
                if (i === board.crossNodeId && board.crossSidesClosed >= 2) {
                    el.classList.add('telephone-highlight');
                }
                wrapper.appendChild(el);
                container.appendChild(wrapper);
            } else {
                wrapper.style.cssText = `position:absolute;left:${n.x - ox}px;top:${n.y - oy}px;`;
                wrapper.dataset.nodeId = String(i);
                const el = wrapper.querySelector('.board-tile');
                if (el) {
                    el.className = `tile ${n.orientation} board-tile`;
                    if (i === board.crossNodeId && board.crossSidesClosed >= 2) {
                        el.classList.add('telephone-highlight');
                    }
                }
            }
        }

        for (const [tileId, wrapper] of existingWrappers) {
            if (!board.nodes.some(n => String(n.tile.id) === tileId)) {
                wrapper.remove();
            }
        }

        let info = this.boardEl.querySelector('.board-open-ends-info');
        if (board.openEnds.length) {
            if (!info) {
                info = document.createElement('div');
                info.className = 'board-open-ends-info';
                info.style.cssText = 'position:absolute;bottom:4px;left:50%;transform:translateX(-50%);display:flex;gap:5px;font-size:0.68rem;color:var(--text-dim);z-index:5;';
                this.boardEl.style.position = 'relative';
                this.boardEl.appendChild(info);
            }
            info.innerHTML = '';
            for (const oe of board.openEnds) {
                const c = document.createElement('span');
                c.style.cssText = 'background:rgba(240,192,64,0.15);border:1px solid rgba(240,192,64,0.3);border-radius:8px;padding:1px 6px;';
                c.textContent = oe.value;
                info.appendChild(c);
            }
        } else if (info) {
            info.remove();
        }
    }

    animateBoardTileEntry(wrapper) {
        if (!wrapper) return;

        gsap.fromTo(
            wrapper,
            { opacity: 0, scale: 0.45, y: -10 },
            {
                opacity: 1,
                scale: 1,
                y: 0,
                duration: 0.42,
                ease: 'back.out(1.9)',
                clearProps: 'transform,opacity'
            }
        );
    }

    animateTileTravel(tileId) {
        const pending = this._pendingBoardTileTravel;
        if (!pending || pending.tileId !== tileId) return Promise.resolve();

        if (this.shouldUseKonvaBoard()) {
            this._pendingBoardTileTravel = null;
            const konvaRenderer = this._konvaBoardRenderer;
            if (konvaRenderer?.animateTileTravel) {
                return konvaRenderer.animateTileTravel(tileId, pending.sourceRect, pending.sourceNode);
            }
            this.revealBoardTile(tileId);
            return Promise.resolve();
        }

        this._pendingBoardTileTravel = null;
        const { sourceRect, sourceNode } = pending;

        const targetEl = this.getBoardTileElement(tileId);
        if (!targetEl || !sourceRect) {
            this.revealBoardTile(tileId);
            return Promise.resolve();
        }

        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (reduceMotion || !gsap) {
            this.revealBoardTile(tileId);
            return Promise.resolve();
        }

        this.cancelActiveTileTravel();

        const travelLayer = document.getElementById('game-screen') || document.body;
        const targetRect = targetEl.getBoundingClientRect();
        const clone = this.createTravelClone(sourceNode || targetEl);
        const isFinalMoveTile = String(this.app?._lastFinalMoveTileId || '') === String(tileId || '')
            && Boolean(this.app?._lastFinalMoveVisualSource);
        const sourceCenterX = sourceRect.left + sourceRect.width / 2;
        const sourceCenterY = sourceRect.top + sourceRect.height / 2;
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;
        const endX = targetCenterX - sourceCenterX;
        const endY = targetCenterY - sourceCenterY;
        const distance = Math.hypot(endX, endY);
        const lift = Math.min(18, Math.max(6, distance * 0.035));
        const travelTilt = Math.max(-3, Math.min(3, -endX / 140));
        const targetRotation = targetEl.classList.contains('horizontal') && clone.classList.contains('vertical') ? 90 : 0;
        const duration = Math.min(0.42, Math.max(0.3, distance / 1050));

        clone.style.cssText = [
            'position:fixed',
            `left:${sourceRect.left}px`,
            `top:${sourceRect.top}px`,
            'margin:0',
            `width:${sourceRect.width}px`,
            `height:${sourceRect.height}px`,
            'z-index:220',
            'pointer-events:none',
            'transform-origin:center center',
            'will-change:transform',
            'opacity:1'
        ].join(';');
        gsap.set(clone, { x: 0, y: 0, scale: 1, rotation: 0, force3D: true });
        travelLayer.appendChild(clone);

        if (!isFinalMoveTile) {
            targetEl.style.visibility = 'hidden';
        }

        return new Promise((resolve) => {
            const timeline = gsap.timeline({
                onComplete: () => {
                    if (!isFinalMoveTile) {
                        this.revealBoardTile(tileId);
                    }
                    clone.remove();
                    this._activeTileTravel = null;
                    resolve();
                },
                onInterrupt: () => {
                    if (!isFinalMoveTile) {
                        this.revealBoardTile(tileId);
                    }
                    clone.remove();
                    this._activeTileTravel = null;
                    resolve();
                }
            });

            this._activeTileTravel = { timeline, clone, tileId };

            timeline
                .to(clone, {
                    x: endX * 0.62,
                    y: endY * 0.62 - lift,
                    scale: 1.006,
                    rotation: travelTilt + targetRotation * 0.45,
                    duration: duration * 0.58,
                    ease: 'sine.out'
                })
                .to(clone, {
                    x: endX,
                    y: endY,
                    scale: 1,
                    rotation: targetRotation,
                    duration: duration * 0.42,
                    ease: 'power1.out'
                });
        });
    }

    cancelActiveTileTravel() {
        if (!this._activeTileTravel) return;
        const { timeline, clone, tileId } = this._activeTileTravel;
        this._activeTileTravel = null;
        if (timeline) {
            timeline.kill();
        }
        if (clone?.remove) {
            clone.remove();
        }
        if (tileId) {
            this.revealBoardTile(tileId);
        }
    }

    revealBoardTile(tileId) {
        if (this.shouldUseKonvaBoard()) {
            this._pendingBoardTileTravel = null;
            this._konvaBoardRenderer?.revealTile?.(tileId);
            return;
        }
        const tileEl = this.boardEl.querySelector(`[data-tile-id="${tileId}"]`);
        if (!tileEl) return;
        tileEl.style.removeProperty('visibility');
        tileEl.style.removeProperty('opacity');
    }

    createTravelClone(nodeEl) {
        if (!nodeEl) {
            const fallback = document.createElement('div');
            fallback.className = 'tile vertical';
            return fallback;
        }
        if (nodeEl.dataset?.displayA !== undefined && nodeEl.dataset?.displayB !== undefined) {
            const clone = this.createTileEl(
                Number(nodeEl.dataset.displayA || 0),
                Number(nodeEl.dataset.displayB || 0),
                nodeEl.dataset.orientation || 'horizontal',
                false,
                nodeEl.dataset.tileId || null
            );
            clone.classList.add('board-tile');
            return clone;
        }
        const clone = nodeEl.cloneNode(true);
        clone.classList.remove('board-tile', 'just-played', 'telephone-highlight', 'playable', 'selected');
        return clone;
    }

    showArrowChoices(board, matchingEnds, onChoose, onCancel) {
        this.removeArrows();
        if (this.shouldUseKonvaBoard()) {
            const validIndexes = Array.isArray(matchingEnds) ? matchingEnds.map((value) => Number(value)).filter(Number.isFinite) : [];
            if (!validIndexes.length) {
                onCancel?.();
                return;
            }
            this._konvaBoardRenderer?.syncPlayableOpenEndHighlights?.(
                board?.openEnds || [],
                validIndexes,
                null,
                (openEndIndex) => onChoose?.(openEndIndex),
                () => onCancel?.()
            );
            return;
        }
        const gs = document.getElementById('game-screen');
        const arrowSymbols = { left: '\u2190', right: '\u2192', top: '\u2191', bottom: '\u2193' };
        const tapEvent = window.PointerEvent ? 'pointerup' : 'click';
        const buttonSize = this.getArrowButtonSize();
        const tileRects = this.collectBoardTileRects();
        const overlay = document.createElement('div');
        overlay.id = 'arrow-overlay';
        overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:100;background:rgba(0,0,0,0.04);';

        overlay.addEventListener(tapEvent, (e) => {
            if (e.target === overlay) {
                this.removeArrows();
                onCancel();
            }
        });

        for (const ei of matchingEnds) {
            const oe = board.openEnds[ei];
            const btn = document.createElement('button');
            btn.className = 'arrow-btn';
            btn.textContent = arrowSymbols[oe.side] || '?';
            btn.classList.add(`arrow-${oe.side || 'bottom'}`);
            btn.title = this.app.format('arrow-place-to', { value: oe.value });
            const rawPoint = this.getBoardOpenEndChoicePoint(oe, { buttonSize });
            const point = rawPoint ? this.adjustArrowPointForCollision(rawPoint, buttonSize, tileRects, oe.side) : null;
            if (!point) continue;
            const gsRect = gs.getBoundingClientRect();
            const ax = point.x - gsRect.left;
            const ay = point.y - gsRect.top;
            if (!Number.isFinite(ax) || !Number.isFinite(ay)) continue;
            btn.style.cssText += `position:absolute;left:${ax}px;top:${ay}px;width:${buttonSize}px;height:${buttonSize}px;transform:translate(-50%,-50%);`;

            btn.addEventListener(tapEvent, (e) => {
                e.stopPropagation();
                this.removeArrows();
                onChoose(ei);
            });
            overlay.appendChild(btn);
        }
        if (!overlay.children.length) {
            onCancel();
            return;
        }
        gs.appendChild(overlay);
    }

    removeArrows() {
        this._konvaBoardRenderer?.clearPlayableOpenEndHighlights?.();
        const ov = document.getElementById('arrow-overlay');
        if (ov) ov.remove();
    }
    renderHand(hand, validMoves = [], sel = -1, isCurrent = false) {
        this.handEl.innerHTML = '';
        if (isCurrent) this.handEl.parentElement.classList.add('active-turn');
        else this.handEl.parentElement.classList.remove('active-turn');

        const handContainer = this.handEl.parentElement;
        if (handContainer) {
            if (this.app?.isInputBlockedByStage?.()) {
                handContainer.classList.add('input-locked');
            } else {
                handContainer.classList.remove('input-locked');
            }
        }

        const tiles = Array.isArray(hand) ? hand : [];
        for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i];
            if (!t || typeof t.a !== 'number' || typeof t.b !== 'number') continue;
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
            const safeName = this.app?.getFirstNameDisplayName
                ? this.app.getFirstNameDisplayName(p?.name || '', this.app?.playerNames?.[p?.index] || 'Player')
                : String(p?.name || this.app?.playerNames?.[p?.index] || 'Player');
            const safeScore = Number.isFinite(Number(p?.score)) ? Number(p.score) : 0;
            const safeRoundWins = Number.isFinite(Number(p?.roundWins)) ? Number(p.roundWins) : 0;
            const it = document.createElement('div');
            it.className = 'score-item';
            if (p.index === cur) it.classList.add('current-player');
            if (p.team) {
                const teamTag = document.createElement('span');
                teamTag.style.fontSize = '0.6rem';
                teamTag.style.color = 'var(--text-dim)';
                teamTag.textContent = `[${p.team}] `;
                it.appendChild(teamTag);
            }
            const playerId = String(p?.playerId || '').trim();
            const canOpenProfile = Boolean(playerId && !p?.isBot);
            const name = document.createElement(canOpenProfile ? 'button' : 'span');
            name.className = canOpenProfile ? 'score-name score-name-button' : 'score-name';
            name.textContent = `${safeName}:`;
            if (canOpenProfile) {
                name.type = 'button';
                name.title = safeName || 'Player';
                name.addEventListener('click', () => {
                    this.app.openPlayerProfileModal({ id: playerId, displayName: safeName, playerId });
                });
            }
            const value = document.createElement('span');
            value.className = 'score-value';
            value.textContent = String(safeScore);
            const wins = document.createElement('span');
            wins.className = 'score-wins';
            wins.textContent = ` ${safeRoundWins}`;
            it.appendChild(name);
            it.appendChild(document.createTextNode(' '));
            it.appendChild(value);
            it.appendChild(wins);
            this.scoresEl.appendChild(it);
        }
    }

    renderInfo(mr, deal, by, sum, stakeLabel = '') {
        const rText = this.app.t('label-round-short');
        const sText = this.app.t('label-deal-short');
        this.roundInfoEl.textContent = `${rText}${mr}/3 В· ${sText}${deal}`;
        if (!this.stakeInfoEl) this.stakeInfoEl = document.getElementById('stake-info');
        if (this.stakeInfoEl) {
            const hud = this.app?.getTopRightHudState?.() || null;
            const labelKey = hud?.labelKey || 'label-stake-short';
            const isBankHud = Boolean(stakeLabel);
            const bankText = Number(hud?.value || 0).toLocaleString('en-US');
            this.stakeInfoEl.classList.toggle('is-hidden', !stakeLabel);
            this.stakeInfoEl.classList.toggle('is-bank-hud', Boolean(stakeLabel));
            this.stakeInfoEl.innerHTML = stakeLabel
                ? `${this.getBankIconMarkup()}<span class="stake-info-bank-value">${bankText}</span>`
                : '';
            const ariaLabel = isBankHud ? this.app.t('label-bank-short') : this.app.t(labelKey);
            this.stakeInfoEl.title = ariaLabel;
            this.stakeInfoEl.setAttribute('aria-label', ariaLabel);
            this.stakeInfoEl.dataset.source = hud?.sourceField || '';
            this.stakeInfoEl.dataset.value = stakeLabel || '';
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
            const host = document.getElementById('game-screen') || document.querySelector('.action-bar');
            host?.appendChild?.(btn);
        }
        btn.textContent = this.app.t('gosha-button');
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
        p.style.cssText = 'position:absolute;left:50%;top:35%;transform:translateX(-50%);font-size:1.8rem;font-weight:800;color:var(--accent);text-shadow:0 2px 12px rgba(240,192,64,0.5);pointer-events:none;z-index:50;animation:scorePopUp 1.4s ease-out forwards;';
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
        const title = document.getElementById('round-end-title');
        const details = document.getElementById('round-end-details');
        const action = document.getElementById('next-round-btn');
        if (title) title.textContent = fish ? this.app.t('msg-fish') : `${wn} ${this.app.t('out-suffix')}`;
        if (details) {
            details.innerHTML = '';
            const orderedPlayers = [...(players || [])].sort(
                (a, b) => (b?.isWinner ? 1 : 0) - (a?.isWinner ? 1 : 0)
            );
            for (const p of orderedPlayers) {
                const row = document.createElement('div');
                row.className = 'detail-row';
                if (p?.isWinner) row.classList.add('round-end-winner-row');
                row.style.flexDirection = 'column';
                row.style.alignItems = 'flex-start';
                row.style.gap = '6px';

                const top = document.createElement('div');
                top.style.display = 'flex';
                top.style.justifyContent = 'space-between';
                top.style.width = '100%';

                const name = document.createElement('span');
                name.textContent = p.name;

                const value = document.createElement('span');
                value.className = 'detail-value';
                const parts = [];
                if (!p.isWinner) {
                    parts.push(`${this.app.t('label-hand-points')}: ${p.handPoints || 0}`);
                }
                if (p.isWinner) parts.push(`${this.app.t('label-bonus')}: +${bonus || 0}`);
                parts.push(`${this.app.t('label-total')}: ${p.score || 0}`);
                value.textContent = parts.join(' · ');

                top.appendChild(name);
                top.appendChild(value);
                row.appendChild(top);

                if (!p.isWinner && Array.isArray(p.leftoverHands) && p.leftoverHands.length) {
                    const handsDiv = document.createElement('div');
                    handsDiv.style.display = 'flex';
                    handsDiv.style.flexWrap = 'wrap';
                    handsDiv.style.gap = '4px';
                    for (const h of p.leftoverHands) {
                        for (const t of h || []) {
                            const tel = this.createTileEl(t.a, t.b, 'vertical', true);
                            handsDiv.appendChild(tel);
                        }
                    }
                    if (handsDiv.children.length > 0) row.appendChild(handsDiv);
                }
                details.appendChild(row);
            }
        }
        if (action) action.style.display = 'none';
        const screen = document.getElementById('round-end-screen');
        if (screen) screen.classList.add('active');
    }

    clearTimeoutForfeitUi() {
        if (this._timeoutForfeitCountdownTimer) {
            clearInterval(this._timeoutForfeitCountdownTimer);
            this._timeoutForfeitCountdownTimer = null;
        }
        this._timeoutForfeitContinueBtn = null;
        this._timeoutForfeitTopUpBtn = null;
        this._timeoutForfeitExitBtn = null;
        this._timeoutForfeitCountdownEl = null;
    }

    renderRoundEnd(wn, players, wins, mr, over, options = {}) {
        void mr;
        const action = document.getElementById('next-round-btn');
        const details = document.getElementById('round-end-details');
        const title = document.getElementById('round-end-title');
        this.clearTimeoutForfeitUi();
        if (action) action.style.display = over ? '' : 'none';

        if (options?.timeoutForfeit) {
            const isTimeoutLoser = Boolean(options.isTimeoutLoser);
            const loserName = String(options.loserName || wn || '').trim() || wn;
            const requiredStakeAmount = Math.max(0, Number(options.requiredStakeAmount || options.bankAmount || 0));
            if (title) {
                title.textContent = isTimeoutLoser
                    ? (this.app.t('timeout-forfeit-title-loser') || `${wn} timed out`)
                    : (this.app.format('timeout-forfeit-title-waiting', { player: loserName }) || `${loserName} timed out`);
            }
            if (details) {
                details.innerHTML = '';
                const baseSummary = document.createElement('div');
                baseSummary.className = 'detail-row';
                const baseLabel = document.createElement('span');
                baseLabel.textContent = isTimeoutLoser
                    ? (this.app.t('timeout-forfeit-desc-loser') || 'Timeout forfeit')
                    : (this.app.t('timeout-forfeit-waiting-other') || 'Waiting for the player to continue');
                const baseValue = document.createElement('span');
                baseValue.className = 'detail-value';
                baseValue.textContent = isTimeoutLoser
                    ? (this.app.t('timeout-forfeit-desc-loser') || 'You lost the round by timeout')
                    : (this.app.format('timeout-forfeit-desc-waiting', { player: loserName }) || 'Waiting for the player to continue');
                baseSummary.appendChild(baseLabel);
                baseSummary.appendChild(baseValue);
                details.appendChild(baseSummary);

                if (isTimeoutLoser && Number(requiredStakeAmount) > 0) {
                    const stakeRow = document.createElement('div');
                    stakeRow.className = 'detail-row';
                    const stakeLabel = document.createElement('span');
                    stakeLabel.textContent = this.app.t('summary-coins');
                    const stakeValue = document.createElement('span');
                    stakeValue.className = 'detail-value';
                    stakeValue.textContent = `${this.app.t('timeout-forfeit-topup') || 'Top up'}: ${requiredStakeAmount}`;
                    stakeRow.appendChild(stakeLabel);
                    stakeRow.appendChild(stakeValue);
                    details.appendChild(stakeRow);
                }

                const countdownRow = document.createElement('div');
                countdownRow.className = 'detail-row';
                const countdownLabel = document.createElement('span');
                countdownLabel.textContent = this.app.t('timeout-forfeit-countdown') || 'Continue window';
                const countdownValue = document.createElement('span');
                countdownValue.className = 'detail-value';
                countdownValue.id = 'timeout-forfeit-countdown';
                countdownRow.appendChild(countdownLabel);
                countdownRow.appendChild(countdownValue);
                details.appendChild(countdownRow);
                this._timeoutForfeitCountdownEl = countdownValue;

                const actionRow = document.createElement('div');
                actionRow.className = 'game-over-actions';
                if (isTimeoutLoser) {
                    const continueBtn = document.createElement('button');
                    continueBtn.className = 'btn btn-primary';
                    continueBtn.type = 'button';
                    continueBtn.textContent = this.app.t('timeout-forfeit-continue') || 'Continue';
                    continueBtn.addEventListener('click', () => {
                        if (continueBtn.disabled) return;
                        continueBtn.disabled = true;
                        options.onContinue?.();
                    });
                    actionRow.appendChild(continueBtn);
                    this._timeoutForfeitContinueBtn = continueBtn;

                    if (options.hasInsufficientBalance) {
                        const topUpBtn = document.createElement('button');
                        topUpBtn.className = 'btn btn-action';
                        topUpBtn.type = 'button';
                        topUpBtn.textContent = this.app.t('timeout-forfeit-topup') || 'Top up balance';
                        topUpBtn.addEventListener('click', () => options.onTopUp?.());
                        actionRow.appendChild(topUpBtn);
                        this._timeoutForfeitTopUpBtn = topUpBtn;
                    }
                }

                const exitBtn = document.createElement('button');
                exitBtn.className = 'btn btn-menu';
                exitBtn.type = 'button';
                exitBtn.textContent = this.app.t('timeout-forfeit-exit') || 'Exit';
                exitBtn.addEventListener('click', () => options.onExit?.());
                actionRow.appendChild(exitBtn);
                this._timeoutForfeitExitBtn = exitBtn;
                details.appendChild(actionRow);

                const updateCountdown = () => {
                    if (!this._timeoutForfeitCountdownEl) return;
                    const expiresAt = Number(options.continueExpiresAt || 0);
                    const remainingMs = Math.max(0, expiresAt - Date.now());
                    const remainingSec = Math.ceil(remainingMs / 1000);
                    this._timeoutForfeitCountdownEl.textContent = expiresAt
                        ? `${remainingSec}s`
                        : (this.app.t('timeout-forfeit-countdown') || 'Waiting');
                    if (remainingMs <= 0 && this._timeoutForfeitContinueBtn) {
                        this._timeoutForfeitContinueBtn.disabled = true;
                    }
                };
                updateCountdown();
                if (Number(options.continueExpiresAt || 0) > 0) {
                    this._timeoutForfeitCountdownTimer = setInterval(updateCountdown, 1000);
                }
            }
            document.getElementById('round-end-screen')?.classList.add('active');
            return;
        }

        if (!over) {
            this.renderDealEnd(wn, players, false, wins);
        }
    }

    showInstantWin(pn, s) {
        this.showMessage(this.app.format('instant-win-title', { player: pn, score: s }), 1400);
        document.getElementById('round-end-screen')?.classList.remove('active');
    }

    renderGameOver(wn, players, economySummary = null, options = {}) {
        this.clearTimeoutForfeitUi();
        const title = options?.titleText || `${wn} ${this.app.t('won-suffix')}`;
        document.getElementById('game-over-title').textContent = title;
        const d = document.getElementById('game-over-details');
        d.innerHTML = '';
        if (economySummary) {
            const summary = document.createElement('div');
            summary.className = 'detail-row';
            const spent = Math.max(0, Number(economySummary.spent || 0));
            const won = Math.max(0, Number(economySummary.won || 0));
            const net = won - spent;
            const label = document.createElement('span');
            label.textContent = this.app.t('summary-coins');
            const value = document.createElement('span');
            value.className = 'detail-value';
            value.textContent = `${this.app.t('summary-won')}: ${won} · ${this.app.t('summary-lost')}: ${spent} · ${this.app.t('summary-net')}: ${net >= 0 ? '+' : ''}${net}`;
            summary.appendChild(label);
            summary.appendChild(value);
            d.appendChild(summary);
        }
        for (const p of [...players].sort((a, b) => {
            const aScore = Number(a?.score ?? Number.NEGATIVE_INFINITY);
            const bScore = Number(b?.score ?? Number.NEGATIVE_INFINITY);
            if (aScore !== bScore) return bScore - aScore;
            return (b.roundWins || 0) - (a.roundWins || 0);
        })) {
            const r = document.createElement('div');
            r.className = 'detail-row';
            const name = document.createElement('span');
            name.textContent = p.name;
            const value = document.createElement('span');
            value.className = 'detail-value';
            const parts = [];
            if (Number.isFinite(Number(p.score))) parts.push(`${this.app.t('label-score')}: ${p.score}`);
            parts.push(`${p.roundWins} ${this.app.t('label-rounds').toLowerCase()}`);
            value.textContent = parts.join(' · ');
            r.appendChild(name);
            r.appendChild(value);
            d.appendChild(r);
        }
        document.getElementById('game-over-screen').classList.add('active');
    }

    onTimeoutContinueResult(payload = {}) {
        const ok = Boolean(payload?.ok);
        if (this._timeoutForfeitContinueBtn) {
            if (ok) {
                this._timeoutForfeitContinueBtn.disabled = true;
                this._timeoutForfeitContinueBtn.textContent = this.app.t('timeout-forfeit-continue-in-progress') || 'Continuing...';
            } else {
                this._timeoutForfeitContinueBtn.disabled = false;
                this._timeoutForfeitContinueBtn.textContent = this.app.t('timeout-forfeit-continue') || 'Continue';
            }
        }
    }
}

