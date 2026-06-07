const TILE_W = 66;
const TILE_H = 34;
const TILE_GAP = 2;
const MAX_PIXEL_RATIO = 2;
const SIDE_RESERVE = 50;
const PILL_BG = 'rgba(8, 18, 13, 0.82)';
const PILL_STROKE = 'rgba(240, 192, 64, 0.28)';
const PILL_TEXT = '#e9e2c2';
const TILE_FILL = '#24392c';
const TILE_STROKE = '#7fb48b';
const TILE_DIVIDER = '#112016';
const PIP_FILL = '#f2eedf';
const PIP_SHADOW = 'rgba(0, 0, 0, 0.16)';

function getKonva() {
    return window.Konva || globalThis.Konva || null;
}

function pipLayout(value, orient = 'horizontal') {
    const layouts = {
        0: [],
        1: [4],
        2: [2, 6],
        3: [2, 4, 6],
        4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8],
        6: orient === 'vertical' ? [0, 2, 3, 5, 6, 8] : [0, 1, 2, 6, 7, 8]
    };
    return layouts[value] || [];
}

function nodeBox(node) {
    const width = node.orientation === 'horizontal' ? TILE_W : 34;
    const height = node.orientation === 'horizontal' ? 34 : TILE_W;
    return { width, height };
}

function measureBoard(board) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of Array.isArray(board?.nodes) ? board.nodes : []) {
        const { width, height } = nodeBox(node);
        const halfW = width / 2;
        const halfH = height / 2;
        minX = Math.min(minX, node.x - halfW);
        maxX = Math.max(maxX, node.x + halfW);
        minY = Math.min(minY, node.y - halfH);
        maxY = Math.max(maxY, node.y + halfH);
    }

    if (!Number.isFinite(minX)) {
        return {
            minX: 0,
            maxX: 0,
            minY: 0,
            maxY: 0,
            width: TILE_W,
            height: TILE_H,
            originX: 0,
            originY: 0
        };
    }

    return {
        minX,
        maxX,
        minY,
        maxY,
        width: (maxX - minX),
        height: (maxY - minY),
        originX: (maxX + minX) / 2,
        originY: (maxY + minY) / 2
    };
}

function buildSignature(board, layout, context = {}) {
    const nodesSig = Array.isArray(board?.nodes)
        ? board.nodes.map((node) => [
            node.tile?.id ?? '',
            node.x,
            node.y,
            node.orientation || '',
            node.displayA ?? '',
            node.displayB ?? ''
        ].join(':')).join('|')
        : 'none';
    const endsSig = Array.isArray(board?.openEnds)
        ? board.openEnds.map((oe) => [
            oe.nodeId ?? '',
            oe.side ?? '',
            oe.value ?? '',
            oe.growthDir ?? ''
        ].join(':')).join('|')
        : 'none';
    const pendingTravel = context?.pendingTravel?.tileId ? String(context.pendingTravel.tileId) : '';
    const animatedCount = context?.animatedBoardTileIds instanceof Set ? context.animatedBoardTileIds.size : 0;
    return [
        layout.stageWidth,
        layout.stageHeight,
        layout.scale.toFixed(4),
        Number(layout.originX || 0).toFixed(2),
        Number(layout.originY || 0).toFixed(2),
        nodesSig,
        endsSig,
        String(board?.crossNodeId ?? ''),
        String(board?.crossSidesClosed ?? ''),
        pendingTravel,
        animatedCount
    ].join('::');
}

function circleSlots(orient = 'horizontal') {
    if (orient === 'horizontal') {
        return [
            { x: 8, y: 8 },
            { x: 16.5, y: 8 },
            { x: 25, y: 8 },
            { x: 8, y: 17 },
            { x: 16.5, y: 17 },
            { x: 25, y: 17 },
            { x: 8, y: 26 },
            { x: 16.5, y: 26 },
            { x: 25, y: 26 }
        ];
    }

    return [
        { x: 8, y: 8 },
        { x: 8, y: 21.5 },
        { x: 8, y: 35 },
        { x: 16.5, y: 8 },
        { x: 16.5, y: 21.5 },
        { x: 16.5, y: 35 },
        { x: 25, y: 8 },
        { x: 25, y: 21.5 },
        { x: 25, y: 35 }
    ];
}

export class KonvaBoardRenderer {
    constructor({ app, containerEl = null, boardEl = null, debug = false } = {}) {
        this.app = app;
        this.containerEl = containerEl;
        this.boardEl = boardEl;
        this.debug = debug;
        this.rootEl = null;
        this.stageHostEl = null;
        this.anchorEl = null;
        this.stage = null;
        this.layer = null;
        this.resizeObserver = null;
        this.lastSignature = '';
        this.lastBoard = null;
        this.lastLayout = null;
        this.nodeRects = new Map();
        this.tileRects = new Map();
        this.animatedTileIds = new Set();
        this.enabled = false;
        this._resizeTimer = null;
    }

    log(...args) {
        if (!this.debug) return;
        console.debug('[KonvaBoard]', ...args);
    }

    mount(containerEl = this.containerEl) {
        const Konva = getKonva();
        if (!Konva) {
            throw new Error('Konva is not available');
        }
        if (!containerEl) {
            throw new Error('Board container is missing');
        }

        this.destroy();
        this.containerEl = containerEl;
        this.rootEl = document.createElement('div');
        this.rootEl.className = 'konva-board-root';
        this.stageHostEl = document.createElement('div');
        this.stageHostEl.className = 'konva-board-stage-host';
        this.anchorEl = document.createElement('div');
        this.anchorEl.className = 'board-layout konva-board-anchors';
        this.anchorEl.setAttribute('aria-hidden', 'true');

        this.rootEl.appendChild(this.stageHostEl);
        this.rootEl.appendChild(this.anchorEl);
        this.containerEl.innerHTML = '';
        this.containerEl.appendChild(this.rootEl);

        const width = Math.max(1, this.containerEl.clientWidth || 1);
        const height = Math.max(1, this.containerEl.clientHeight || 1);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

        this.stage = new Konva.Stage({
            container: this.stageHostEl,
            width,
            height,
            pixelRatio
        });
        this.layer = new Konva.Layer({ listening: false });
        this.stage.add(this.layer);

        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                clearTimeout(this._resizeTimer);
                this._resizeTimer = setTimeout(() => {
                    if (this.lastBoard) {
                        this.render(this.lastBoard, { ...this.lastContext, force: true, resized: true });
                    }
                }, 50);
            });
            this.resizeObserver.observe(this.containerEl);
        } else {
            window.addEventListener('resize', this._handleWindowResize = () => {
                if (this.lastBoard) {
                    this.render(this.lastBoard, { ...this.lastContext, force: true, resized: true });
                }
            });
        }

        this.enabled = true;
        this.log('mounted');
        return this;
    }

    destroy() {
        if (this.resizeObserver) {
            try { this.resizeObserver.disconnect(); } catch {}
            this.resizeObserver = null;
        }
        if (this._handleWindowResize) {
            window.removeEventListener('resize', this._handleWindowResize);
            this._handleWindowResize = null;
        }
        if (this.stage) {
            try { this.stage.destroy(); } catch {}
            this.stage = null;
        }
        if (this.rootEl?.remove) {
            this.rootEl.remove();
        }
        this.rootEl = null;
        this.stageHostEl = null;
        this.anchorEl = null;
        this.layer = null;
        this.enabled = false;
        this.lastSignature = '';
        this.lastBoard = null;
        this.lastLayout = null;
        this.nodeRects.clear();
        this.tileRects.clear();
        this.animatedTileIds.clear();
    }

    syncStageSize() {
        if (!this.stage || !this.containerEl) return { width: 1, height: 1 };
        const width = Math.max(1, this.containerEl.clientWidth || 1);
        const height = Math.max(1, this.containerEl.clientHeight || 1);
        if (this.stage.width() !== width || this.stage.height() !== height) {
            this.stage.size({ width, height });
        }
        return { width, height };
    }

    buildLayout(board) {
        const { width: stageWidth, height: stageHeight } = this.syncStageSize();
        const bounds = measureBoard(board);
        const pad = 20;
        const boardWidth = (bounds.width || TILE_W) + pad * 2;
        const boardHeight = (bounds.height || TILE_H) + pad * 2;
        const viewWidth = Math.max(stageWidth - (Array.isArray(board?.nodes) && board.nodes.length > 5 ? SIDE_RESERVE * 2 : 0), 100);
        const viewHeight = Math.max(stageHeight - 20, 100);
        const scale = Math.min(viewWidth / boardWidth, viewHeight / boardHeight, 1.1);

        return {
            stageWidth,
            stageHeight,
            bounds,
            originX: bounds.originX,
            originY: bounds.originY,
            scale,
            padding: pad,
            viewWidth,
            viewHeight
        };
    }

    render(board, context = {}) {
        if (!board) return;
        if (!this.stage || !this.layer || !this.rootEl) {
            this.mount(this.containerEl);
        }

        const layout = this.buildLayout(board);
        const signature = buildSignature(board, layout, context);
        if (!context.force && signature === this.lastSignature) {
            return;
        }

        this.lastSignature = signature;
        this.lastBoard = board;
        this.lastLayout = layout;
        this.lastContext = context;

        const Konva = getKonva();
        if (!Konva) {
            throw new Error('Konva is not available');
        }

        this.layer.destroyChildren();
        this.nodeRects.clear();
        this.tileRects.clear();
        this.anchorEl.innerHTML = '';

        const boardGroup = new Konva.Group({
            x: layout.stageWidth / 2,
            y: layout.stageHeight / 2,
            scaleX: layout.scale,
            scaleY: layout.scale
        });
        this.layer.add(boardGroup);

        const hasNodes = Array.isArray(board.nodes) && board.nodes.length > 0;
        if (!hasNodes) {
            this.animatedTileIds.clear();
            const empty = new Konva.Text({
                x: layout.stageWidth / 2,
                y: layout.stageHeight / 2,
                offsetX: 110,
                offsetY: 12,
                width: 220,
                align: 'center',
                text: this.app?.t?.('board-empty') || 'Сделайте первый ход',
                fontSize: 15,
                fontFamily: 'system-ui, sans-serif',
                fill: '#d3d9d1',
                opacity: 0.9
            });
            this.layer.add(empty);
            this.layer.draw();
            this.stage.draw();
            return;
        }

        const { originX, originY } = layout.bounds;
        const pendingTravelId = context?.pendingTravel?.tileId ? String(context.pendingTravel.tileId) : '';
        const lastNodeIndex = board.nodes.length - 1;
        const isReducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

        for (let i = 0; i < board.nodes.length; i++) {
            const node = board.nodes[i];
            const { width, height } = nodeBox(node);
            const localX = node.x - originX;
            const localY = node.y - originY;
            const tileId = String(node.tile?.id ?? `${i}`);
            const rect = {
                left: ((localX - width / 2) * layout.scale) + layout.stageWidth / 2,
                top: ((localY - height / 2) * layout.scale) + layout.stageHeight / 2,
                width: width * layout.scale,
                height: height * layout.scale
            };
            rect.right = rect.left + rect.width;
            rect.bottom = rect.top + rect.height;
            rect.centerX = rect.left + rect.width / 2;
            rect.centerY = rect.top + rect.height / 2;
            this.nodeRects.set(String(i), rect);
            this.tileRects.set(tileId, rect);

            const anchor = document.createElement('div');
            anchor.className = `tile ${node.orientation} board-tile`;
            anchor.dataset.nodeId = String(i);
            anchor.dataset.tileId = tileId;
            anchor.dataset.displayA = String(node.displayA ?? node.tile?.a ?? 0);
            anchor.dataset.displayB = String(node.displayB ?? node.tile?.b ?? 0);
            anchor.dataset.orientation = node.orientation || 'horizontal';
            anchor.style.cssText = [
                'position:absolute',
                `left:${rect.left}px`,
                `top:${rect.top}px`,
                `width:${rect.width}px`,
                `height:${rect.height}px`,
                'opacity:0',
                'pointer-events:none',
                'z-index:2'
            ].join(';');
            this.anchorEl.appendChild(anchor);

            const group = new Konva.Group({
                x: localX,
                y: localY,
                offsetX: width / 2,
                offsetY: height / 2
            });

            const isPendingTravel = pendingTravelId && pendingTravelId === tileId;
            const isNewestTile = i === lastNodeIndex && board.nodes.length > 1 && !this.animatedTileIds.has(tileId);

            if (isPendingTravel) {
                group.visible(false);
            } else if (isNewestTile) {
                group.opacity(0);
                group.scale({ x: 0.84, y: 0.84 });
            }

            const tile = new Konva.Rect({
                x: -width / 2,
                y: -height / 2,
                width,
                height,
                cornerRadius: 5,
                fill: TILE_FILL,
                stroke: TILE_STROKE,
                strokeWidth: 1.2,
                shadowColor: 'rgba(0, 0, 0, 0.18)',
                shadowBlur: 3,
                shadowOffsetY: 1
            });
            group.add(tile);

            const divider = new Konva.Rect({
                x: node.orientation === 'horizontal' ? -1 : -width / 2 + 0.5,
                y: node.orientation === 'horizontal' ? -height / 2 : -1,
                width: node.orientation === 'horizontal' ? 2 : width - 1,
                height: node.orientation === 'horizontal' ? height : 2,
                fill: TILE_DIVIDER,
                opacity: 0.95
            });
            group.add(divider);

            const values = [node.displayA ?? node.tile?.a ?? 0, node.displayB ?? node.tile?.b ?? 0];
            const halfOrientations = [node.orientation, node.orientation];
            for (let halfIndex = 0; halfIndex < values.length; halfIndex++) {
                const halfValue = values[halfIndex];
                const halfX = node.orientation === 'horizontal'
                    ? (halfIndex === 0 ? -width / 2 : 0)
                    : -width / 2;
                const halfY = node.orientation === 'horizontal'
                    ? -height / 2
                    : (halfIndex === 0 ? -height / 2 : 0);
                const halfW = node.orientation === 'horizontal' ? width / 2 : width;
                const halfH = node.orientation === 'horizontal' ? height : height / 2;
                const slots = circleSlots(node.orientation === 'horizontal' ? 'horizontal' : 'vertical');
                const pips = pipLayout(Number(halfValue) || 0, halfOrientations[halfIndex]);

                for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
                    const slot = slots[slotIndex];
                    const pip = new Konva.Circle({
                        x: halfX + slot.x,
                        y: halfY + slot.y,
                        radius: 2.35,
                        fill: pips.includes(slotIndex) ? PIP_FILL : 'rgba(0,0,0,0)',
                        opacity: pips.includes(slotIndex) ? 1 : 0
                    });
                    if (pips.includes(slotIndex)) {
                        pip.setAttrs({
                            shadowColor: PIP_SHADOW,
                            shadowBlur: 1.4,
                            shadowOffsetY: 0.6
                        });
                    }
                    group.add(pip);
                }

                void halfW;
                void halfH;
            }

            if (i === board.crossNodeId && board.crossSidesClosed >= 2) {
                tile.stroke('#f0c040');
                tile.strokeWidth(1.7);
            }

            boardGroup.add(group);

            if (isPendingTravel) {
                continue;
            }
            if (isNewestTile && !isReducedMotion) {
                this.animatedTileIds.add(tileId);
                group.to({
                    opacity: 1,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 0.24
                });
            } else {
                this.animatedTileIds.add(tileId);
            }
        }

        if (Array.isArray(board.openEnds) && board.openEnds.length) {
            const pills = new Konva.Group({
                x: layout.stageWidth / 2,
                y: layout.stageHeight / 2 + ((layout.bounds.height + 32) * layout.scale) / 2
            });
            for (let i = 0; i < board.openEnds.length; i++) {
                const oe = board.openEnds[i];
                const label = String(oe.value ?? '');
                const pillWidth = Math.max(18, 11 + label.length * 7);
                const pillHeight = 18;
                const pillX = (i - (board.openEnds.length - 1) / 2) * (pillWidth + 6);
                const bg = new Konva.Rect({
                    x: pillX - pillWidth / 2,
                    y: -pillHeight / 2,
                    width: pillWidth,
                    height: pillHeight,
                    cornerRadius: 9,
                    fill: PILL_BG,
                    stroke: PILL_STROKE,
                    strokeWidth: 1
                });
                const text = new Konva.Text({
                    x: pillX - pillWidth / 2,
                    y: -7,
                    width: pillWidth,
                    height: 14,
                    align: 'center',
                    text: label,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    fill: PILL_TEXT
                });
                pills.add(bg);
                pills.add(text);
            }
            this.layer.add(pills);
        }

        this.layer.draw();
        this.stage.draw();
        this.log('rendered', board.nodes.length, 'nodes');
    }

    getTileRect(tileId) {
        if (!tileId) return null;
        const anchor = this.anchorEl?.querySelector(`[data-tile-id="${String(tileId)}"]`);
        return anchor?.getBoundingClientRect?.() || null;
    }

    getNodeRect(nodeId) {
        if (!Number.isInteger(Number(nodeId))) return null;
        const anchor = this.anchorEl?.querySelector(`[data-node-id="${String(nodeId)}"]`);
        return anchor?.getBoundingClientRect?.() || null;
    }

    getOpenEndAnchorRect(openEnd) {
        if (!openEnd) return null;
        const rect = this.getNodeRect(openEnd.nodeId);
        if (!rect) return null;
        const side = String(openEnd.side || '').trim();
        const offset = 26;
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
}
