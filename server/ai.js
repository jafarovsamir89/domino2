const { cloneBoard } = require("./board");
const crypto = require("crypto");

// Keep bot decision-making intentionally simple and deterministic enough for multiplayer.
const DIFF = {
    easy:   { scoreW: 5,  doubleB: 1,  totalW: 0.2, futureW: 0,   goOut: 30,  handP: 0,    rand: 8,  blockW: 0   },
    medium: { scoreW: 10, doubleB: 3,  totalW: 0.5, futureW: 0.3, goOut: 100, handP: 0.1,  rand: 2,  blockW: 0   },
    hard:   { scoreW: 15, doubleB: 4,  totalW: 0.7, futureW: 0.6, goOut: 150, handP: 0.15, rand: 0.5, blockW: 0.4 },
};

function randomFloat() {
    return crypto.randomInt(0, 1_000_000) / 1_000_000;
}

class AIPlayer {
    constructor(playerIndex, difficulty = "medium") {
        this.playerIndex = playerIndex;
        this.difficulty = difficulty;
        this.params = DIFF[difficulty] || DIFF.medium;
    }

    chooseMove(board, hand, validMoves, scores, handCounts, boneyardCount, missingSuits = null, teamContext = null) {
        if (!Array.isArray(handCounts) || !handCounts.every(count => Number.isInteger(count) && count >= 0)
            || !Number.isInteger(boneyardCount) || boneyardCount < 0) {
            throw new TypeError("AI requires public hand counts and bazaar count");
        }
        if (validMoves.length === 0) return null;
        if (validMoves.length === 1) return validMoves[0];

        let bestMove = validMoves[0];
        let bestScore = -Infinity;
        for (const move of validMoves) {
            const score = this.evaluateMove(board, hand, move, scores, handCounts, boneyardCount, missingSuits, teamContext);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        return bestMove;
    }

    evaluateMove(board, hand, move, scores, handCounts, boneyardCount, missingSuits, teamContext) {
        const P = this.params;
        const tile = hand[move.tileIndex];
        let score = 0;

        const sim = this.simulateMove(board, tile, move.openEndIndex);
        const pointsScored = sim.score;
        score += pointsScored * P.scoreW;

        if (tile.isDouble) score += P.doubleB;
        score += tile.total * P.totalW;

        const openEndValues = sim.board.openEnds.map((oe) => oe.value);
        const remainingHand = hand.filter((_, i) => i !== move.tileIndex);
        let futureOptions = 0;
        for (const t of remainingHand) {
            for (const v of openEndValues) {
                if (t.hasValue(v)) futureOptions++;
            }
        }
        score += futureOptions * P.futureW;

        if (remainingHand.length === 0) score += P.goOut;

        const remainingPoints = remainingHand.reduce((s, t) => s + t.total, 0);
        score -= remainingPoints * P.handP;

        // Hard: estimate blocking potential using tracked missing suits.
        if (P.blockW > 0) {
            if (this.difficulty === "hard" && Array.isArray(missingSuits) && missingSuits.length === handCounts.length) {
                const opponentIndexes = handCounts.map((_, i) => i).filter((i) => i !== this.playerIndex);
                const nextPlayer = (this.playerIndex + 1) % handCounts.length;
                let fullyBlockedOpponents = 0;

                for (const idx of opponentIndexes) {
                    const missing = missingSuits[idx];
                    if (!missing) continue;
                    const missingCount = openEndValues.filter((v) => missing.has(v)).length;
                    if (missingCount === openEndValues.length) {
                        fullyBlockedOpponents++;
                    } else if (missingCount > 0) {
                        score += 15 * missingCount;
                    }
                }

                if (fullyBlockedOpponents > 0) {
                    const nextMissing = missingSuits[nextPlayer];
                    const nextFullyBlocked = nextMissing && openEndValues.every((v) => nextMissing.has(v));
                    if (nextFullyBlocked || fullyBlockedOpponents === opponentIndexes.length) {
                        score += 50;
                    }
                }
            } else {
                let totalOpponentTiles = 0;
                for (let i = 0; i < handCounts.length; i++) {
                    if (i === this.playerIndex) continue;
                    totalOpponentTiles += handCounts[i];
                }
                const uniqueEndValues = new Set(openEndValues).size;
                const estimatedOptions = totalOpponentTiles * uniqueEndValues * (2 / 7);
                score -= estimatedOptions * P.blockW;
            }
        }

        if (teamContext?.isTeamMode && Number.isInteger(Number(teamContext.partnerIndex)) && Array.isArray(handCounts)) {
            const partnerIndex = Number(teamContext.partnerIndex);
            // Possibility based on visible counts and suits revealed by passes/draws.
            // Never inspect partner/opponent tiles, even for team takeover.
            const mayHavePlay = (index) => handCounts[index] > 0
                && openEndValues.some(value => !missingSuits?.[index]?.has(value));
            const partnerHasPlay = mayHavePlay(partnerIndex);
            let opponentPressure = 0;
            for (let i = 0; i < handCounts.length; i++) {
                if (i === this.playerIndex || i === partnerIndex) continue;
                if (mayHavePlay(i)) opponentPressure++;
            }

            if (partnerHasPlay) {
                score += Number(teamContext.partnerBonus ?? 6);
            } else {
                score -= Number(teamContext.partnerPenalty ?? 4);
            }
            score -= opponentPressure * Number(teamContext.opponentPenalty ?? 1);
        }

        score += randomFloat() * P.rand;
        return score;
    }

    simulateMove(board, tile, openEndIndex) {
        const simBoard = cloneBoard(board);
        let score = 0;
        if (simBoard.isEmpty) {
            score = simBoard.placeFirst(tile);
        } else {
            score = simBoard.placeTile(tile, openEndIndex);
        }
        return { board: simBoard, score };
    }
}

module.exports = { AIPlayer };
