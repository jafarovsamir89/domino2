import { Injectable } from "@nestjs/common";

import { EconomyService } from "../economy/economy.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { verifyGameToken } from "../auth/game-token.js";

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

function eloDelta(userRating: number, oppRating: number, result: number, k = 32) {
  const expected = 1 / (1 + Math.pow(10, (oppRating - userRating) / 400));
  return Math.round(k * (result - expected));
}

function toInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

    const isTeamMode = payload.isTeamMode === true;
    const winnerKey = String(payload.winnerKey || "").trim();
    const totalPoints = Number.isFinite(Number(payload.totalPoints))
      ? Number(payload.totalPoints)
      : participants.reduce((sum, participant) => sum + toInt(participant.points), 0);
    const matchCreatedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const resolvedParticipants: Array<{
        participant: MatchParticipantPayload;
        player: PlayerSnapshot;
      }> = [];

      for (const participant of participants) {
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
          }
        });
      }

      if (!resolvedParticipants.length) {
        return null;
      }

      const teamRatings = isTeamMode && Array.isArray(payload.teams) && payload.teams.length >= 2
        ? payload.teams.slice(0, 2).map((team, teamIndex) => {
            const members = (team.memberIds || [])
              .map((memberId) => resolvedParticipants.find((entry) => entry.participant.userId === memberId)?.player.rating)
              .filter((rating): rating is number => typeof rating === "number");
            if (!members.length) {
              return 1000;
            }
            return members.reduce((sum, value) => sum + value, 0) / members.length;
          })
        : null;

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
            create: resolvedParticipants.map(({ participant, player }) => ({
              playerId: player.playerId,
              displayNameSnapshot: player.displayName,
              teamIndex: participant.teamIndex ?? null,
              winnerKey: participant.winnerKey ?? null,
              result: participant.result ?? null,
              points: toInt(participant.points),
              roundWins: toInt(participant.roundWins),
              isBot: participant.isBot === true
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

        let ratingDelta = 0;
        if (isTeamMode && teamRatings && participant.teamIndex !== null && participant.teamIndex !== undefined) {
          const ownTeam = teamRatings[participant.teamIndex] || 1000;
          const oppTeam = teamRatings[participant.teamIndex === 0 ? 1 : 0] || 1000;
          const result = isDraw ? 0.5 : (didWin ? 1 : 0);
          ratingDelta = eloDelta(ownTeam, oppTeam, result, 28);
        } else {
          const opponentRatings = resolvedParticipants
            .filter((entry) => entry.player.userId !== player.userId)
            .map((entry) => entry.player.rating);
          const opponentAverage = opponentRatings.length
            ? opponentRatings.reduce((sum, value) => sum + value, 0) / opponentRatings.length
            : 1000;
          const result = isDraw ? 0.5 : (didWin ? 1 : 0);
          ratingDelta = eloDelta(player.rating, opponentAverage, result, 32);
        }

        const nextRating = Math.max(100, player.rating + ratingDelta);
        const nextCurrentStreak = didWin ? player.currentStreak + 1 : 0;

        await tx.playerStats.update({
          where: { playerId: player.playerId },
          data: {
            rating: nextRating,
            points: player.points + toInt(participant.points),
            wins: player.wins + (didWin ? 1 : 0),
            losses: player.losses + (didLose ? 1 : 0),
            draws: player.draws + (isDraw ? 1 : 0),
            matchesPlayed: player.matchesPlayed + 1,
            currentStreak: nextCurrentStreak,
            bestStreak: Math.max(player.bestStreak, nextCurrentStreak)
          }
        });
      }

      const settlement = await this.economyService.settleMatchStake(token, {
        roomId: String(payload.roomId || claims.sessionId || ""),
        matchId: match.id,
        stakeKey: String(payload.stakeKey || "free"),
        result: winnerKey === "draw" || payload.result === "draw" ? "draw" : "win",
        winnerPlayerIds: winnerParticipants.map(({ player }) => player.playerId),
        winnerUserIds: winnerParticipants.map(({ player }) => player.userId)
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
