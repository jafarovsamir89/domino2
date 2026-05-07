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

  const rooms = Array.from(roomsMap.values()).sort((a, b) => b.connectedPlayers - a.connectedPlayers);

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

module.exports = {
  upsertLivePlayer,
  removeLivePlayer,
  setRoomGameActive,
  removeRoomPlayers,
  listLivePlayers,
  getLiveSummary
};
