import test from "node:test";
import assert from "node:assert/strict";

const { LeaderboardService } = await import("../src/modules/leaderboard/leaderboard.service.js");

test("LeaderboardService uses mode stats ordering and defaults to telefon", async () => {
  let captured: any = null;
  const prismaMock = {
    player: {
      findMany: async (query: any) => {
        captured = query;
        return [
          {
            id: "p1",
            displayName: "Alpha",
            modeStats: [
              {
                playerId: "p1",
                rating: 1500,
                points: 100,
                wins: 15,
                losses: 1,
                draws: 0,
                matchesPlayed: 16,
                currentStreak: 2,
                bestStreak: 5
              }
            ]
          },
          {
            id: "p2",
            displayName: "Bravo",
            modeStats: [
              {
                playerId: "p2",
                rating: 1400,
                points: 80,
                wins: 12,
                losses: 2,
                draws: 1,
                matchesPlayed: 15,
                currentStreak: 1,
                bestStreak: 4
              }
            ]
          }
        ];
      }
    }
  } as any;

  const service = new LeaderboardService(prismaMock, {} as any);
  const items = await service.getLeaderboard({} as any, "overall", undefined as any, 5);

  assert.ok(captured);
  assert.equal(captured.select.modeStats.where.gameMode, "telefon");
  assert.equal(items[0].id, "p1");
  assert.equal(items[0].rank, 1);
  assert.equal(items[0].titleCode, "platinum");
  assert.equal(items[1].id, "p2");
  assert.equal(items[1].rank, 2);
});

test("LeaderboardService weekly leaderboard filters by match gameMode", async () => {
  let matchQuery: any = null;
  let modeStatsQuery: any = null;
  const prismaMock = {
    match: {
      findMany: async (query: any) => {
        matchQuery = query;
        return [
          {
            participants: [
              {
                playerId: "p1",
                displayNameSnapshot: "Alpha",
                result: "win",
                ratingDelta: 20
              },
              {
                playerId: "p2",
                displayNameSnapshot: "Bravo",
                result: "loss",
                ratingDelta: -20
              }
            ]
          }
        ];
      }
    },
    playerModeStats: {
      findMany: async (query: any) => {
        modeStatsQuery = query;
        return [
          {
            playerId: "p1",
            rating: 1325,
            points: 18,
            wins: 4,
            losses: 1,
            draws: 0,
            matchesPlayed: 5,
            player: { displayName: "Alpha" }
          },
          {
            playerId: "p2",
            rating: 1111,
            points: 12,
            wins: 2,
            losses: 3,
            draws: 0,
            matchesPlayed: 5,
            player: { displayName: "Bravo" }
          }
        ];
      }
    }
  } as any;

  const service = new LeaderboardService(prismaMock, {} as any);
  const items = await service.getLeaderboard({} as any, "weekly", "classic101", 10);

  assert.ok(matchQuery);
  assert.equal(matchQuery.where.gameMode, "classic101");
  assert.ok(modeStatsQuery);
  assert.equal(modeStatsQuery.where.gameMode, "classic101");
  assert.equal(items[0].id, "p1");
  assert.equal(items[0].weeklyRatingDelta, 20);
  assert.equal(items[0].rank, 1);
  assert.equal(items[1].id, "p2");
  assert.equal(items[1].rank, 2);
});

test("LeaderboardService friends leaderboard uses mode stats and fills missing rows with the starting rating", async () => {
  const prismaMock = {
    friendConnection: {
      findMany: async () => [
        {
          requesterPlayerId: "p1",
          addresseePlayerId: "p2"
        }
      ]
    },
    player: {
      findMany: async (query: any) => {
        assert.equal(query.where.id.in.length, 2);
        return [
          {
            id: "p1",
            displayName: "Alpha",
            modeStats: [
              {
                playerId: "p1",
                gameMode: "classic101",
                rating: 1450,
                points: 40,
                wins: 10,
                losses: 2,
                draws: 0,
                matchesPlayed: 12
              }
            ]
          },
          {
            id: "p2",
            displayName: "Bravo",
            modeStats: []
          }
        ];
      }
    }
  } as any;
  const authMock = {
    getCurrentProfile: async () => ({
      player: { id: "p1" }
    })
  } as any;

  const service = new LeaderboardService(prismaMock, authMock);
  const items = await service.getLeaderboard({} as any, "friends", "classic101", 10);

  assert.equal(items[0].id, "p1");
  assert.equal(items[0].rating, 1450);
  assert.equal(items[0].isSelf, true);
  assert.equal(items[1].id, "p2");
  assert.equal(items[1].rating, 1000);
  assert.equal(items[1].isSelf, false);
});
