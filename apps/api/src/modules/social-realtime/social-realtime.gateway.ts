import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { WebSocketGateway } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

import { verifyGameToken, type GameTokenClaims } from "../auth/game-token.js";
import { SocialService } from "../social/social.service.js";
import { SocialRealtimeService, type SocialPresenceStatus } from "./social-realtime.service.js";

type SocialAck<T = any> = (response: T) => void;

@WebSocketGateway({
  namespace: "/social",
  path: "/api/socket.io",
  cors: {
    origin: true,
    credentials: true
  }
})
export class SocialRealtimeGateway implements OnModuleInit, OnModuleDestroy {
  private server: Server | null = null;
  private unsubscribeLiveEvents: (() => void) | null = null;

  constructor(
    private readonly socialService: SocialService,
    private readonly realtimeService: SocialRealtimeService
  ) {}

  onModuleInit() {
    this.unsubscribeLiveEvents = this.socialService.subscribeToLiveEvents((event) => {
      this.forwardLiveEvent(event.playerId, event.type, event.data);
    });
  }

  onModuleDestroy() {
    if (this.unsubscribeLiveEvents) {
      this.unsubscribeLiveEvents();
      this.unsubscribeLiveEvents = null;
    }
  }

  afterInit(server: Server) {
    this.server = server;
    this.realtimeService.setBroadcastFn((playerId, event, payload) => {
      this.server?.to(`player:${playerId}`).emit(event, payload);
    });
  }

  handleConnection(socket: Socket) {
    const claims = this.authenticateSocket(socket);
    if (!claims) {
      socket.emit("social:error", {
        code: "unauthorized",
        message: "Login required"
      });
      socket.disconnect(true);
      return;
    }
    const player = {
      id: claims.playerId,
      displayName: claims.displayName
    };

    void this.realtimeService.registerSocket(socket, claims).catch((error: any) => {
      socket.emit("social:error", {
        code: "presence_failed",
        message: String(error?.message || "Unable to initialize social presence")
      });
    });

    socket.on("social:hello", (payload: any, ack?: SocialAck) => {
      ack?.({
        ok: true,
        playerId: claims.playerId,
        status: this.realtimeService.getPresence(claims.playerId)?.status || "online",
        serverNow: Date.now(),
        payload: payload || null
      });
    });

    socket.on("presence:update", async (payload: any, ack?: SocialAck) => {
      try {
        const status = this.normalizePresenceStatus(payload?.status);
        const roomCode = String(payload?.roomCode || "").trim() || null;
        const entry = status === "in_game"
          ? await this.realtimeService.updateRoomPresence(claims.playerId, roomCode)
          : status === "offline"
            ? await this.realtimeService.markOffline(claims.playerId)
            : await this.realtimeService.markOnline(claims.playerId);

        ack?.({
          ok: true,
          presence: entry
        });
      } catch (error: any) {
        ack?.({
          ok: false,
          error: String(error?.message || "presence_update_failed")
        });
      }
    });

    socket.on("dm:send", async (payload: any, ack?: SocialAck) => {
      const tempId = String(payload?.tempId || "").trim();
      const receiverPlayerId = String(payload?.receiverPlayerId || "").trim();
      const text = String(payload?.text || "").trim();
      if (!receiverPlayerId || !text) {
        ack?.({ ok: false, error: "Message cannot be empty" });
        return;
      }

      try {
        const result = await this.socialService.sendDirectMessageForPlayer(
          player,
          receiverPlayerId,
          { text },
          { emitEvents: false }
        );
        const message = result.item;
        const ackPayload = {
          ok: true,
          tempId,
          message,
          threadPlayerId: receiverPlayerId
        };
        this.realtimeService.emitSocketEventToPlayer(claims.playerId, "dm:ack", ackPayload);
        this.realtimeService.emitSocketEventToPlayer(receiverPlayerId, "dm:new", {
          message,
          threadPlayerId: claims.playerId
        });
        ack?.(ackPayload);
      } catch (error: any) {
        const errorPayload = {
          ok: false,
          tempId,
          error: String(error?.message || "message_send_failed")
        };
        ack?.(errorPayload);
        socket.emit("social:error", errorPayload);
      }
    });

    socket.on("dm:read", async (payload: any, ack?: SocialAck) => {
      const threadPlayerId = String(payload?.threadPlayerId || payload?.playerId || "").trim();
      if (!threadPlayerId) {
        ack?.({ ok: false, error: "threadPlayerId is required" });
        return;
      }

      try {
        await this.socialService.markDirectMessageThreadReadForPlayer(player, threadPlayerId);
        const readPayload = {
          threadPlayerId,
          readerPlayerId: claims.playerId,
          readAt: new Date().toISOString()
        };
        this.realtimeService.emitSocketEventToPlayer(threadPlayerId, "dm:read", readPayload);
        ack?.({ ok: true, ...readPayload });
      } catch (error: any) {
        ack?.({ ok: false, error: String(error?.message || "message_read_failed") });
      }
    });

    socket.on("invite:create", async (payload: any, ack?: SocialAck) => {
      try {
        const inviteePlayerId = String(payload?.inviteePlayerId || "").trim();
        const roomId = String(payload?.roomId || "").trim();
        if (!inviteePlayerId || !roomId) {
          ack?.({ ok: false, error: "inviteePlayerId and roomId are required" });
          return;
        }
        const result = await this.socialService.inviteFriendToRoomForPlayer(
          player,
          roomId,
          payload || {},
          { emitEvents: false }
        );
        const invite = result.item;
        const response = { ok: true, invite };
        this.realtimeService.emitSocketEventToPlayer(inviteePlayerId, "invite:new", { invite });
        this.realtimeService.emitSocketEventToPlayer(claims.playerId, "invite:update", { invite });
        ack?.(response);
      } catch (error: any) {
        ack?.({ ok: false, error: String(error?.message || "invite_create_failed") });
      }
    });

    socket.on("play-invite:create", async (payload: any, ack?: SocialAck) => {
      try {
        const inviteePlayerId = String(payload?.inviteePlayerId || "").trim();
        if (!inviteePlayerId) {
          ack?.({ ok: false, error: "inviteePlayerId is required" });
          return;
        }
        const result = await this.socialService.createPlayInviteForPlayer(
          player,
          payload || {},
          { emitEvents: false }
        );
        const invite = result.item;
        this.realtimeService.emitSocketEventToPlayer(inviteePlayerId, "play-invite:new", { invite });
        ack?.({ ok: true, invite });
      } catch (error: any) {
        ack?.({ ok: false, error: String(error?.message || "play_invite_create_failed") });
      }
    });

    socket.on("play-invite:accept", async (payload: any, ack?: SocialAck) => {
      try {
        const inviteId = String(payload?.inviteId || payload?.id || "").trim();
        if (!inviteId) {
          ack?.({ ok: false, error: "inviteId is required" });
          return;
        }
        const result: any = await this.socialService.acceptPlayInviteForPlayer(player, inviteId, { emitEvents: false });
        if (!result.ok && result.reason) {
          ack?.(result);
          return;
        }
        const invite = result.item;
        if (!invite) {
          ack?.({ ok: false, error: "play_invite_missing" });
          return;
        }
        const inviteePlayerId = String(invite.invitee?.id || claims.playerId || "").trim();
        const inviterPlayerId = String(invite.inviter?.id || "").trim();
        if (inviteePlayerId) {
          this.realtimeService.emitSocketEventToPlayer(inviteePlayerId, "play-invite:accepted", { invite });
        }
        if (inviterPlayerId) {
          this.realtimeService.emitSocketEventToPlayer(inviterPlayerId, "play-invite:accepted", { invite });
        }
        ack?.({ ok: true, invite });
      } catch (error: any) {
        ack?.({ ok: false, error: String(error?.message || "play_invite_accept_failed") });
      }
    });

    socket.on("play-invite:decline", async (payload: any, ack?: SocialAck) => {
      try {
        const inviteId = String(payload?.inviteId || payload?.id || "").trim();
        if (!inviteId) {
          ack?.({ ok: false, error: "inviteId is required" });
          return;
        }
        const result = await this.socialService.declinePlayInviteForPlayer(player, inviteId, { emitEvents: false });
        const invite = result.item;
        const inviteePlayerId = String(invite.invitee?.id || claims.playerId || "").trim();
        const inviterPlayerId = String(invite.inviter?.id || "").trim();
        if (inviteePlayerId) {
          this.realtimeService.emitSocketEventToPlayer(inviteePlayerId, "play-invite:declined", { invite });
        }
        if (inviterPlayerId) {
          this.realtimeService.emitSocketEventToPlayer(inviterPlayerId, "play-invite:declined", { invite });
        }
        ack?.({ ok: true, invite });
      } catch (error: any) {
        ack?.({ ok: false, error: String(error?.message || "play_invite_decline_failed") });
      }
    });

    socket.on("play-invite:cancel", async (payload: any, ack?: SocialAck) => {
      try {
        const inviteId = String(payload?.inviteId || payload?.id || "").trim();
        if (!inviteId) {
          ack?.({ ok: false, error: "inviteId is required" });
          return;
        }
        const result = await this.socialService.cancelPlayInviteForPlayer(player, inviteId, { emitEvents: false });
        const invite = result.item;
        const inviteePlayerId = String(invite.invitee?.id || "").trim();
        const inviterPlayerId = String(invite.inviter?.id || claims.playerId || "").trim();
        if (inviteePlayerId) {
          this.realtimeService.emitSocketEventToPlayer(inviteePlayerId, "play-invite:cancelled", { invite });
        }
        if (inviterPlayerId) {
          this.realtimeService.emitSocketEventToPlayer(inviterPlayerId, "play-invite:cancelled", { invite });
        }
        ack?.({ ok: true, invite });
      } catch (error: any) {
        ack?.({ ok: false, error: String(error?.message || "play_invite_cancel_failed") });
      }
    });

    socket.on("invite:accept", async (payload: any, ack?: SocialAck) => {
      try {
        const inviteId = String(payload?.inviteId || payload?.id || "").trim();
        if (!inviteId) {
          ack?.({ ok: false, error: "inviteId is required" });
          return;
        }
        const result: any = await this.socialService.acceptRoomInvitationForPlayer(player, inviteId, { emitEvents: false });
        if (!result.ok) {
          ack?.(result);
          return;
        }
        const invite = result.item;
        const join = result.join;
        const inviteePlayerId = String(invite.invitee?.id || claims.playerId || "").trim();
        const inviterPlayerId = String(invite.inviter?.id || "").trim();
        const payloadToSend = {
          invite,
          join
        };
        this.realtimeService.emitSocketEventToPlayer(inviteePlayerId, "invite:update", {
          type: "invite_accepted",
          invite,
          join
        });
        if (inviterPlayerId) {
          this.realtimeService.emitSocketEventToPlayer(inviterPlayerId, "invite:update", {
            type: "invite_accepted",
            invite,
            join
          });
        }
        ack?.({ ok: true, ...payloadToSend });
      } catch (error: any) {
        ack?.({ ok: false, error: String(error?.message || "invite_accept_failed") });
      }
    });

    socket.on("invite:decline", async (payload: any, ack?: SocialAck) => {
      try {
        const inviteId = String(payload?.inviteId || payload?.id || "").trim();
        if (!inviteId) {
          ack?.({ ok: false, error: "inviteId is required" });
          return;
        }
        const result = await this.socialService.declineRoomInvitationForPlayer(player, inviteId, { emitEvents: false });
        const invite = result.item;
        const inviteePlayerId = String(invite.invitee?.id || claims.playerId || "").trim();
        const inviterPlayerId = String(invite.inviter?.id || "").trim();
        this.realtimeService.emitSocketEventToPlayer(inviteePlayerId, "invite:update", {
          type: "invite_declined",
          invite
        });
        if (inviterPlayerId) {
          this.realtimeService.emitSocketEventToPlayer(inviterPlayerId, "invite:update", {
            type: "invite_declined",
            invite
          });
        }
        ack?.({ ok: true, invite });
      } catch (error: any) {
        ack?.({ ok: false, error: String(error?.message || "invite_decline_failed") });
      }
    });

    socket.on("invite:cancel", async (payload: any, ack?: SocialAck) => {
      try {
        const inviteId = String(payload?.inviteId || payload?.id || "").trim();
        if (!inviteId) {
          ack?.({ ok: false, error: "inviteId is required" });
          return;
        }
        const result = await this.socialService.cancelRoomInvitationForPlayer(player, inviteId, { emitEvents: false });
        const invite = result.item;
        const inviteePlayerId = String(invite.invitee?.id || "").trim();
        const inviterPlayerId = String(invite.inviter?.id || claims.playerId || "").trim();
        if (inviteePlayerId) {
          this.realtimeService.emitSocketEventToPlayer(inviteePlayerId, "invite:update", {
            type: "invite_cancelled",
            invite
          });
        }
        if (inviterPlayerId) {
          this.realtimeService.emitSocketEventToPlayer(inviterPlayerId, "invite:update", {
            type: "invite_cancelled",
            invite
          });
        }
        ack?.({ ok: true, invite });
      } catch (error: any) {
        ack?.({ ok: false, error: String(error?.message || "invite_cancel_failed") });
      }
    });

    socket.on("typing:start", (payload: any) => {
      const threadPlayerId = String(payload?.threadPlayerId || payload?.playerId || "").trim();
      if (!threadPlayerId) return;
      this.realtimeService.emitSocketEventToPlayer(threadPlayerId, "typing:start", {
        threadPlayerId: claims.playerId,
        displayName: claims.displayName
      });
    });

    socket.on("typing:stop", (payload: any) => {
      const threadPlayerId = String(payload?.threadPlayerId || payload?.playerId || "").trim();
      if (!threadPlayerId) return;
      this.realtimeService.emitSocketEventToPlayer(threadPlayerId, "typing:stop", {
        threadPlayerId: claims.playerId,
        displayName: claims.displayName
      });
    });
  }

  async handleDisconnect(socket: Socket) {
    await this.realtimeService.unregisterSocket(socket).catch(() => {});
  }

  private authenticateSocket(socket: Socket): GameTokenClaims | null {
    const authToken = String(socket.handshake.auth?.token || "").trim()
      || String(socket.handshake.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
    const claims = verifyGameToken(authToken);
    if (!claims?.playerId || !claims?.userId) return null;
    return claims;
  }

  private normalizePresenceStatus(value: unknown): SocialPresenceStatus {
    const text = String(value || "").trim().toLowerCase();
    if (text === "in_game") return "in_game";
    if (text === "offline") return "offline";
    return "online";
  }

  private forwardLiveEvent(playerId: string, type: string, data: any) {
    const key = String(playerId || "").trim();
    if (!key || !this.server) return;

    if (type === "message") {
      this.server.to(`player:${key}`).emit("dm:new", {
        message: data?.message || data,
        threadPlayerId: String(data?.threadPlayerId || "").trim() || null
      });
      return;
    }

    if (type === "message_sent") {
      this.server.to(`player:${key}`).emit("dm:ack", {
        message: data?.message || data,
        threadPlayerId: String(data?.threadPlayerId || "").trim() || null
      });
      return;
    }

    if (type === "invite_update") {
      const inviteType = String(data?.type || "").trim();
      const eventName = inviteType === "invite_created" ? "invite:new" : "invite:update";
      this.server.to(`player:${key}`).emit(eventName, {
        invite: data?.invite || data,
        type: inviteType || "invite_updated"
      });
      return;
    }

    if (type === "play_invite_update") {
      const inviteType = String(data?.type || "").trim();
      const eventNameMap: Record<string, string> = {
        play_invite_created: "play-invite:new",
        play_invite_accepted: "play-invite:accepted",
        play_invite_declined: "play-invite:declined",
        play_invite_cancelled: "play-invite:cancelled",
        play_invite_room_ready: "play-invite:room-ready",
        play_invite_room_created: "play-invite:room-created",
        play_invite_joined: "play-invite:joined",
        play_invite_failed_to_join: "play-invite:failed-to-join"
      };
      const eventName = eventNameMap[inviteType] || "play-invite:update";
      this.server.to(`player:${key}`).emit(eventName, {
        invite: data?.invite || data,
        type: inviteType || "play_invite_updated"
      });
      return;
    }

    if (type === "friend_update") {
      this.server.to(`player:${key}`).emit("friend:update", data);
      return;
    }

    if (type === "presence:update") {
      this.server.to(`player:${key}`).emit("presence:update", data);
    }
  }
}
