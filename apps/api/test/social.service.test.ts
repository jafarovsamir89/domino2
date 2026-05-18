import test from "node:test";
import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";

const { SocialService } = await import("../src/modules/social/social.service.js");

test("acceptFriend only allows the addressee to accept a request", async () => {
  const prismaMock = {
    friendConnection: {
      findUnique: async () => ({
        id: "friend-1",
        requesterPlayerId: "player-requester",
        addresseePlayerId: "player-addressee",
        status: "pending"
      }),
      update: async () => {
        throw new Error("should not be called");
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => ({ id: "player-requester" });

  await assert.rejects(
    () => service.acceptFriend({} as any, "friend-1"),
    /Friend request not found/
  );
});
