import test from "node:test";
import assert from "node:assert/strict";

const { HealthController } = await import("../src/modules/health/health.controller.js");

test("HealthController reports database and redis status", async () => {
  delete process.env.REDIS_URI;

  const controller = new HealthController({
    $queryRaw: async () => [{ "?column?": 1 }]
  } as any);

  const result = await controller.getHealth();

  assert.equal(result.status, "ok");
  assert.equal(result.service, "domino2-api");
  assert.equal(result.database, "reachable");
  assert.equal(result.redis, "not_configured");
});
