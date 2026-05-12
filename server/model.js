const crypto = require("crypto");

class Tile {
    constructor(a, b) { this.a = a; this.b = b; this.id = `${a}-${b}`; }
    get isDouble() { return this.a === this.b; }
    get total() { return this.a + this.b; }
    hasValue(v) { return this.a === v || this.b === v; }
    otherSide(v) { return this.a === v ? this.b : (this.b === v ? this.a : -1); }
    toString() { return `[${this.a}|${this.b}]`; }
}
function createFullSet() {
    const t = [];
    for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) t.push(new Tile(a, b));
    return t;
}
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function getHandSize(pc) { return 7; }

function determineFirstPlayer(hands) {
    // [3|2] first
    for (let p = 0; p < hands.length; p++)
        for (let i = 0; i < hands[p].length; i++) {
            const t = hands[p][i];
            if ((t.a === 3 && t.b === 2) || (t.a === 2 && t.b === 3)) return { player: p, tileIndex: i };
        }
    // Min double from [1|1]
    for (let v = 1; v <= 6; v++)
        for (let p = 0; p < hands.length; p++)
            for (let i = 0; i < hands[p].length; i++)
                if (hands[p][i].isDouble && hands[p][i].a === v) return { player: p, tileIndex: i };
    // [0|0]
    for (let p = 0; p < hands.length; p++)
        for (let i = 0; i < hands[p].length; i++)
            if (hands[p][i].isDouble && hands[p][i].a === 0) return { player: p, tileIndex: i };
    // Fallback
    let best = null, bp = 0, bi = 0;
    for (let p = 0; p < hands.length; p++)
        for (let i = 0; i < hands[p].length; i++)
            if (!best || hands[p][i].total < best.total) { best = hands[p][i]; bp = p; bi = i; }
    return { player: bp, tileIndex: bi };
}

function handPoints(hand) {
    if (hand.length === 1) {
        const tile = hand[0];
        if (tile && tile.isDouble && tile.a === 0) return 10;
    }
    return hand.reduce((s, t) => s + t.total, 0);
}
// Round UP to nearest 5
function roundTo5(n) { return Math.ceil(n / 5) * 5; }

module.exports = { Tile, createFullSet, shuffle, getHandSize, determineFirstPlayer, handPoints, roundTo5 };
