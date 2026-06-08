import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

import type { Socket } from "socket.io";

export type SocialPresenceStatus = "online" | "in_game" | "offline";

export type SocialRealtimeClaims = {
  userId: string;
  playerId: string;
  displayName: string;
  sessionId: string;
  provider: "better-auth";
  issuedAt: number;
  expiresAt: number;
};

export type SocialPresenceEntry = {
  playerId: string;
  displayName: string;
  status: SocialPresenceStatus;
  roomCode: string | null;
  lastSeenAt: string;
  socketCount: number;
};

type BroadcastFn = (playerId: string, event: string, payload: any) => void;

@Injectable()
export class SocialRealtimeService {
  private readonly socketsByPlayer = new Map<string, Set<Socket>>();
  private readonly socketToPlayer = new Map<string, string>();
  private readonly presenceByPlayer = new Map<string, SocialPresenceEntry>();
  private broadcastFn: BroadcastFn | null = null;

  constructor(private readonly prisma: PrismaService) {}

  setBroadcastFn(fn: BroadcastFn) {
    this.broadcastFn = fn;
  }

  private emitToPlayer(playerId: string, event: string, payload: any) {
    const key = String(playerId || "").trim();
    if (!key || !this.broadcastFn) return;
    this.broadcastFn(key, event, payload);
  }

  private normalizeStatus(status: string | null | undefined): SocialPresenceStatus {
    const value = String(status || "").trim().toLowerCase();
    if (value === "in_game") return "in_game";
    if (value === "offline") return "offline";
    return "online";
  }

  private async getAcceptedFriendIds(playerId: string) {
    const key = String(playerId || "").trim();
    if (!key) return [];
    const rows = await this.prisma.friendConnection.findMany({
      where: {
        status: "accepted",
        OR: [
          { requesterPlayerId: key },
          { addresseePlayerId: key }
        ]
      },
      select: {
        requesterPlayerId: true,
        addresseePlayerId: true
      }
    });
    return rows
      .map((row) => (row.requesterPlayerId === key ? row.addresseePlayerId : row.requesterPlayerId))
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }

  getPresence(playerId: string) {
    const key = String(playerId || "").trim();
    if (!key) return null;
    return this.presenceByPlayer.get(key) || null;
  }

  getSocketPlayerId(socket: Socket) {
    return String(this.socketToPlayer.get(socket.id) || "").trim();
  }

  async registerSocket(socket: Socket, claims: SocialRealtimeClaims) {
    const playerId = String(claims?.playerId || "").trim();
    if (!playerId) {
      throw new Error("Player id is required");
    }

    const displayName = String(claims?.displayName || "Player").trim() || "Player";
    const socketSet = this.socketsByPlayer.get(playerId) || new Set<Socket>();
    socketSet.add(socket);
    this.socketsByPlayer.set(playerId, socketSet);
    this.socketToPlayer.set(socket.id, playerId);

    const entry = this.upsertPresence(playerId, {
      displayName,
      status: "online",
      roomCode: this.presenceByPlayer.get(playerId)?.roomCode || null
    });

    socket.join(`player:${playerId}`);
    socket.data.socialPlayerId = playerId;
    socket.data.socialDisplayName = displayName;
    socket.data.socialSessionId = String(claims?.sessionId || "").trim();
    socket.data.socialPresenceStatus = entry.status;

    this.emitToPlayer(playerId, "social:ready", {
      playerId,
      status: entry.status,
      roomCode: entry.roomCode,
      lastSeenAt: entry.lastSeenAt
    });

    const friends = await this.getAcceptedFriendIds(playerId).catch(() => []);
    for (const friendId of friends) {
      const friendPresence = this.presenceByPlayer.get(friendId);
      if (!friendPresence) continue;
      this.emitToPlayer(playerId, "presence:update", {
        playerId: friendPresence.playerId,
        displayName: friendPresence.displayName,
        status: friendPresence.status,
        roomCode: friendPresence.roomCode,
        lastSeenAt: friendPresence.lastSeenAt
      });
    }
    for (const friendId of friends) {
      this.emitToPlayer(friendId, "presence:update", {
        playerId,
        displayName,
        status: entry.status,
        roomCode: entry.roomCode,
        lastSeenAt: entry.lastSeenAt
      });
    }

    return entry;
  }

  async unregisterSocket(socket: Socket) {
    const playerId = this.getSocketPlayerId(socket);
    this.socketToPlayer.delete(socket.id);
    if (!playerId) return;

    const socketSet = this.socketsByPlayer.get(playerId);
    if (socketSet) {
      socketSet.delete(socket);
      if (!socketSet.size) {
        this.socketsByPlayer.delete(playerId);
        const entry = this.upsertPresence(playerId, {
          status: "offline",
          lastSeenAt: new Date().toISOString(),
          socketCount: 0
        });
        await this.broadcastPresenceChange(entry, true);
      } else {
        const entry = this.presenceByPlayer.get(playerId);
        if (entry) {
          this.presenceByPlayer.set(playerId, {
            ...entry,
            socketCount: socketSet.size
          });
        }
      }
    }
  }

  private upsertPresence(
    playerId: string,
    next: Partial<SocialPresenceEntry> & { status: SocialPresenceStatus }
  ) {
    const key = String(playerId || "").trim();
    const current = this.presenceByPlayer.get(key) || {
      playerId: key,
      displayName: "Player",
      status: "online" as SocialPresenceStatus,
      roomCode: null,
      lastSeenAt: new Date().toISOString(),
      socketCount: 0
    };
    const entry: SocialPresenceEntry = {
      playerId: key,
      displayName: String(next.displayName || current.displayName || "Player").trim() || "Player",
      status: this.normalizeStatus(next.status ?? current.status),
      roomCode: next.roomCode === undefined ? current.roomCode : (String(next.roomCode || "").trim() || null),
      lastSeenAt: String(next.lastSeenAt || new Date().toISOString()),
      socketCount: Number.isFinite(Number(next.socketCount))
        ? Number(next.socketCount)
        : current.socketCount
    };
    this.presenceByPlayer.set(key, entry);
    return entry;
  }

  async setPresence(
    playerId: string,
    status: SocialPresenceStatus,
    payload: { displayName?: string; roomCode?: string | null; lastSeenAt?: string } = {}
  ) {
    const key = String(playerId || "").trim();
    if (!key) return null;
    const entry = this.upsertPresence(key, {
      displayName: payload.displayName,
      status,
      roomCode: payload.roomCode === undefined ? this.presenceByPlayer.get(key)?.roomCode || null : payload.roomCode,
      lastSeenAt: payload.lastSeenAt || new Date().toISOString(),
      socketCount: this.socketsByPlayer.get(key)?.size || 0
    });

    await this.broadcastPresenceChange(entry, false);
    return entry;
  }

  async updateRoomPresence(playerId: string, roomCode: string | null) {
    const key = String(playerId || "").trim();
    if (!key) return null;
    const current = this.presenceByPlayer.get(key);
    return this.setPresence(key, "in_game", {
      displayName: current?.displayName,
      roomCode: String(roomCode || "").trim() || null
    });
  }

  async markOnline(playerId: string) {
    const key = String(playerId || "").trim();
    if (!key) return null;
    const current = this.presenceByPlayer.get(key);
    return this.setPresence(key, "online", {
      displayName: current?.displayName,
      roomCode: null
    });
  }

  async markOffline(playerId: string) {
    const key = String(playerId || "").trim();
    if (!key) return null;
    const current = this.presenceByPlayer.get(key);
    return this.setPresence(key, "offline", {
      displayName: current?.displayName,
      roomCode: current?.roomCode || null
    });
  }

  private async broadcastPresenceChange(entry: SocialPresenceEntry, includeSelf = false) {
    const friends = await this.getAcceptedFriendIds(entry.playerId).catch(() => []);
    const payload = {
      playerId: entry.playerId,
      displayName: entry.displayName,
      status: entry.status,
      roomCode: entry.roomCode,
      lastSeenAt: entry.lastSeenAt
    };

    for (const friendId of friends) {
      this.emitToPlayer(friendId, "presence:update", payload);
    }
    if (includeSelf) {
      this.emitToPlayer(entry.playerId, "presence:update", payload);
    }
  }

  emitSocketEventToPlayer(playerId: string, event: string, payload: any) {
    this.emitToPlayer(playerId, event, payload);
  }
}
