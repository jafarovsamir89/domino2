import { Injectable } from "@nestjs/common";

type RealtimePresenceEntry = {
  sessionId: string;
  provider: string;
  displayName: string;
  roomId: string | null;
  roomCode: string | null;
  gameMode: string;
  isPlaying: boolean;
  isConnected: boolean;
  source: string;
  updatedAt: string;
};

function getStore() {
  const globalRef = globalThis as typeof globalThis & {
    __DOMINO_PLATFORM_REALTIME?: Map<string, RealtimePresenceEntry>;
  };

  if (!globalRef.__DOMINO_PLATFORM_REALTIME) {
    globalRef.__DOMINO_PLATFORM_REALTIME = new Map();
  }

  return globalRef.__DOMINO_PLATFORM_REALTIME;
}

function isStale(entry: RealtimePresenceEntry) {
  const updatedAt = Date.parse(entry.updatedAt);
  if (!Number.isFinite(updatedAt)) return true;
  return Date.now() - updatedAt > 90_000;
}

@Injectable()
export class RealtimeService {
  heartbeat(payload: Partial<RealtimePresenceEntry>) {
    const sessionId = String(payload.sessionId || "").trim();
    if (!sessionId) {
      return null;
    }

    const store = getStore();
    const current = store.get(sessionId) || ({} as RealtimePresenceEntry);
    const next: RealtimePresenceEntry = {
      sessionId,
      provider: String(payload.provider || current.provider || "guest"),
      displayName: String(payload.displayName || current.displayName || "Player").slice(0, 32),
      roomId: payload.roomId === undefined ? current.roomId || null : payload.roomId,
      roomCode: payload.roomCode === undefined ? current.roomCode || null : payload.roomCode,
      gameMode: String(payload.gameMode || current.gameMode || "solo"),
      isPlaying: payload.isPlaying === undefined ? current.isPlaying ?? false : Boolean(payload.isPlaying),
      isConnected: payload.isConnected === undefined ? current.isConnected ?? false : Boolean(payload.isConnected),
      source: String(payload.source || current.source || "client-local"),
      updatedAt: new Date().toISOString()
    };

    store.set(sessionId, next);
    return next;
  }

  clear(sessionId: string) {
    const key = String(sessionId || "").trim();
    if (!key) return;
    getStore().delete(key);
  }

  list() {
    const store = getStore();
    for (const [sessionId, entry] of store.entries()) {
      if (isStale(entry)) {
        store.delete(sessionId);
      }
    }
    return Array.from(store.values());
  }

  summary() {
    const players = this.list();
    const connectedPlayers = players.filter((player) => player.isConnected !== false);
    const authenticatedConnectedPlayers = connectedPlayers.filter((player) => player.provider === "platform");
    const guestConnectedPlayers = connectedPlayers.filter((player) => player.provider !== "platform");
    const playingPlayers = connectedPlayers.filter((player) => player.isPlaying === true);

    const roomsMap = new Map<string, {
      roomId: string;
      roomCode: string | null;
      gameActive: boolean;
      totalPlayers: number;
      connectedPlayers: number;
      authenticatedPlayers: number;
      players: Array<{
        sessionId: string;
        displayName: string;
        provider: string;
        isConnected: boolean;
        isPlaying: boolean;
        roomCode: string | null;
        role: string;
        joinedAt: string | null;
      }>;
    }>();

    for (const player of players) {
      const roomId = String(player.roomId || "").trim();
      if (!roomId) continue;

      const current = roomsMap.get(roomId) || {
        roomId,
        roomCode: player.roomCode || null,
        gameActive: Boolean(player.isPlaying),
        totalPlayers: 0,
        connectedPlayers: 0,
        authenticatedPlayers: 0,
        players: []
      };

      current.totalPlayers += 1;
      current.connectedPlayers += player.isConnected === false ? 0 : 1;
      current.authenticatedPlayers += player.provider === "platform" && player.isConnected !== false ? 1 : 0;
      current.gameActive = current.gameActive || Boolean(player.isPlaying);
      current.roomCode = current.roomCode || player.roomCode || null;
      current.players.push({
        sessionId: player.sessionId,
        displayName: player.displayName || "Player",
        provider: player.provider || "guest",
        isConnected: player.isConnected !== false,
        isPlaying: Boolean(player.isPlaying),
        roomCode: player.roomCode || null,
        role: "player",
        joinedAt: player.updatedAt || null
      });

      roomsMap.set(roomId, current);
    }

    const rooms = Array.from(roomsMap.values()).sort((a, b) => b.connectedPlayers - a.connectedPlayers);

    return {
      counts: {
        total: players.length,
        connected: connectedPlayers.length,
        authenticatedConnected: authenticatedConnectedPlayers.length,
        guestConnected: guestConnectedPlayers.length,
        authenticatedPlaying: playingPlayers.length,
        rooms: rooms.length
      },
      players: connectedPlayers
        .sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || "")))
        .map((player) => ({
          sessionId: player.sessionId,
          userId: "",
          playerId: "",
          displayName: player.displayName || "Player",
          provider: player.provider || "guest",
          isConnected: player.isConnected !== false,
          isPlaying: Boolean(player.isPlaying),
          roomId: player.roomId || null,
          roomCode: player.roomCode || null,
          role: "player",
          joinedAt: player.updatedAt || null,
          updatedAt: player.updatedAt || null,
          source: player.source || "client-local"
        })),
      rooms
    };
  }
}
