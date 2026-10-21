import test from "node:test";
import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";

const { AuthService } = await import("../src/modules/auth/auth.service.js");
const { createGameToken } = await import("../src/modules/auth/game-token.js");
const { signDominoPayload } = await import("../src/modules/security/domino-proof.js");

function makeSession() {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
  return {
    user: {
      id: "user-1",
      email: "player@example.com",
      name: "Alpha",
      image: null,
      role: "player"
    },
    session: {
      id: "session-1",
      token: "session-token-1",
      expiresAt
    }
  };
}

test('active game session checks require a fresh server proof and recheck logout, deletion and bans beyond admission-token expiry', async () => {
  const claims = { userId: 'active-u', playerId: 'active-p', sessionId: 'active-s', displayName: 'Synthetic', role: 'player', provider: 'better-auth' as const, issuedAt: Date.now() - 600_000, expiresAt: Date.now() - 300_000 };
  const token = createGameToken(claims);
  let session: any = { id: claims.sessionId, userId: claims.userId, expiresAt: new Date(Date.now() + 60_000) };
  let player: any = { id: claims.playerId, userId: claims.userId };
  let ban: any = null;
  let reads = 0;
  const service: any = new AuthService({
    session: { findUnique: async () => { reads++; return session; } },
    player: { findUnique: async () => { reads++; return player; } },
    playerBan: { findFirst: async () => { reads++; return ban; } }
  } as any);
  const signed = (extra = {}) => {
    const payload = { token, checkedAt: Date.now(), integrityScope: 'game.session.validate', ...extra };
    return { ...payload, proof: signDominoPayload(payload) };
  };
  for (const bad of [ { token }, signed({ checkedAt: Date.now() - 20_000 }), signed({ integrityScope: 'economy.reconcile' }), { ...signed(), token: 'tampered-token' } ]) {
    await assert.rejects(service.validateActiveGameSession(bad), (err: any) => err.getStatus() === 401);
  }
  assert.equal(reads, 0, 'invalid server proof must be rejected before DB reads');
  assert.equal((await service.validateActiveGameSession(signed())).valid, true, 'active session survives the five-minute admission token');
  session = null;
  await assert.rejects(service.validateActiveGameSession(signed()), (err: any) => err.getStatus() === 401, 'logout revokes active access');
  session = { userId: claims.userId, expiresAt: new Date(Date.now() + 60_000) };
  player = null;
  await assert.rejects(service.validateActiveGameSession(signed()), (err: any) => err.getStatus() === 401, 'deleted player revokes active access');
  player = { id: claims.playerId, userId: claims.userId };
  ban = { id: 'active-ban' };
  await assert.rejects(service.validateActiveGameSession(signed()), (err: any) => err.getStatus() === 401, 'active ban revokes active access');
});

test("AuthService.getCurrentProfile filters recent matches by gameMode and exposes gameMode on each item", async () => {
  let query: any = null;
  const prismaMock = {
    player: {
      upsert: async () => ({
        id: "player-1",
        displayName: "Alpha",
        avatarSeed: null,
        avatarUrl: null,
        tableSkinKey: null,
        language: "en",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        stats: {
          playerId: "player-1",
          rating: 1200,
          points: 50,
          wins: 5,
          losses: 1,
          draws: 0,
          matchesPlayed: 6,
          currentStreak: 2,
          bestStreak: 4
        }
      })
    },
    playerStats: {
      create: async () => ({})
    },
    playerModeStats: {
      upsert: async () => ({})
    },
    coinLedgerEntry: {
      findUnique: async () => ({ id: "starter-ledger-1" })
    },
    coinWallet: {
      upsert: async () => ({
        id: "wallet-1",
        balance: 250,
        reserved: 0
      })
    },
    matchParticipant: {
      findMany: async (nextQuery: any) => {
        query = nextQuery;
        return [
          {
            id: "participant-1",
            matchId: "match-1",
            result: "win",
            ratingDelta: 18,
            scoreDelta: 20,
            match: {
              gameMode: "classic101",
              createdAt: new Date("2026-01-01T10:00:00.000Z")
            }
          }
        ];
      }
    }
  } as any;

  const service = new AuthService(prismaMock);
  (service as any).getSession = async () => makeSession();

  const result: any = await service.getCurrentProfile({} as any, "classic101");

  assert.ok(query);
  assert.equal(query.where.playerId, "player-1");
  assert.equal(query.where.match.gameMode, "classic101");
  assert.equal(result.recentMatches.length, 1);
  assert.equal(result.recentMatches[0].gameMode, "classic101");
  assert.equal(result.recentMatches[0].mode, "classic101");
});

test("AuthService.getCurrentProfile keeps default history behavior when no mode is passed", async () => {
  let query: any = null;
  const prismaMock = {
    player: {
      upsert: async () => ({
        id: "player-1",
        displayName: "Alpha",
        avatarSeed: null,
        avatarUrl: null,
        tableSkinKey: null,
        language: "en",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        stats: {
          playerId: "player-1",
          rating: 1200,
          points: 50,
          wins: 5,
          losses: 1,
          draws: 0,
          matchesPlayed: 6,
          currentStreak: 2,
          bestStreak: 4
        }
      })
    },
    playerStats: {
      create: async () => ({})
    },
    playerModeStats: {
      upsert: async () => ({})
    },
    coinLedgerEntry: {
      findUnique: async () => ({ id: "starter-ledger-1" })
    },
    coinWallet: {
      upsert: async () => ({
        id: "wallet-1",
        balance: 250,
        reserved: 0
      })
    },
    matchParticipant: {
      findMany: async (nextQuery: any) => {
        query = nextQuery;
        return [
          {
            id: "participant-1",
            matchId: "match-1",
            result: "win",
            ratingDelta: 18,
            scoreDelta: 20,
            match: {
              gameMode: "classic101",
              createdAt: new Date("2026-01-01T10:00:00.000Z")
            }
          },
          {
            id: "participant-2",
            matchId: "match-2",
            result: "loss",
            ratingDelta: -12,
            scoreDelta: -10,
            match: {
              gameMode: "telefon",
              createdAt: new Date("2026-01-02T10:00:00.000Z")
            }
          }
        ];
      }
    }
  } as any;

  const service = new AuthService(prismaMock);
  (service as any).getSession = async () => makeSession();

  const result: any = await service.getCurrentProfile({} as any);

  assert.ok(query);
  assert.equal(query.where.match, undefined);
  assert.equal(result.recentMatches.length, 2);
  assert.deepEqual(
    result.recentMatches.map((match: any) => match.gameMode).sort(),
    ["classic101", "telefon"]
  );
});

test("AuthService.getCurrentProfile accepts platform game bearer tokens when cookies are unavailable", async () => {
  const prismaMock = {
    session: {
      findUnique: async (query: any) => {
        assert.equal(query.where.id, "session-token");
        return {
          id: "session-token",
          token: "session-token-db",
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
        };
      }
    },
    user: {
      findUnique: async (query: any) => {
        assert.equal(query.where.id, "user-token");
        return {
          id: "user-token",
          email: "token@example.com",
          name: "Token Player",
          image: null,
          role: "player"
        };
      }
    },
    player: {
      upsert: async () => ({
        id: "player-token",
        displayName: "Token Player",
        avatarSeed: null,
        avatarUrl: null,
        tableSkinKey: null,
        language: "en",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        stats: {
          playerId: "player-token",
          rating: 1000,
          points: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          matchesPlayed: 0,
          currentStreak: 0,
          bestStreak: 0
        }
      })
    },
    playerStats: {
      create: async () => ({})
    },
    playerModeStats: {
      upsert: async () => ({})
    },
    coinLedgerEntry: {
      findUnique: async () => ({ id: "starter-ledger-token" })
    },
    coinWallet: {
      upsert: async () => ({
        id: "wallet-token",
        balance: 1000,
        reserved: 0
      })
    },
    matchParticipant: {
      findMany: async () => []
    }
  } as any;

  const service = new AuthService(prismaMock);
  (service as any).getSession = async () => null;
  const token = createGameToken({
    userId: "user-token",
    playerId: "player-token",
    displayName: "Token Player",
    role: "player",
    sessionId: "session-token",
    provider: "better-auth",
    issuedAt: Date.now(),
    expiresAt: Date.now() - 60_000
  });

  const result: any = await service.getCurrentProfile({ authorization: `Bearer ${token}` } as any);

  assert.equal(result.user.id, "user-token");
  assert.equal(result.player.id, "player-token");
  assert.equal(result.session.id, "session-token");
  assert.equal(result.session.token, "session-token-db");
});

test("AuthService.validateGameToken accepts only a live matching session, player, and unbanned account", async () => {
  const claims = {
    userId: "user-validate",
    playerId: "player-validate",
    displayName: "Validation Player",
    role: "player",
    sessionId: "session-validate",
    provider: "better-auth" as const,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  };
  const token = createGameToken(claims);
  const liveSession = {
    id: claims.sessionId,
    userId: claims.userId,
    expiresAt: new Date(Date.now() + 60_000)
  };
  const matchingPlayer = { id: claims.playerId, userId: claims.userId };

  const makeService = (records: { session?: any; player?: any; ban?: any }) => {
    const queries = { session: 0, player: 0, ban: 0 };
    const service = new AuthService({
      session: { findUnique: async () => { queries.session++; return records.session ?? null; } },
      player: { findUnique: async () => { queries.player++; return records.player ?? null; } },
      playerBan: { findFirst: async (query: any) => {
        queries.ban++;
        assert.equal(query.where.playerId, claims.playerId);
        assert.equal(query.where.revokedAt, null);
        assert.equal(query.where.OR[0].expiresAt, null);
        assert.ok(query.where.OR[1].expiresAt.gt instanceof Date);
        return records.ban ?? null;
      } }
    } as any);
    return { service, queries };
  };

  const valid = makeService({ session: liveSession, player: matchingPlayer });
  assert.deepEqual(await valid.service.validateGameToken(token), { valid: true, expiresAt: claims.expiresAt });
  assert.deepEqual(valid.queries, { session: 1, player: 1, ban: 1 });

  for (const [name, records] of [
    ["missing session", { session: null, player: matchingPlayer }],
    ["expired session", { session: { ...liveSession, expiresAt: new Date(Date.now() - 1) }, player: matchingPlayer }],
    ["wrong session owner", { session: { ...liveSession, userId: "different-user" }, player: matchingPlayer }],
    ["deleted player", { session: liveSession, player: null }],
    ["wrong player owner", { session: liveSession, player: { ...matchingPlayer, userId: "different-user" } }],
    ["active ban", { session: liveSession, player: matchingPlayer, ban: { id: "active-ban" } }]
  ] as const) {
    const rejected = makeService(records);
    await assert.rejects(rejected.service.validateGameToken(token), (error: any) => error?.getStatus?.() === 401, name);
  }

  const expiredToken = createGameToken({ ...claims, expiresAt: Date.now() - 1 });
  const expired = makeService({ session: liveSession, player: matchingPlayer });
  await assert.rejects(expired.service.validateGameToken(expiredToken), (error: any) => error?.getStatus?.() === 401);
  assert.deepEqual(expired.queries, { session: 0, player: 0, ban: 0 });
});

test("AuthService.updateCurrentProfileAvatar rejects non-image https URLs", async () => {
  const originalFetch = global.fetch;
  const prismaMock = {
    user: {
      update: async () => ({})
    },
    player: {
      upsert: async () => ({})
    }
  } as any;

  const service = new AuthService(prismaMock);
  (service as any).getSession = async () => makeSession();
  global.fetch = (async () => ({
    ok: true,
    status: 200,
    headers: {
      get: (key: string) => (String(key).toLowerCase() === "content-type" ? "text/html" : null)
    },
    arrayBuffer: async () => new ArrayBuffer(0)
  })) as any;

  try {
    await assert.rejects(
      () => service.updateCurrentProfileAvatar({} as any, "https://example.com/avatar.html"),
      /image/i
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("AuthService.updateCurrentProfileAvatar rejects oversized image URLs", async () => {
  const originalFetch = global.fetch;
  const prismaMock = {
    user: {
      update: async () => ({})
    },
    player: {
      upsert: async () => ({})
    }
  } as any;

  const service = new AuthService(prismaMock);
  (service as any).getSession = async () => makeSession();
  global.fetch = (async () => ({
    ok: true,
    status: 200,
    headers: {
      get: (key: string) => {
        const normalized = String(key).toLowerCase();
        if (normalized === "content-type") return "image/png";
        if (normalized === "content-length") return String(3 * 1024 * 1024);
        return null;
      }
    },
    arrayBuffer: async () => new ArrayBuffer(3 * 1024 * 1024 + 1)
  })) as any;

  try {
    await assert.rejects(
      () => service.updateCurrentProfileAvatar({} as any, "https://example.com/avatar.png"),
      /large/i
    );
  } finally {
    global.fetch = originalFetch;
  }
});
