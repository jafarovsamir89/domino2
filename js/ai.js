// AI player logic for Domino Pyaterochka

import { cloneBoard } from './board.js';

// Difficulty presets: [scoreWeight, doubleBonus, totalWeight, futureWeight, goOutBonus, handPenalty, randomness]
const DIFF = {
    easy:   { scoreW: 5,  doubleB: 1,  totalW: 0.2, futureW: 0,   goOut: 30,  handP: 0,    rand: 8,  blockW: 0   },
    medium: { scoreW: 10, doubleB: 3,  totalW: 0.5, futureW: 0.3, goOut: 100, handP: 0.1,  rand: 2,  blockW: 0   },
    hard:   { scoreW: 15, doubleB: 4,  totalW: 0.7, futureW: 0.6, goOut: 150, handP: 0.15, rand: 0.5, blockW: 0.4 },
};

export class AIPlayer {
    constructor(playerIndex, difficulty = 'medium') {
        this.playerIndex = playerIndex;
        this.index = playerIndex;
        this.difficulty = difficulty;
        this.params = DIFF[difficulty] || DIFF.medium;
    }

    chooseMove(board, hand, validMoves, scores, allHands, boneyard) {
        if (validMoves.length === 0) return null;
        if (validMoves.length === 1) return validMoves[0];

        let bestMove = validMoves[0];
        let bestScore = -Infinity;

        for (const move of validMoves) {
            const score = this.evaluateMove(board, hand, move, scores, allHands, boneyard);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        return bestMove;
    }

    evaluateMove(board, hand, move, scores, allHands, boneyard) {
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

        // Hard: try to block opponents
        if (P.blockW > 0) {
            let opponentOptions = 0;
            for (let i = 0; i < allHands.length; i++) {
                if (i === this.playerIndex) continue;
                for (const t of allHands[i]) {
                    for (const v of openEndValues) {
                        if (t.hasValue(v)) opponentOptions++;
                    }
                }
            }
            score -= opponentOptions * P.blockW;
        }

        // Randomness (higher = more random = easier)
        score += Math.random() * P.rand;

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
