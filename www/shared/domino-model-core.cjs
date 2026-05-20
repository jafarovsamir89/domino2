(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.DominoModelCore = factory();
    }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
    let nodeCrypto = null;
    try {
        if (typeof require === "function") {
            nodeCrypto = require("crypto");
        }
    } catch {
        nodeCrypto = null;
    }

    class Tile {
        constructor(a, b) {
            this.a = a;
            this.b = b;
            this.id = `${a}-${b}`;
        }
        get isDouble() { return this.a === this.b; }
        get total() { return this.a + this.b; }
        hasValue(v) { return this.a === v || this.b === v; }
        otherSide(v) { return this.a === v ? this.b : (this.b === v ? this.a : -1); }
        toString() { return `[${this.a}|${this.b}]`; }
    }

    let fallbackSeed = (Date.now() ^ Math.floor(((globalThis.performance?.now?.() || 0) * 1000))) >>> 0;
    function fallbackRandomInt(max) {
        fallbackSeed = (1664525 * fallbackSeed + 1013904223) >>> 0;
        return max > 0 ? fallbackSeed % max : 0;
    }

    function randomInt(max) {
        if (nodeCrypto?.randomInt) {
            return nodeCrypto.randomInt(0, max);
        }
        if (globalThis.crypto?.getRandomValues) {
            return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % max;
        }
        return fallbackRandomInt(max);
    }

    function createFullSet() {
        const t = [];
        for (let a = 0; a <= 6; a++) {
            for (let b = a; b <= 6; b++) t.push(new Tile(a, b));
        }
        return t;
    }

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = randomInt(i + 1);
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function getHandSize() { return 7; }

    function determineFirstPlayer(hands) {
        for (let p = 0; p < hands.length; p++) {
            for (let i = 0; i < hands[p].length; i++) {
                const t = hands[p][i];
                if ((t.a === 3 && t.b === 2) || (t.a === 2 && t.b === 3)) return { player: p, tileIndex: i };
            }
        }
        for (let v = 1; v <= 6; v++) {
            for (let p = 0; p < hands.length; p++) {
                for (let i = 0; i < hands[p].length; i++) {
                    if (hands[p][i].isDouble && hands[p][i].a === v) return { player: p, tileIndex: i };
                }
            }
        }
        for (let p = 0; p < hands.length; p++) {
            for (let i = 0; i < hands[p].length; i++) {
                if (hands[p][i].isDouble && hands[p][i].a === 0) return { player: p, tileIndex: i };
            }
        }
        let best = null, bp = 0, bi = 0;
        for (let p = 0; p < hands.length; p++) {
            for (let i = 0; i < hands[p].length; i++) {
                if (!best || hands[p][i].total < best.total) {
                    best = hands[p][i];
                    bp = p;
                    bi = i;
                }
            }
        }
        return { player: bp, tileIndex: bi };
    }

    function handPoints(hand) {
        if (hand.length === 1) {
            const tile = hand[0];
            if (tile && tile.isDouble && tile.a === 0) return 10;
        }
        return hand.reduce((s, t) => s + t.total, 0);
    }

    function getOpeningPlayScore(tile, currentScore = 0) {
        if (!tile?.isDouble || tile.a !== 5) return 0;
        return Number(currentScore || 0) >= 300 ? 0 : 10;
    }

    function countDistinctGosha(hand = []) {
        return new Set(
            (Array.isArray(hand) ? hand : [])
                .filter((tile) => tile?.isDouble)
                .map((tile) => tile.a)
        ).size;
    }

    function hasInvalidOpeningHand(hand = []) {
        return countDistinctGosha(hand) >= 5;
    }

    function roundTo5(n) {
        return Math.ceil(n / 5) * 5;
    }

    return {
        Tile,
        createFullSet,
        shuffle,
        getHandSize,
        determineFirstPlayer,
        handPoints,
        getOpeningPlayScore,
        countDistinctGosha,
        hasInvalidOpeningHand,
        roundTo5
    };
});
