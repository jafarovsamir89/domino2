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
    const CLASSIC101_MATCH_TARGET = 101;
    const CLASSIC101_ENTRY_THRESHOLD = 13;
    const CLASSIC101_MISS_STREAK_LIMIT = 3;
    const CLASSIC101_OPENING_TILE_ID = "1-1";

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

    function rawHandPoints(hand) {
        if (!Array.isArray(hand) || !hand.length) return 0;
        return hand.reduce((sum, tile) => sum + Number(tile?.total || 0), 0);
    }

    function createClassic101SideState() {
        return {
            scored: 0,
            pending: 0,
            enteredBoard: false,
            missStreak: 0
        };
    }

    function cloneClassic101SideState(side = {}) {
        return {
            scored: Math.max(0, Number(side?.scored || 0)),
            pending: Math.max(0, Number(side?.pending || 0)),
            enteredBoard: Boolean(side?.enteredBoard),
            missStreak: Math.max(0, Number(side?.missStreak || 0))
        };
    }

    function createClassic101MatchState(playerCount = 0, isTeamMode = false) {
        const sideCount = isTeamMode ? 2 : Math.max(0, Number(playerCount) || 0);
        return {
            mode: "classic101",
            carryPoints: 0,
            thresholdBypassNext: false,
            sides: Array.from({ length: sideCount }, () => createClassic101SideState())
        };
    }

    function normalizeClassic101MatchState(matchState, playerCount = 0, isTeamMode = false) {
        const fallback = createClassic101MatchState(playerCount, isTeamMode);
        const source = matchState && typeof matchState === "object" ? matchState : {};
        const desiredLength = fallback.sides.length;
        const normalizedSides = Array.isArray(source.sides)
            ? source.sides.map((side) => cloneClassic101SideState(side))
            : [];

        while (normalizedSides.length < desiredLength) {
            normalizedSides.push(createClassic101SideState());
        }

        return {
            mode: "classic101",
            carryPoints: Math.max(0, Number(source.carryPoints || 0)),
            thresholdBypassNext: Boolean(source.thresholdBypassNext),
            sides: desiredLength > 0 ? normalizedSides.slice(0, desiredLength) : normalizedSides
        };
    }

    function getClassic101SideIndex(playerIndex, isTeamMode) {
        const index = Math.max(0, Number(playerIndex) || 0);
        return isTeamMode ? (index % 2) : index;
    }

    function getClassic101TeamMembers(state, teamIndex) {
        if (typeof state?.getTeamMembers === "function") {
            return Array.from(state.getTeamMembers(teamIndex) || []);
        }
        const hands = Array.isArray(state?.hands) ? state.hands : [];
        const members = [];
        for (let index = 0; index < hands.length; index += 1) {
            if ((index % 2) === teamIndex) members.push(index);
        }
        return members;
    }

    function getClassic101SideRawPoints(state, sideIndex) {
        const hands = Array.isArray(state.hands) ? state.hands : [];
        if (state.isTeamMode) {
            return getClassic101TeamMembers(state, sideIndex).reduce((sum, index) => sum + rawHandPoints(hands[index] || []), 0);
        }
        return rawHandPoints(hands[sideIndex] || []);
    }

    function getClassic101Scoreboard(matchState, isTeamMode = false, playerCount = 0) {
        const normalized = normalizeClassic101MatchState(matchState, playerCount, isTeamMode);
        if (isTeamMode) {
            const left = Number(normalized.sides[0]?.scored || 0);
            const right = Number(normalized.sides[1]?.scored || 0);
            return {
                teamScores: [left, right],
                scores: Array.from({ length: Math.max(0, Number(playerCount) || 0) }, (_, index) => (index % 2 === 0 ? left : right))
            };
        }
        return {
            teamScores: null,
            scores: normalized.sides.map((side) => Number(side?.scored || 0))
        };
    }

    function markClassic101Miss(matchState, sideIndex, options = {}) {
        const normalized = normalizeClassic101MatchState(matchState, Number(options.playerCount || 0), Boolean(options.isTeamMode));
        const side = normalized.sides[sideIndex] || createClassic101SideState();
        normalized.sides[sideIndex] = side;
        if (side.enteredBoard) {
            side.missStreak = 0;
            return normalized;
        }
        side.missStreak += 1;
        if (side.missStreak >= CLASSIC101_MISS_STREAK_LIMIT) {
            side.pending = 0;
            side.missStreak = 0;
        }
        return normalized;
    }

    function markClassic101Misses(matchState, excludedSides = [], options = {}) {
        const normalized = normalizeClassic101MatchState(matchState, Number(options.playerCount || 0), Boolean(options.isTeamMode));
        const excluded = new Set(Array.isArray(excludedSides) ? excludedSides : []);
        let nextState = normalized;
        for (let index = 0; index < nextState.sides.length; index += 1) {
            if (excluded.has(index)) continue;
            nextState = markClassic101Miss(nextState, index, options);
        }
        return nextState;
    }

    function applyClassic101Award(matchState, sideIndex, awardPoints, options = {}) {
        const normalized = normalizeClassic101MatchState(matchState, Number(options.playerCount || 0), Boolean(options.isTeamMode));
        const sides = normalized.sides;
        const side = sides[sideIndex] || createClassic101SideState();
        sides[sideIndex] = side;

        let points = Math.max(0, Number(awardPoints || 0));
        if (Number(normalized.carryPoints || 0) > 0) {
            points += Number(normalized.carryPoints || 0);
            normalized.carryPoints = 0;
        }

        const bypassThreshold = Boolean(options.bypassThreshold || normalized.thresholdBypassNext);
        if (bypassThreshold) {
            side.scored += points;
            side.pending = 0;
            side.enteredBoard = true;
            side.missStreak = 0;
            normalized.thresholdBypassNext = false;
            return {
                scoreDelta: points,
                matchState: normalized
            };
        }

        if (side.enteredBoard) {
            side.scored += points;
            side.pending = 0;
            side.missStreak = 0;
            return {
                scoreDelta: points,
                matchState: normalized
            };
        }

        side.pending += points;
        let scoreDelta = 0;
        if (side.pending >= CLASSIC101_ENTRY_THRESHOLD) {
            scoreDelta = side.pending;
            side.scored += side.pending;
            side.pending = 0;
            side.enteredBoard = true;
            side.missStreak = 0;
            normalized.thresholdBypassNext = false;
        } else {
            side.missStreak += 1;
            if (side.missStreak >= CLASSIC101_MISS_STREAK_LIMIT) {
                side.pending = 0;
                side.missStreak = 0;
            }
        }

        return {
            scoreDelta,
            matchState: normalized
        };
    }

    function createClassic101Result(base = {}) {
        return {
            isFinalMove: Boolean(base.isFinalMove),
            isInstantWin: false,
            finishKind: base.finishKind || "tile",
            winnerIndex: Number.isInteger(Number(base.winnerIndex)) ? Number(base.winnerIndex) : 0,
            fish: Boolean(base.fish),
            blocked: Boolean(base.blocked),
            tie: Boolean(base.tie),
            dealEnd: Boolean(base.dealEnd),
            roundEnd: Boolean(base.roundEnd),
            rawPoints: Number(base.rawPoints || 0),
            scoreDelta: Number(base.scoreDelta || 0),
            dryWin: Boolean(base.dryWin),
            matchTargetReached: Boolean(base.matchTargetReached),
            carryPoints: Number(base.carryPoints || 0),
            scoreboard: Array.isArray(base.scoreboard) ? base.scoreboard.slice() : [],
            teamScores: Array.isArray(base.teamScores) ? base.teamScores.slice() : null,
            matchState: base.matchState || null
        };
    }

    function resolveClassic101Blocked(state = {}) {
        const hands = Array.isArray(state.hands) ? state.hands : [];
        const isTeamMode = Boolean(state.isTeamMode);
        const matchState = normalizeClassic101MatchState(state.matchState, hands.length, isTeamMode);
        const board = state.board || state.internalBoard || null;
        const boneyard = Array.isArray(state.boneyard) ? state.boneyard : [];
        if (!board?.isBlocked?.(hands, boneyard)) {
            const scoreboard = getClassic101Scoreboard(matchState, isTeamMode, hands.length);
            return createClassic101Result({
                blocked: false,
                fish: false,
                winnerIndex: Number.isInteger(Number(state.playerIndex)) ? Number(state.playerIndex) : 0,
                scoreDelta: 0,
                rawPoints: 0,
                carryPoints: Number(matchState.carryPoints || 0),
                matchState,
                scoreboard: scoreboard.scores,
                teamScores: scoreboard.teamScores
            });
        }

        const rawBySide = isTeamMode
            ? [0, 1].map((teamIndex) => getClassic101TeamMembers(state, teamIndex).reduce((sum, index) => sum + rawHandPoints(hands[index] || []), 0))
            : hands.map((hand) => rawHandPoints(hand || []));
        const totalRaw = rawBySide.reduce((sum, value) => sum + value, 0);

        let winnerSide = 0;
        let tie = false;
        if (isTeamMode || rawBySide.length === 2) {
            const left = Number(rawBySide[0] || 0);
            const right = Number(rawBySide[1] || 0);
            if (left === right) {
                tie = true;
                winnerSide = 0;
            } else {
                winnerSide = left < right ? 0 : 1;
            }
        } else if (rawBySide.length > 2) {
            const minRaw = Math.min(...rawBySide);
            const minIndices = rawBySide.reduce((acc, value, index) => {
                if (value === minRaw) acc.push(index);
                return acc;
            }, []);
            if (minIndices.length !== 1) {
                tie = true;
                winnerSide = minIndices[0] ?? 0;
            } else {
                winnerSide = minIndices[0];
            }
        }

        if (tie) {
            let nextState = normalizeClassic101MatchState(matchState, hands.length, isTeamMode);
            nextState.carryPoints += totalRaw;
            if (!nextState.sides.some((side) => Number(side?.scored || 0) > 0) && totalRaw > CLASSIC101_ENTRY_THRESHOLD) {
                nextState.thresholdBypassNext = true;
            }
            nextState = markClassic101Misses(nextState, [], { isTeamMode, playerCount: hands.length });
            const scoreboard = getClassic101Scoreboard(nextState, isTeamMode, hands.length);
            return createClassic101Result({
                blocked: true,
                fish: true,
                tie: true,
                winnerIndex: isTeamMode ? (getClassic101TeamMembers(state, 0)[0] ?? 0) : winnerSide,
                teamIndex: isTeamMode ? 0 : null,
                scoreDelta: 0,
                rawPoints: totalRaw,
                carryPoints: Number(nextState.carryPoints || 0),
                dryWin: false,
                matchTargetReached: false,
                matchState: nextState,
                scoreboard: scoreboard.scores,
                teamScores: scoreboard.teamScores
            });
        }

        const award = Math.max(0, Number(totalRaw - Number(rawBySide[winnerSide] || 0)));
        const applied = applyClassic101Award(matchState, winnerSide, award, {
            bypassThreshold: matchState.thresholdBypassNext,
            isTeamMode,
            playerCount: hands.length
        });
        let nextState = applied.matchState;
        nextState = markClassic101Misses(nextState, [winnerSide], { isTeamMode, playerCount: hands.length });
        const scoreboard = getClassic101Scoreboard(nextState, isTeamMode, hands.length);
        const winnerIndex = isTeamMode
            ? (getClassic101TeamMembers(state, winnerSide)[0] ?? 0)
            : winnerSide;
        const matchTargetReached = isTeamMode
            ? scoreboard.teamScores.some((score) => Number(score || 0) >= CLASSIC101_MATCH_TARGET)
            : scoreboard.scores.some((score) => Number(score || 0) >= CLASSIC101_MATCH_TARGET);
        const dryWin = matchTargetReached && (
            isTeamMode
                ? Number(scoreboard.teamScores[1 - winnerSide] || 0) === 0
                : scoreboard.scores.every((score, index) => index === winnerSide || Number(score || 0) === 0)
        );

        return createClassic101Result({
            blocked: true,
            fish: true,
            winnerIndex,
            teamIndex: isTeamMode ? winnerSide : null,
            scoreDelta: Number(applied.scoreDelta || 0),
            rawPoints: award,
            carryPoints: Number(nextState.carryPoints || 0),
            dryWin,
            matchTargetReached,
            matchState: nextState,
            scoreboard: scoreboard.scores,
            teamScores: scoreboard.teamScores
        });
    }

    function resolveClassic101RoundEnd(state = {}) {
        const hands = Array.isArray(state.hands) ? state.hands : [];
        const isTeamMode = Boolean(state.isTeamMode);
        const matchState = normalizeClassic101MatchState(state.matchState, hands.length, isTeamMode);
        const playerIndex = Number.isInteger(Number(state.playerIndex)) ? Number(state.playerIndex) : 0;
        const winnerSide = getClassic101SideIndex(playerIndex, isTeamMode);

        if (state.hand && Array.isArray(state.hand) && state.hand.length === 0) {
            const opponentRaw = isTeamMode
                ? getClassic101TeamMembers(state, 1 - winnerSide).reduce((sum, index) => sum + rawHandPoints(hands[index] || []), 0)
                : hands.reduce((sum, hand, index) => (index === playerIndex ? sum : sum + rawHandPoints(hand || [])), 0);
            const applied = applyClassic101Award(matchState, winnerSide, opponentRaw, {
                bypassThreshold: matchState.thresholdBypassNext,
                isTeamMode,
                playerCount: hands.length
            });
            let nextState = applied.matchState;
            nextState = markClassic101Misses(nextState, [winnerSide], { isTeamMode, playerCount: hands.length });
            const scoreboard = getClassic101Scoreboard(nextState, isTeamMode, hands.length);
            const matchTargetReached = isTeamMode
                ? scoreboard.teamScores.some((score) => Number(score || 0) >= CLASSIC101_MATCH_TARGET)
                : scoreboard.scores.some((score) => Number(score || 0) >= CLASSIC101_MATCH_TARGET);
            const dryWin = matchTargetReached && (
                isTeamMode
                    ? Number(scoreboard.teamScores[1 - winnerSide] || 0) === 0
                    : scoreboard.scores.every((score, index) => index === winnerSide || Number(score || 0) === 0)
            );
            return createClassic101Result({
                isFinalMove: true,
                finishKind: state.isGosha ? "gosha" : "tile",
                winnerIndex: isTeamMode ? (getClassic101TeamMembers(state, winnerSide)[0] ?? 0) : winnerSide,
                fish: false,
                dealEnd: true,
                roundEnd: false,
                scoreDelta: Number(applied.scoreDelta || 0),
                rawPoints: opponentRaw,
                carryPoints: Number(nextState.carryPoints || 0),
                dryWin,
                matchTargetReached,
                matchState: nextState,
                scoreboard: scoreboard.scores,
                teamScores: scoreboard.teamScores
            });
        }

        if (state.fish) {
            const blocked = resolveClassic101Blocked(state);
            return createClassic101Result({
                ...blocked,
                isFinalMove: true,
                dealEnd: true
            });
        }

        const scoreboard = getClassic101Scoreboard(matchState, isTeamMode, hands.length);
        return createClassic101Result({
            isFinalMove: false,
            finishKind: state.isGosha ? "gosha" : "tile",
            winnerIndex: playerIndex,
            fish: false,
            dealEnd: false,
            roundEnd: false,
            scoreDelta: 0,
            rawPoints: 0,
            matchState,
            scoreboard: scoreboard.scores,
            teamScores: scoreboard.teamScores
        });
    }

    function drawToOpen(state = {}) {
        const hands = Array.isArray(state.hands) ? state.hands : [];
        const boneyard = Array.isArray(state.boneyard) ? state.boneyard : [];
        if (!hands.length || !boneyard.length) {
            return {
                found: false,
                player: -1,
                tileIndex: -1,
                draws: 0
            };
        }
        let player = Math.max(0, Number(state.startPlayer) || 0) % hands.length;
        let draws = 0;
        while (boneyard.length) {
            const tile = boneyard.pop();
            hands[player].push(tile);
            draws += 1;
            if (tile?.isDouble && Number(tile.a) >= 1) {
                return {
                    found: true,
                    player,
                    tileIndex: hands[player].length - 1,
                    draws
                };
            }
            player = (player + 1) % hands.length;
        }
        return {
            found: false,
            player: -1,
            tileIndex: -1,
            draws
        };
    }

    function drawToPlay(state = {}) {
        const board = state.board || state.internalBoard || null;
        const hand = Array.isArray(state.hand) ? state.hand : [];
        const boneyard = Array.isArray(state.boneyard) ? state.boneyard : [];
        let draws = 0;
        if (!board?.canPlayAny || !hand) {
            return {
                playable: false,
                draws: 0,
                exhausted: !boneyard.length
            };
        }
        while (boneyard.length && !board.canPlayAny(hand)) {
            hand.push(boneyard.pop());
            draws += 1;
        }
        return {
            playable: board.canPlayAny(hand),
            draws,
            exhausted: !boneyard.length
        };
    }

    const classic101Ruleset = Object.freeze({
        id: "classic101",
        matchTarget: CLASSIC101_MATCH_TARGET,
        getHandSize(playerCount) {
            return getHandSize(playerCount);
        },
        determineFirstPlayer(hands) {
            const normalizedHands = Array.isArray(hands) ? hands : [];
            for (let doubleValue = 1; doubleValue <= 6; doubleValue += 1) {
                for (let player = 0; player < normalizedHands.length; player += 1) {
                    for (let tileIndex = 0; tileIndex < (Array.isArray(normalizedHands[player]) ? normalizedHands[player].length : 0); tileIndex += 1) {
                        const current = normalizedHands[player][tileIndex];
                        if (current?.isDouble && Number(current.a) === doubleValue) {
                            return { player, tileIndex, drawToOpen: false };
                        }
                    }
                }
            }
            return { player: -1, tileIndex: -1, drawToOpen: true };
        },
        needsRedeal() {
            return false;
        },
        openingPlayScore() {
            return 0;
        },
        scoreDuringPlay() {
            return 0;
        },
        handPoints(hand) {
            return rawHandPoints(Array.isArray(hand) ? hand : []);
        },
        createMatchState(playerCount, isTeamMode) {
            return createClassic101MatchState(playerCount, isTeamMode);
        },
        normalizeMatchState(matchState, playerCount, isTeamMode) {
            return normalizeClassic101MatchState(matchState, playerCount, isTeamMode);
        },
        drawToOpen,
        drawToPlay,
        resolveBlocked(state) {
            return resolveClassic101Blocked(state);
        },
        resolveRoundEnd(state) {
            return resolveClassic101RoundEnd(state);
        }
    });

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
        if (normalizedMode === "classic101") {
            return classic101Ruleset;
        }
        if (!normalizedMode || normalizedMode === "telefon") {
            return telefonRuleset;
        }
        return telefonRuleset;
    }

    return {
        getRuleset,
        telefonRuleset,
        classic101Ruleset,
        createClassic101MatchState,
        drawToOpen,
        drawToPlay,
        resolveBlocked,
        resolveRoundEnd
    };
});
