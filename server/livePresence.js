const Redis = require("ioredis");

const PRESENCE_TTL_SECONDS = 180;
const redisUrl = process.env.REDIS_URI || "";
const redis = redisUrl
  ? new Redis(redisUrl, {
      enableReadyCheck: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        return Math.min(times * 200, 1000);
      }
    })
  : null;

if (redis) {
  redis.on("error", (err) => {
    console.warn("[Redis] Live presence unavailable:", err.message);
  });
}

function getStore() {
  const globalRef = globalThis;
  if (!globalRef.__DOMINO_LIVE_PRESENCE) {
    globalRef.__DOMINO_LIVE_PRESENCE = new Map();
  }
  return globalRef.__DOMINO_LIVE_PRESENCE;
}

function getSessionKey(sessionId) {
  return `domino:presence:session:${sessionId}`;
}

function getRoomIndexKey(roomId) {
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
    console.warn("[Redis] Live presence connect failed:", err.message);
    return null;
  }
}

function normalizeEntry(sessionId, current, payload) {
  return {
    sessionId,
    updatedAt: new Date().toISOString(),
    ...current,
    ...payload
  };
}

async function persistEntry(entry) {
  const client = await getRedisClient();
  if (!client) return;

  const previousRaw = await client.get(getSessionKey(entry.sessionId)).catch(() => null);
  const previous = previousRaw ? JSON.parse(previousRaw) : null;
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

  await pipeline.exec().catch((err) => {
    console.warn("[Redis] Live presence write failed:", err.message);
  });
}

async function removeEntry(sessionId) {
  const client = await getRedisClient();
  if (!client) return;

  const raw = await client.get(getSessionKey(sessionId)).catch(() => null);
  const entry = raw ? JSON.parse(raw) : null;
  const pipeline = client.pipeline();
  pipeline.del(getSessionKey(sessionId));
  if (entry?.roomId) {
    pipeline.srem(getRoomIndexKey(entry.roomId), sessionId);
  }
  await pipeline.exec().catch((err) => {
    console.warn("[Redis] Live presence delete failed:", err.message);
  });
}

async function updateRoomEntries(roomId, updater) {
  const client = await getRedisClient();
  if (!client) return;

  const indexKey = getRoomIndexKey(roomId);
  const sessionIds = await client.smembers(indexKey).catch(() => []);
  if (!sessionIds.length) return;

  const pipeline = client.pipeline();
  let touched = 0;
  for (const sessionId of sessionIds) {
    const raw = await client.get(getSessionKey(sessionId)).catch(() => null);
    if (!raw) {
      pipeline.srem(indexKey, sessionId);
      continue;
    }
    const current = JSON.parse(raw);
    const next = updater(current);
    if (!next) continue;
    touched += 1;
    pipeline.setex(getSessionKey(sessionId), PRESENCE_TTL_SECONDS, JSON.stringify(next));
  }

  if (touched > 0) {
    pipeline.expire(indexKey, PRESENCE_TTL_SECONDS);
  }

  await pipeline.exec().catch((err) => {
    console.warn("[Redis] Live presence room update failed:", err.message);
  });
}

async function readRedisPlayers() {
  const client = await getRedisClient();
  if (!client) return [];

  const players = [];
  let cursor = "0";
  do {
    const [nextCursor, keys] = await client.scan(
      cursor,
      "MATCH",
      "domino:presence:session:*",
      "COUNT",
      "200"
    );
    cursor = nextCursor;
    for (const key of keys) {
      const raw = await client.get(key).catch(() => null);
      if (!raw) continue;
      try {
        players.push(JSON.parse(raw));
      } catch (err) {
        console.warn("[Redis] Skipping malformed live presence entry:", err.message);
      }
    }
  } while (cursor !== "0");

  return players;
}

function upsertLivePlayer(sessionId, payload) {
  if (!sessionId) return null;

  const store = getStore();
  const current = store.get(sessionId) || {};
  const next = normalizeEntry(sessionId, current, payload);
  store.set(sessionId, next);
  void persistEntry(next);
  return next;
}

function removeLivePlayer(sessionId) {
  if (!sessionId) return;
  getStore().delete(sessionId);
  void removeEntry(sessionId);
}

function setRoomGameActive(roomId, isPlaying) {
  if (!roomId) return;

  const store = getStore();
  for (const [sessionId, entry] of store.entries()) {
    if (String(entry.roomId || "") !== String(roomId)) continue;
    const next = {
      ...entry,
      isPlaying: Boolean(isPlaying),
      updatedAt: new Date().toISOString()
    };
    store.set(sessionId, next);
    void persistEntry(next);
  }
  void updateRoomEntries(roomId, (entry) => ({
    ...entry,
    isPlaying: Boolean(isPlaying),
    updatedAt: new Date().toISOString()
  }));
}

function removeRoomPlayers(roomId) {
  if (!roomId) return;

  const store = getStore();
  for (const [sessionId, entry] of store.entries()) {
    if (String(entry.roomId || "") !== String(roomId)) continue;
    store.delete(sessionId);
    void removeEntry(sessionId);
  }
}

async function listLivePlayers() {
  const merged = new Map();
  for (const [sessionId, entry] of getStore().entries()) {
    merged.set(sessionId, entry);
  }

  const redisPlayers = await readRedisPlayers();
  for (const entry of redisPlayers) {
    if (!entry?.sessionId) continue;
    merged.set(entry.sessionId, entry);
  }

  return Array.from(merged.values());
}

function getRoomSnapshot(roomId, players) {
  const roomPlayers = players.filter((player) => player.roomId === roomId);
  if (!roomPlayers.length) return null;

  const first = roomPlayers[0];
  const humanSeats = Number.isFinite(Number(first.humanSeats)) ? Number(first.humanSeats) : Number(first.totalPlayers ?? 0) || roomPlayers.length;
  const totalPlayers = Number.isFinite(Number(first.totalPlayers)) ? Number(first.totalPlayers) : roomPlayers.length;
  const connectedPlayers = roomPlayers.filter((player) => player.isConnected !== false).length;
  const authenticatedPlayers = roomPlayers.filter((player) => player.provider === "platform" && player.isConnected !== false).length;
  const openSeats = Math.max(0, humanSeats - connectedPlayers);
  const gameActive = roomPlayers.some((player) => player.isPlaying === true);

  return {
    roomId,
    roomCode: first.roomCode || null,
    roomMode: first.roomMode || (first.isTeamMode ? "team" : "ffa"),
    roomVisibility: first.roomVisibility || "closed",
    stakeKey: first.stakeKey || null,
    stakeAmount: Number(first.stakeAmount || 0),
    humanSeats,
    totalPlayers,
    connectedPlayers,
    authenticatedPlayers,
    aiCount: Number(first.aiCount || Math.max(0, totalPlayers - humanSeats)),
    isTeamMode: Boolean(first.isTeamMode),
    gameActive,
    openSeats,
    joinable: !gameActive && openSeats > 0,
    hostName: first.hostName || roomPlayers.find((player) => player.role === "host")?.displayName || first.displayName || "Player",
    players: roomPlayers
      .slice()
      .sort((a, b) => String(a.joinedAt || a.updatedAt || "").localeCompare(String(b.joinedAt || b.updatedAt || "")))
      .map((player) => ({
        sessionId: player.sessionId,
        userId: player.userId || "",
        playerId: player.playerId || "",
        displayName: player.displayName || "Player",
        provider: player.provider || "guest",
        isConnected: player.isConnected !== false,
        isPlaying: Boolean(player.isPlaying),
        roomCode: player.roomCode || null,
        role: player.role || "player",
        joinedAt: player.joinedAt || null
      }))
  };
}

async function getLiveSummary() {
  const players = await listLivePlayers();
  const connectedPlayers = players.filter((player) => player.isConnected !== false);
  const connectedAuthenticatedPlayers = connectedPlayers.filter((player) => player.provider === "platform");
  const connectedGuestPlayers = connectedPlayers.filter((player) => player.provider !== "platform");
  const playingPlayers = connectedPlayers.filter((player) => player.isPlaying === true);

  const roomsMap = new Map();
  for (const player of players) {
    if (!player.roomId) continue;
    const current = roomsMap.get(player.roomId) || {
      roomId: player.roomId,
      roomCode: player.roomCode || null,
      roomMode: player.roomMode || (player.isTeamMode ? "team" : "ffa"),
      roomVisibility: player.roomVisibility || "closed",
      stakeKey: player.stakeKey || null,
      stakeAmount: Number(player.stakeAmount || 0),
      humanSeats: Number.isFinite(Number(player.humanSeats)) ? Number(player.humanSeats) : 0,
      totalPlayers: Number.isFinite(Number(player.totalPlayers)) ? Number(player.totalPlayers) : 0,
      gameActive: Boolean(player.isPlaying),
      connectedPlayers: 0,
      authenticatedPlayers: 0,
      openSeats: 0,
      joinable: false,
      isTeamMode: Boolean(player.isTeamMode),
      aiCount: Number(player.aiCount || 0),
      hostName: player.hostName || player.displayName || "Player",
      players: []
    };

    current.totalPlayers += 1;
    current.connectedPlayers += player.isConnected === false ? 0 : 1;
    current.authenticatedPlayers += player.provider === "platform" && player.isConnected !== false ? 1 : 0;
    current.gameActive = current.gameActive || Boolean(player.isPlaying);
    current.roomCode = current.roomCode || player.roomCode || null;
    current.roomMode = current.roomMode || player.roomMode || (player.isTeamMode ? "team" : "ffa");
    current.roomVisibility = current.roomVisibility || player.roomVisibility || "closed";
    current.stakeKey = current.stakeKey || player.stakeKey || null;
    current.stakeAmount = current.stakeAmount || Number(player.stakeAmount || 0);
    current.humanSeats = current.humanSeats || Number(player.humanSeats || 0);
    current.isTeamMode = current.isTeamMode || Boolean(player.isTeamMode);
    current.aiCount = current.aiCount || Number(player.aiCount || 0);
    current.hostName = current.hostName || player.hostName || player.displayName || "Player";
    current.players.push({
      sessionId: player.sessionId,
      userId: player.userId || "",
      playerId: player.playerId || "",
      displayName: player.displayName || "Player",
      provider: player.provider || "guest",
      isConnected: player.isConnected !== false,
      isPlaying: Boolean(player.isPlaying),
      roomCode: player.roomCode || null,
      role: player.role || "player",
      joinedAt: player.joinedAt || null
    });

    roomsMap.set(player.roomId, current);
  }

  const rooms = Array.from(roomsMap.values())
    .map((room) => ({
      ...room,
      openSeats: Math.max(0, Number(room.humanSeats || room.totalPlayers || 0) - room.connectedPlayers),
      joinable: !room.gameActive && Math.max(0, Number(room.humanSeats || room.totalPlayers || 0) - room.connectedPlayers) > 0,
      roomVisibility: room.roomVisibility || "closed",
      hostName: room.hostName || room.players[0]?.displayName || "Player"
    }))
    .sort((a, b) => b.connectedPlayers - a.connectedPlayers);

  return {
    counts: {
      total: players.length,
      connected: connectedPlayers.length,
      authenticatedConnected: connectedAuthenticatedPlayers.length,
      guestConnected: connectedGuestPlayers.length,
      authenticatedPlaying: playingPlayers.length,
      rooms: rooms.length
    },
    players: connectedPlayers
      .sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || "")))
      .map((player) => ({
        sessionId: player.sessionId,
        userId: player.userId || "",
        playerId: player.playerId || "",
        displayName: player.displayName || "Player",
        provider: player.provider || "guest",
        isConnected: player.isConnected !== false,
        isPlaying: Boolean(player.isPlaying),
        roomId: player.roomId || null,
        roomCode: player.roomCode || null,
        role: player.role || "player",
        joinedAt: player.joinedAt || null,
        updatedAt: player.updatedAt || null
      })),
    rooms
  };
}

async function getOpenRooms(filters = {}) {
  const summary = await getLiveSummary();
  const search = String(filters.search || filters.q || "").trim().toLowerCase();
  const stakeKey = String(filters.stakeKey || "").trim();
  const roomMode = String(filters.roomMode || filters.mode || "").trim().toLowerCase();
  const joinableOnly = filters.joinableOnly === undefined
    ? true
    : String(filters.joinableOnly) !== "false" && String(filters.joinableOnly) !== "0";
  const visibility = String(filters.visibility || filters.roomVisibility || (joinableOnly ? "open" : "all"))
    .trim()
    .toLowerCase();
  const minPlayers = Math.max(0, Number(filters.minPlayers || 0));
  const maxPlayers = Math.max(0, Number(filters.maxPlayers || 0));
  const limit = Math.max(1, Number(filters.limit || 24));

  const items = summary.rooms.filter((room) => {
    if (joinableOnly && !room.joinable) return false;
    if (visibility !== "all" && String(room.roomVisibility || "closed").toLowerCase() !== visibility) return false;
    if (stakeKey && stakeKey !== "all" && String(room.stakeKey || "") !== stakeKey) return false;
    if (roomMode && roomMode !== "all" && String(room.roomMode || "").toLowerCase() !== roomMode) return false;
    if (minPlayers && room.connectedPlayers < minPlayers) return false;
    if (maxPlayers && room.connectedPlayers > maxPlayers) return false;
    if (search) {
      const haystack = [
        room.roomCode,
        room.roomId,
        room.hostName,
        room.stakeKey,
        room.roomMode,
        ...(room.players || []).map((player) => player.displayName)
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  }).slice(0, limit);

  return {
    items,
    counts: summary.counts
  };
}

module.exports = {
  upsertLivePlayer,
  removeLivePlayer,
  setRoomGameActive,
  removeRoomPlayers,
  listLivePlayers,
  getLiveSummary,
  getOpenRooms,
  getRoomSnapshot
};
