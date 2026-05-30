import { Injectable } from "@nestjs/common";

import { EconomyService } from "../economy/economy.service.js";
import { grantStarterCoins } from "../economy/economy-starter.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { verifyGameToken } from "../auth/game-token.js";
import {
  calculateEloUpdate,
  ELO_FORFEIT_PENALTY,
  normalizeEloRating
} from "../ranking/player-ranking.js";
import { signDominoPayload, verifyDominoPayload } from "../security/domino-proof.js";

type MatchParticipantPayload = {
  userId?: string;
  name?: string;
  teamIndex?: number | null;
  winnerKey?: string | null;
  points?: number | string | null;
  roundWins?: number | string | null;
  result?: string | null;
  isBot?: boolean;
};

type MatchPayload = {
  mode?: string;
  isTeamMode?: boolean;
  roomId?: string | null;
  sourceMatchId?: string | null;
  winnerKey?: string | null;
  result?: string | null;
  stakeKey?: string | null;
  participants?: MatchParticipantPayload[];
  teams?: Array<{ memberIds?: string[] }>;
  totalPoints?: number | null;
  integrityScope?: string | null;
  proof?: string | null;
  matchOutcome?: string | null;
  forfeitUserIds?: string[];
  forfeitPlayerIds?: string[];
};

type PlayerSnapshot = {
  playerId: string;
  userId: string;
  displayName: string;
  rating: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  currentStreak: number;
  bestStreak: number;
};

type ResolvedParticipant = {
  participant: MatchParticipantPayload;
  player: PlayerSnapshot;
  statsExists: boolean;
  sideKey: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
};

function toInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function stripProof<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload } as Record<string, unknown> & { proof?: unknown };
  const proof = String(next.proof || "").trim();
  delete next.proof;
  return { proof, payload: next as Record<string, unknown> };
}

function getParticipantSideKey(participant: MatchParticipantPayload, isTeamMode: boolean) {
  if (isTeamMode) {
    const teamIndex = Number(participant.teamIndex);
    return Number.isInteger(teamIndex) && teamIndex >= 0 ? `team:${teamIndex}` : "";
  }

  const result = normalizeText(participant.result).toLowerCase();
  if (result === "win" || result === "loss") {
    return result;
  }

  const winnerKey = normalizeText(participant.winnerKey).toLowerCase();
  if (winnerKey.startsWith("player:")) {
    return result === "win" ? "win" : "loss";
  }

  return "";
}

function averageRating(participants: ResolvedParticipant[]) {
  if (!participants.length) return 0;
  const total = participants.reduce((sum, entry) => sum + normalizeEloRating(entry.player.rating), 0);
  return Math.round(total / participants.length);
}

function buildRankedMatchContext({
  payload,
  participants
}: {
  payload: MatchPayload;
  participants: ResolvedParticipant[];
}) {
  const isTeamMode = payload.isTeamMode === true;
  const result = normalizeText(payload.result).toLowerCase();
  const matchOutcome = normalizeText(payload.matchOutcome).toLowerCase();
  const isForfeit = matchOutcome === "forfeit";
  const forfeitUserIds = new Set(
    Array.isArray(payload.forfeitUserIds)
      ? payload.forfeitUserIds.map((value) => normalizeText(value)).filter(Boolean)
      : []
  );

  if (result === "draw" || result === "refund") {
    return {
      ranked: false,
      reason: "no_rank_result",
      isTeamMode,
      isForfeit,
      forfeitUserIds
    };
  }

  const humanParticipants = participants.filter(({ participant }) => Boolean(normalizeText(participant.userId)));
  if (humanParticipants.length < 2) {
    return {
      ranked: false,
      reason: "not_enough_humans",
      isTeamMode,
      isForfeit,
      forfeitUserIds
    };
  }

  const sides = new Map<string, ResolvedParticipant[]>();
  for (const entry of humanParticipants) {
    const sideKey = getParticipantSideKey(entry.participant, isTeamMode);
    if (!sideKey) {
      return {
        ranked: false,
        reason: "invalid_participant_side",
        isTeamMode,
        isForfeit,
        forfeitUserIds
      };
    }

    const list = sides.get(sideKey) || [];
    list.push(entry);
    sides.set(sideKey, list);
  }

  if (isTeamMode) {
    const team0 = sides.get("team:0") || [];
    const team1 = sides.get("team:1") || [];
    if (!team0.length || !team1.length) {
      return {
        ranked: false,
        reason: "not_enough_opposing_humans",
        isTeamMode,
        isForfeit,
        forfeitUserIds
      };
    }

    const winnerKey = normalizeText(payload.winnerKey);
    if (!winnerKey.startsWith("team:")) {
      return {
        ranked: false,
        reason: "missing_winner_side",
        isTeamMode,
        isForfeit,
        forfeitUserIds
      };
    }
  } else {
    const winners = sides.get("win") || [];
    const losers = sides.get("loss") || [];
    if (!winners.length || !losers.length) {
      return {
        ranked: false,
        reason: "not_enough_opposing_humans",
        isTeamMode,
        isForfeit,
        forfeitUserIds
      };
    }
  }

  const sideAverageRatings = new Map<string, number>();
  for (const [sideKey, sideParticipants] of sides.entries()) {
    sideAverageRatings.set(sideKey, averageRating(sideParticipants));
  }

  return {
    ranked: true,
    reason: "ranked",
    isTeamMode,
    isForfeit,
    forfeitUserIds,
    humanParticipants,
    sides,
    sideAverageRatings
  };
}

function buildWinnerParticipants({
  payload,
  participants
}: {
  payload: MatchPayload;
  participants: ResolvedParticipant[];
}) {
  const isTeamMode = payload.isTeamMode === true;
  if (normalizeText(payload.result).toLowerCase() === "draw") {
    return [];
  }

  if (isTeamMode) {
    const winnerKey = normalizeText(payload.winnerKey);
    if (!winnerKey.startsWith("team:")) {
      return [];
    }
    return participants.filter(({ participant }) => getParticipantSideKey(participant, true) === winnerKey);
  }

  return participants.filter(({ participant }) => getParticipantSideKey(participant, false) === "win");
}

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economyService: EconomyService
  ) {}

  async recordPlatformMatch(token: string, payload: MatchPayload) {
    const claims = verifyGameToken(token);
    if (!claims) {
      return null;
    }

    const participants = Array.isArray(payload.participants) ? payload.participants : [];
    if (!participants.length) {
      return null;
    }

    const sourceMatchId = String(payload.sourceMatchId || "").trim();
    if (!sourceMatchId) {
      return null;
    }

    const { proof, payload: signedPayload } = stripProof(payload as Record<string, unknown>);
    if (String(signedPayload.integrityScope || "").trim() !== "platform.match") {
      return null;
    }
    if (!verifyDominoPayload(signedPayload, proof)) {
      return null;
    }

    const uniqueParticipants = new Map<string, MatchParticipantPayload>();
    for (const participant of participants) {
      const userId = String(participant.userId || "").trim();
      if (!userId || uniqueParticipants.has(userId)) {
        continue;
      }
      uniqueParticipants.set(userId, participant);
    }
    const dedupedParticipants = Array.from(uniqueParticipants.values());
    if (!dedupedParticipants.length) {
      return null;
    }
    if (!dedupedParticipants.some((participant) => String(participant.userId || "").trim() === claims.userId)) {
      return null;
    }

    const matchCreatedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existingMatch = await tx.match.findUnique({
        where: { id: sourceMatchId },
        include: {
          participants: true
        }
      });
      if (existingMatch) {
        return {
          matchId: existingMatch.id,
          createdAt: existingMatch.createdAt,
          participants: existingMatch.participants.length,
          economy: {
            ok: true,
            duplicate: true
          }
        };
      }

      const resolvedParticipants: ResolvedParticipant[] = [];

      for (const participant of dedupedParticipants) {
        const userId = String(participant.userId || "").trim();
        if (!userId) {
          continue;
        }

        const displayName = String(participant.name || claims.displayName || "Player").trim().slice(0, 24) || "Player";
        const player = await tx.player.upsert({
          where: { userId },
          update: {
            displayName
          },
          create: {
            userId,
            displayName,
            isGuest: false
          },
          include: {
            stats: true
          }
        });

        const stats = player.stats || null;
        const snapshotStats = stats || {
          rating: 1000,
          points: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          matchesPlayed: 0,
          currentStreak: 0,
          bestStreak: 0
        };

        await grantStarterCoins(
          tx,
          player.id,
          userId,
          displayName,
          "match_backfill"
        );

        resolvedParticipants.push({
          participant,
          player: {
            playerId: player.id,
            userId: player.userId ?? userId,
            displayName: player.displayName,
            rating: normalizeEloRating(snapshotStats.rating),
            points: toInt(snapshotStats.points),
            wins: toInt(snapshotStats.wins),
            losses: toInt(snapshotStats.losses),
            draws: toInt(snapshotStats.draws),
            matchesPlayed: toInt(snapshotStats.matchesPlayed),
            currentStreak: toInt(snapshotStats.currentStreak),
            bestStreak: toInt(snapshotStats.bestStreak)
          },
          statsExists: Boolean(stats),
          sideKey: "",
          ratingBefore: normalizeEloRating(snapshotStats.rating),
          ratingAfter: normalizeEloRating(snapshotStats.rating),
          ratingDelta: 0
        });
      }

      if (!resolvedParticipants.length) {
        return null;
      }

      const rankingContext = buildRankedMatchContext({
        payload,
        participants: resolvedParticipants
      });

      if (rankingContext.ranked) {
        for (const entry of resolvedParticipants) {
          if (!entry.statsExists) {
            await tx.playerStats.create({
              data: {
                playerId: entry.player.playerId,
                rating: 1000,
                points: 0,
                wins: 0,
                losses: 0,
                draws: 0,
                matchesPlayed: 0,
                currentStreak: 0,
                bestStreak: 0
              }
            });
            entry.statsExists = true;
          }
        }
      }

      const winnerParticipants = buildWinnerParticipants({
        payload,
        participants: resolvedParticipants
      });

      const match = await tx.match.create({
        data: {
          id: sourceMatchId,
          mode: payload.mode || "online",
          isTeamMode: Boolean(payload.isTeamMode),
          roomId: payload.roomId || claims.sessionId || null,
          winnerKey: payload.winnerKey || null,
          result: payload.result || null,
          totalPoints: Number.isFinite(Number(payload.totalPoints))
            ? Number(payload.totalPoints)
            : resolvedParticipants.reduce((sum, entry) => sum + toInt(entry.participant.points), 0),
          createdAt: matchCreatedAt,
          participants: {
            create: resolvedParticipants.map((entry) => ({
              playerId: entry.player.playerId,
              displayNameSnapshot: entry.player.displayName,
              teamIndex: entry.participant.teamIndex ?? null,
              winnerKey: entry.participant.winnerKey ?? null,
              result: entry.participant.result ?? null,
              points: toInt(entry.participant.points),
              roundWins: toInt(entry.participant.roundWins),
              isBot: entry.participant.isBot === true,
              ratingBefore: entry.ratingBefore,
              ratingAfter: entry.ratingAfter,
              ratingDelta: entry.ratingDelta
            }))
          }
        },
        include: {
          participants: true
        }
      });

      if (rankingContext.ranked) {
        const isTeamMode = Boolean(payload.isTeamMode);
        const winnerSideKey = isTeamMode
          ? normalizeText(payload.winnerKey)
          : "win";
        const losingSideKey = isTeamMode
          ? (winnerSideKey === "team:0" ? "team:1" : "team:0")
          : "loss";

        for (const entry of resolvedParticipants) {
          const userId = String(entry.participant.userId || "").trim();
          if (!userId) {
            continue;
          }

          const currentSideKey = getParticipantSideKey(entry.participant, isTeamMode);
          if (!currentSideKey) {
            continue;
          }

          const isWinner = currentSideKey === winnerSideKey;
          const isLoser = currentSideKey === losingSideKey;
          const actualScore = isWinner ? 1 : 0;
          const opponentKey = isWinner ? losingSideKey : winnerSideKey;
          const opponentRating = rankingContext.sideAverageRatings?.get(opponentKey) ?? entry.player.rating;
          const penalty = rankingContext.isForfeit && rankingContext.forfeitUserIds.has(userId) ? -ELO_FORFEIT_PENALTY : 0;
          const nextRating = calculateEloUpdate({
            playerRating: entry.player.rating,
            opponentRating,
            actualScore,
            matchesPlayed: entry.player.matchesPlayed,
            penalty
          });
          const nextCurrentStreak = isWinner ? entry.player.currentStreak + 1 : 0;
          const nextStats = {
            wins: entry.player.wins + (isWinner ? 1 : 0),
            losses: entry.player.losses + (isLoser ? 1 : 0),
            draws: entry.player.draws,
            matchesPlayed: entry.player.matchesPlayed + 1,
            currentStreak: nextCurrentStreak,
            bestStreak: Math.max(entry.player.bestStreak, nextCurrentStreak)
          };

          await tx.playerStats.update({
            where: { playerId: entry.player.playerId },
            data: {
              rating: nextRating,
              points: entry.player.points + toInt(entry.participant.points),
              ...nextStats
            }
          });

          entry.ratingBefore = entry.player.rating;
          entry.ratingAfter = nextRating;
          entry.ratingDelta = nextRating - entry.player.rating;
        }
      }

      await tx.systemAuditLog.create({
        data: {
          actorType: "system",
          actorPlayerId: claims.playerId,
          action: "match.recorded",
          entityType: "Match",
          entityId: match.id,
          payloadJson: {
            mode: payload.mode || "online",
            roomId: payload.roomId || claims.sessionId || null,
            winnerKey: payload.winnerKey || null,
            result: payload.result || null,
            matchOutcome: payload.matchOutcome || "normal",
            stakeKey: payload.stakeKey || null,
            totalPoints: Number.isFinite(Number(payload.totalPoints))
              ? Number(payload.totalPoints)
              : resolvedParticipants.reduce((sum, entry) => sum + toInt(entry.participant.points), 0),
            ranked: rankingContext.ranked,
            forfeitUserIds: Array.isArray(payload.forfeitUserIds) ? payload.forfeitUserIds : [],
            participants: resolvedParticipants.map((entry) => ({
              playerId: entry.player.playerId,
              userId: entry.player.userId,
              displayName: entry.player.displayName,
              ratingBefore: entry.ratingBefore,
              ratingAfter: entry.ratingAfter,
              ratingDelta: entry.ratingDelta
            }))
          }
        }
      });

      const settlement = await this.economyService.settleMatchStake(token, {
        roomId: String(payload.roomId || claims.sessionId || ""),
        matchId: match.id,
        stakeKey: String(payload.stakeKey || "free"),
        result: winnerParticipants.length ? "win" : "refund",
        winnerPlayerIds: winnerParticipants.map(({ player }) => player.playerId),
        winnerUserIds: winnerParticipants.map(({ player }) => player.userId),
        integrityScope: "economy.settle",
        proof: signDominoPayload({
          roomId: String(payload.roomId || claims.sessionId || ""),
          matchId: match.id,
          stakeKey: String(payload.stakeKey || "free"),
          result: winnerParticipants.length ? "win" : "refund",
          winnerPlayerIds: winnerParticipants.map(({ player }) => player.playerId),
          winnerUserIds: winnerParticipants.map(({ player }) => player.userId),
          integrityScope: "economy.settle"
        })
      });

      return {
        matchId: match.id,
        createdAt: match.createdAt,
        participants: match.participants.length,
        economy: settlement
      };
    });
  }
}
