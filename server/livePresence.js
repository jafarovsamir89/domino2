function getStore() {
  if (!global.__DOMINO_LIVE_PRESENCE) {
    global.__DOMINO_LIVE_PRESENCE = new Map();
  }

  return global.__DOMINO_LIVE_PRESENCE;
}

function upsertLivePlayer(sessionId, payload) {
  if (!sessionId) return null;

  const store = getStore();
  const current = store.get(sessionId) || {};
  const next = {
    sessionId,
    updatedAt: new Date().toISOString(),
    ...current,
    ...payload
  };

  store.set(sessionId, next);
  return next;
}

function removeLivePlayer(sessionId) {
  if (!sessionId) return;
  getStore().delete(sessionId);
}

function setRoomGameActive(roomId, isPlaying) {
  if (!roomId) return;

  const store = getStore();
  for (const [sessionId, entry] of store.entries()) {
    if (entry.roomId === roomId) {
      store.set(sessionId, {
        ...entry,
        isPlaying: Boolean(isPlaying),
        updatedAt: new Date().toISOString()
      });
    }
  }
}

function removeRoomPlayers(roomId) {
  if (!roomId) return;

  const store = getStore();
  for (const [sessionId, entry] of store.entries()) {
    if (entry.roomId === roomId) {
      store.delete(sessionId);
    }
  }
}

function listLivePlayers() {
  return Array.from(getStore().values());
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

function getLiveSummary() {
  const players = listLivePlayers();
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
      stakeKey: player.stakeKey || null,
      stakeAmount: Number(player.stakeAmount || 0),
      humanSeats: Number.isFinite(Number(player.humanSeats)) ? Number(player.humanSeats) : 0,
      totalPlayers: Number.isFinite(Number(player.totalPlayers)) ? Number(player.totalPlayers) : 0,
      gameActive: Boolean(player.isPlaying),
      totalPlayers: 0,
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

function getOpenRooms(filters = {}) {
  const summary = getLiveSummary();
  const search = String(filters.search || filters.q || "").trim().toLowerCase();
  const stakeKey = String(filters.stakeKey || "").trim();
  const roomMode = String(filters.roomMode || filters.mode || "").trim().toLowerCase();
  const joinableOnly = filters.joinableOnly === undefined
    ? true
    : String(filters.joinableOnly) !== "false" && String(filters.joinableOnly) !== "0";
  const minPlayers = Math.max(0, Number(filters.minPlayers || 0));
  const maxPlayers = Math.max(0, Number(filters.maxPlayers || 0));
  const limit = Math.max(1, Number(filters.limit || 24));

  const items = summary.rooms.filter((room) => {
    if (joinableOnly && !room.joinable) return false;
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
