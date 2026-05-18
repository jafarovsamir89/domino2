const core = globalThis.DominoBoardCore;

if (!core) {
    throw new Error("DominoBoardCore is not loaded");
}

export const {
    OpenEnd,
    BoardNode,
    Board,
    cloneBoard,
    reconstructBoard
} = core;
