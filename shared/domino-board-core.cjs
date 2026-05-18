const boardModelCore = typeof module === "object" && module.exports
    ? require("./domino-model-core.cjs")
    : globalThis.DominoModelCore;

if (!boardModelCore) {
    throw new Error("DominoModelCore is not loaded");
}

const { Tile } = boardModelCore;
// Board state, open ends, scoring
const TILE_W = 66, TILE_H = 34, TILE_GAP = 2;

class OpenEnd {
    constructor(nodeId, side, value, growthDir) { 
        this.nodeId = nodeId; 
        this.side = side; 
        this.value = value;
        this.growthDir = growthDir || side; // left, right, top, bottom
    }
}
class BoardNode {
    constructor(tile, x, y, orientation, displayA, displayB) {
        this.tile = tile; this.x = x; this.y = y; this.orientation = orientation;
        this.displayA = displayA !== undefined ? displayA : tile.a;
        this.displayB = displayB !== undefined ? displayB : tile.b;
        this.connections = {};
    }

    toJSON() {
        return {
            tile: { a: this.tile.a, b: this.tile.b },
            x: this.x,
            y: this.y,
            orientation: this.orientation,
            displayA: this.displayA,
            displayB: this.displayB,
            connections: { ...this.connections }
        };
    }
}

class Board {
    constructor() { this.nodes = []; this.openEnds = []; this.crossNodeId = null; this.crossSidesClosed = 0; }
    get isEmpty() { return this.nodes.length === 0; }

    isOpenEndAvailable(oe) {
        if (!oe) return false;
        const node = this.nodes[oe.nodeId];
        if (!node) return false;
        return !Object.prototype.hasOwnProperty.call(node.connections || {}, oe.side);
    }

    normalizeOpenEnds() {
        const seen = new Set();
        this.openEnds = this.openEnds.filter((oe) => {
            if (!this.isOpenEndAvailable(oe)) return false;
            const key = `${oe.nodeId}:${oe.side}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    toJSON() {
        return {
            nodes: this.nodes.map((node) => node.toJSON()),
            openEnds: this.openEnds.map((oe) => ({
                nodeId: oe.nodeId,
                side: oe.side,
                value: oe.value,
                growthDir: oe.growthDir
            })),
            crossNodeId: this.crossNodeId,
            crossSidesClosed: this.crossSidesClosed
        };
    }

    static fromJSON(data) {
        const board = new Board();
        if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.openEnds)) return board;
        board.nodes = data.nodes.map((n) => {
            const tile = new Tile(n.tile?.a ?? 0, n.tile?.b ?? 0);
            const node = new BoardNode(tile, n.x, n.y, n.orientation, n.displayA, n.displayB);
            node.connections = { ...(n.connections || {}) };
            return node;
        });
        board.openEnds = data.openEnds.map((oe) => new OpenEnd(oe.nodeId, oe.side, oe.value, oe.growthDir));
        board.crossNodeId = data.crossNodeId ?? null;
        board.crossSidesClosed = data.crossSidesClosed ?? 0;
        return board;
    }

    placeFirst(tile) {
        const orientation = tile.isDouble ? 'vertical' : 'horizontal';
        const node = new BoardNode(tile, 0, 0, orientation, tile.a, tile.b);
        this.nodes.push(node);
        const id = 0;
        this.openEnds = [
            new OpenEnd(id, 'left', tile.a, 'left'), 
            new OpenEnd(id, 'right', tile.isDouble ? tile.a : tile.b, 'right')
        ];
        
        // Only [5|5] scores on first play
        if (tile.isDouble && tile.a === 5) return 10;
        return 0;
    }

    placeTile(tile, openEndIndex) {
        this.normalizeOpenEnds();
        const oe = this.openEnds[openEndIndex];
        if (!this.isOpenEndAvailable(oe)) return 0;
        const parent = this.nodes[oe.nodeId];
        const val = oe.value;
        const pos = this.calcPosition(parent, oe.side, tile, val, oe.growthDir);
        const other = tile.isDouble ? tile.a : tile.otherSide(val);
        let dA, dB;
        if (tile.isDouble) { dA = tile.a; dB = tile.b; }
        else if (pos.orientation === 'horizontal') {
            if (pos.growthDir === 'left') { dA = other; dB = val; }
            else { dA = val; dB = other; }
        } else {
            if (pos.growthDir === 'top') { dA = other; dB = val; }
            else { dA = val; dB = other; }
        }

        const node = new BoardNode(tile, pos.x, pos.y, pos.orientation, dA, dB);
        const nodeId = this.nodes.length;
        this.nodes.push(node);
        node.connections[oppSide(oe.side)] = oe.nodeId;
        parent.connections[oe.side] = nodeId;
        this.openEnds.splice(openEndIndex, 1);

        // Snake/Turn Logic
        const MAX_W = 210, MAX_H = 350;
        let gDir = oe.growthDir;
        if (gDir === 'right' && node.x > MAX_W) gDir = 'bottom';
        else if (gDir === 'left' && node.x < -MAX_W) gDir = 'top';
        else if (gDir === 'bottom' && node.y > MAX_H) gDir = 'left';
        else if (gDir === 'top' && node.y < -MAX_H) gDir = 'right';

        const nextVal = tile.isDouble ? tile.a : other;
        this.openEnds.push(new OpenEnd(nodeId, this.getOpenSide(node, nextVal, gDir, oe.side), nextVal, gDir));

        // Telephone Logic: The FIRST double to get 2 connections becomes the Telephone
        if (this.crossNodeId === null) {
            // Check if any double now has 2 connections (left and right)
            for (let i = 0; i < this.nodes.length; i++) {
                const n = this.nodes[i];
                if (n.tile.isDouble) {
                    const connCount = Object.keys(n.connections).length;
                    if (connCount >= 2) {
                        this.crossNodeId = i;
                        this.crossSidesClosed = connCount;
                        break;
                    }
                }
            }
        } else if (oe.nodeId === this.crossNodeId) {
            this.crossSidesClosed = Object.keys(parent.connections).length;
        }

        const score = this.calculateScore();

        // After scoring, if a Telephone was just established or updated, open top/bottom
        if (this.crossNodeId !== null) {
            const crossNode = this.nodes[this.crossNodeId];
            if (Object.keys(crossNode.connections).length >= 2) {
                const cv = crossNode.tile.a;
                const branchSides = ['top', 'bottom', 'left', 'right'];
                for (const s of branchSides) {
                    if (!crossNode.connections[s] && !this.openEnds.some(e => e.nodeId === this.crossNodeId && e.side === s)) {
                        this.openEnds.push(new OpenEnd(this.crossNodeId, s, cv, s));
                    }
                }
            }
        }

        this.normalizeOpenEnds();

        return score;
    }

    calculateScore() {
        this.normalizeOpenEnds();
        const sum = this.getOpenEndsScore();
        return (sum > 0 && sum % 5 === 0) ? sum : 0;
    }

    getOpenEndsScore() {
        let sum = 0, hasCrossEnd = false;
        for (const oe of this.openEnds) {
            if (oe.nodeId === this.crossNodeId) {
                if (this.crossSidesClosed >= 2) {
                    // Telephone established — empty branches do not score
                } else {
                    hasCrossEnd = true;
                }
            } else {
                const n = this.nodes[oe.nodeId];
                sum += n.tile.isDouble ? (n.tile.a + n.tile.b) : oe.value;
            }
        }
        const crossNode = this.crossNodeId === null ? null : this.nodes[this.crossNodeId];
        if (hasCrossEnd && crossNode?.tile) sum += 2 * crossNode.tile.a;
        return sum;
    }

    findOpenEndIndex(nodeId, side) {
        this.normalizeOpenEnds();
        return this.openEnds.findIndex((oe) => oe.nodeId === nodeId && oe.side === side);
    }

    getGoshaCombo(hand) {
        this.normalizeOpenEnds();
        if (this.isEmpty || this.openEnds.length < 2) return null;
        let bestCombo = null;
        let bestScore = 0;

        const search = (boardState, availableTiles, chain = []) => {
            const options = [];
            for (const oe of boardState.openEnds) {
                for (const item of availableTiles) {
                    if (item.tile?.isDouble && item.tile.a === oe.value) {
                        options.push({
                            tileIndex: item.tileIndex,
                            tile: item.tile,
                            nodeId: oe.nodeId,
                            side: oe.side,
                            value: oe.value
                        });
                    }
                }
            }

            for (const option of options) {
                const sim = cloneBoard(boardState);
                const openEndIndex = sim.findOpenEndIndex(option.nodeId, option.side);
                if (openEndIndex === -1) continue;
                sim.placeTile(option.tile, openEndIndex);

                const nextChain = chain.concat({
                    tileIndex: option.tileIndex,
                    nodeId: option.nodeId,
                    side: option.side,
                    value: option.value
                });
                const score = sim.calculateScore();
                if (nextChain.length >= 2 && score > 0) {
                    if (!bestCombo || nextChain.length > bestCombo.length || (nextChain.length === bestCombo.length && score > bestScore)) {
                        bestCombo = nextChain;
                        bestScore = score;
                    }
                }

                const remainingTiles = availableTiles.filter((item) => item.tileIndex !== option.tileIndex);
                if (remainingTiles.length > 0) {
                    search(sim, remainingTiles, nextChain);
                }
            }
        };

        search(this, hand.map((tile, tileIndex) => ({ tile, tileIndex })));

        return bestCombo ? { matches: bestCombo.map((m) => ({ ...m })), score: bestScore } : null;
    }

    getValidMoves(hand) {
        this.normalizeOpenEnds();
        const moves = [];
        if (this.isEmpty) { for (let i = 0; i < hand.length; i++) moves.push({ tileIndex: i, openEndIndex: -1 }); return moves; }
        for (let i = 0; i < hand.length; i++) {
            const t = hand[i];
            for (let j = 0; j < this.openEnds.length; j++)
                if (t.hasValue(this.openEnds[j].value)) moves.push({ tileIndex: i, openEndIndex: j });
        }
        return moves;
    }
    canPlayTile(t) {
        this.normalizeOpenEnds();
        return this.isEmpty || this.openEnds.some(oe => t.hasValue(oe.value));
    }
    canPlayAny(h) { return this.isEmpty ? h.length > 0 : h.some(t => this.canPlayTile(t)); }
    calcPosition(p, side, tile, openValue, growthDir=side) {
        const sideAxis = (side === 'left' || side === 'right') ? 'horizontal' : 'vertical';
        const growthAxis = (growthDir === 'left' || growthDir === 'right') ? 'horizontal' : 'vertical';
        
        let o;
        if (tile.isDouble) {
            o = sideAxis === 'horizontal' ? 'vertical' : 'horizontal';
        } else {
            o = growthAxis === 'horizontal' ? 'horizontal' : 'vertical';
        }
        const isH = o === 'horizontal';

        const parentPoint = this.getConnectionPoint(p, side, openValue);
        let x = parentPoint.x, y = parentPoint.y;

        // Move center of new tile away from parent edge
        const hw = isH ? 33 : 17;
        const hh = isH ? 17 : 33;

        if (side === 'right') x += hw + TILE_GAP;
        else if (side === 'left') x -= hw + TILE_GAP;
        else if (side === 'bottom') y += hh + TILE_GAP;
        else if (side === 'top') y -= hh + TILE_GAP;

        // If it's a turn on the NEW tile (side connection), shift by 16.5
        if (!tile.isDouble && sideAxis !== growthAxis) {
            if (sideAxis === 'horizontal') {
                // New tile is vertical, we are connecting to its side
                y += (growthDir === 'bottom' ? 16.5 : -16.5);
            } else {
                // New tile is horizontal, we are connecting to its side
                x += (growthDir === 'right' ? 16.5 : -16.5);
            }
        }

        return { x, y, orientation: o, growthDir };
    }

    getConnectionPoint(node, side, value) {
        let x = node.x, y = node.y;
        const isH = node.orientation === 'horizontal';
        const isD = node.tile.isDouble;
        
        // 1. Move to the physical edge of the parent tile
        if (side === 'right') x += (isH ? 33 : 17);
        else if (side === 'left') x -= (isH ? 33 : 17);
        else if (side === 'bottom') y += (isH ? 17 : 33);
        else if (side === 'top') y -= (isH ? 17 : 33);

        // 2. If it's a side connection on the parent (not a double), 
        // offset to the center of the matching half
        if (!isD) {
            const sideAxis = (side === 'left' || side === 'right') ? 'horizontal' : 'vertical';
            const nodeAxis = isH ? 'horizontal' : 'vertical';
            if (sideAxis !== nodeAxis) {
                const valueOffset = node.displayA === value ? -1 : 1;
                if (isH) x += valueOffset * 16.5;
                else y += valueOffset * 16.5;
            }
        }
        return { x, y };
    }

    getOpenSide(node, value, growthDir, connectedSide) {
        let side;
        if (node.tile.isDouble) side = growthDir || oppSide(connectedSide);
        else if (node.orientation === 'horizontal') side = node.displayA === value ? 'left' : 'right';
        else side = node.displayA === value ? 'top' : 'bottom';

        if (!node.connections[side]) return side;
        const opposite = oppSide(side);
        if (!node.connections[opposite]) return opposite;
        return ['right', 'bottom', 'left', 'top'].find(s => !node.connections[s]) || side;
    }

    isBlocked(hands, boneyard) {
        if (boneyard.length > 0 || hands.some(h => h.length === 0)) return false;
        return hands.every(h => !this.canPlayAny(h));
    }
}
function oppSide(s) { return { left:'right', right:'left', top:'bottom', bottom:'top' }[s] || s; }

function cloneBoard(b) {
    return Board.fromJSON(b?.toJSON ? b.toJSON() : b);
}

function reconstructBoard(data) {
    return Board.fromJSON(data);
}

const boardExports = { OpenEnd, BoardNode, Board, cloneBoard, reconstructBoard };

if (typeof module === "object" && module.exports) {
    module.exports = boardExports;
} else {
    globalThis.DominoBoardCore = boardExports;
}
