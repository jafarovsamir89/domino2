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
