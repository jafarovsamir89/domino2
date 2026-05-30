export type PlayerProgressStats = {
  rating?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  matchesPlayed?: number;
  currentStreak?: number;
  bestStreak?: number;
};

export const ELO_STARTING_RATING = 1000;
export const ELO_MIN_RATING = 300;
export const ELO_MAX_RATING = 5000;
export const ELO_STANDARD_K_FACTOR = 32;
export const ELO_PROVISIONAL_K_FACTOR = 40;
export const ELO_PROVISIONAL_MATCHES = 20;
export const ELO_FORFEIT_PENALTY = 5;

const TITLE_TIERS = [
  { code: "rookie", minRating: 0 },
  { code: "bronze", minRating: 1075 },
  { code: "silver", minRating: 1200 },
  { code: "gold", minRating: 1350 },
  { code: "platinum", minRating: 1500 },
  { code: "diamond", minRating: 1650 },
  { code: "master", minRating: 1800 },
  { code: "legend", minRating: 1950 }
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeEloRating(value: unknown, fallback = ELO_STARTING_RATING) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return clamp(Math.round(fallback), ELO_MIN_RATING, ELO_MAX_RATING);
  }
  return clamp(Math.round(parsed), ELO_MIN_RATING, ELO_MAX_RATING);
}

export function calculatePlayerRating(stats: PlayerProgressStats) {
  return normalizeEloRating(stats?.rating ?? ELO_STARTING_RATING);
}

export function calculateEloExpectedScore(playerRating: number, opponentRating: number) {
  const player = normalizeEloRating(playerRating);
  const opponent = normalizeEloRating(opponentRating);
  return 1 / (1 + 10 ** ((opponent - player) / 400));
}

export function calculateEloDelta({
  playerRating,
  opponentRating,
  actualScore,
  matchesPlayed = 0,
  penalty = 0
}: {
  playerRating: number;
  opponentRating: number;
  actualScore: number;
  matchesPlayed?: number;
  penalty?: number;
}) {
  const safeActualScore = Number.isFinite(Number(actualScore)) ? Number(actualScore) : 0;
  const safeMatchesPlayed = Math.max(0, toFiniteInt(matchesPlayed, 0));
  const kFactor = safeMatchesPlayed < ELO_PROVISIONAL_MATCHES ? ELO_PROVISIONAL_K_FACTOR : ELO_STANDARD_K_FACTOR;
  const expectedScore = calculateEloExpectedScore(playerRating, opponentRating);
  return Math.round(kFactor * (safeActualScore - expectedScore)) + Math.trunc(penalty);
}

export function calculateEloUpdate({
  playerRating,
  opponentRating,
  actualScore,
  matchesPlayed = 0,
  penalty = 0
}: {
  playerRating: number;
  opponentRating: number;
  actualScore: number;
  matchesPlayed?: number;
  penalty?: number;
}) {
  const delta = calculateEloDelta({
    playerRating,
    opponentRating,
    actualScore,
    matchesPlayed,
    penalty
  });
  return normalizeEloRating(playerRating + delta);
}

export function getPlayerRatingTitleCode(rating: number) {
  const safeRating = Number.isFinite(rating) ? rating : 1000;
  let current = TITLE_TIERS[0];
  for (const tier of TITLE_TIERS) {
    if (safeRating >= tier.minRating) {
      current = tier;
    }
  }
  return current.code;
}
