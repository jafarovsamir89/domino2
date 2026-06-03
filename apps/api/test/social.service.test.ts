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
  let capturedInboxCreate: any = null;

  const prismaMock = {
    player: {
      findUnique: async ({ where }: any) => {
        if (where.id === targetPlayer.id) return targetPlayer;
        return null;
      }
    },
    $transaction: async (fn: any) => fn({
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
      },
      inboxMessage: {
        create: async (query: any) => {
          capturedInboxCreate = query;
          return makeInboxRow({
            id: "inbox-1",
            playerId: targetPlayer.id,
            type: "direct_message",
            title: `Message from ${currentPlayer.displayName}`,
            body: "Hello from Alpha",
            payloadJson: {
              messageId: "message-1",
              senderPlayerId: currentPlayer.id,
              senderDisplayName: currentPlayer.displayName,
              receiverPlayerId: targetPlayer.id
            },
            rewardJson: null
          });
        }
      }
    })
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
  assert.deepEqual(capturedInboxCreate.data, {
    playerId: targetPlayer.id,
    type: "direct_message",
    title: "Message from Alpha",
    body: "Hello from Alpha",
    status: "unread",
    payloadJson: {
      messageId: "message-1",
      senderPlayerId: currentPlayer.id,
      senderDisplayName: currentPlayer.displayName,
      receiverPlayerId: targetPlayer.id
    }
  });
  assert.equal(result.item.id, "message-1");
  assert.equal(result.item.text, "Hello from Alpha");
  assert.equal(result.item.sender.displayName, "Alpha");
  assert.equal(result.item.receiver.displayName, "Beta");
  assert.equal(result.inbox.id, "inbox-1");
  assert.equal(result.inbox.type, "direct_message");
});

test("getDirectMessages returns the conversation history between two players", async () => {
  const currentPlayer = makePlayer("player-a", "Alpha");
  const targetPlayer = makePlayer("player-b", "Beta");
  let capturedQuery: any = null;
  const rows = [
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

  const result = await service.getDirectMessages({} as any, targetPlayer.id);

  assert.ok(capturedQuery);
  assert.deepEqual(capturedQuery.where.OR, [
    { senderPlayerId: currentPlayer.id, receiverPlayerId: targetPlayer.id },
    { senderPlayerId: targetPlayer.id, receiverPlayerId: currentPlayer.id }
  ]);
  assert.deepEqual(capturedQuery.include, {
    sender: { select: { id: true, displayName: true, avatarSeed: true, avatarUrl: true, isGuest: true, createdAt: true } },
    receiver: { select: { id: true, displayName: true, avatarSeed: true, avatarUrl: true, isGuest: true, createdAt: true } }
  });
  assert.deepEqual(capturedQuery.orderBy, { createdAt: "asc" });
  assert.equal(capturedQuery.take, 50);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].id, "message-1");
  assert.equal(result.items[1].id, "message-2");
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
    makeInboxRow({ id: "inbox-3", status: "read", readAt: new Date("2024-03-01T11:00:00.000Z") })
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
        assert.deepEqual(where, { playerId: currentPlayer.id, status: "unread" });
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
    status: { not: "deleted" }
  });
  assert.equal(result.unreadCount, 2);
  assert.equal(result.items[0].id, "inbox-1");
  assert.equal(result.items[0].isUnread, true);
  assert.equal(result.items[0].isClaimable, true);
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
  const hiddenMarkerRows = [
    makeInboxRow({
      id: "hidden-1",
      playerId: currentPlayer.id,
      type: "direct_message_thread_hidden",
      status: "deleted",
      payloadJson: {
        relatedPlayerId: targetPlayer.id
      }
    })
  ];
  const inboxRows = [
    makeInboxRow({
      id: "inbox-dm-1",
      playerId: currentPlayer.id,
      type: "direct_message",
      status: "unread",
      payloadJson: {
        senderPlayerId: targetPlayer.id,
        receiverPlayerId: currentPlayer.id,
        messageId: "message-1"
      }
    }),
    makeInboxRow({
      id: "inbox-dm-2",
      playerId: currentPlayer.id,
      type: "direct_message",
      status: "read",
      payloadJson: {
        senderPlayerId: targetPlayer.id,
        receiverPlayerId: currentPlayer.id,
        messageId: "message-2"
      }
    })
  ];
  const updatedRows: any[] = [];
  const createdRows: any[] = [];
  const tx = {
    inboxMessage: {
      findMany: async ({ where }: any) => {
        if (where?.type === "direct_message_thread_hidden") {
          return hiddenMarkerRows;
        }
        if (where?.type === "direct_message") {
          return inboxRows;
        }
        return [];
      },
      updateMany: async ({ where, data }: any) => {
        updatedRows.push({ where, data });
        return { count: 2 };
      },
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
  const prismaMock = {
    player: {
      findUnique: async ({ where }: any) => (where.id === targetPlayer.id ? targetPlayer : null)
    },
    inboxMessage: tx.inboxMessage,
    $transaction: async (fn: any) => fn(tx)
  } as any;

  const service = new SocialService(prismaMock, {} as any);
  (service as any).getCurrentPlayer = async () => currentPlayer;

  const result = await service.deleteMessageThread({} as any, targetPlayer.id);
  assert.equal(result.ok, true);
  assert.equal(updatedRows.length, 1);
  assert.deepEqual(updatedRows[0].where, {
    id: { in: ["inbox-dm-1", "inbox-dm-2"] },
    playerId: currentPlayer.id
  });
  assert.equal(updatedRows[0].data.status, "deleted");
  assert.ok(updatedRows[0].data.readAt instanceof Date);
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
        assert.deepEqual(where, { playerId: currentPlayer.id, status: "unread" });
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
  assert.equal(result.inviteUnreadCount, 4);
  assert.equal(result.friendRequestCount, 5);
  assert.equal(result.totalUnreadCount, 14);
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
