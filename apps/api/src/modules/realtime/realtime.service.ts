import { Injectable } from "@nestjs/common";
import RedisImport from "ioredis";
import {
  isStalePresenceEntry,
  normalizePresenceEntry,
  type RealtimePresenceEntry
} from "./realtime.helpers.js";

const Redis = RedisImport as any;

function getStore() {
  const globalRef = globalThis as typeof globalThis & {
    __DOMINO_PLATFORM_REALTIME?: Map<string, RealtimePresenceEntry>;
  };

  if (!globalRef.__DOMINO_PLATFORM_REALTIME) {
    globalRef.__DOMINO_PLATFORM_REALTIME = new Map();
  }

  return globalRef.__DOMINO_PLATFORM_REALTIME;
}

const PRESENCE_TTL_SECONDS = 180;
const redisUrl = process.env.REDIS_URI || "";
const redis = redisUrl
  ? new Redis(redisUrl, {
      enableReadyCheck: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy(times: number) {
        return Math.min(times * 200, 1000);
      }
    })
  : null;

if (redis) {
  redis.on("error", (err: Error) => {
    console.warn("[Redis] Platform realtime presence unavailable:", err.message);
  });
}

function getSessionKey(sessionId: string) {
  return `domino:presence:session:${sessionId}`;
}

function getRoomIndexKey(roomId: string) {
  return `domino:presence:room:${roomId}`;
}

async function getRedisClient() {
  if (!redis) return null;
  try {
    if (redis.status !== "ready") {
      await redis.connect();
    }
    return redis;
  } catch (err) {
    console.warn("[Redis] Platform realtime connect failed:", (err as Error).message);
    return null;
  }
}

async function persistEntry(entry: RealtimePresenceEntry) {
  const client = await getRedisClient();
  if (!client) return;

  const previousRaw = await client.get(getSessionKey(entry.sessionId)).catch(() => null);
  const previous = previousRaw ? JSON.parse(previousRaw) as Partial<RealtimePresenceEntry> : null;
  const nextRoomId = String(entry.roomId || "").trim();
  const previousRoomId = String(previous?.roomId || "").trim();
  const pipeline = client.pipeline();

  pipeline.setex(getSessionKey(entry.sessionId), PRESENCE_TTL_SECONDS, JSON.stringify(entry));
  if (nextRoomId) {
    pipeline.sadd(getRoomIndexKey(nextRoomId), entry.sessionId);
    pipeline.expire(getRoomIndexKey(nextRoomId), PRESENCE_TTL_SECONDS);
  }
  if (previousRoomId && previousRoomId !== nextRoomId) {
    pipeline.srem(getRoomIndexKey(previousRoomId), entry.sessionId);
  }

  await pipeline.exec().catch((err: unknown) => {
    console.warn("[Redis] Platform realtime write failed:", (err as Error).message);
  });
}

async function removeEntry(sessionId: string) {
  const client = await getRedisClient();
  if (!client) return;

  const raw = await client.get(getSessionKey(sessionId)).catch(() => null);
  const entry = raw ? JSON.parse(raw) as Partial<RealtimePresenceEntry> : null;
  const pipeline = client.pipeline();
  pipeline.del(getSessionKey(sessionId));
  if (entry?.roomId) {
    pipeline.srem(getRoomIndexKey(String(entry.roomId)), sessionId);
  }
  await pipeline.exec().catch((err: unknown) => {
    console.warn("[Redis] Platform realtime delete failed:", (err as Error).message);
  });
}

async function readRedisPlayers() {
  const client = await getRedisClient();
  if (!client) return [];

  const players: RealtimePresenceEntry[] = [];
  let cursor = "0";
  do {
    const [nextCursor, keys] = await client.scan(cursor, "MATCH", "domino:presence:session:*", "COUNT", "200");
    cursor = nextCursor;
    for (const key of keys) {
      const raw = await client.get(key).catch(() => null);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as RealtimePresenceEntry;
        if (isStalePresenceEntry(parsed)) {
          void removeEntry(parsed.sessionId);
          continue;
        }
        players.push(parsed);
      } catch (err) {
        console.warn("[Redis] Skipping malformed platform presence entry:", (err as Error).message);
      }
    }
  } while (cursor !== "0");

  return players;
}

async function readRedisSession(sessionId: string) {
  const client = await getRedisClient();
  if (!client) return null;

  const key = getSessionKey(sessionId);
  const raw = await client.get(key).catch(() => null);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as RealtimePresenceEntry;
    if (isStalePresenceEntry(parsed)) {
      void removeEntry(sessionId);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn("[Redis] Skipping malformed platform presence session:", (err as Error).message);
    return null;
  }
}

function pruneStore() {
  const store = getStore();
  for (const [sessionId, entry] of store.entries()) {
    if (!isStalePresenceEntry(entry)) continue;
    store.delete(sessionId);
    void removeEntry(sessionId);
  }
}

@Injectable()
export class RealtimeService {
  async getSession(sessionId: string) {
    const key = String(sessionId || "").trim();
    if (!key) return null;

    const store = getStore();
    const current = store.get(key) || null;
    if (current && !isStalePresenceEntry(current)) {
      return current;
    }
    if (current && isStalePresenceEntry(current)) {
      store.delete(key);
      void removeEntry(key);
    }

    const redisEntry = await readRedisSession(key);
    if (!redisEntry) {
      store.delete(key);
      return null;
    }

    if (isStalePresenceEntry(redisEntry)) {
      store.delete(key);
      return null;
    }

    store.set(key, redisEntry);
    return redisEntry;
  }

  async heartbeat(payload: Partial<RealtimePresenceEntry>) {
    const sessionId = String(payload.sessionId || "").trim().slice(0, 128);
    if (!sessionId || !/^[a-zA-Z0-9:_-]{4,128}$/.test(sessionId)) {
      return null;
    }

    const store = getStore();
    const current = store.get(sessionId) || ({} as RealtimePresenceEntry);
    const next = normalizePresenceEntry(sessionId, current, payload);

    store.set(sessionId, next);
    void persistEntry(next);
    return next;
  }

  clear(sessionId: string) {
    const key = String(sessionId || "").trim();
    if (!key) return;
    getStore().delete(key);
    void removeEntry(key);
  }

  async list() {
    pruneStore();
    const store = getStore();
    for (const [sessionId, entry] of store.entries()) {
      if (isStalePresenceEntry(entry)) {
        store.delete(sessionId);
      }
    }
    const merged = new Map<string, RealtimePresenceEntry>(store);
    const redisPlayers = await readRedisPlayers();
    for (const entry of redisPlayers) {
      merged.set(entry.sessionId, entry);
    }
    return Array.from(merged.values());
  }

  async summary() {
    pruneStore();
    const players = await this.list();
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
