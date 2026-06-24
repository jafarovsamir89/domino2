import test from "node:test";
import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";

const { AdminService } = await import("../src/modules/admin/admin.service.js");

test("AdminService.listSystemAuditLogs filters by action and entity type", async () => {
  const logs = [
    {
      id: "log-1",
      actorType: "system",
      actorUserId: null,
      actorPlayerId: "player-1",
      action: "wallet.reserve",
      entityType: "CoinWallet",
      entityId: "wallet-1",
      payloadJson: { amount: 100 },
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      actorUser: null,
      actorPlayer: { id: "player-1", displayName: "Alpha" }
    },
    {
      id: "log-2",
      actorType: "system",
      actorUserId: null,
      actorPlayerId: "player-1",
      action: "match.recorded",
      entityType: "Match",
      entityId: "match-1",
      payloadJson: { result: "win" },
      createdAt: new Date("2024-01-02T00:00:00.000Z"),
      actorUser: null,
      actorPlayer: { id: "player-1", displayName: "Alpha" }
    }
  ];

  const prismaMock = {
    systemAuditLog: {
      findMany: async () => logs
    }
  } as any;

  const service = new AdminService({
    getSession: async () => ({ user: { id: "admin-1", role: "admin" } })
  } as any, prismaMock);

  const result = await service.listSystemAuditLogs({ authorization: "Bearer admin" } as any, "50", "0", "wallet", "CoinWallet");

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].action, "wallet.reserve");
  assert.equal(result.pagination.limit, 50);
  assert.equal(result.pagination.offset, 0);
});

test("AdminService.listFeedback filters by status and query", async () => {
  const rows = [
    {
      id: "feedback-1",
      playerId: "player-1",
      message: "Crash when opening social hub",
      category: "bug",
      contactEmail: "alpha@example.com",
      status: "new",
      appVersion: "build-1",
      locale: "az",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      resolvedAt: null,
      resolvedByUserId: null,
      player: {
        id: "player-1",
        displayName: "Alpha",
        user: { email: "alpha@example.com" }
      },
      resolvedByUser: null
    },
    {
      id: "feedback-2",
      playerId: null,
      message: "Feature request",
      category: "suggestion",
      contactEmail: null,
      status: "resolved",
      appVersion: null,
      locale: "en",
      createdAt: new Date("2024-01-02T00:00:00.000Z"),
      resolvedAt: new Date("2024-01-03T00:00:00.000Z"),
      resolvedByUserId: "admin-1",
      player: null,
      resolvedByUser: {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        role: "admin"
      }
    }
  ];

  const prismaMock = {
    feedback: {
      findMany: async () => rows
    }
  } as any;

  const service = new AdminService({
    getSession: async () => ({ user: { id: "admin-1", role: "admin" } })
  } as any, prismaMock);

  const result = await service.listFeedback({ authorization: "Bearer admin" } as any, "new", "crash");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "feedback-1");
});

test("AdminService.resolveFeedback updates feedback and records an audit log", async () => {
  const auditRows: any[] = [];
  const prismaMock = {
    $transaction: async (callback: any) => callback({
      feedback: {
        update: async ({ data }: any) => ({
          id: "feedback-1",
          playerId: "player-1",
          message: "Crash when opening social hub",
          category: "bug",
          contactEmail: "alpha@example.com",
          status: data.status,
          appVersion: "build-1",
          locale: "az",
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          resolvedAt: data.resolvedAt,
          resolvedByUserId: data.resolvedByUserId,
          player: {
            id: "player-1",
            displayName: "Alpha",
            user: { email: "alpha@example.com" }
          },
          resolvedByUser: {
            id: data.resolvedByUserId,
            email: "admin@example.com",
            name: "Admin",
            role: "admin"
          }
        })
      },
      adminAuditLog: {
        create: async ({ data }: any) => {
          auditRows.push(data);
          return data;
        }
      }
    })
  } as any;

  const service = new AdminService({
    getSession: async () => ({ user: { id: "admin-1", role: "admin" } })
  } as any, prismaMock);

  const result = await service.resolveFeedback({ authorization: "Bearer admin" } as any, "feedback-1", { status: "resolved" });
  assert.equal(result.feedback.status, "resolved");
  assert.equal(result.feedback.resolvedByUserId, "admin-1");
  assert.equal(auditRows[0].action, "feedback.resolved");
  assert.equal(auditRows[0].entityType, "Feedback");
});
