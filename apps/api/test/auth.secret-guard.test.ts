import test from "node:test";
import assert from "node:assert/strict";

const DEV_FALLBACK_SECRET = "domino-dev-secret";

test("production rejects weak auth secrets", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAuthSecret = process.env.BETTER_AUTH_SECRET;
  const previousDominoSecret = process.env.DOMINO_SERVER_SECRET;

  try {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_SECRET = "change-me";
    process.env.DOMINO_SERVER_SECRET = "change-me";

    const { getBetterAuthConfig } = await import("../src/modules/auth/better-auth.config.js");

    assert.throws(() => getBetterAuthConfig(), /BETTER_AUTH_SECRET/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAuthSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previousAuthSecret;
    if (previousDominoSecret === undefined) delete process.env.DOMINO_SERVER_SECRET;
    else process.env.DOMINO_SERVER_SECRET = previousDominoSecret;
  }
});

test("development fallback secrets keep auth and proof signing working", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAuthSecret = process.env.BETTER_AUTH_SECRET;
  const previousDominoSecret = process.env.DOMINO_SERVER_SECRET;

  try {
    process.env.NODE_ENV = "development";
    process.env.BETTER_AUTH_SECRET = "change-me";
    process.env.DOMINO_SERVER_SECRET = "change-me";

    const { getBetterAuthConfig } = await import("../src/modules/auth/better-auth.config.js");
    const { createGameToken, verifyGameToken } = await import("../src/modules/auth/game-token.js");
    const { signDominoPayload, verifyDominoPayload } = await import("../src/modules/security/domino-proof.js");

    const config = getBetterAuthConfig();
    assert.equal(config.secret, DEV_FALLBACK_SECRET);

    const token = createGameToken({
      userId: "user-1",
      playerId: "player-1",
      displayName: "Alice",
      role: "player",
      sessionId: "session-1",
      provider: "better-auth",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000
    });
    assert.ok(verifyGameToken(token));

    const payload = { roomId: "room-1", result: "win" };
    const proof = signDominoPayload(payload);
    assert.equal(verifyDominoPayload(payload, proof), true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAuthSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previousAuthSecret;
    if (previousDominoSecret === undefined) delete process.env.DOMINO_SERVER_SECRET;
    else process.env.DOMINO_SERVER_SECRET = previousDominoSecret;
  }
});
