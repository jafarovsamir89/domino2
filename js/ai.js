// AI player logic for Domino Pyaterochka

import { cloneBoard } from './board.js';

// Difficulty presets: [scoreWeight, doubleBonus, totalWeight, futureWeight, goOutBonus, handPenalty, randomness]
const DIFF = {
    easy:   { scoreW: 5,  doubleB: 1,  totalW: 0.2, futureW: 0,   goOut: 30,  handP: 0,    rand: 8,  blockW: 0   },
    medium: { scoreW: 10, doubleB: 3,  totalW: 0.5, futureW: 0.3, goOut: 100, handP: 0.1,  rand: 2,  blockW: 0   },
    hard:   { scoreW: 15, doubleB: 4,  totalW: 0.7, futureW: 0.6, goOut: 150, handP: 0.15, rand: 0.5, blockW: 0.4 },
};

let fallbackSeed = (Date.now() ^ Math.floor((window.performance?.now?.() || 0) * 1000)) >>> 0;

function fallbackRandomFloat() {
    fallbackSeed = (1664525 * fallbackSeed + 1013904223) >>> 0;
    return fallbackSeed / 0x100000000;
}

function randomFloat() {
    if (window.crypto?.getRandomValues) {
        const buf = new Uint32Array(1);
        window.crypto.getRandomValues(buf);
        return buf[0] / 0x100000000;
    }
    return fallbackRandomFloat();
}

export class AIPlayer {
    constructor(playerIndex, difficulty = 'medium') {
        this.playerIndex = playerIndex;
        this.index = playerIndex;
        this.difficulty = difficulty;
        this.params = DIFF[difficulty] || DIFF.medium;
    }

    chooseMove(board, hand, validMoves, scores, allHands, boneyard, missingSuits = null, teamContext = null) {
        if (validMoves.length === 0) return null;
        if (validMoves.length === 1) return validMoves[0];

        let bestMove = validMoves[0];
        let bestScore = -Infinity;

        for (const move of validMoves) {
            const score = this.evaluateMove(board, hand, move, scores, allHands, boneyard, missingSuits, teamContext);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        return bestMove;
    }

    evaluateMove(board, hand, move, scores, allHands, boneyard, missingSuits, teamContext) {
        const P = this.params;
        const tile = hand[move.tileIndex];
        let score = 0;

        const simBoard = this.simulateMove(board, tile, move.openEndIndex);
        const pointsScored = simBoard.score;

        // High priority: scoring points
        score += pointsScored * P.scoreW;

        // Medium: playing doubles
        if (tile.isDouble) score += P.doubleB;

        // Medium: playing high-value tiles
        score += tile.total * P.totalW;

        // Future options
        const openEndValues = simBoard.board.openEnds.map(oe => oe.value);
        const remainingHand = hand.filter((_, i) => i !== move.tileIndex);
        let futureOptions = 0;
        for (const t of remainingHand) {
            for (const v of openEndValues) {
                if (t.hasValue(v)) futureOptions++;
            }
        }
        score += futureOptions * P.futureW;

        // Going out
        if (remainingHand.length === 0) score += P.goOut;

        // Reduce remaining hand points
        const remainingPoints = remainingHand.reduce((s, t) => s + t.total, 0);
        score -= remainingPoints * P.handP;

        // Hard: estimate blocking potential using tracked missing suits.
        if (P.blockW > 0) {
            if (this.difficulty === 'hard' && Array.isArray(missingSuits) && missingSuits.length === allHands.length) {
                const opponentIndexes = allHands.map((_, i) => i).filter((i) => i !== this.playerIndex);
                const nextPlayer = (this.playerIndex + 1) % allHands.length;
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
                for (let i = 0; i < allHands.length; i++) {
                    if (i === this.playerIndex) continue;
                    totalOpponentTiles += allHands[i].length;
                }
                // Statistical estimate: each tile has ~2/7 chance of matching any given open end value
                const uniqueEndValues = new Set(openEndValues).size;
                const estimatedOptions = totalOpponentTiles * uniqueEndValues * (2 / 7);
                score -= estimatedOptions * P.blockW;
            }
        }

        if (teamContext?.isTeamMode && Number.isInteger(Number(teamContext.partnerIndex)) && Array.isArray(allHands)) {
            const partnerIndex = Number(teamContext.partnerIndex);
            const partnerHand = allHands[partnerIndex] || [];
            const partnerHasPlay = partnerHand.some((partnerTile) => openEndValues.some((value) => partnerTile?.hasValue?.(value)));
            let opponentPressure = 0;

            for (let i = 0; i < allHands.length; i++) {
                if (i === this.playerIndex || i === partnerIndex) continue;
                const opponentHand = allHands[i] || [];
                const opponentHasPlay = opponentHand.some((opponentTile) => openEndValues.some((value) => opponentTile?.hasValue?.(value)));
                if (opponentHasPlay) opponentPressure++;
            }

            if (partnerHasPlay) {
                score += Number(teamContext.partnerBonus ?? 6);
            } else {
                score -= Number(teamContext.partnerPenalty ?? 4);
            }
            score -= opponentPressure * Number(teamContext.opponentPenalty ?? 1);
        }

        // Randomness (higher = more random = easier)
        score += randomFloat() * P.rand;

        return score;
    }

    simulateMove(board, tile, openEndIndex) {
        const simBoard = cloneBoard(board);
        let score;
        if (simBoard.isEmpty) {
            score = simBoard.placeFirst(tile);
        } else {
            score = simBoard.placeTile(tile, openEndIndex);
        }
        return { board: simBoard, score };
    }

    shouldDraw(board, hand, boneyard) {
        return boneyard.length > 0 && !board.canPlayAny(hand);
    }
}
