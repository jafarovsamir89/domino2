import { ELO_STARTING_RATING, normalizeEloRating } from "./player-ranking.js";

export type PlayerModeStatsSnapshot = {
  rating: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  currentStreak: number;
  bestStreak: number;
};

export const RATING_GAME_MODES = ["telefon", "classic101"] as const;

export function normalizeRatingGameMode(value: unknown, fallback: (typeof RATING_GAME_MODES)[number] = "telefon") {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (normalized === "classic101") return "classic101";
  return "telefon";
}

export function createPlayerModeStatsSnapshot(seed: Partial<PlayerModeStatsSnapshot> = {}): PlayerModeStatsSnapshot {
  return {
    rating: normalizeEloRating(seed.rating ?? ELO_STARTING_RATING),
    points: Math.trunc(Number(seed.points ?? 0)),
    wins: Math.trunc(Number(seed.wins ?? 0)),
    losses: Math.trunc(Number(seed.losses ?? 0)),
    draws: Math.trunc(Number(seed.draws ?? 0)),
    matchesPlayed: Math.trunc(Number(seed.matchesPlayed ?? 0)),
    currentStreak: Math.trunc(Number(seed.currentStreak ?? 0)),
    bestStreak: Math.trunc(Number(seed.bestStreak ?? 0))
  };
}

export async function ensurePlayerModeStats(tx: any, playerId: string, gameMode: unknown, seed: Partial<PlayerModeStatsSnapshot> = {}) {
  const normalizedGameMode = normalizeRatingGameMode(gameMode);
  const snapshot = createPlayerModeStatsSnapshot(seed);
  return tx.playerModeStats.upsert({
    where: {
      playerId_gameMode: {
        playerId,
        gameMode: normalizedGameMode
      }
    },
    update: {},
    create: {
      playerId,
      gameMode: normalizedGameMode,
      ...snapshot
    }
  });
}

export async function syncTelefonPlayerStats(tx: any, playerId: string, seed: Partial<PlayerModeStatsSnapshot> = {}) {
  const snapshot = createPlayerModeStatsSnapshot(seed);
  return tx.playerStats.upsert({
    where: { playerId },
    update: snapshot,
    create: {
      playerId,
      ...snapshot
    }
  });
}
