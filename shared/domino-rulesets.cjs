(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(
            require("./domino-model-core.cjs"),
            require("./domino-board-core.cjs")
        );
    } else {
        root.DominoRulesets = factory(root.DominoModelCore, root.DominoBoardCore);
    }
})(typeof globalThis !== "undefined" ? globalThis : window, function (modelCore, boardCore) {
    if (!modelCore) {
        throw new Error("DominoModelCore is not loaded");
    }
    if (!boardCore) {
        throw new Error("DominoBoardCore is not loaded");
    }

    const {
        getHandSize,
        determineFirstPlayer,
        handPoints,
        getOpeningPlayScore,
        hasInvalidOpeningHand
    } = modelCore;

    const DEFAULT_MATCH_TARGET = 365;
    const DEFAULT_INSTANT_WIN_THRESHOLD = 35;

    function getTeamMembers(state, teamIndex) {
        if (typeof state?.getTeamMembers === "function") {
            return Array.from(state.getTeamMembers(teamIndex) || []);
        }
        const hands = Array.isArray(state?.hands) ? state.hands : [];
        const limit = hands.length;
        const members = [];
        for (let index = 0; index < limit; index += 1) {
            if ((index % 2) === teamIndex) members.push(index);
        }
        return members;
    }

    function resolveBlocked(state = {}) {
        const board = state.board || state.internalBoard || null;
        const hands = Array.isArray(state.hands) ? state.hands : [];
        const boneyard = Array.isArray(state.boneyard) ? state.boneyard : [];
        if (!board?.isBlocked?.(hands, boneyard)) return null;

        if (state.isTeamMode) {
            const team0 = getTeamMembers(state, 0);
            const team1 = getTeamMembers(state, 1);
            const team0Points = team0.reduce((sum, index) => sum + handPoints(hands[index] || []), 0);
            const team1Points = team1.reduce((sum, index) => sum + handPoints(hands[index] || []), 0);
            const winningTeam = team0Points <= team1Points ? 0 : 1;
            const winners = getTeamMembers(state, winningTeam);

            let winnerIndex = winners[0] ?? 0;
            let minPoints = Infinity;
            for (const index of winners) {
                const points = handPoints(hands[index] || []);
                if (points < minPoints) {
                    minPoints = points;
                    winnerIndex = index;
                }
            }

            return {
                blocked: true,
                fish: true,
                winnerIndex,
                teamIndex: winningTeam
            };
        }

        let winnerIndex = 0;
        let minPoints = Infinity;
        for (let index = 0; index < hands.length; index += 1) {
            const points = handPoints(hands[index] || []);
            if (points < minPoints) {
                minPoints = points;
                winnerIndex = index;
            }
        }

        return {
            blocked: true,
            fish: true,
            winnerIndex,
            teamIndex: null
        };
    }

    function resolveRoundEnd(state = {}) {
        const score = Number(state.score || 0);
        const hand = Array.isArray(state.hand) ? state.hand : [];
        const playerIndex = Number.isInteger(Number(state.playerIndex)) ? Number(state.playerIndex) : 0;
        const instantWinEnabled = state.instantWinEnabled !== false;
        const instantWinThreshold = Number(state.instantWinThreshold || DEFAULT_INSTANT_WIN_THRESHOLD);

        if (instantWinEnabled && score >= instantWinThreshold) {
            return {
                isFinalMove: true,
                isInstantWin: true,
                finishKind: state.isGosha ? "instant_win_gosha" : "instant_win",
                winnerIndex: playerIndex,
                fish: false,
                dealEnd: false,
                roundEnd: true
            };
        }

        if (hand.length === 0) {
            return {
                isFinalMove: true,
                isInstantWin: false,
                finishKind: state.isGosha ? "gosha" : "tile",
                winnerIndex: playerIndex,
                fish: false,
                dealEnd: true,
                roundEnd: false
            };
        }

        const blocked = resolveBlocked(state);
        if (blocked) {
            return {
                isFinalMove: true,
                isInstantWin: false,
                finishKind: "fish",
                winnerIndex: blocked.winnerIndex,
                fish: true,
                dealEnd: true,
                roundEnd: false
            };
        }

        return {
            isFinalMove: false,
            isInstantWin: false,
            finishKind: state.isGosha ? "gosha" : "tile",
            winnerIndex: playerIndex,
            fish: false,
            dealEnd: false,
            roundEnd: false
        };
    }

    const telefonRuleset = Object.freeze({
        id: "telefon",
        matchTarget: DEFAULT_MATCH_TARGET,
        instantWinThreshold: DEFAULT_INSTANT_WIN_THRESHOLD,
        getHandSize(playerCount) {
            return getHandSize(playerCount);
        },
        determineFirstPlayer(hands) {
            return determineFirstPlayer(hands);
        },
        needsRedeal(hand) {
            return hasInvalidOpeningHand(hand);
        },
        openingPlayScore(tile, currentScore) {
            return getOpeningPlayScore(tile, currentScore);
        },
        scoreDuringPlay(board) {
            return board?.calculateScore?.() || 0;
        },
        handPoints(hand) {
            return handPoints(Array.isArray(hand) ? hand : []);
        },
        resolveBlocked,
        resolveRoundEnd
    });

    function getRuleset(mode = "telefon") {
        const normalizedMode = String(mode || "telefon").trim().toLowerCase();
        if (!normalizedMode || normalizedMode === "telefon") {
            return telefonRuleset;
        }
        return telefonRuleset;
    }

    return {
        getRuleset,
        telefonRuleset,
        resolveBlocked,
        resolveRoundEnd
    };
});
