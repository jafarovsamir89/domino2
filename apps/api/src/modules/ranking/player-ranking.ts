export type PlayerProgressStats = {
  wins?: number;
  losses?: number;
  draws?: number;
  matchesPlayed?: number;
  currentStreak?: number;
  bestStreak?: number;
};

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

export function calculatePlayerRating(stats: PlayerProgressStats) {
  const matchesPlayed = Math.max(0, toFiniteInt(stats.matchesPlayed, 0));
  if (matchesPlayed <= 0) {
    return 1000;
  }

  const wins = Math.max(0, toFiniteInt(stats.wins, 0));
  const losses = Math.max(0, toFiniteInt(stats.losses, 0));
  const draws = Math.max(0, toFiniteInt(stats.draws, 0));
  const currentStreak = Math.max(0, toFiniteInt(stats.currentStreak, 0));
  const bestStreak = Math.max(0, toFiniteInt(stats.bestStreak, 0));

  const confidence = matchesPlayed / (matchesPlayed + 12);
  const winRate = (wins + draws * 0.5) / matchesPlayed;
  const balance = (wins - losses) / matchesPlayed;
  const volumeBonus = Math.log10(matchesPlayed + 1) * 70;
  const streakBonus = Math.min(100, currentStreak * 10 + bestStreak * 2);

  const raw = 1000
    + confidence * ((winRate - 0.5) * 850 + balance * 300)
    + volumeBonus
    + streakBonus;

  return clamp(Math.round(raw), 300, 5000);
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
