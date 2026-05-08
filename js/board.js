import { Tile } from './model.js';
// Board state, open ends, scoring
const TILE_W = 66, TILE_H = 34, TILE_GAP = 2;

export class OpenEnd {
    constructor(nodeId, side, value, growthDir) { 
        this.nodeId = nodeId; 
        this.side = side; 
        this.value = value;
        this.growthDir = growthDir || side; // left, right, top, bottom
    }
}
export class BoardNode {
    constructor(tile, x, y, orientation, displayA, displayB) {
        this.tile = tile; this.x = x; this.y = y; this.orientation = orientation;
        this.displayA = displayA !== undefined ? displayA : tile.a;
        this.displayB = displayB !== undefined ? displayB : tile.b;
        this.connections = {};
    }
}

export class Board {
    constructor() { this.nodes = []; this.openEnds = []; this.crossNodeId = null; this.crossSidesClosed = 0; }
    get isEmpty() { return this.nodes.length === 0; }

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
        const oe = this.openEnds[openEndIndex];
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
                for (const s of ['top', 'bottom']) {
                    if (!crossNode.connections[s] && !this.openEnds.some(e => e.nodeId === this.crossNodeId && e.side === s)) {
                        this.openEnds.push(new OpenEnd(this.crossNodeId, s, cv, s));
                    }
                }
            }
        }

        return score;
    }

    calculateScore() {
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
        if (hasCrossEnd) sum += 2 * this.nodes[this.crossNodeId].tile.a;
        return sum;
    }

    findOpenEndIndex(nodeId, side) {
        return this.openEnds.findIndex((oe) => oe.nodeId === nodeId && oe.side === side);
    }

    getGoshaCombo(hand) {
        if (this.isEmpty || this.openEnds.length < 2) return null;
        
        const possibleMatches = []; 
        const usedTiles = new Set();
        for (let j = 0; j < this.openEnds.length; j++) {
            const oe = this.openEnds[j];
            for (let i = 0; i < hand.length; i++) {
                if (!usedTiles.has(i) && hand[i].hasValue(oe.value)) {
                    possibleMatches.push({
                        tileIndex: i,
                        openEndIndex: j,
                        nodeId: oe.nodeId,
                        side: oe.side,
                        value: oe.value
                    });
                    usedTiles.add(i);
                    break;
                }
            }
        }

        if (possibleMatches.length < 2) return null;

        const getCombinations = (arr) => {
            const result = [];
            const f = (prefix, rem) => {
                for (let i = 0; i < rem.length; i++) {
                    const next = [...prefix, rem[i]];
                    result.push(next);
                    f(next, rem.slice(i + 1));
                }
            };
            f([], arr);
            return result.filter(c => c.length >= 2);
        };

        const getPermutations = (arr) => {
            if (arr.length <= 1) return [arr];
            const result = [];
            const used = new Array(arr.length).fill(false);
            const current = [];
            const walk = () => {
                if (current.length === arr.length) {
                    result.push(current.map((item) => ({ ...item })));
                    return;
                }
                for (let i = 0; i < arr.length; i++) {
                    if (used[i]) continue;
                    used[i] = true;
                    current.push(arr[i]);
                    walk();
                    current.pop();
                    used[i] = false;
                }
            };
            walk();
            return result;
        };

        const combos = getCombinations(possibleMatches);
        let bestCombo = null;
        let bestScore = 0;

        for (const combo of combos) {
            for (const order of getPermutations(combo)) {
                const sim = cloneBoard(this);
                let valid = true;
                for (const m of order) {
                    const idx = sim.findOpenEndIndex(m.nodeId, m.side);
                    if (idx === -1) {
                        valid = false;
                        break;
                    }
                    const tile = hand[m.tileIndex];
                    const oe = sim.openEnds[idx];
                    if (!tile || !tile.hasValue(oe.value)) {
                        valid = false;
                        break;
                    }
                    sim.placeTile(tile, idx);
                }
                if (!valid) continue;
                const score = sim.calculateScore();
                if (score > 0) {
                    if (!bestCombo || order.length > bestCombo.length || (order.length === bestCombo.length && score > bestScore)) {
                        bestCombo = order;
                        bestScore = score;
                    }
                }
            }
        }

        return bestCombo ? { matches: bestCombo.map((m) => ({ ...m })), score: bestScore } : null;
    }

    getValidMoves(hand) {
        const moves = [];
        if (this.isEmpty) { for (let i = 0; i < hand.length; i++) moves.push({ tileIndex: i, openEndIndex: -1 }); return moves; }
        for (let i = 0; i < hand.length; i++) {
            const t = hand[i];
            for (let j = 0; j < this.openEnds.length; j++)
                if (t.hasValue(this.openEnds[j].value)) moves.push({ tileIndex: i, openEndIndex: j });
        }
        return moves;
    }
    canPlayTile(t) { return this.isEmpty || this.openEnds.some(oe => t.hasValue(oe.value)); }
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

export function cloneBoard(b) {
    const c = new Board();
    if (!b || !Array.isArray(b.nodes) || !Array.isArray(b.openEnds)) return c;
    c.nodes = b.nodes.map(n => { 
        const tile = new Tile(n.tile.a, n.tile.b);
        const nn = new BoardNode(tile, n.x, n.y, n.orientation, n.displayA, n.displayB); 
        nn.connections = { ...n.connections }; 
        return nn; 
    });
    c.openEnds = b.openEnds.map(oe => new OpenEnd(oe.nodeId, oe.side, oe.value, oe.growthDir));
    c.crossNodeId = b.crossNodeId; c.crossSidesClosed = b.crossSidesClosed;
    return c;
}

export function reconstructBoard(data) {
    return cloneBoard(data);
}
