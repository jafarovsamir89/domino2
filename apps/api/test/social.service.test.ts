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

function makeInboxRow(overrides: Record<string, any> = {}) {
  return {
    id: "inbox-1",
    playerId: "player-a",
    type: "gift_received",
    title: "Gift from Alpha",
    body: "You received Gift 001",
    status: "unread",
    payloadJson: {
      senderPlayerId: "player-z",
      giftKey: "gift_001"
    },
    rewardJson: {
      type: "gift",
      giftKey: "gift_001"
    },
    createdAt: new Date("2024-03-01T10:00:00.000Z"),
    readAt: null,
    claimedAt: null,
    expiresAt: null,
    ...overrides
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

test("subscribeToSocialEvents emits heartbeat and clears the interval on cleanup", async () => {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const intervals: Array<{ fn: () => void; ms: number; cleared: boolean; unref: () => void }> = [];

  global.setInterval = ((fn: (...args: any[]) => void, ms?: number) => {
    const handle = {
      fn: () => fn(),
      ms: Number(ms || 0),
      cleared: false,
      unref() {}
    };
    intervals.push(handle);
    return handle as any;
  }) as any;

  global.clearInterval = ((handle: any) => {
    if (handle && typeof handle === "object") {
      handle.cleared = true;
    }
  }) as any;

  try {
    const prismaMock = {} as any;
    const service = new SocialService(prismaMock, {} as any);
    (service as any).getCurrentPlayer = async () => ({ id: "player-1" });

    const events: Array<{ type?: string; data?: any }> = [];
    const subscription = service.subscribeToSocialEvents({ authorization: "Bearer token" } as any).subscribe({
      next: (event) => events.push(event)
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(events[0]?.type, "connection");
    const heartbeat = intervals.find((item) => item.ms === 20000);
    assert.ok(heartbeat);
    heartbeat?.fn();
    assert.equal(events.some((event) => event.type === "heartbeat"), true);

    subscription.unsubscribe();
    assert.equal(heartbeat?.cleared, true);
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test("getPlayerProfile resolves profiles by userId when playerId is not provided", async () => {
  const currentPlayer = makePlayer("player-current", "Current");
  const targetPlayer = {
    id: "player-target",
    userId: "user-target",
    displayName: "Target Player",
    avatarSeed: null,
    avatarUrl: null,
    stats: {
      rating: 1111,
      matchesPlayed: 22,
      wins: 15,
      losses: 7
    }
  };

  const prismaMock = {
    player: {
      findFirst: async ({ where }: any) => {
        const filters = Array.isArray(where?.OR) ? where.OR : [];
        if (filters.some((item: any) => item.id === targetPlayer.userId || item.userId === targetPlayer.userId)) {
          return targetPlayer;
        }
        return null;
      }
    },
    friendConnection: {
      findFirst: async () => null
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.getPlayerProfile({} as any, targetPlayer.userId);
  assert.equal(result.item.id, targetPlayer.id);
  assert.equal(result.item.displayName, targetPlayer.displayName);
  assert.equal(result.item.stats.rating, 1111);
});

test("searchPlayers returns friendship status and friendship id", async () => {
  const currentPlayer = makePlayer("player-current", "Current");
  const friend = makePlayer("player-friend", "Friend");
  const pending = makePlayer("player-pending", "Pending");
  const prismaMock = {
    player: {
      findMany: async () => [currentPlayer, friend, pending]
    },
    friendConnection: {
      findMany: async () => ([
        {
          id: "friend-1",
          requesterPlayerId: currentPlayer.id,
          addresseePlayerId: friend.id,
          status: "accepted"
        },
        {
          id: "friend-2",
          requesterPlayerId: pending.id,
          addresseePlayerId: currentPlayer.id,
          status: "pending"
        }
      ])
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.searchPlayers({} as any, "a");
  assert.equal(result.items.length, 3);
  const friendRow = result.items.find((item: any) => item.id === friend.id) as any;
  const pendingRow = result.items.find((item: any) => item.id === pending.id) as any;
  const selfRow = result.items.find((item: any) => item.id === currentPlayer.id) as any;
  assert.ok(friendRow);
  assert.ok(pendingRow);
  assert.ok(selfRow);
  assert.equal(friendRow.friendshipStatus, "accepted");
  assert.equal(friendRow.friendshipId, "friend-1");
  assert.equal(pendingRow.friendshipStatus, "pending_incoming");
  assert.equal(pendingRow.friendshipId, "friend-2");
  assert.equal(selfRow.friendshipStatus, "self");
});

test("cancelFriendRequest allows the requester to cancel a pending request", async () => {
  const currentPlayer = makePlayer("player-current", "Current");
  const otherPlayer = makePlayer("player-other", "Other");
  const request = {
    id: "friend-req-1",
    requesterPlayerId: currentPlayer.id,
    addresseePlayerId: otherPlayer.id,
    status: "pending",
    note: null,
    createdAt: new Date("2024-03-01T00:00:00.000Z"),
    updatedAt: new Date("2024-03-01T00:00:00.000Z"),
    respondedAt: null,
    requester: currentPlayer,
    addressee: otherPlayer
  };
  const events: Array<{ playerId: string; type: string; data: any }> = [];
  const prismaMock = {
    friendConnection: {
      findUnique: async () => request,
      update: async ({ data }: any) => ({
        ...request,
        ...data,
        status: data.status
      })
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;
  (service as any).emitSseEvent = (playerId: string, type: string, data: any) => {
    events.push({ playerId, type, data });
  };

  const result = await service.cancelFriendRequest({} as any, request.id);
  assert.equal(result.item.status, "rejected");
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "friend_update");
  assert.equal(events[0].data.type, "friend_cancelled");
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

test("inviteFriendToRoom updates an accepted invite when the room is linked later", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const existingInvite = {
    id: "invite-2",
    roomId: "invite-session-1",
    roomCode: null,
    roomMode: "ffa",
    stakeKey: "stake_50",
    stakeAmount: 50,
    humanSeats: 2,
    totalPlayers: 4,
    isTeamMode: false,
    status: "accepted",
    note: "waiting",
    payloadJson: null,
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    respondedAt: new Date("2024-01-01T00:00:01.000Z"),
    expiresAt: new Date("2024-01-01T00:01:00.000Z"),
    inviter,
    invitee
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
        throw new Error("should not be called");
      }
    },
    $transaction: async (fn: any) => fn({ ...prismaMock, roomInvitation: prismaMock.roomInvitation })
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => inviter;

  const result = await service.inviteFriendToRoom(
    { authorization: "Bearer fake" } as any,
    "invite-session-1",
    {
      inviteePlayerId: invitee.id,
      roomCode: "WXYZ",
      roomMode: "team",
      stakeKey: "stake_100",
      stakeAmount: 100,
      humanSeats: 4,
      totalPlayers: 4,
      isTeamMode: true,
      note: "room linked"
    }
  );

  assert.equal(result.item.id, existingInvite.id);
  assert.equal(result.item.status, "accepted");
  assert.equal(result.item.roomCode, "WXYZ");
  assert.equal(result.item.note, "room linked");
});

test("inviteFriendToRoom defaults invite expiration to about 5 minutes", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  let capturedCreateData: any = null;

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
      findFirst: async () => null,
      create: async ({ data }: any) => {
        capturedCreateData = data;
        return {
          ...data,
          id: "invite-3",
          inviter,
          invitee,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
          respondedAt: null
        };
      }
    },
    $transaction: async (fn: any) => fn({ ...prismaMock })
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => inviter;
  const now = new Date("2024-02-01T00:00:00.000Z");
  const realNow = Date.now;
  Date.now = () => now.getTime();
  try {
    await service.inviteFriendToRoom(
      { authorization: "Bearer fake" } as any,
      "invite-session-2",
      {
        inviteePlayerId: invitee.id
      }
    );
  } finally {
    Date.now = realNow;
  }

  assert.ok(capturedCreateData?.expiresAt instanceof Date);
  const deltaMs = Math.abs(capturedCreateData.expiresAt.getTime() - now.getTime());
  assert.ok(deltaMs >= 299000 && deltaMs <= 301000);
});

test("acceptRoomInvitation returns room_not_available for expired invites and marks them expired", async () => {
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

  const result = await service.acceptRoomInvitation({} as any, invite.id);
  assert.equal(expiredMarked, true);
  assert.equal(invite.status, "expired");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "room_not_available");
});

test("acceptRoomInvitation returns join payload when roomCode is available", async () => {
  const invitee = makePlayer("player-b", "Beta");
  const inviter = makePlayer("player-a", "Alpha");
  const invite = {
    id: "invite-join",
    roomId: "room-join-1",
    roomCode: "ABCD",
    roomMode: "team",
    stakeKey: "stake_100",
    stakeAmount: 100,
    humanSeats: 4,
    totalPlayers: 4,
    isTeamMode: true,
    status: "pending",
    note: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    inviter,
    invitee
  };

  const prismaMock = {
    roomInvitation: {
      findUnique: async () => invite,
      update: async ({ data }: any) => ({
        ...invite,
        ...data,
        status: data.status
      })
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => invitee;

  const result = await service.acceptRoomInvitation({} as any, invite.id);
  assert.equal(result.ok, true);
  const join = result.join as any;
  assert.ok(join);
  assert.equal(join.roomCode, "ABCD");
  assert.equal(join.roomId, "room-join-1");
  assert.equal(join.roomMode, "team");
});

test("getRoomInvitations returns incoming and sent invites separately", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const friend = makePlayer("player-b", "Beta");
  const incomingInvite = {
    id: "invite-incoming",
    roomId: "room-1",
    roomCode: "ABCD",
    roomMode: "ffa",
    stakeKey: null,
    stakeAmount: 50,
    humanSeats: 2,
    totalPlayers: 2,
    isTeamMode: false,
    status: "pending",
    note: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    respondedAt: null,
    expiresAt: new Date("2024-01-01T00:01:00.000Z"),
    inviterPlayerId: friend.id,
    inviteePlayerId: currentPlayer.id,
    inviter: friend,
    invitee: currentPlayer
  };
  const sentInvite = {
    id: "invite-sent",
    roomId: "room-2",
    roomCode: null,
    roomMode: "team",
    stakeKey: "stake_100",
    stakeAmount: 100,
    humanSeats: 4,
    totalPlayers: 4,
    isTeamMode: true,
    status: "accepted",
    note: null,
    createdAt: new Date("2024-01-02T00:00:00.000Z"),
    updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    respondedAt: new Date("2024-01-02T00:00:01.000Z"),
    expiresAt: new Date("2024-01-02T00:01:00.000Z"),
    inviterPlayerId: currentPlayer.id,
    inviteePlayerId: friend.id,
    inviter: currentPlayer,
    invitee: friend
  };
  const prismaMock = {
    roomInvitation: {
      updateMany: async () => ({ count: 0 }),
      findMany: async () => [incomingInvite, sentInvite]
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.getRoomInvitations({} as any);
  assert.equal(result.incoming.length, 1);
  assert.equal(result.sent.length, 1);
  assert.equal(result.incoming[0].id, incomingInvite.id);
  assert.equal(result.sent[0].id, sentInvite.id);
});

test("cancelRoomInvitation allows the inviter to cancel pending sent invites", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const invite = {
    id: "invite-cancel",
    roomId: "room-3",
    roomCode: "EFGH",
    roomMode: "ffa",
    stakeKey: null,
    stakeAmount: 50,
    humanSeats: 2,
    totalPlayers: 2,
    isTeamMode: false,
    status: "pending",
    note: null,
    createdAt: new Date("2024-01-03T00:00:00.000Z"),
    updatedAt: new Date("2024-01-03T00:00:00.000Z"),
    respondedAt: null,
    expiresAt: new Date("2024-01-03T00:01:00.000Z"),
    inviterPlayerId: currentPlayer.id,
    inviteePlayerId: invitee.id,
    inviter: currentPlayer,
    invitee
  };
  let cancelled = false;

  const prismaMock = {
    roomInvitation: {
      findUnique: async () => invite,
      update: async ({ data }: any) => {
        cancelled = data.status === "revoked";
        Object.assign(invite, data);
        return invite;
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.cancelRoomInvitation({} as any, invite.id);
  assert.equal(cancelled, true);
  assert.equal(result.item.status, "revoked");
  assert.equal(invite.status, "revoked");
});

test("cancelRoomInvitation rejects an invitee trying to cancel someone else's invite", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const invite = {
    id: "invite-cancel-forbidden",
    roomId: "room-4",
    roomCode: "IJKL",
    roomMode: "ffa",
    stakeKey: null,
    stakeAmount: 50,
    humanSeats: 2,
    totalPlayers: 2,
    isTeamMode: false,
    status: "pending",
    note: null,
    createdAt: new Date("2024-01-04T00:00:00.000Z"),
    updatedAt: new Date("2024-01-04T00:00:00.000Z"),
    respondedAt: null,
    expiresAt: new Date("2024-01-04T00:01:00.000Z"),
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    inviter,
    invitee
  };

  const prismaMock = {
    roomInvitation: {
      findUnique: async () => invite,
      update: async () => {
        throw new Error("should not be called");
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => invitee;

  await assert.rejects(
    () => service.cancelRoomInvitation({} as any, invite.id),
    /Invitation not found/
  );
});

test("createPlayInvite creates a play invite without roomId", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  let capturedCreateData: any = null;

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
    playInvite: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        capturedCreateData = data;
        return {
          ...data,
          id: "play-invite-1",
          inviter,
          invitee,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
          respondedAt: null
        };
      }
    },
    $transaction: async (fn: any) => fn({ ...prismaMock })
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => inviter;

  const result = await service.createPlayInvite({} as any, {
    inviteePlayerId: invitee.id,
    note: "play now"
  });

  assert.equal(capturedCreateData?.roomId, null);
  assert.equal(capturedCreateData?.inviteePlayerId, invitee.id);
  assert.equal(result.item.status, "pending");
  assert.equal(result.item.note, "play now");
});

test("createPlayInvite preserves roomContext roomId and roomCode", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  let capturedCreateData: any = null;

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
    playInvite: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        capturedCreateData = data;
        return {
          ...data,
          id: "play-invite-room-bound-1",
          inviter,
          invitee,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
          respondedAt: null
        };
      }
    },
    $transaction: async (fn: any) => fn({ ...prismaMock })
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => inviter;

  const result = await service.createPlayInvite({} as any, {
    inviteePlayerId: invitee.id,
    note: "play now",
    payloadJson: {
      roomContext: {
        roomId: "room-123",
        roomCode: "abcd"
      }
    }
  });

  assert.equal(capturedCreateData?.roomId, "room-123");
  assert.equal(capturedCreateData?.roomCode, "ABCD");
  assert.equal(result.item.roomId, "room-123");
  assert.equal(result.item.roomCode, "ABCD");
});

test("getPlayInvites returns incoming, outgoing and waiting invites", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const friend = makePlayer("player-b", "Beta");
  const incomingInvite = {
    id: "play-invite-incoming",
    roomId: null,
    status: "pending",
    note: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    respondedAt: null,
    expiresAt: new Date("2024-01-01T00:01:00.000Z"),
    inviterPlayerId: friend.id,
    inviteePlayerId: currentPlayer.id,
    inviter: friend,
    invitee: currentPlayer
  };
  const outgoingWaitingInvite = {
    id: "play-invite-outgoing",
    roomId: null,
    status: "accepted",
    note: null,
    createdAt: new Date("2024-01-02T00:00:00.000Z"),
    updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    respondedAt: new Date("2024-01-02T00:00:01.000Z"),
    expiresAt: new Date("2024-01-02T00:01:00.000Z"),
    inviterPlayerId: currentPlayer.id,
    inviteePlayerId: friend.id,
    inviter: currentPlayer,
    invitee: friend
  };

  const prismaMock = {
    playInvite: {
      updateMany: async () => ({ count: 0 }),
      findMany: async () => [incomingInvite, outgoingWaitingInvite]
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.getPlayInvites({} as any);
  assert.equal(result.incoming.length, 1);
  assert.equal(result.outgoing.length, 1);
  assert.equal(result.waiting.length, 1);
  assert.equal(result.acceptedWaiting.length, 1);
  assert.equal(result.incoming[0].id, incomingInvite.id);
  assert.equal(result.outgoing[0].id, outgoingWaitingInvite.id);
  assert.equal(result.waiting[0].id, outgoingWaitingInvite.id);
});

test("attachPlayInviteRoom sets roomId and emits room-ready to invitee", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const acceptedInvite = {
    id: "play-invite-ready",
    roomId: null,
    roomCode: null,
    status: "accepted",
    note: null,
    payloadJson: null,
    createdAt: new Date("2024-01-05T00:00:00.000Z"),
    updatedAt: new Date("2024-01-05T00:00:00.000Z"),
    respondedAt: new Date("2024-01-05T00:00:01.000Z"),
    expiresAt: new Date(Date.now() + 60_000),
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    inviter,
    invitee
  };
  const updates: any[] = [];
  const emitted: any[] = [];

  const prismaMock = {
    playInvite: {
      findMany: async () => [acceptedInvite],
      update: async ({ data }: any) => {
        updates.push(data);
        Object.assign(acceptedInvite, data);
        return {
          ...acceptedInvite,
          inviter,
          invitee
        };
      }
    },
    $transaction: async (fn: any) => fn({ playInvite: prismaMock.playInvite })
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => inviter;
  (service as any).emitSseEvent = (playerId: string, type: string, data: any) => {
    emitted.push({ playerId, type, data });
  };

  const result = await service.attachPlayInviteRoom({} as any, {
    roomId: "room-123",
    roomCode: "ABCD",
    inviteIds: [acceptedInvite.id],
    roomSettings: {
      maxPlayers: 4,
      roomMode: "ffa"
    }
  });

  assert.equal(result.count, 1);
  assert.equal(result.item?.status, "room_created");
  assert.equal(result.item?.roomId, "room-123");
  assert.equal(result.item?.roomCode, "ABCD");
  assert.equal(updates[0].roomId, "room-123");
  assert.equal(updates[0].roomCode, "ABCD");
  assert.equal(updates[0].status, "room_created");
  assert.ok(emitted.some((row) => row.playerId === invitee.id && row.type === "play_invite_update" && row.data?.type === "play_invite_room_ready"));
  assert.ok(emitted.some((row) => row.playerId === inviter.id && row.type === "play_invite_update" && row.data?.type === "play_invite_room_created"));
});

test("attachPlayInviteRoom ignores pending declined and cancelled invites", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const acceptedInvite = {
    id: "play-invite-accepted",
    roomId: null,
    roomCode: null,
    status: "accepted",
    note: null,
    payloadJson: null,
    createdAt: new Date("2024-01-05T00:00:00.000Z"),
    updatedAt: new Date("2024-01-05T00:00:00.000Z"),
    respondedAt: new Date("2024-01-05T00:00:01.000Z"),
    expiresAt: new Date(Date.now() + 60_000),
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    inviter,
    invitee
  };
  const pendingInvite = { ...acceptedInvite, id: "play-invite-pending", status: "pending" };
  const declinedInvite = { ...acceptedInvite, id: "play-invite-declined", status: "declined" };
  const cancelledInvite = { ...acceptedInvite, id: "play-invite-cancelled", status: "cancelled" };
  const updates: string[] = [];

  const prismaMock = {
    playInvite: {
      findMany: async () => [acceptedInvite, pendingInvite, declinedInvite, cancelledInvite],
      update: async ({ where, data }: any) => {
        updates.push(where.id);
        Object.assign(acceptedInvite, data);
        return {
          ...acceptedInvite,
          inviter,
          invitee
        };
      }
    },
    $transaction: async (fn: any) => fn({ playInvite: prismaMock.playInvite })
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => inviter;

  const result = await service.attachPlayInviteRoom({} as any, {
    roomId: "room-456",
    inviteIds: [acceptedInvite.id, pendingInvite.id, declinedInvite.id, cancelledInvite.id],
    roomSettings: { maxPlayers: 4 }
  });

  assert.equal(result.count, 1);
  assert.deepEqual(updates, [acceptedInvite.id]);
  assert.equal(result.item?.status, "room_created");
});

test("acceptPlayInvite changes status to accepted", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const invite = {
    id: "play-invite-accept",
    roomId: null,
    status: "pending",
    note: null,
    createdAt: new Date("2024-01-03T00:00:00.000Z"),
    updatedAt: new Date("2024-01-03T00:00:00.000Z"),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    inviter,
    invitee
  };
  const updates: any[] = [];

  const prismaMock = {
    playInvite: {
      findUnique: async () => invite,
      update: async ({ data }: any) => {
        updates.push(data);
        Object.assign(invite, data);
        return invite;
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => invitee;

  const accepted = await service.acceptPlayInvite({} as any, invite.id);
  assert.ok(accepted.item);
  assert.equal(accepted.item!.status, "accepted");
  assert.equal(updates[0].status, "accepted");
  assert.equal(updates[0].expiresAt, null);
});

test("acceptPlayInvite preserves room context for room-bound invites", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const invite = {
    id: "play-invite-room-bound-accept",
    roomId: null,
    roomCode: null,
    status: "pending",
    note: null,
    payloadJson: {
      roomContext: {
        roomId: "room-456",
        roomCode: "wxyz"
      }
    },
    createdAt: new Date("2024-01-03T00:00:00.000Z"),
    updatedAt: new Date("2024-01-03T00:00:00.000Z"),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    inviter,
    invitee
  };
  const updates: any[] = [];

  const prismaMock = {
    playInvite: {
      findUnique: async () => invite,
      update: async ({ data }: any) => {
        updates.push(data);
        Object.assign(invite, data);
        return invite;
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => invitee;

  const accepted = await service.acceptPlayInvite({} as any, invite.id);
  assert.ok(accepted.item);
  assert.equal(accepted.item!.status, "accepted");
  assert.equal(accepted.item!.roomId, "room-456");
  assert.equal(accepted.item!.roomCode, "WXYZ");
  assert.equal(updates[0].roomId, "room-456");
  assert.equal(updates[0].roomCode, "WXYZ");
});

test("declinePlayInvite changes status to declined", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const invite = {
    id: "play-invite-decline",
    roomId: null,
    status: "pending",
    note: null,
    createdAt: new Date("2024-01-04T00:00:00.000Z"),
    updatedAt: new Date("2024-01-04T00:00:00.000Z"),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    inviter,
    invitee
  };
  const updates: any[] = [];

  const prismaMock = {
    playInvite: {
      findUnique: async () => invite,
      update: async ({ data }: any) => {
        updates.push(data);
        Object.assign(invite, data);
        return invite;
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => invitee;

  const declined = await service.declinePlayInvite({} as any, invite.id);
  assert.equal(declined.item.status, "declined");
  assert.equal(updates[0].status, "declined");
});

test("cancelPlayInvite allows inviter to cancel a pending play invite", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const invite = {
    id: "play-invite-cancel-pending",
    roomId: null,
    status: "pending",
    note: null,
    createdAt: new Date("2024-01-06T00:00:00.000Z"),
    updatedAt: new Date("2024-01-06T00:00:00.000Z"),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    inviter,
    invitee
  };
  const updates: any[] = [];
  const emitted: any[] = [];

  const prismaMock = {
    playInvite: {
      findUnique: async () => invite,
      update: async ({ data }: any) => {
        updates.push(data);
        Object.assign(invite, data);
        return invite;
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => inviter;
  (service as any).emitSseEvent = (playerId: string, type: string, data: any) => {
    emitted.push({ playerId, type, data });
  };

  const cancelled = await service.cancelPlayInvite({} as any, invite.id);
  assert.equal(cancelled.item.status, "cancelled");
  assert.equal(updates[0].status, "cancelled");
  assert.ok(emitted.some((row) => row.playerId === inviter.id && row.data?.type === "play_invite_cancelled"));
  assert.ok(emitted.some((row) => row.playerId === invitee.id && row.data?.type === "play_invite_cancelled"));
});

test("cancelPlayInvite allows invitee to leave an accepted waiting play invite", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const invite = {
    id: "play-invite-cancel-waiting",
    roomId: null,
    status: "accepted",
    note: null,
    createdAt: new Date("2024-01-07T00:00:00.000Z"),
    updatedAt: new Date("2024-01-07T00:00:00.000Z"),
    respondedAt: new Date("2024-01-07T00:00:01.000Z"),
    expiresAt: null,
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    inviter,
    invitee
  };
  const updates: any[] = [];

  const prismaMock = {
    playInvite: {
      findUnique: async () => invite,
      update: async ({ data }: any) => {
        updates.push(data);
        Object.assign(invite, data);
        return invite;
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => invitee;

  const cancelled = await service.cancelPlayInvite({} as any, invite.id);
  assert.equal(cancelled.item.status, "cancelled");
  assert.equal(updates[0].status, "cancelled");
});

test("cancelPlayInvite allows inviter to cancel an accepted waiting play invite", async () => {
  const inviter = makePlayer("player-a", "Alpha");
  const invitee = makePlayer("player-b", "Beta");
  const invite = {
    id: "play-invite-cancel-waiting-inviter",
    roomId: null,
    status: "accepted",
    note: null,
    createdAt: new Date("2024-01-08T00:00:00.000Z"),
    updatedAt: new Date("2024-01-08T00:00:00.000Z"),
    respondedAt: new Date("2024-01-08T00:00:01.000Z"),
    expiresAt: null,
    inviterPlayerId: inviter.id,
    inviteePlayerId: invitee.id,
    inviter,
    invitee
  };
  const updates: any[] = [];

  const prismaMock = {
    playInvite: {
      findUnique: async () => invite,
      update: async ({ data }: any) => {
        updates.push(data);
        Object.assign(invite, data);
        return invite;
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => inviter;

  const cancelled = await service.cancelPlayInvite({} as any, invite.id);
  assert.equal(cancelled.item.status, "cancelled");
  assert.equal(updates[0].status, "cancelled");
});

test("sendDirectMessage rejects messaging yourself", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const prismaMock = {
    player: {
      findUnique: async () => {
        throw new Error("should not be called");
      }
    },
    directMessage: {
      create: async () => {
        throw new Error("should not be called");
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  await assert.rejects(
    () => service.sendDirectMessage({} as any, currentPlayer.id, { text: "Hello" }),
    /You cannot message yourself/
  );
});

test("sendDirectMessage rejects empty and overlong text", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const targetPlayer = makePlayer("player-b", "Beta");
  const prismaMock = {
    player: {
      findUnique: async () => targetPlayer
    },
    directMessage: {
      create: async () => {
        throw new Error("should not be called");
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  await assert.rejects(
    () => service.sendDirectMessage({} as any, targetPlayer.id, { text: "   " }),
    /Message cannot be empty/
  );
  await assert.rejects(
    () => service.sendDirectMessage({} as any, targetPlayer.id, { text: "x".repeat(501) }),
    /Message is too long/
  );
});

test("sendDirectMessage creates a message between two players", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const targetPlayer = makePlayer("player-b", "Beta");
  let capturedCreate: any = null;

  const prismaMock = {
    player: {
      findUnique: async ({ where }: any) => {
        if (where.id === targetPlayer.id) return targetPlayer;
        return null;
      }
    },
    inboxMessage: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 })
    },
    directMessage: {
      create: async (query: any) => {
        capturedCreate = query;
        return {
          id: "message-1",
          senderPlayerId: currentPlayer.id,
          receiverPlayerId: targetPlayer.id,
          text: "Hello from Alpha",
          createdAt: new Date("2024-03-01T10:00:00.000Z"),
          readAt: null,
          sender: currentPlayer,
          receiver: targetPlayer
        };
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.sendDirectMessage({} as any, targetPlayer.id, { text: "  Hello from Alpha  " });

  assert.ok(capturedCreate);
  assert.deepEqual(capturedCreate.data, {
    senderPlayerId: currentPlayer.id,
    receiverPlayerId: targetPlayer.id,
    text: "Hello from Alpha"
  });
  assert.equal(result.item.id, "message-1");
  assert.equal(result.item.text, "Hello from Alpha");
  assert.equal(result.item.sender.displayName, "Alpha");
  assert.equal(result.item.receiver.displayName, "Beta");
});

test("sendDirectMessage clears hidden thread markers and emits full SSE payload", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const targetPlayer = makePlayer("player-b", "Beta");
  const deletedIds: string[] = [];
  let hiddenRows = [
    { id: "hidden-outgoing", payloadJson: { relatedPlayerId: targetPlayer.id } },
    { id: "hidden-incoming", payloadJson: { relatedPlayerId: currentPlayer.id } }
  ];
  const events: Array<{ playerId: string; type: string; data: any }> = [];

  const prismaMock = {
    player: {
      findUnique: async ({ where }: any) => {
        if (where.id === targetPlayer.id) return targetPlayer;
        return null;
      }
    },
    inboxMessage: {
      findMany: async ({ where }: any) => {
        if (where?.type === "direct_message_thread_hidden") {
          const playerIds = Array.isArray(where?.playerId?.in) ? where.playerId.in : [];
          return hiddenRows.filter((row) => playerIds.includes("player-a") || playerIds.includes("player-b")).map((row) => ({ ...row }));
        }
        return [];
      },
      deleteMany: async ({ where }: any) => {
        const ids = Array.isArray(where?.id?.in) ? where.id.in : [];
        deletedIds.push(...ids);
        hiddenRows = hiddenRows.filter((row) => !ids.includes(row.id));
        return { count: where?.id?.in?.length || 0 };
      }
    },
    directMessage: {
      create: async () => ({
        id: "message-9",
        senderPlayerId: currentPlayer.id,
        receiverPlayerId: targetPlayer.id,
        text: "Hello again",
        createdAt: new Date("2024-03-01T10:00:00.000Z"),
        readAt: null,
        sender: currentPlayer,
        receiver: targetPlayer
      })
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;
  (service as any).emitSseEvent = (playerId: string, type: string, data: any) => {
    events.push({ playerId, type, data });
  };

  const result = await service.sendDirectMessage({} as any, targetPlayer.id, { text: "Hello again" });
  assert.equal(deletedIds.includes("hidden-outgoing"), true);
  assert.equal(deletedIds.includes("hidden-incoming"), true);
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "message");
  assert.equal(events[0].data.type, "direct_message_created");
  assert.equal(events[0].data.message.id, "message-9");
  assert.equal(events[1].type, "message_sent");
  assert.equal(result.item.id, "message-9");
});

test("sendDirectMessage restores hidden/deleted threads after a new incoming message", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const targetPlayer = makePlayer("player-b", "Beta");
  let hidden = true;
  const prismaMock = {
    player: {
      findUnique: async ({ where }: any) => {
        if (where.id === targetPlayer.id) return targetPlayer;
        return null;
      }
    },
    inboxMessage: {
      findMany: async ({ where }: any) => {
        if (where?.type === "direct_message_thread_hidden" && hidden) {
          const playerIds = Array.isArray(where?.playerId?.in) ? where.playerId.in : [];
          return playerIds.map((playerId: string) => ({
            id: `hidden-${playerId}`,
            payloadJson: { relatedPlayerId: playerId === currentPlayer.id ? targetPlayer.id : currentPlayer.id }
          }));
        }
        return [];
      },
      deleteMany: async () => {
        hidden = false;
        return { count: 2 };
      }
    },
    directMessage: {
      create: async () => ({
        id: "message-10",
        senderPlayerId: currentPlayer.id,
        receiverPlayerId: targetPlayer.id,
        text: "Ping after hidden",
        createdAt: new Date("2024-03-01T10:10:00.000Z"),
        readAt: null,
        sender: currentPlayer,
        receiver: targetPlayer
      })
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.sendDirectMessage({} as any, targetPlayer.id, { text: "Ping after hidden" });
  assert.equal(result.item.id, "message-10");
  assert.equal(hidden, false);
});

test("getDirectMessages returns the newest page of messages first", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const targetPlayer = makePlayer("player-b", "Beta");
  let capturedQuery: any = null;
  const rows = [
    {
      id: "message-3",
      senderPlayerId: targetPlayer.id,
      receiverPlayerId: currentPlayer.id,
      text: "Third",
      createdAt: new Date("2024-03-01T10:10:00.000Z"),
      readAt: null,
      sender: targetPlayer,
      receiver: currentPlayer
    },
    {
      id: "message-2",
      senderPlayerId: currentPlayer.id,
      receiverPlayerId: targetPlayer.id,
      text: "Second",
      createdAt: new Date("2024-03-01T10:05:00.000Z"),
      readAt: null,
      sender: currentPlayer,
      receiver: targetPlayer
    },
    {
      id: "message-1",
      senderPlayerId: currentPlayer.id,
      receiverPlayerId: targetPlayer.id,
      text: "First",
      createdAt: new Date("2024-03-01T10:00:00.000Z"),
      readAt: null,
      sender: currentPlayer,
      receiver: targetPlayer
    },
    {
      id: "message-2",
      senderPlayerId: targetPlayer.id,
      receiverPlayerId: currentPlayer.id,
      text: "Second",
      createdAt: new Date("2024-03-01T10:05:00.000Z"),
      readAt: null,
      sender: targetPlayer,
      receiver: currentPlayer
    }
  ];

  const prismaMock = {
    player: {
      findUnique: async ({ where }: any) => {
        if (where.id === targetPlayer.id) return targetPlayer;
        return null;
      }
    },
    directMessage: {
      findMany: async (query: any) => {
        capturedQuery = query;
        return rows;
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.getDirectMessages({} as any, targetPlayer.id, { limit: 2 });

  assert.ok(capturedQuery);
  assert.deepEqual(capturedQuery.where.OR, [
    { senderPlayerId: currentPlayer.id, receiverPlayerId: targetPlayer.id },
    { senderPlayerId: targetPlayer.id, receiverPlayerId: currentPlayer.id }
  ]);
  assert.deepEqual(capturedQuery.include, {
    sender: { select: { id: true, displayName: true, avatarSeed: true, avatarUrl: true, isGuest: true, createdAt: true } },
    receiver: { select: { id: true, displayName: true, avatarSeed: true, avatarUrl: true, isGuest: true, createdAt: true } }
  });
  assert.deepEqual(capturedQuery.orderBy, { createdAt: "desc" });
  assert.equal(capturedQuery.take, 3);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].id, "message-2");
  assert.equal(result.items[1].id, "message-3");
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, "2024-03-01T10:05:00.000Z");
});

test("getMessageThreads returns only the current player's conversations with unread counts", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const playerB = makePlayer("player-b", "Beta");
  const playerC = makePlayer("player-c", "Gamma");
  const stranger = makePlayer("player-d", "Delta");

  const rows = [
    {
      id: "m-5",
      senderPlayerId: stranger.id,
      receiverPlayerId: playerB.id,
      text: "Not visible",
      createdAt: new Date("2024-03-03T10:00:00.000Z"),
      readAt: null,
      sender: stranger,
      receiver: playerB
    },
    {
      id: "m-4",
      senderPlayerId: playerC.id,
      receiverPlayerId: currentPlayer.id,
      text: "Hey Alpha",
      createdAt: new Date("2024-03-02T09:00:00.000Z"),
      readAt: null,
      sender: playerC,
      receiver: currentPlayer
    },
    {
      id: "m-3",
      senderPlayerId: playerB.id,
      receiverPlayerId: currentPlayer.id,
      text: "Seen message",
      createdAt: new Date("2024-03-01T12:00:00.000Z"),
      readAt: new Date("2024-03-01T12:30:00.000Z"),
      sender: playerB,
      receiver: currentPlayer
    },
    {
      id: "m-2",
      senderPlayerId: playerB.id,
      receiverPlayerId: currentPlayer.id,
      text: "Unread message",
      createdAt: new Date("2024-03-01T11:00:00.000Z"),
      readAt: null,
      sender: playerB,
      receiver: currentPlayer
    },
    {
      id: "m-1",
      senderPlayerId: currentPlayer.id,
      receiverPlayerId: playerB.id,
      text: "Hello Beta",
      createdAt: new Date("2024-03-01T10:00:00.000Z"),
      readAt: null,
      sender: currentPlayer,
      receiver: playerB
    }
  ];

  const prismaMock = {
    inboxMessage: {
      findMany: async () => []
    },
    directMessage: {
      findMany: async ({ where, take }: any) => {
        assert.equal(take, 200);
        assert.deepEqual(where.OR, [
          { senderPlayerId: currentPlayer.id },
          { receiverPlayerId: currentPlayer.id }
        ]);
        return rows.filter((row) => row.senderPlayerId === currentPlayer.id || row.receiverPlayerId === currentPlayer.id);
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.getMessageThreads({} as any);

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].player.id, playerC.id);
  assert.equal(result.items[0].lastMessage.text, "Hey Alpha");
  assert.equal(result.items[0].unreadCount, 1);
  assert.equal(result.items[1].player.id, playerB.id);
  assert.equal(result.items[1].lastMessage.text, "Seen message");
  assert.equal(result.items[1].unreadCount, 1);
});

test("getMessageThreads hides threads that the player archived", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const playerB = makePlayer("player-b", "Beta");
  const playerC = makePlayer("player-c", "Gamma");

  const rows = [
    {
      id: "m-2",
      senderPlayerId: playerB.id,
      receiverPlayerId: currentPlayer.id,
      text: "Unread message",
      createdAt: new Date("2024-03-01T11:00:00.000Z"),
      readAt: null,
      sender: playerB,
      receiver: currentPlayer
    },
    {
      id: "m-1",
      senderPlayerId: playerC.id,
      receiverPlayerId: currentPlayer.id,
      text: "Hidden message",
      createdAt: new Date("2024-03-01T10:00:00.000Z"),
      readAt: null,
      sender: playerC,
      receiver: currentPlayer
    }
  ];

  const prismaMock = {
    inboxMessage: {
      findMany: async ({ where }: any) => {
        if (where?.type === "direct_message_thread_hidden") {
          return [
            makeInboxRow({
              id: "hidden-1",
              playerId: currentPlayer.id,
              type: "direct_message_thread_hidden",
              status: "deleted",
              payloadJson: { relatedPlayerId: playerC.id }
            })
          ];
        }
        return [];
      }
    },
    directMessage: {
      findMany: async () => rows
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.getMessageThreads({} as any);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].player.id, playerB.id);
});

test("getInbox returns inbox items and unread count", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const rows = [
    makeInboxRow({ id: "inbox-1", status: "unread", title: "First", createdAt: new Date("2024-03-03T10:00:00.000Z") }),
    makeInboxRow({ id: "inbox-2", status: "unread", title: "Second", createdAt: new Date("2024-03-02T10:00:00.000Z") }),
    makeInboxRow({ id: "inbox-3", status: "read", readAt: new Date("2024-03-01T11:00:00.000Z") }),
    makeInboxRow({
      id: "inbox-4",
      status: "unread",
      type: "direct_message",
      payloadJson: {
        senderPlayerId: "player-z",
        receiverPlayerId: currentPlayer.id,
        messageId: "message-4"
      }
    })
  ];
  let capturedWhere: any = null;
  const prismaMock = {
    inboxMessage: {
      findMany: async ({ where, take }: any) => {
        capturedWhere = where;
        assert.equal(take, 30);
        return rows;
      },
      count: async ({ where }: any) => {
        assert.deepEqual(where, {
          playerId: currentPlayer.id,
          status: "unread",
          type: { not: "direct_message" }
        });
        return 2;
      }
    },
    directMessage: {
      count: async () => 0
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.getInbox({} as any, { status: "all", limit: "30" });

  assert.deepEqual(capturedWhere, {
    playerId: currentPlayer.id,
    type: { not: "direct_message" },
    status: { not: "deleted" }
  });
  assert.equal(result.unreadCount, 2);
  assert.equal(result.items[0].id, "inbox-1");
  assert.equal(result.items[0].isUnread, true);
  assert.equal(result.items[0].isClaimable, true);
});

test("markDirectMessageThreadRead marks the matching direct message rows as read", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const targetPlayer = makePlayer("player-b", "Beta");
  const updates: any[] = [];
  const prismaMock = {
    directMessage: {
      updateMany: async (query: any) => {
        updates.push({ kind: "direct", query });
        return { count: 2 };
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.markDirectMessageThreadRead({} as any, targetPlayer.id);
  assert.equal(result.ok, true);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].query.where.OR[0], {
    senderPlayerId: targetPlayer.id,
    receiverPlayerId: currentPlayer.id
  });
});

test("markInboxRead claimInboxMessage and deleteInboxMessage update inbox state", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const unreadRow = makeInboxRow({ id: "inbox-10", status: "unread" });
  const dmRow = makeInboxRow({
    id: "inbox-10-dm",
    status: "unread",
    type: "direct_message",
    payloadJson: {
      messageId: "message-10",
      senderPlayerId: "player-z",
      receiverPlayerId: currentPlayer.id
    }
  });
  const claimableRow = makeInboxRow({ id: "inbox-11", status: "read" });
  const deletableRow = makeInboxRow({ id: "inbox-12", status: "read", rewardJson: null, type: "system_news" });
  const updatedRows: Record<string, any> = {};
  const directMessageUpdates: any[] = [];
  const prismaMock = {
    inboxMessage: {
      findUnique: async ({ where }: any) => {
        if (where.id === unreadRow.id) return unreadRow;
        if (where.id === dmRow.id) return dmRow;
        if (where.id === claimableRow.id) return claimableRow;
        if (where.id === deletableRow.id) return deletableRow;
        return null;
      },
      update: async ({ where, data }: any) => {
        updatedRows[where.id] = { ...(updatedRows[where.id] || {}), ...data };
        const base = where.id === unreadRow.id ? unreadRow : where.id === claimableRow.id ? claimableRow : deletableRow;
        return { ...base, ...data };
      }
    },
    directMessage: {
      updateMany: async (query: any) => {
        directMessageUpdates.push(query);
        return { count: 1 };
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const marked = await service.markInboxRead({} as any, unreadRow.id);
  assert.equal(marked.item.status, "read");
  assert.equal(updatedRows[unreadRow.id].status, "read");

  const markedDm = await service.markInboxRead({} as any, dmRow.id);
  assert.equal(markedDm.item.status, "read");
  assert.equal(directMessageUpdates.length, 1);
  assert.deepEqual(directMessageUpdates[0].where, {
    id: "message-10",
    receiverPlayerId: currentPlayer.id,
    readAt: null
  });
  assert.ok(directMessageUpdates[0].data.readAt instanceof Date);

  const claimed = await service.claimInboxMessage({} as any, claimableRow.id);
  assert.equal(claimed.item?.status, "claimed");
  assert.equal(updatedRows[claimableRow.id].status, "claimed");

  const deleted = await service.deleteInboxMessage({} as any, deletableRow.id);
  assert.equal(deleted.item.status, "deleted");
  assert.equal(updatedRows[deletableRow.id].status, "deleted");
});

test("deleteMessageThread hides a conversation and clears inbox rows for that thread", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const targetPlayer = makePlayer("player-b", "Beta");
  const createdRows: any[] = [];

  const prismaMock = {
    player: {
      findUnique: async ({ where }: any) => (where.id === targetPlayer.id ? targetPlayer : null)
    },
    inboxMessage: {
      findMany: async ({ where }: any) => {
        if (where?.type === "direct_message_thread_hidden") {
          return [
            makeInboxRow({
              id: "hidden-existing",
              playerId: currentPlayer.id,
              type: "direct_message_thread_hidden",
              status: "deleted",
              payloadJson: { relatedPlayerId: targetPlayer.id }
            })
          ];
        }
        return [];
      },
      deleteMany: async () => ({ count: 1 }),
      create: async ({ data }: any) => {
        createdRows.push(data);
        return makeInboxRow({
          id: "hidden-created",
          playerId: currentPlayer.id,
          type: data.type,
          title: data.title,
          body: data.body,
          status: data.status,
          payloadJson: data.payloadJson
        });
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.deleteMessageThread({} as any, targetPlayer.id);
  assert.equal(result.ok, true);
  assert.equal(createdRows.length, 1);
  assert.equal(createdRows[0].type, "direct_message_thread_hidden");
  assert.deepEqual(createdRows[0].payloadJson, { relatedPlayerId: targetPlayer.id });
});

test("getSocialSummary counts inbox chats invites and friend requests", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const prismaMock = {
    inboxMessage: {
      findMany: async () => [],
      count: async ({ where }: any) => {
        assert.deepEqual(where, {
          playerId: currentPlayer.id,
          status: "unread",
          type: { not: "direct_message" }
        });
        return 2;
      }
    },
    directMessage: {
      count: async ({ where }: any) => {
        assert.deepEqual(where, {
          receiverPlayerId: currentPlayer.id,
          readAt: null
        });
        return 3;
      }
    },
    roomInvitation: {
      count: async ({ where }: any) => {
        assert.deepEqual(where, { inviteePlayerId: currentPlayer.id, status: "pending" });
        return 4;
      }
    },
    playInvite: {
      count: async ({ where }: any) => {
        assert.deepEqual(where, { inviteePlayerId: currentPlayer.id, status: "pending" });
        return 6;
      }
    },
    friendConnection: {
      count: async ({ where }: any) => {
        assert.deepEqual(where, { addresseePlayerId: currentPlayer.id, status: "pending" });
        return 5;
      }
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.getSocialSummary({} as any);
  assert.equal(result.inboxUnreadCount, 2);
  assert.equal(result.chatUnreadCount, 3);
  assert.equal(result.inviteUnreadCount, 10);
  assert.equal(result.friendRequestCount, 5);
  assert.equal(result.totalUnreadCount, 20);
});

test("sendGift creates an inbox notification for the recipient", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const recipient = makePlayer("player-b", "Beta");
  let inboxCreateData: any = null;
  let transactionUsed = false;

  const prismaMock = {
    player: {
      findUnique: async ({ where }: any) => {
        if (where.id === recipient.id) return recipient;
        if (where.id === currentPlayer.id) return currentPlayer;
        return null;
      }
    },
    giftCatalog: {
      findUnique: async () => ({
        id: "catalog-1",
        key: "gift_001",
        name: "Gift 001",
        assetKey: "gift_001",
        coinCost: 100,
        exchangeRateBps: 7000,
        isActive: true
      })
    },
    $transaction: async (fn: any) => {
      transactionUsed = true;
      return fn({
        giftCatalog: {
          findUnique: async () => ({
            id: "catalog-1",
            key: "gift_001",
            name: "Gift 001",
            assetKey: "gift_001",
            coinCost: 100,
            exchangeRateBps: 7000,
            isActive: true
          })
        },
        playerGiftInventory: {
          upsert: async () => ({
            id: "inventory-1",
            playerId: recipient.id,
            giftCatalogId: "catalog-1",
            quantity: 1,
            receivedCount: 1,
            sentCount: 0,
            exchangedCount: 0,
            lastReceivedAt: new Date("2024-03-03T10:00:00.000Z"),
            lastSentAt: null,
            createdAt: new Date("2024-03-03T10:00:00.000Z"),
            updatedAt: new Date("2024-03-03T10:00:00.000Z"),
            catalog: {
              id: "catalog-1",
              key: "gift_001",
              name: "Gift 001",
              description: null,
              assetKey: "gift_001",
              coinCost: 100,
              exchangeRateBps: 7000,
              rarity: "common",
              sortOrder: 1,
              isActive: true,
              createdAt: new Date("2024-03-03T10:00:00.000Z"),
              updatedAt: new Date("2024-03-03T10:00:00.000Z")
            }
          })
        },
        giftTransaction: {
          create: async ({ data }: any) => ({
            id: "gift-1",
            senderPlayerId: currentPlayer.id,
            recipientPlayerId: recipient.id,
            giftCatalogId: "catalog-1",
            giftKeySnapshot: data.giftKeySnapshot,
            giftNameSnapshot: data.giftNameSnapshot,
            assetKeySnapshot: data.assetKeySnapshot,
            coinCost: data.coinCost,
            exchangeValue: data.exchangeValue,
            contextType: data.contextType,
            contextId: data.contextId,
            note: data.note,
            status: data.status,
            createdAt: new Date("2024-03-03T10:00:00.000Z"),
            updatedAt: new Date("2024-03-03T10:00:00.000Z"),
            sender: currentPlayer,
            recipient
          })
        },
        inboxMessage: {
          create: async ({ data }: any) => {
            inboxCreateData = data;
            return makeInboxRow({
              id: "inbox-100",
              playerId: recipient.id,
              type: data.type,
              title: data.title,
              body: data.body,
              status: data.status,
              payloadJson: data.payloadJson,
              rewardJson: data.rewardJson
            });
          }
        },
        coinWallet: {
          update: async () => ({ balance: 900, reserved: 0, lifetimeEarned: 0, lifetimeSpent: 100 })
        },
        coinLedgerEntry: {
          create: async () => ({})
        }
      });
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;
  (service as any).ensureGiftCatalog = async () => {};
  (service as any).debitWallet = async () => ({ balance: 900 });

  const result = await service.sendGift({} as any, {
    recipientPlayerId: recipient.id,
    giftKey: "gift_001",
    contextType: "profile",
    contextId: "profile-1",
    note: "Gift 001"
  });

  assert.equal(transactionUsed, true);
  assert.ok(inboxCreateData);
  assert.equal(inboxCreateData.playerId, recipient.id);
  assert.equal(inboxCreateData.type, "gift_received");
  assert.equal(inboxCreateData.status, "unread");
  assert.equal(result.ok, true);
  assert.equal(result.inbox.id, "inbox-100");
});

test("sendDirectMessage emits live events for socket subscribers", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const targetPlayer = makePlayer("player-b", "Beta");
  const prismaMock = {
    player: {
      findUnique: async ({ where }: any) => {
        if (where?.id === targetPlayer.id) return targetPlayer;
        if (where?.id === currentPlayer.id) return currentPlayer;
        return null;
      }
    },
    directMessage: {
      create: async ({ data }: any) => ({
        id: "message-1",
        senderPlayerId: data.senderPlayerId,
        receiverPlayerId: data.receiverPlayerId,
        text: data.text,
        createdAt: new Date("2024-03-01T10:00:00.000Z"),
        readAt: null,
        sender: currentPlayer,
        receiver: targetPlayer
      })
    }
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;
  (service as any).clearHiddenDirectMessageThreadMarkers = async () => {};

  const liveEvents: Array<{ playerId: string; type: string; data: any }> = [];
  const unsubscribe = service.subscribeToLiveEvents((event) => {
    liveEvents.push(event);
  });

  try {
    const result = await service.sendDirectMessageForPlayer(currentPlayer, targetPlayer.id, { text: "Hello" });
    assert.equal(result.item.text, "Hello");
    assert.ok(liveEvents.some((event) => event.playerId === targetPlayer.id && event.type === "message"));
    assert.ok(liveEvents.some((event) => event.playerId === currentPlayer.id && event.type === "message_sent"));
  } finally {
    unsubscribe();
  }
});
