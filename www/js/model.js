const core = globalThis.DominoModelCore;

if (!core) {
    throw new Error("DominoModelCore is not loaded");
}

export const {
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
} = core;
