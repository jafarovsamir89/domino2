import test from "node:test";
import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";

const { AuthService } = await import("../src/modules/auth/auth.service.js");

function makeSession() {
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
      expiresAt: new Date("2026-01-01T00:00:00.000Z")
    }
  };
}

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
