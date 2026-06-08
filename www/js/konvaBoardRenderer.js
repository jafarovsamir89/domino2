const TILE_W = 66;
const TILE_H = 34;
const MAX_PIXEL_RATIO = 2;
const SIDE_RESERVE = 50;
const PILL_BG = 'rgba(8, 18, 13, 0.82)';
const PILL_STROKE = 'rgba(240, 192, 64, 0.28)';
const PILL_TEXT = '#e9e2c2';
const FALLBACK_TILE_FILL = '#faf6eb';
const FALLBACK_TILE_STROKE = '#b8a07a';
const FALLBACK_TILE_SHADOW = 'rgba(0, 0, 0, 0.5)';
const FALLBACK_TILE_DIVIDER = '#b8a07a';
const FALLBACK_PIP_FILL = '#1a1a1a';
const FALLBACK_PIP_SHADOW = 'rgba(0, 0, 0, 0.16)';
const LOW_POWER_USER_AGENT_RE = /Android|iPhone|iPad|iPod/i;

function getKonva() {
    return window.Konva || globalThis.Konva || null;
}

function getCssVar(name, fallback) {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

function readBoardMetrics() {
    return {
        tileW: Number.parseFloat(getCssVar('--tile-w', String(TILE_W))) || TILE_W,
        tileH: Number.parseFloat(getCssVar('--tile-h', String(TILE_H))) || TILE_H,
        pipSize: Number.parseFloat(getCssVar('--pip-size', '6')) || 6,
        tileFill: getCssVar('--tile-bg', FALLBACK_TILE_FILL),
        tileStroke: getCssVar('--tile-border', FALLBACK_TILE_STROKE),
        tileShadow: getCssVar('--tile-shadow', FALLBACK_TILE_SHADOW),
        tileDivider: getCssVar('--tile-border', FALLBACK_TILE_DIVIDER),
        pipFill: getCssVar('--pip', FALLBACK_PIP_FILL),
        pipShadow: getCssVar('--tile-shadow', FALLBACK_PIP_SHADOW)
    };
}

function isLowPowerMode() {
    return LOW_POWER_USER_AGENT_RE.test(navigator.userAgent || '');
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

function getPipPosition(slotIndex, halfX, halfY, halfW, halfH) {
    const col = slotIndex % 3;
    const row = Math.floor(slotIndex / 3);
    const innerPadX = Math.max(1.5, halfW * 0.08);
    const innerPadY = Math.max(1.5, halfH * 0.08);
    const usableW = Math.max(1, halfW - innerPadX * 2);
    const usableH = Math.max(1, halfH - innerPadY * 2);
    return {
        x: halfX + innerPadX + (col + 0.5) * (usableW / 3),
        y: halfY + innerPadY + (row + 0.5) * (usableH / 3)
    };
}

function nodeBox(node, metrics = readBoardMetrics()) {
    const width = node.orientation === 'horizontal' ? metrics.tileW : metrics.tileH;
    const height = node.orientation === 'horizontal' ? metrics.tileH : metrics.tileW;
    return { width, height };
}

function measureBoard(board, metrics = readBoardMetrics()) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of Array.isArray(board?.nodes) ? board.nodes : []) {
        const { width, height } = nodeBox(node, metrics);
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
            width: metrics.tileW,
            height: metrics.tileH,
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
        this.lastContext = null;
        this.nodeRects = new Map();
        this.tileRects = new Map();
        this.anchorElsByTileId = new Map();
        this.anchorElsByNodeId = new Map();
        this.animatedTileIds = new Set();
        this.activeTileAnimations = new Map();
        this.tileGroupsById = new Map();
        this.openEndGroupsByKey = new Map();
        this.playableOpenEndHighlightsByKey = new Map();
        this.playableOpenEndOverlayEl = null;
        this.enabled = false;
        this.sceneRoot = null;
        this.boardGroup = null;
        this.overlayGroup = null;
        this.emptyTextNode = null;
        this.metrics = readBoardMetrics();
        this.lowPowerMode = isLowPowerMode();
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
        this.rootEl.style.position = 'absolute';
        this.rootEl.style.inset = '0';
        this.rootEl.style.width = '100%';
        this.rootEl.style.height = '100%';
        this.rootEl.style.overflow = 'hidden';
        this.stageHostEl = document.createElement('div');
        this.stageHostEl.className = 'konva-board-stage-host';
        this.stageHostEl.style.position = 'absolute';
        this.stageHostEl.style.inset = '0';
        this.stageHostEl.style.zIndex = '1';
        this.stageHostEl.style.pointerEvents = 'none';
        this.anchorEl = document.createElement('div');
        this.anchorEl.className = 'board-layout konva-board-anchors';
        this.anchorEl.setAttribute('aria-hidden', 'true');
        this.anchorEl.style.zIndex = '2';
        this.anchorEl.style.pointerEvents = 'none';
        this.playableOpenEndOverlayEl = document.createElement('div');
        this.playableOpenEndOverlayEl.className = 'konva-open-end-overlay';
        this.playableOpenEndOverlayEl.style.position = 'absolute';
        this.playableOpenEndOverlayEl.style.inset = '0';
        this.playableOpenEndOverlayEl.style.zIndex = '4';
        this.playableOpenEndOverlayEl.style.pointerEvents = 'none';

        this.rootEl.appendChild(this.stageHostEl);
        this.rootEl.appendChild(this.anchorEl);
        this.rootEl.appendChild(this.playableOpenEndOverlayEl);
        this.containerEl.innerHTML = '';
        this.containerEl.appendChild(this.rootEl);

        const width = Math.max(1, this.containerEl.clientWidth || 1);
        const height = Math.max(1, this.containerEl.clientHeight || 1);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, this.lowPowerMode ? 1.25 : MAX_PIXEL_RATIO);

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
        this.sceneRoot = null;
        this.boardGroup = null;
        this.overlayGroup = null;
        this.emptyTextNode = null;
        this.enabled = false;
        this.lastSignature = '';
        this.lastBoard = null;
        this.lastLayout = null;
        this.lastContext = null;
        this.nodeRects.clear();
        this.tileRects.clear();
        this.anchorElsByTileId.clear();
        this.anchorElsByNodeId.clear();
        this.animatedTileIds.clear();
        this.activeTileAnimations.clear();
        this.tileGroupsById.clear();
        this.openEndGroupsByKey.clear();
        this.clearPlayableOpenEndHighlights();
        this.playableOpenEndHighlightsByKey.clear();
        this.playableOpenEndOverlayEl?.remove?.();
        this.playableOpenEndOverlayEl = null;
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
        this.metrics = readBoardMetrics();
        this.lowPowerMode = isLowPowerMode();
        const { width: stageWidth, height: stageHeight } = this.syncStageSize();
        const bounds = measureBoard(board, this.metrics);
        const pad = 20;
        const boardWidth = (bounds.width || this.metrics.tileW) + pad * 2;
        const boardHeight = (bounds.height || this.metrics.tileH) + pad * 2;
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

    ensureSceneGraph(Konva, layout) {
        if (!this.sceneRoot) {
            this.sceneRoot = new Konva.Group({ listening: false });
            this.boardGroup = new Konva.Group({ listening: false });
            this.sceneRoot.add(this.boardGroup);
            this.layer.add(this.sceneRoot);
        }
        if (!this.overlayGroup) {
            this.overlayGroup = new Konva.Group({ listening: false });
            this.layer.add(this.overlayGroup);
        }
        if (!this.emptyTextNode) {
            this.emptyTextNode = new Konva.Text({
                x: layout.stageWidth / 2,
                y: layout.stageHeight / 2,
                offsetX: 110,
                offsetY: 12,
                width: 220,
                align: 'center',
                text: this.app?.t?.('board-empty') || 'Сделайте первый ход',
                fontSize: 15,
                fontFamily: 'system-ui, sans-serif',
                fill: getCssVar('--text-dim', '#d3d9d1'),
                opacity: 0.9,
                listening: false
            });
            this.overlayGroup.add(this.emptyTextNode);
        }
    }

    getOrCreateAnchorEl(kind, key) {
        const map = kind === 'node' ? this.anchorElsByNodeId : this.anchorElsByTileId;
        let anchor = map.get(String(key));
        if (!anchor) {
            anchor = document.createElement('div');
            anchor.className = kind === 'node' ? 'board-node-anchor' : 'board-tile-anchor';
            anchor.style.cssText = [
                'position:absolute',
                'opacity:0',
                'pointer-events:none',
                'z-index:2'
            ].join(';');
            map.set(String(key), anchor);
            this.anchorEl.appendChild(anchor);
        }
        return anchor;
    }

    pruneAnchors(activeTileIds, activeNodeIds) {
        for (const [tileId, anchor] of this.anchorElsByTileId.entries()) {
            if (activeTileIds.has(tileId)) continue;
            try { anchor.remove(); } catch {}
            this.anchorElsByTileId.delete(tileId);
        }
        for (const [nodeId, anchor] of this.anchorElsByNodeId.entries()) {
            if (activeNodeIds.has(nodeId)) continue;
            try { anchor.remove(); } catch {}
            this.anchorElsByNodeId.delete(nodeId);
        }
    }

    render(board, context = {}) {
        if (!board) return;
        if (!this.stage || !this.layer || !this.rootEl) {
            this.mount(this.containerEl);
        }

        const renderStartedAt = performance.now();
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

        this.ensureSceneGraph(Konva, layout);
        this.sceneRoot.setAttrs({
            x: layout.stageWidth / 2,
            y: layout.stageHeight / 2,
            scaleX: layout.scale,
            scaleY: layout.scale
        });
        this.nodeRects.clear();
        this.tileRects.clear();

        const hasNodes = Array.isArray(board.nodes) && board.nodes.length > 0;
        this.boardGroup.visible(hasNodes);
        this.emptyTextNode?.visible(!hasNodes);
        if (this.emptyTextNode) {
            this.emptyTextNode.position({
                x: layout.stageWidth / 2,
                y: layout.stageHeight / 2
            });
        }

        if (!hasNodes) {
            for (const entry of this.tileGroupsById.values()) {
                try { entry.group.destroy(); } catch {}
            }
            this.tileGroupsById.clear();
            this.openEndGroupsByKey.forEach((entry) => {
                try { entry.group.destroy(); } catch {}
            });
            this.openEndGroupsByKey.clear();
            this.clearPlayableOpenEndHighlights();
            this.animatedTileIds.clear();
            this.pruneAnchors(new Set(), new Set());
            this.layer.batchDraw();
            return;
        }

        const tileStats = this.syncBoardTiles(Konva, board, layout, context);
        this.syncOpenEnds(Konva, board, layout);
        this.layer.batchDraw();
        const renderDuration = performance.now() - renderStartedAt;
        this.log(
            'rendered',
            board.nodes.length,
            'nodes',
            `${renderDuration.toFixed(2)}ms`,
            tileStats ? { created: tileStats.createdTiles, updated: tileStats.updatedTiles, active: this.activeTileAnimations.size } : null
        );
    }

    createTileEntry(Konva, node) {
        const { width, height } = nodeBox(node, this.metrics);
        const tile = new Konva.Rect({
            x: -width / 2,
            y: -height / 2,
            width,
            height,
            cornerRadius: 4,
            fill: this.metrics.tileFill,
            stroke: this.metrics.tileStroke,
            strokeWidth: 1.5,
            shadowColor: this.metrics.tileShadow,
            shadowBlur: this.lowPowerMode ? 0 : 3,
            shadowOffsetY: this.lowPowerMode ? 0 : 1,
            perfectDrawEnabled: false,
            shadowForStrokeEnabled: false,
            listening: false
        });
        const divider = new Konva.Rect({
            x: node.orientation === 'horizontal' ? -1 : -width / 2 + 0.5,
            y: node.orientation === 'horizontal' ? -height / 2 : -1,
            width: node.orientation === 'horizontal' ? 2 : width - 1,
            height: node.orientation === 'horizontal' ? height : 2,
            fill: this.metrics.tileDivider,
            opacity: 0.95,
            listening: false
        });
        const group = new Konva.Group({ listening: false });
        group.add(tile);
        group.add(divider);

        const pipCircles = [];
        const values = [node.displayA ?? node.tile?.a ?? 0, node.displayB ?? node.tile?.b ?? 0];
        for (let halfIndex = 0; halfIndex < values.length; halfIndex++) {
            const halfValue = Number(values[halfIndex]) || 0;
            const halfX = node.orientation === 'horizontal'
                ? (halfIndex === 0 ? -width / 2 : 0)
                : -width / 2;
            const halfY = node.orientation === 'horizontal'
                ? -height / 2
                : (halfIndex === 0 ? -height / 2 : 0);
            const halfW = node.orientation === 'horizontal' ? width / 2 : width;
            const halfH = node.orientation === 'horizontal' ? height : height / 2;
            const pips = pipLayout(halfValue, node.orientation === 'horizontal' ? 'horizontal' : 'vertical');

            for (let slotIndex = 0; slotIndex < 9; slotIndex++) {
                const position = getPipPosition(slotIndex, halfX, halfY, halfW, halfH);
                const filled = pips.includes(slotIndex);
                const circle = new Konva.Circle({
                    x: position.x,
                    y: position.y,
                    radius: Math.max(2.4, this.metrics.pipSize / 2),
                    fill: filled ? this.metrics.pipFill : 'rgba(0,0,0,0)',
                    opacity: filled ? 1 : 0,
                    listening: false
                });
                if (filled) {
                    circle.setAttrs({
                        shadowColor: this.metrics.pipShadow,
                        shadowBlur: this.lowPowerMode ? 0 : 1.4,
                        shadowOffsetY: this.lowPowerMode ? 0 : 0.6
                    });
                }
                pipCircles.push(circle);
                group.add(circle);
            }
        }

        return { group, tile, divider, pipCircles, width, height };
    }

    syncBoardTiles(Konva, board, layout, context) {
        const pendingTravelId = context?.pendingTravel?.tileId ? String(context.pendingTravel.tileId) : '';
        const lastNodeIndex = board.nodes.length - 1;
        const isReducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
        const nextTileIds = new Set();
        const nextNodeIds = new Set();
        let createdTiles = 0;
        let updatedTiles = 0;

        for (let i = 0; i < board.nodes.length; i++) {
            const node = board.nodes[i];
            const tileId = String(node.tile?.id ?? `${i}`);
            nextTileIds.add(tileId);
            nextNodeIds.add(String(i));

            let entry = this.tileGroupsById.get(tileId);
            if (!entry) {
                entry = this.createTileEntry(Konva, node);
                this.tileGroupsById.set(tileId, entry);
                this.boardGroup.add(entry.group);
                createdTiles += 1;
            } else {
                updatedTiles += 1;
            }

            const { width, height } = nodeBox(node, this.metrics);
            const localX = node.x - layout.originX;
            const localY = node.y - layout.originY;
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

            const anchor = this.getOrCreateAnchorEl('tile', tileId);
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
            this.anchorElsByTileId.set(tileId, anchor);

            const nodeAnchor = this.getOrCreateAnchorEl('node', i);
            nodeAnchor.dataset.nodeId = String(i);
            nodeAnchor.dataset.tileId = tileId;
            nodeAnchor.style.cssText = [
                'position:absolute',
                `left:${rect.left}px`,
                `top:${rect.top}px`,
                `width:${rect.width}px`,
                `height:${rect.height}px`,
                'opacity:0',
                'pointer-events:none',
                'z-index:2'
            ].join(';');
            this.anchorElsByNodeId.set(String(i), nodeAnchor);

            const isPendingTravel = pendingTravelId && pendingTravelId === tileId;
            const isActiveTravel = this.activeTileAnimations.has(tileId);
            const isNewestTile = i === lastNodeIndex && board.nodes.length > 1 && !this.animatedTileIds.has(tileId);
            const shouldUpdateGeometry = !isActiveTravel;

            if (shouldUpdateGeometry) {
                entry.group.setAttrs({
                    x: localX,
                    y: localY,
                    offsetX: 0,
                    offsetY: 0,
                    visible: true,
                    opacity: 1,
                    scaleX: 1,
                    scaleY: 1,
                    rotation: 0
                });

                entry.tile.setAttrs({
                    x: -width / 2,
                    y: -height / 2,
                    width,
                    height,
                    cornerRadius: 4,
                    fill: this.metrics.tileFill,
                    stroke: this.metrics.tileStroke,
                    strokeWidth: 1.5,
                    shadowColor: this.metrics.tileShadow,
                    shadowBlur: this.lowPowerMode ? 0 : 3,
                    shadowOffsetY: this.lowPowerMode ? 0 : 1,
                    perfectDrawEnabled: false,
                    shadowForStrokeEnabled: false
                });

                entry.divider.setAttrs({
                    x: node.orientation === 'horizontal' ? -1 : -width / 2 + 0.5,
                    y: node.orientation === 'horizontal' ? -height / 2 : -1,
                    width: node.orientation === 'horizontal' ? 2 : width - 1,
                    height: node.orientation === 'horizontal' ? height : 2,
                    fill: this.metrics.tileDivider,
                    opacity: 0.95
                });

                const values = [node.displayA ?? node.tile?.a ?? 0, node.displayB ?? node.tile?.b ?? 0];
                let pipCursor = 0;
                for (let halfIndex = 0; halfIndex < values.length; halfIndex++) {
                    const halfValue = Number(values[halfIndex]) || 0;
                    const halfX = node.orientation === 'horizontal'
                        ? (halfIndex === 0 ? -width / 2 : 0)
                        : -width / 2;
                    const halfY = node.orientation === 'horizontal'
                        ? -height / 2
                        : (halfIndex === 0 ? -height / 2 : 0);
                    const halfW = node.orientation === 'horizontal' ? width / 2 : width;
                    const halfH = node.orientation === 'horizontal' ? height : height / 2;
                    const pips = pipLayout(halfValue, node.orientation === 'horizontal' ? 'horizontal' : 'vertical');

                    for (let slotIndex = 0; slotIndex < 9; slotIndex++) {
                        const pip = entry.pipCircles[pipCursor++];
                        const position = getPipPosition(slotIndex, halfX, halfY, halfW, halfH);
                        const filled = pips.includes(slotIndex);
                        pip.setAttrs({
                            x: position.x,
                            y: position.y,
                            radius: Math.max(2.4, this.metrics.pipSize / 2),
                            fill: filled ? this.metrics.pipFill : 'rgba(0,0,0,0)',
                            opacity: filled ? 1 : 0,
                            shadowColor: this.metrics.pipShadow,
                            shadowBlur: filled && !this.lowPowerMode ? 1.4 : 0,
                            shadowOffsetY: filled && !this.lowPowerMode ? 0.6 : 0
                        });
                    }
                }

                if (i === board.crossNodeId && board.crossSidesClosed >= 2) {
                    entry.tile.setAttrs({
                        stroke: '#f0c040',
                        strokeWidth: 1.7
                    });
                }
            }

            if (isPendingTravel) {
                entry.group.visible(false);
                this.animatedTileIds.add(tileId);
            } else if (isActiveTravel) {
                this.animatedTileIds.add(tileId);
            } else if (isNewestTile && !isReducedMotion) {
                entry.group.opacity(0);
                entry.group.scale({ x: 0.84, y: 0.84 });
                entry.group.to({
                    opacity: 1,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 0.24
                });
                this.animatedTileIds.add(tileId);
            } else {
                this.animatedTileIds.add(tileId);
            }

            entry.group.zIndex(i);
        }

        for (const [tileId, entry] of this.tileGroupsById.entries()) {
            if (nextTileIds.has(tileId)) continue;
            try { entry.group.destroy(); } catch {}
            this.tileGroupsById.delete(tileId);
            this.animatedTileIds.delete(tileId);
        }

        this.pruneAnchors(nextTileIds, nextNodeIds);

        return { createdTiles, updatedTiles, totalTiles: board.nodes.length };
    }

    syncOpenEnds(Konva, board, layout) {
        const openEnds = Array.isArray(board.openEnds) ? board.openEnds : [];
        const nextKeys = new Set();
        const pillHeight = 18;
        const bottomPadding = Math.max(8, Math.min(14, layout.stageHeight * 0.025));
        const minY = layout.stageHeight * 0.84;
        const maxY = layout.stageHeight - 8 - (pillHeight / 2);
        const preferredY = layout.stageHeight - bottomPadding - (pillHeight / 2);
        const baseY = Math.min(maxY, Math.max(minY, preferredY));

        for (let i = 0; i < openEnds.length; i++) {
            const oe = openEnds[i];
            const key = `${oe.nodeId ?? ''}:${oe.side ?? ''}:${oe.value ?? ''}:${oe.growthDir ?? ''}`;
            nextKeys.add(key);
            const label = String(oe.value ?? '');
            const pillWidth = Math.max(18, 11 + label.length * 7);
            const pillHeight = 18;
            const pillX = layout.stageWidth / 2 + (i - (openEnds.length - 1) / 2) * (pillWidth + 6);
            let entry = this.openEndGroupsByKey.get(key);
            if (!entry) {
                const group = new Konva.Group({ listening: false });
                const bg = new Konva.Rect({
                    x: -pillWidth / 2,
                    y: -pillHeight / 2,
                    width: pillWidth,
                    height: pillHeight,
                    cornerRadius: 9,
                    fill: PILL_BG,
                    stroke: PILL_STROKE,
                    strokeWidth: 1,
                    listening: false
                });
                const text = new Konva.Text({
                    x: -pillWidth / 2,
                    y: -(pillHeight / 2),
                    width: pillWidth,
                    height: pillHeight,
                    align: 'center',
                    verticalAlign: 'middle',
                    text: label,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    fill: PILL_TEXT,
                    listening: false
                });
                group.add(bg);
                group.add(text);
                this.overlayGroup.add(group);
                entry = { group, bg, text };
                this.openEndGroupsByKey.set(key, entry);
            }
            entry.group.setAttrs({ x: pillX, y: baseY, visible: true });
            entry.bg.setAttrs({
                x: -pillWidth / 2,
                y: -pillHeight / 2,
                width: pillWidth,
                height: pillHeight
            });
            entry.text.setAttrs({
                x: -pillWidth / 2,
                y: -(pillHeight / 2),
                width: pillWidth,
                height: pillHeight,
                verticalAlign: 'middle',
                text: label
            });
        }

        for (const [key, entry] of this.openEndGroupsByKey.entries()) {
            if (nextKeys.has(key)) continue;
            try { entry.group.destroy(); } catch {}
            this.openEndGroupsByKey.delete(key);
        }

        if (!openEnds.length) {
            this.openEndGroupsByKey.clear();
        }
    }

    getTileRect(tileId) {
        if (!tileId) return null;
        const anchor = this.anchorElsByTileId.get(String(tileId)) || this.anchorEl?.querySelector?.(`[data-tile-id="${String(tileId)}"]`);
        return anchor?.getBoundingClientRect?.() || null;
    }

    getNodeRect(nodeId) {
        if (!Number.isInteger(Number(nodeId))) return null;
        const anchor = this.anchorElsByNodeId.get(String(nodeId)) || this.anchorEl?.querySelector?.(`[data-node-id="${String(nodeId)}"]`);
        return anchor?.getBoundingClientRect?.() || null;
    }

    getOpenEndAnchorRect(openEnd) {
        if (!openEnd) return null;
        const rect = this.getNodeRect(openEnd.nodeId);
        if (!rect) return null;
        const side = String(openEnd.side || '').trim();
        const offset = Math.max(10, Math.min(24, Math.max(rect.width, rect.height) * 0.38));
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

    getOpenEndChoiceRect(openEnd) {
        return this.getOpenEndAnchorRect(openEnd);
    }

    getOpenEndChoicePoint(openEnd, options = {}) {
        if (!openEnd) return null;
        const rect = this.getNodeRect(openEnd.nodeId);
        if (!rect) return null;
        const buttonSize = Math.max(32, Number(options.buttonSize || 42));
        const radius = buttonSize / 2;
        const gap = Math.max(6, Number(options.gap || 8));
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
            rect: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2
            },
            nodeId: openEnd.nodeId
        };
    }

    getBoardTileRects() {
        const rects = [];
        for (const [tileId, anchor] of this.anchorElsByTileId.entries()) {
            const rect = anchor?.getBoundingClientRect?.();
            if (!rect) continue;
            rects.push({
                tileId,
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2
            });
        }
        return rects;
    }

    getBoardTileLocalRects() {
        return Array.from(this.tileRects.entries()).map(([tileId, rect]) => ({
            tileId,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            centerX: rect.centerX,
            centerY: rect.centerY
        }));
    }

    ensurePlayableOpenEndOverlay() {
        if (!this.rootEl) return null;
        if (!this.playableOpenEndOverlayEl) {
            this.playableOpenEndOverlayEl = document.createElement('div');
            this.playableOpenEndOverlayEl.className = 'konva-open-end-overlay';
            this.playableOpenEndOverlayEl.style.position = 'absolute';
            this.playableOpenEndOverlayEl.style.inset = '0';
            this.playableOpenEndOverlayEl.style.zIndex = '4';
            this.playableOpenEndOverlayEl.style.pointerEvents = 'none';
            this.rootEl.appendChild(this.playableOpenEndOverlayEl);
        }
        return this.playableOpenEndOverlayEl;
    }

    clearPlayableOpenEndHighlights() {
        this.playableOpenEndHighlightsByKey.forEach((entry) => {
            try { entry.button.remove(); } catch {}
        });
        this.playableOpenEndHighlightsByKey.clear();
        if (this.playableOpenEndOverlayEl) {
            this.playableOpenEndOverlayEl.innerHTML = '';
        }
    }

    syncPlayableOpenEndHighlights(openEnds, validOpenEndIndexes, selectedTile = null, onChoose = null, onCancel = null) {
        const overlay = this.ensurePlayableOpenEndOverlay();
        if (!overlay) return;
        const indexSet = new Set(Array.isArray(validOpenEndIndexes) ? validOpenEndIndexes.map((value) => Number(value)).filter(Number.isFinite) : []);
        const openEndList = Array.isArray(openEnds) ? openEnds : [];
        const nextKeys = new Set();
        const buttonSize = window.matchMedia?.('(max-width: 390px)')?.matches ? 36 : 38;
        const buttonThickness = Math.max(16, Math.round(buttonSize / 2));
        const tapEvent = window.PointerEvent ? 'pointerup' : 'click';
        const rootRect = this.rootEl?.getBoundingClientRect?.() || { left: 0, top: 0 };
        const safeLeft = Number(rootRect.left || 0);
        const safeTop = Number(rootRect.top || 0);
        const shouldLog = window.DOMINO_DEBUG_BOARD_RENDERER === true;
        let index = 0;

        for (const validIndex of indexSet) {
            const openEnd = openEndList[validIndex];
            if (!openEnd) continue;
            const key = `${String(openEnd.nodeId ?? '')}:${String(openEnd.side ?? '')}:${String(openEnd.value ?? '')}:${validIndex}`;
            nextKeys.add(key);
            const anchorRect = this.getOpenEndAnchorRect(openEnd);
            if (!anchorRect) continue;
            const centerX = anchorRect.left + anchorRect.width / 2;
            const centerY = anchorRect.top + anchorRect.height / 2;
            const side = String(openEnd.side || '').trim();
            const isVertical = side === 'top' || side === 'bottom';
            const width = isVertical ? buttonSize : buttonThickness;
            const height = isVertical ? buttonThickness : buttonSize;
            let x = centerX - safeLeft;
            let y = centerY - safeTop;
            if (side === 'top') {
                y = anchorRect.bottom - safeTop - (height / 2);
            } else if (side === 'bottom') {
                y = anchorRect.top - safeTop + (height / 2);
            } else if (side === 'left') {
                x = anchorRect.right - safeLeft - (width / 2);
            } else if (side === 'right') {
                x = anchorRect.left - safeLeft + (width / 2);
            }
            let entry = this.playableOpenEndHighlightsByKey.get(key);
            if (!entry) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'konva-open-end-highlight';
                button.classList.add(`arrow-${side || 'bottom'}`);
                button.dataset.openEndIndex = String(validIndex);
                button.dataset.side = String(openEnd.side || '');
                button.dataset.value = String(openEnd.value ?? '');
                button.style.position = 'absolute';
                button.style.left = '0';
                button.style.top = '0';
                button.style.width = `${width}px`;
                button.style.height = `${height}px`;
                button.style.transform = 'translate(-50%, -50%)';
                button.style.border = '0';
                button.style.padding = '0';
                button.style.borderRadius = side === 'top'
                    ? '999px 999px 0 0'
                    : side === 'bottom'
                        ? '0 0 999px 999px'
                        : side === 'left'
                            ? '999px 0 0 999px'
                            : side === 'right'
                                ? '0 999px 999px 0'
                                : '999px';
                button.style.pointerEvents = 'auto';
                button.style.cursor = 'pointer';
                button.style.background = 'radial-gradient(circle at center, rgba(240,192,64,0.42) 0%, rgba(240,192,64,0.18) 48%, rgba(240,192,64,0.02) 72%, rgba(240,192,64,0) 100%)';
                button.style.boxShadow = '0 0 0 1px rgba(240,192,64,0.38), 0 0 16px rgba(240,192,64,0.32)';
                button.style.opacity = '1';
                button.style.zIndex = '5';
                const ariaLabel = this.app?.format?.('arrow-place-to', { value: openEnd.value }) || `Play to ${openEnd.value}`;
                button.setAttribute('aria-label', ariaLabel);
                button.title = ariaLabel;
                button.addEventListener(tapEvent, (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.clearPlayableOpenEndHighlights();
                    onChoose?.(validIndex);
                });
                overlay.appendChild(button);
                entry = { button, key };
                this.playableOpenEndHighlightsByKey.set(key, entry);
            }
            entry.button.style.left = `${x}px`;
            entry.button.style.top = `${y}px`;
            entry.button.dataset.openEndIndex = String(validIndex);
            entry.button.dataset.side = String(openEnd.side || '');
            entry.button.dataset.value = String(openEnd.value ?? '');
            entry.button.classList.remove('arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');
            entry.button.classList.add(`arrow-${side || 'bottom'}`);
            entry.button.classList.toggle('is-selected', Boolean(selectedTile && String(selectedTile?.id || '') === String(openEnd?.nodeId || '')));
            entry.button.style.width = `${width}px`;
            entry.button.style.height = `${height}px`;
            entry.button.style.borderRadius = side === 'top'
                ? '999px 999px 0 0'
                : side === 'bottom'
                    ? '0 0 999px 999px'
                    : side === 'left'
                        ? '999px 0 0 999px'
                        : side === 'right'
                            ? '0 999px 999px 0'
                            : '999px';
            index += 1;
        }

        for (const [key, entry] of this.playableOpenEndHighlightsByKey.entries()) {
            if (nextKeys.has(key)) continue;
            try { entry.button.remove(); } catch {}
            this.playableOpenEndHighlightsByKey.delete(key);
        }

        if (this.playableOpenEndOverlayEl) {
            this.playableOpenEndOverlayEl.style.pointerEvents = 'none';
            if (shouldLog) {
                console.debug('[KonvaPlayableOpenEnds]', {
                    count: index,
                    selectedTileId: String(selectedTile?.id || ''),
                    validIndexes: Array.from(indexSet)
                });
            }
        }
    }

    revealTile(tileId) {
        const entry = this.tileGroupsById.get(String(tileId));
        if (entry?.group) {
            entry.group.visible(true);
            entry.group.opacity(1);
            entry.group.scale({ x: 1, y: 1 });
        }
    }

    screenRectToLocalPoint(layout, rect) {
        if (!layout || !rect) return null;
        return {
            x: ((rect.left + rect.width / 2) - (layout.stageWidth / 2)) / layout.scale,
            y: ((rect.top + rect.height / 2) - (layout.stageHeight / 2)) / layout.scale
        };
    }

    async animateTileTravel(tileId, sourceRect = null, sourceNode = null) {
        const entry = this.tileGroupsById.get(String(tileId));
        if (!entry || !this.lastLayout) {
            this.revealTile(tileId);
            return Promise.resolve();
        }

        const targetRect = this.getTileRect(tileId);
        if (!targetRect) {
            this.revealTile(tileId);
            return Promise.resolve();
        }

        const Konva = getKonva();
        if (!Konva) {
            this.revealTile(tileId);
            return Promise.resolve();
        }

        const reduceMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
        if (reduceMotion) {
            this.revealTile(tileId);
            return Promise.resolve();
        }

        const layout = this.lastLayout;
        const targetLocal = {
            x: entry.group.x(),
            y: entry.group.y()
        };
        const fallbackSourceRect = sourceRect || {
            left: targetRect.left,
            top: Math.max(8, targetRect.top - Math.max(42, targetRect.height * 1.25)),
            width: targetRect.width,
            height: targetRect.height
        };
        const sourceLocal = this.screenRectToLocalPoint(layout, fallbackSourceRect);
        if (!sourceLocal) {
            this.revealTile(tileId);
            return Promise.resolve();
        }

        const sourceWidth = Math.max(1, fallbackSourceRect.width || targetRect.width);
        const sourceHeight = Math.max(1, fallbackSourceRect.height || targetRect.height);
        const scaleX = sourceWidth / Math.max(1, targetRect.width);
        const scaleY = sourceHeight / Math.max(1, targetRect.height);
        const finalX = targetLocal.x;
        const finalY = targetLocal.y;
        const distance = Math.hypot(targetLocal.x - sourceLocal.x, targetLocal.y - sourceLocal.y);
        this.log('animate-start', {
            tileId: String(tileId),
            source: { x: sourceLocal.x, y: sourceLocal.y },
            target: { x: finalX, y: finalY },
            distance: Number(distance.toFixed(2))
        });
        entry.group.visible(true);
        entry.group.position({ x: sourceLocal.x, y: sourceLocal.y });
        entry.group.opacity(1);
        entry.group.scale({
            x: Math.max(0.96, scaleX * 0.98),
            y: Math.max(0.96, scaleY * 0.98)
        });
        entry.group.rotation(0);
        this.animatedTileIds.add(String(tileId));
        this.activeTileAnimations.set(String(tileId), {
            finalX,
            finalY,
            startedAt: performance.now(),
            sourceRect: fallbackSourceRect,
            targetRect
        });
        this.layer.batchDraw();
        const duration = this.lowPowerMode
            ? Math.min(0.30, Math.max(0.20, distance / 1450))
            : Math.min(0.36, Math.max(0.24, distance / 1150));
        const targetRotation = 0;

        return new Promise((resolve) => {
            const finish = () => {
                this.activeTileAnimations.delete(String(tileId));
                this.animatedTileIds.add(String(tileId));
                entry.group.position({ x: finalX, y: finalY });
                entry.group.opacity(1);
                entry.group.scale({ x: 1, y: 1 });
                entry.group.rotation(0);
                this.layer.batchDraw();
                this.log('animate-finish', {
                    tileId: String(tileId),
                    duration: Number(duration.toFixed(3)),
                    active: this.activeTileAnimations.size
                });
                this.revealTile(tileId);
                resolve();
            };
            const tween = new Konva.Tween({
                node: entry.group,
                x: finalX,
                y: finalY,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                rotation: targetRotation,
                duration,
                easing: Konva.Easings?.EaseInOut || Konva.Easings?.EaseOut,
                onFinish: finish
            });
            if (!tween) {
                finish();
            } else {
                tween.play();
            }
        });
    }
}
