import test from "node:test";
import assert from "node:assert/strict";

import { createGameToken } from "../src/modules/auth/game-token.js";
import { SocialRealtimeGateway } from "../src/modules/social-realtime/social-realtime.gateway.js";
import { SocialRealtimeService } from "../src/modules/social-realtime/social-realtime.service.js";

function makeClaims(playerId = "player-1", displayName = "Alpha") {
  return {
    userId: `user-${playerId}`,
    playerId,
    displayName,
    role: "player",
    sessionId: `session-${playerId}`,
    provider: "better-auth" as const,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  };
}

function makeToken(playerId = "player-1", displayName = "Alpha") {
  return createGameToken(makeClaims(playerId, displayName));
}

class FakeSocket {
  id: string;
  connected = true;
  disconnected = false;
  handshake: any;
  data: Record<string, any> = {};
  joined: string[] = [];
  emitted: Array<{ event: string; payload: any }> = [];
  listeners = new Map<string, (...args: any[]) => any>();

  constructor(token: string) {
    this.id = `socket-${Math.random().toString(36).slice(2, 8)}`;
    this.handshake = {
      auth: { token },
      headers: { authorization: `Bearer ${token}` }
    };
  }

  on(event: string, handler: (...args: any[]) => any) {
    this.listeners.set(event, handler);
    return this;
  }

  emit(event: string, payload: any, ack?: (...args: any[]) => void) {
    this.emitted.push({ event, payload });
    if (typeof ack === "function" && payload?.__ack !== undefined) {
      ack(payload.__ack);
    }
    return this;
  }

  join(room: string) {
    this.joined.push(room);
  }

  disconnect(force?: boolean) {
    this.disconnected = true;
    this.connected = false;
    this.data.disconnectForce = force;
  }

  trigger(event: string, payload?: any, ack?: (response?: any) => void) {
    const handler = this.listeners.get(event);
    if (!handler) throw new Error(`No handler registered for ${event}`);
    return handler(payload, ack);
  }
}

function createGatewayHarness({ friendRows = [] as any[], socialServiceOverrides = {} as Record<string, any> } = {}) {
  const broadcasts: Array<{ room: string; event: string; payload: any }> = [];
  const server = {
    to(room: string) {
      return {
        emit(event: string, payload: any) {
          broadcasts.push({ room, event, payload });
        }
      };
    }
  } as any;

  const realtimeService = new SocialRealtimeService({
    friendConnection: {
      findMany: async () => friendRows
    }
  } as any);
  realtimeService.setBroadcastFn((playerId, event, payload) => {
    server.to(`player:${playerId}`).emit(event, payload);
  });

  const socialService = {
    subscribeToLiveEvents: () => () => {},
    ...socialServiceOverrides
  } as any;

  const gateway = new SocialRealtimeGateway(socialService, realtimeService);
  gateway.afterInit(server);
  gateway.onModuleInit();

  return { gateway, realtimeService, socialService, broadcasts };
}

test("social realtime gateway accepts valid token, marks presence online, and broadcasts presence snapshots", async () => {
  const friendRows = [
    { requesterPlayerId: "friend-1", addresseePlayerId: "player-1" }
  ];
  const { gateway, realtimeService, broadcasts } = createGatewayHarness({ friendRows });
  const socket = new FakeSocket(makeToken("player-1", "Alpha"));

  gateway.handleConnection(socket as any);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(socket.joined, ["player:player-1"]);
  assert.equal(realtimeService.getPresence("player-1")?.status, "online");
  assert.ok(broadcasts.some((row) => row.room === "player:player-1" && row.event === "social:ready"));
  assert.ok(broadcasts.some((row) => row.room === "player:friend-1" && row.event === "presence:update" && row.payload?.playerId === "player-1"));

  await gateway.handleDisconnect(socket as any);
  assert.equal(realtimeService.getPresence("player-1")?.status, "offline");
  assert.ok(broadcasts.some((row) => row.room === "player:friend-1" && row.event === "presence:update" && row.payload?.status === "offline"));
});

test("social realtime gateway rejects invalid token", async () => {
  const { gateway } = createGatewayHarness();
  const socket = new FakeSocket("invalid-token");

  gateway.handleConnection(socket as any);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(socket.disconnected, true);
  assert.ok(socket.emitted.some((row) => row.event === "social:error" && row.payload?.code === "unauthorized"));
});

test("dm:send uses live socket delivery and invite:create pushes invite updates", async () => {
  const sentMessages: any[] = [];
  const sentInvites: any[] = [];
  const { gateway, broadcasts } = createGatewayHarness({
    socialServiceOverrides: {
      sendDirectMessageForPlayer: async (claims: any, playerId: string, body: any, options: any) => {
        sentMessages.push({ claims, playerId, body, options });
        return {
          item: {
            id: "msg-1",
            senderPlayerId: claims.playerId,
            receiverPlayerId: playerId,
            text: body.text,
            createdAt: "2026-06-08T00:00:00.000Z"
          }
        };
      },
      inviteFriendToRoomForPlayer: async (claims: any, roomId: string, body: any, options: any) => {
        sentInvites.push({ claims, roomId, body, options });
        return {
          item: {
            id: "invite-1",
            status: "pending",
            roomId,
            roomCode: body.roomCode,
            roomMode: body.roomMode || "ffa",
            stakeKey: body.stakeKey || null,
            inviter: { id: claims.playerId, displayName: claims.displayName },
            invitee: { id: body.inviteePlayerId, displayName: "Beta" }
          }
        };
      }
    }
  });

  const socket = new FakeSocket(makeToken("player-1", "Alpha"));
  gateway.handleConnection(socket as any);
  await new Promise((resolve) => setImmediate(resolve));
  broadcasts.length = 0;

  let dmAck: any = null;
  socket.trigger("dm:send", { tempId: "tmp-1", receiverPlayerId: "player-2", text: "hello" }, (response) => {
    dmAck = response;
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(dmAck?.ok, true);
  assert.equal(sentMessages.length, 1);
  assert.ok(broadcasts.some((row) => row.room === "player:player-1" && row.event === "dm:ack"));
  assert.ok(broadcasts.some((row) => row.room === "player:player-2" && row.event === "dm:new"));

  broadcasts.length = 0;
  let inviteAck: any = null;
  socket.trigger("invite:create", {
    inviteePlayerId: "player-2",
    roomId: "room-1",
    roomCode: "ABCD",
    roomMode: "ffa",
    stakeKey: "stake_50"
  }, (response) => {
    inviteAck = response;
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(inviteAck?.ok, true);
  assert.equal(sentInvites.length, 1);
  assert.ok(broadcasts.some((row) => row.room === "player:player-2" && row.event === "invite:new"));
  assert.ok(broadcasts.some((row) => row.room === "player:player-1" && row.event === "invite:update"));
});

test("play-invite:create and play-invite:accept emit play invite socket events", async () => {
  const createdInvites: any[] = [];
  const acceptedInvites: any[] = [];
  const { gateway, broadcasts } = createGatewayHarness({
    socialServiceOverrides: {
      createPlayInviteForPlayer: async (claims: any, body: any, options: any) => {
        createdInvites.push({ claims, body, options });
        return {
          item: {
            id: "play-invite-1",
            status: "pending",
            roomId: null,
            inviter: { id: claims.playerId, displayName: claims.displayName },
            invitee: { id: body.inviteePlayerId, displayName: "Beta" }
          }
        };
      },
      acceptPlayInviteForPlayer: async (claims: any, inviteId: string, options: any) => {
        acceptedInvites.push({ claims, inviteId, options });
        return {
          item: {
            id: inviteId,
            status: "accepted",
            roomId: null,
            inviter: { id: "player-1", displayName: "Alpha" },
            invitee: { id: claims.playerId, displayName: claims.displayName }
          }
        };
      }
    }
  });

  const socket = new FakeSocket(makeToken("player-1", "Alpha"));
  gateway.handleConnection(socket as any);
  await new Promise((resolve) => setImmediate(resolve));
  broadcasts.length = 0;

  let createAck: any = null;
  socket.trigger("play-invite:create", { inviteePlayerId: "player-2" }, (response) => {
    createAck = response;
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(createAck?.ok, true);
  assert.equal(createdInvites.length, 1);
  assert.ok(broadcasts.some((row) => row.room === "player:player-2" && row.event === "play-invite:new"));

  const inviteeSocket = new FakeSocket(makeToken("player-2", "Beta"));
  gateway.handleConnection(inviteeSocket as any);
  await new Promise((resolve) => setImmediate(resolve));
  broadcasts.length = 0;
  let acceptAck: any = null;
  inviteeSocket.trigger("play-invite:accept", { inviteId: "play-invite-1" }, (response) => {
    acceptAck = response;
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(acceptAck?.ok, true);
  assert.equal(acceptedInvites.length, 1);
  assert.ok(broadcasts.some((row) => row.room === "player:player-1" && row.event === "play-invite:accepted"));
  assert.ok(broadcasts.some((row) => row.room === "player:player-2" && row.event === "play-invite:accepted"));
});

test("play-invite room-ready and joined live events map to socket events", async () => {
  const { gateway, broadcasts } = createGatewayHarness();
  (gateway as any).forwardLiveEvent("player-2", "play_invite_update", {
    type: "play_invite_room_ready",
    invite: {
      id: "play-invite-1",
      status: "room_created",
      roomId: "room-1",
      roomCode: "ABCD",
      inviter: { id: "player-1", displayName: "Alpha" },
      invitee: { id: "player-2", displayName: "Beta" }
    }
  });
  (gateway as any).forwardLiveEvent("player-1", "play_invite_update", {
    type: "play_invite_joined",
    invite: {
      id: "play-invite-1",
      status: "joined",
      roomId: "room-1",
      roomCode: "ABCD",
      inviter: { id: "player-1", displayName: "Alpha" },
      invitee: { id: "player-2", displayName: "Beta" }
    }
  });

  assert.ok(broadcasts.some((row) => row.room === "player:player-2" && row.event === "play-invite:room-ready"));
  assert.ok(broadcasts.some((row) => row.room === "player:player-1" && row.event === "play-invite:joined"));
});

test("presence:update toggles in_game and offline states", async () => {
  const { gateway, realtimeService } = createGatewayHarness();
  const socket = new FakeSocket(makeToken("player-1", "Alpha"));

  gateway.handleConnection(socket as any);
  await new Promise((resolve) => setImmediate(resolve));

  let presenceAck: any = null;
  socket.trigger("presence:update", { status: "in_game", roomCode: "ROOM1" }, (response) => {
    presenceAck = response;
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(presenceAck?.ok, true);
  assert.equal(realtimeService.getPresence("player-1")?.status, "in_game");
  assert.equal(realtimeService.getPresence("player-1")?.roomCode, "ROOM1");

  await gateway.handleDisconnect(socket as any);
  assert.equal(realtimeService.getPresence("player-1")?.status, "offline");
});
