import { Injectable } from "@nestjs/common";

import { EconomyService } from "../economy/economy.service.js";
import { grantStarterCoins } from "../economy/economy-starter.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { verifyGameToken } from "../auth/game-token.js";
import { calculatePlayerRating } from "../ranking/player-ranking.js";
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
  winnerKey?: string | null;
  result?: string | null;
  stakeKey?: string | null;
  participants?: MatchParticipantPayload[];
  teams?: Array<{ memberIds?: string[] }>;
  totalPoints?: number | null;
  integrityScope?: string | null;
  proof?: string | null;
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

function toInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stripProof<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload } as Record<string, unknown> & { proof?: unknown };
  const proof = String(next.proof || "").trim();
  delete next.proof;
  return { proof, payload: next as Record<string, unknown> };
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

    const isTeamMode = payload.isTeamMode === true;
    const winnerKey = String(payload.winnerKey || "").trim();
    const totalPoints = Number.isFinite(Number(payload.totalPoints))
      ? Number(payload.totalPoints)
      : dedupedParticipants.reduce((sum, participant) => sum + toInt(participant.points), 0);
    const matchCreatedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const resolvedParticipants: Array<{
        participant: MatchParticipantPayload;
        player: PlayerSnapshot;
        ratingBefore: number;
        ratingAfter: number;
        ratingDelta: number;
      }> = [];

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

        const stats = player.stats
          ? player.stats
          : await tx.playerStats.create({
              data: {
                playerId: player.id
              }
            });
        const ratingBefore = stats.rating;

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
            rating: stats.rating,
            points: stats.points,
            wins: stats.wins,
            losses: stats.losses,
            draws: stats.draws,
            matchesPlayed: stats.matchesPlayed,
            currentStreak: stats.currentStreak,
            bestStreak: stats.bestStreak
          },
          ratingBefore,
          ratingAfter: ratingBefore,
          ratingDelta: 0
        });
      }

      if (!resolvedParticipants.length) {
        return null;
      }

      const match = await tx.match.create({
        data: {
          mode: payload.mode || "online",
          isTeamMode,
          roomId: payload.roomId || claims.sessionId || null,
          winnerKey: winnerKey || null,
          result: payload.result || null,
          totalPoints,
          createdAt: matchCreatedAt,
          participants: {
            create: resolvedParticipants.map(({ participant, player, ratingBefore, ratingAfter, ratingDelta }) => ({
              playerId: player.playerId,
              displayNameSnapshot: player.displayName,
              teamIndex: participant.teamIndex ?? null,
              winnerKey: participant.winnerKey ?? null,
              result: participant.result ?? null,
              points: toInt(participant.points),
              roundWins: toInt(participant.roundWins),
              isBot: participant.isBot === true,
              ratingBefore,
              ratingAfter,
              ratingDelta
            }))
          }
        },
        include: {
          participants: true
        }
      });

      const winnerTeamIndex = isTeamMode && winnerKey.startsWith("team:")
        ? Number.parseInt(winnerKey.slice(5), 10)
        : -1;
      const winnerParticipants = resolvedParticipants.filter(({ participant }) => {
        if (winnerKey === "draw") {
          return false;
        }
        if (isTeamMode) {
          return Number.isFinite(winnerTeamIndex) && participant.teamIndex !== null && participant.teamIndex === winnerTeamIndex;
        }
        return participant.winnerKey === winnerKey || participant.result === "win";
      });

      for (const { participant, player } of resolvedParticipants) {
        const isDraw = winnerKey === "draw" || payload.result === "draw";
        const isWinner = !isDraw && (isTeamMode
          ? participant.teamIndex !== null && participant.teamIndex !== undefined && `team:${participant.teamIndex}` === winnerKey
          : participant.winnerKey === winnerKey);
        const didWin = isDraw ? false : isWinner;
        const didLose = !didWin && !isDraw;
        const nextCurrentStreak = didWin ? player.currentStreak + 1 : 0;
        const nextStats = {
          wins: player.wins + (didWin ? 1 : 0),
          losses: player.losses + (didLose ? 1 : 0),
          draws: player.draws + (isDraw ? 1 : 0),
          matchesPlayed: player.matchesPlayed + 1,
          currentStreak: nextCurrentStreak,
          bestStreak: Math.max(player.bestStreak, nextCurrentStreak)
        };
        const nextRating = calculatePlayerRating(nextStats);
        const ratingBefore = player.rating;

        await tx.playerStats.update({
          where: { playerId: player.playerId },
          data: {
            rating: nextRating,
            points: player.points + toInt(participant.points),
            ...nextStats
          }
        });

        const snapshot = resolvedParticipants.find((entry) => entry.player.playerId === player.playerId);
        if (snapshot) {
          snapshot.ratingBefore = ratingBefore;
          snapshot.ratingAfter = nextRating;
          snapshot.ratingDelta = nextRating - ratingBefore;
        }
      }

      const settlement = await this.economyService.settleMatchStake(token, {
        roomId: String(payload.roomId || claims.sessionId || ""),
        matchId: match.id,
        stakeKey: String(payload.stakeKey || "free"),
        result: winnerKey === "draw" || payload.result === "draw" ? "draw" : "win",
        winnerPlayerIds: winnerParticipants.map(({ player }) => player.playerId),
        winnerUserIds: winnerParticipants.map(({ player }) => player.userId),
        integrityScope: "economy.settle",
        proof: signDominoPayload({
          roomId: String(payload.roomId || claims.sessionId || ""),
          matchId: match.id,
          stakeKey: String(payload.stakeKey || "free"),
          result: winnerKey === "draw" || payload.result === "draw" ? "draw" : "win",
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
