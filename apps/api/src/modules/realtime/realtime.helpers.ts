export type RealtimePresenceEntry = {
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

export function isStalePresenceEntry(entry: Pick<RealtimePresenceEntry, "updatedAt">, now = Date.now()) {
  const updatedAt = Date.parse(String(entry.updatedAt || ""));
  if (!Number.isFinite(updatedAt)) return true;
  return now - updatedAt > 90_000;
}

export function normalizePresenceEntry(
  sessionId: string,
  current: Partial<RealtimePresenceEntry>,
  payload: Partial<RealtimePresenceEntry>,
  now = Date.now()
): RealtimePresenceEntry {
  const provider = String(payload.provider || current.provider || "guest").trim().toLowerCase();
  const gameMode = String(payload.gameMode || current.gameMode || "solo").trim().toLowerCase();
  const source = String(payload.source || current.source || "client-local").trim().slice(0, 32) || "client-local";
  const roomCode = payload.roomCode === undefined ? current.roomCode || null : String(payload.roomCode || "").trim().toUpperCase().slice(0, 16) || null;
  const roomId = payload.roomId === undefined ? current.roomId || null : String(payload.roomId || "").trim().slice(0, 128) || null;

  return {
    sessionId,
    provider: provider === "platform" ? "platform" : "guest",
    displayName: String(payload.displayName || current.displayName || "Player").trim().slice(0, 32) || "Player",
    roomId,
    roomCode,
    gameMode: gameMode === "team" ? "team" : "solo",
    isPlaying: payload.isPlaying === undefined ? current.isPlaying ?? false : Boolean(payload.isPlaying),
    isConnected: payload.isConnected === undefined ? current.isConnected ?? false : Boolean(payload.isConnected),
    source,
    updatedAt: new Date(now).toISOString()
  };
}
