import test from "node:test";
import assert from "node:assert/strict";

import {
  isStalePresenceEntry,
  normalizePresenceEntry
} from "../src/modules/realtime/realtime.helpers.js";

test("normalizePresenceEntry keeps platform provider and trims room data", () => {
  const result = normalizePresenceEntry(
    "session-1",
    {
      provider: "guest",
      displayName: "Old Name",
      roomId: "  room-old  ",
      roomCode: " abcd "
    },
    {
      provider: "platform",
      displayName: " New Player ",
      roomId: "  room-new  ",
      roomCode: " efgh ",
      gameMode: "team",
      isPlaying: true,
      isConnected: true,
      source: "  client-web  "
    },
    Date.parse("2026-05-13T10:00:00.000Z")
  );

  assert.equal(result.sessionId, "session-1");
  assert.equal(result.provider, "platform");
  assert.equal(result.displayName, "New Player");
  assert.equal(result.roomId, "room-new");
  assert.equal(result.roomCode, "EFGH");
  assert.equal(result.gameMode, "team");
  assert.equal(result.isPlaying, true);
  assert.equal(result.isConnected, true);
  assert.equal(result.source, "client-web");
  assert.equal(result.updatedAt, "2026-05-13T10:00:00.000Z");
});

test("isStalePresenceEntry flags old or invalid timestamps", () => {
  assert.equal(
    isStalePresenceEntry({ updatedAt: "2026-05-13T10:00:00.000Z" }, Date.parse("2026-05-13T10:01:20.000Z")),
    false
  );

  assert.equal(
    isStalePresenceEntry({ updatedAt: "2026-05-13T10:00:00.000Z" }, Date.parse("2026-05-13T10:02:01.000Z")),
    true
  );

  assert.equal(isStalePresenceEntry({ updatedAt: "not-a-date" }), true);
});
