const test = require("node:test");
const assert = require("node:assert/strict");

const {
    normalizeAuthToken,
    normalizePlayerUserId,
    normalizePlayerAvatarUrl,
    normalizePlayerId,
    normalizePlayerRole,
    getFirstNameDisplayName,
    buildRoomIdentity
} = require("../roomIdentity");

test("normalizeAuthToken reads identity authToken before options authToken", () => {
    assert.equal(normalizeAuthToken({ authToken: "  from-identity  " }, { authToken: "from-options" }), "from-identity");
    assert.equal(normalizeAuthToken({}, { authToken: "  from-options  " }), "from-options");
});

test("room identity helpers preserve current fallback behavior", () => {
    assert.equal(normalizePlayerUserId({ userId: "u1" }, { userId: "u2" }), "u1");
    assert.equal(normalizePlayerAvatarUrl({ avatarUrl: " https://a.example/avatar.png " }, { avatarUrl: "ignored" }, { avatarUrl: "https://b.example/avatar.png" }), "https://a.example/avatar.png");
    assert.equal(normalizePlayerId({ playerId: "p1", userId: "u1" }, { playerId: "p2" }, { userId: "u3" }), "p1");
    assert.equal(normalizePlayerRole({ role: "host" }, { role: "player" }, false), "host");
    assert.equal(normalizePlayerRole({}, {}, true), "host");
    assert.equal(normalizePlayerRole({}, {}, false), "player");
});

test("getFirstNameDisplayName returns the first token safely", () => {
    assert.equal(getFirstNameDisplayName("Samir Jafarov", "Player"), "Samir");
    assert.equal(getFirstNameDisplayName("  Elvin   Məmmədov  ", "Player"), "Elvin");
    assert.equal(getFirstNameDisplayName("Nigar", "Player"), "Nigar");
    assert.equal(getFirstNameDisplayName("", "Fallback"), "Fallback");
});

test("buildRoomIdentity sanitizes, trims, preserves existing fields, and does not mutate inputs", () => {
    const identity = {
        provider: "platform",
        authToken: "  secret-token  ",
        userId: "user-1",
        displayName: " <b>Alice</b>! ",
        playerId: "player-1",
        avatarUrl: " https://example.com/a.png ",
        role: "player"
    };
    const existingIdentity = {
        provider: "platform",
        authToken: "old-token",
        userId: "existing-user",
        displayName: "Old Name",
        playerId: "existing-player",
        avatarUrl: "https://example.com/old.png",
        role: "host",
        customFlag: true
    };
    const player = { userId: "player-user", name: "Player Name" };
    const options = { name: "Option Name", avatarUrl: " https://example.com/opt.png " };

    const identityClone = structuredClone(identity);
    const existingClone = structuredClone(existingIdentity);
    const playerClone = structuredClone(player);
    const optionsClone = structuredClone(options);

    const next = buildRoomIdentity({
        existingIdentity,
        identity,
        authToken: normalizeAuthToken(identity, options),
        player,
        options,
        isHost: false
    });

    assert.equal(next.authToken, "secret-token");
    assert.equal(next.displayName, "Alice");
    assert.equal(next.avatarUrl, "https://example.com/a.png");
    assert.equal(next.role, "player");
    assert.equal(next.customFlag, true);
    assert.equal(next.userId, "user-1");
    assert.equal(next.playerId, "player-1");
    assert.deepEqual(identity, identityClone);
    assert.deepEqual(existingIdentity, existingClone);
    assert.deepEqual(player, playerClone);
    assert.deepEqual(options, optionsClone);
});
