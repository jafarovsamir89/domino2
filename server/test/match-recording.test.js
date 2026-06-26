const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DOMINO_SERVER_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";
process.env.BETTER_AUTH_SECRET ||= process.env.DOMINO_SERVER_SECRET;

const DominoRoom = require("../DominoRoom");

function makeRoom() {
    const room = Object.create(DominoRoom.prototype);
    Object.defineProperty(room, "roomId", { value: "room-match", writable: true, configurable: true });
    room.currentStakeKey = "stake_200";
    room.currentDealMatchId = "room-match:round:3";
    room.matchRecorded = false;
    room.matchRecordId = "";
    room.pendingMatchRecording = null;
    room.matchRecordInFlight = false;
    room.matchRecordRetryTimer = null;
    room.state = {
        isTeamMode: false,
        playerOrder: ["session-1", "session-2"],
        players: new Map([
            ["session-1", { name: "Alice", userId: "user-a", score: 13, roundWins: 1 }],
            ["session-2", { name: "Bob", userId: "user-b", score: 8, roundWins: 0 }]
        ]),
        teamScores: [0, 0],
        teamRoundWins: [0, 0]
    };
    room.identityBySessionId = new Map([
        ["session-1", { provider: "platform", authToken: "token-a", userId: "user-a", displayName: "Alice", playerId: "player-a", avatarUrl: "", role: "player" }],
        ["session-2", { provider: "platform", authToken: "token-b", userId: "user-b", displayName: "Bob", playerId: "player-b", avatarUrl: "", role: "player" }]
    ]);
    return room;
}

test("recordMatchResult retries a failed platform match recording without marking the match recorded", async () => {
    const room = makeRoom();
    room.gameMode = "classic101";
    const fetchCalls = [];
    const originalFetch = global.fetch;

    global.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        fetchCalls.push(body);
        if (fetchCalls.length === 1) {
            return {
                ok: false,
                status: 503,
                text: async () => "temporary failure",
                json: async () => ({})
            };
        }
        return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({ ok: true })
        };
    };

    try {
        const first = await room.recordMatchResult(0, false, null, null);
        assert.equal(first, false);
        assert.equal(room.matchRecorded, false);
        assert.ok(room.pendingMatchRecording);
        assert.equal(room.pendingMatchRecording.sourceMatchId, room.matchRecordId);
        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].sourceMatchId, room.matchRecordId);
        assert.equal(fetchCalls[0].gameMode, "classic101");
        assert.equal(fetchCalls[0].classic101DryWin, false);

        const second = await room.retryPendingMatchRecording();
        assert.equal(second, true);
        assert.equal(room.matchRecorded, true);
        assert.equal(room.pendingMatchRecording, null);
        assert.equal(fetchCalls.length, 2);
        assert.equal(fetchCalls[1].sourceMatchId, room.matchRecordId);
        assert.equal(fetchCalls[1].gameMode, "classic101");
    } finally {
        global.fetch = originalFetch;
    }
});

test("recordMatchResult handles payloads without userIds without breaking the room", async () => {
    const room = Object.create(DominoRoom.prototype);
    Object.defineProperty(room, "roomId", { value: "room-no-users", writable: true, configurable: true });
    room.currentStakeKey = "stake_200";
    room.currentDealMatchId = "room-no-users:round:1";
    room.matchRecorded = false;
    room.matchRecordId = "";
    room.matchRecordInFlight = false;
    room.matchRecordRetryTimer = null;
    room.state = {
        isTeamMode: false,
        playerOrder: ["session-1"],
        players: new Map([
            ["session-1", { name: "Alice", score: 13, roundWins: 1 }]
        ]),
        teamScores: [0, 0],
        teamRoundWins: [0, 0]
    };
    room.identityBySessionId = new Map([
        ["session-1", { provider: "platform", authToken: "token-a", displayName: "Alice", playerId: "player-a", avatarUrl: "", role: "player" }]
    ]);

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
        warnings.push(args.join(" "));
    };

    try {
        const result = await room.recordMatchResult(0, false, null, null);
        assert.equal(result, true);
        assert.equal(room.matchRecorded, true);
        assert.equal(room.pendingMatchRecording, null);
        assert.equal(warnings.some((entry) => entry.includes("no participants had userIds")), true);
    } finally {
        console.warn = originalWarn;
    }
});

test("recordMatchResult forwards classic101 dry-win metadata", async () => {
  const room = makeRoom();
  room.gameMode = "classic101";
  const fetchCalls = [];
  const originalFetch = global.fetch;

  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    fetchCalls.push(body);
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ ok: true })
    };
  };

  try {
    const result = await room.recordMatchResult(0, false, null, 2);
    assert.equal(result, true);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].gameMode, "classic101");
    assert.equal(fetchCalls[0].classic101DryWin, true);
  } finally {
    global.fetch = originalFetch;
  }
});
