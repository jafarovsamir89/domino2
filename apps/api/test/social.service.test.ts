import test from "node:test";
import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";

const { SocialService } = await import("../src/modules/social/social.service.js");

function makePlayer(id: string, displayName: string) {
  return {
    id,
    displayName,
    avatarSeed: null,
    avatarUrl: null,
    isGuest: false,
    createdAt: new Date("2024-01-01T00:00:00.000Z")
  };
}

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

test("inviteFriendToRoom refreshes an existing pending invite after a unique constraint race", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const existingInvite = {
    id: "invite-1",
    roomId: "room-1",
    roomCode: "ABCD",
    roomMode: "ffa",
    stakeKey: "stake_50",
    stakeAmount: 50,
    humanSeats: 2,
    totalPlayers: 4,
    isTeamMode: false,
    status: "pending",
    note: "old note",
    payloadJson: null,
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    respondedAt: null,
    expiresAt: new Date("2024-01-02T00:00:00.000Z"),
    inviter,
    invitee
  };

  const txRoomInvitation = {
    findFirst: async () => null,
    create: async () => {
      const error: any = new Error("unique violation");
      error.code = "P2002";
      throw error;
    },
    update: async () => {
      throw new Error("should not be called in tx path");
    }
  };

  const prismaMock = {
    player: {
      findUnique: async ({ where }: any) => {
        if (where.id === invitee.id) return invitee;
        if (where.id === inviter.id) return inviter;
        return null;
      }
    },
    friendConnection: {
      findFirst: async () => ({
        id: "friend-1",
        requesterPlayerId: inviter.id,
        addresseePlayerId: invitee.id,
        status: "accepted"
      })
    },
    roomInvitation: {
      findFirst: async () => existingInvite,
      update: async ({ data }: any) => Object.assign(existingInvite, data),
      create: async () => {
        throw new Error("should not be called outside tx path");
      }
    },
    $transaction: async (fn: any) => fn({ ...prismaMock, roomInvitation: txRoomInvitation })
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => inviter;

  const result = await service.inviteFriendToRoom(
    { authorization: "Bearer fake" } as any,
    "room-1",
    {
      inviteePlayerId: invitee.id,
      roomCode: "WXYZ",
      roomMode: "team",
      stakeKey: "stake_100",
      stakeAmount: 100,
      humanSeats: 3,
      totalPlayers: 6,
      isTeamMode: true,
      note: "fresh note",
      expiresAt: "2024-02-01T00:00:00.000Z"
    }
  );

  assert.equal(result.item.id, existingInvite.id);
  assert.equal(result.item.roomCode, "WXYZ");
  assert.equal(result.item.roomMode, "team");
  assert.equal(result.item.stakeAmount, 100);
  assert.equal(result.item.note, "fresh note");
});

test("acceptRoomInvitation rejects expired invites and marks them expired", async () => {
  const invitee = makePlayer("player-b", "Beta");
  const inviter = makePlayer("player-a", "Alpha");
  const invite = {
    id: "invite-2",
    roomId: "room-2",
    roomCode: "ABCD",
    roomMode: "ffa",
    stakeKey: null,
    stakeAmount: 0,
    humanSeats: 2,
    totalPlayers: 2,
    isTeamMode: false,
    status: "pending",
    note: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    respondedAt: null,
    expiresAt: new Date("2024-01-01T00:00:00.000Z"),
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    inviter,
    invitee
  };
  let expiredMarked = false;

  const prismaMock = {
    roomInvitation: {
      findUnique: async () => invite,
      update: async ({ data }: any) => {
        expiredMarked = data.status === "expired";
        Object.assign(invite, data);
        return invite;
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => invitee;

  await assert.rejects(
    () => service.acceptRoomInvitation({} as any, invite.id),
    /Invitation expired/
  );
  assert.equal(expiredMarked, true);
  assert.equal(invite.status, "expired");
});
