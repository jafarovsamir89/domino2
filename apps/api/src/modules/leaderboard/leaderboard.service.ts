import type { IncomingHttpHeaders } from "node:http";

import { Injectable, UnauthorizedException } from "@nestjs/common";

import { AuthService } from "../auth/auth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { getPlayerRatingTitleCode } from "../ranking/player-ranking.js";

type LeaderboardRow = {
  id: string;
  displayName: string;
  rating: number;
  titleCode: string;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  rank: number;
  isSelf?: boolean;
  weeklyRatingDelta?: number;
  weeklyWins?: number;
  weeklyLosses?: number;
  weeklyMatchesPlayed?: number;
};

type StatsRow = {
  playerId: string;
  rating: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  displayName: string;
};

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  private async getCurrentPlayerId(headers: IncomingHttpHeaders) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player?.id) {
      throw new UnauthorizedException("Sign in required");
    }
    return profile.player.id;
  }

  private summarizeOverall(row: StatsRow, rank: number, isSelf = false): LeaderboardRow {
    return {
      id: row.playerId,
      displayName: row.displayName || "Player",
      rating: Number(row.rating ?? 1000),
      titleCode: getPlayerRatingTitleCode(Number(row.rating ?? 1000)),
      points: Number(row.points ?? 0),
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      draws: Number(row.draws ?? 0),
      matchesPlayed: Number(row.matchesPlayed ?? 0),
      rank,
      isSelf
    };
  }

  private async getOverallLeaderboard(limit = 10) {
    const rows = await this.prisma.playerStats.findMany({
      orderBy: [
        { rating: "desc" },
        { matchesPlayed: "desc" },
        { wins: "desc" },
        { losses: "asc" },
        { playerId: "asc" }
      ],
      take: Math.max(1, Math.min(100, Math.trunc(Number(limit || 10) || 10))),
      include: {
        player: true
      }
    });

    return rows.map((row, index) => this.summarizeOverall({
      playerId: row.playerId,
      displayName: row.player?.displayName ?? "Player",
      rating: row.rating ?? 1000,
      points: row.points ?? 0,
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
      draws: row.draws ?? 0,
      matchesPlayed: row.matchesPlayed ?? 0
    }, index + 1));
  }

  private async getWeeklyLeaderboard(limit = 10) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const matches = await this.prisma.match.findMany({
      where: {
        createdAt: {
          gte: since
        }
      },
      select: {
        participants: {
          select: {
            playerId: true,
            displayNameSnapshot: true,
            result: true,
            ratingDelta: true
          }
        }
      }
    });

    const aggregate = new Map<string, {
      displayName: string;
      ratingDelta: number;
      wins: number;
      losses: number;
      matchesPlayed: number;
    }>();

    for (const match of matches) {
      for (const participant of match.participants || []) {
        const playerId = String(participant.playerId || "").trim();
        if (!playerId) continue;
        const current = aggregate.get(playerId) || {
          displayName: participant.displayNameSnapshot || "Player",
          ratingDelta: 0,
          wins: 0,
          losses: 0,
          matchesPlayed: 0
        };
        current.displayName = current.displayName || participant.displayNameSnapshot || "Player";
        current.ratingDelta += Number(participant.ratingDelta ?? 0);
        current.matchesPlayed += 1;
        const result = String(participant.result || "").toLowerCase();
        if (result === "win") current.wins += 1;
        else if (result === "loss") current.losses += 1;
        aggregate.set(playerId, current);
      }
    }

    const rows = Array.from(aggregate.entries()).map(([playerId, value]) => ({
      playerId,
      displayName: value.displayName,
      ratingDelta: value.ratingDelta,
      wins: value.wins,
      losses: value.losses,
      matchesPlayed: value.matchesPlayed
    }));

    const playerIds = rows.map((row) => row.playerId);
    const statsRows = await this.prisma.playerStats.findMany({
      where: {
        playerId: {
          in: playerIds
        }
      },
      include: {
        player: true
      }
    });
    const statsMap = new Map(statsRows.map((row) => [row.playerId, row]));

    return rows
      .map((row) => {
        const stats = statsMap.get(row.playerId);
        const rating = Number(stats?.rating ?? 1000);
        return {
          id: row.playerId,
          displayName: stats?.player?.displayName ?? row.displayName ?? "Player",
          rating,
          titleCode: getPlayerRatingTitleCode(rating),
          points: Number(stats?.points ?? 0),
          wins: Number(stats?.wins ?? row.wins ?? 0),
          losses: Number(stats?.losses ?? row.losses ?? 0),
          draws: Number(stats?.draws ?? 0),
          matchesPlayed: Number(row.matchesPlayed ?? stats?.matchesPlayed ?? 0),
          rank: 0,
          weeklyRatingDelta: row.ratingDelta,
          weeklyWins: row.wins,
          weeklyLosses: row.losses,
          weeklyMatchesPlayed: row.matchesPlayed
        };
      })
      .sort((a, b) => {
        if ((b.weeklyRatingDelta ?? 0) !== (a.weeklyRatingDelta ?? 0)) {
          return (b.weeklyRatingDelta ?? 0) - (a.weeklyRatingDelta ?? 0);
        }
        if ((b.weeklyWins ?? 0) !== (a.weeklyWins ?? 0)) {
          return (b.weeklyWins ?? 0) - (a.weeklyWins ?? 0);
        }
        if ((b.weeklyMatchesPlayed ?? 0) !== (a.weeklyMatchesPlayed ?? 0)) {
          return (b.weeklyMatchesPlayed ?? 0) - (a.weeklyMatchesPlayed ?? 0);
        }
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, Math.max(1, Math.min(100, Math.trunc(Number(limit || 10) || 10))))
      .map((row, index) => ({
        ...row,
        rank: index + 1
      }));
  }

  private async getFriendsLeaderboard(headers: IncomingHttpHeaders, limit = 10) {
    const currentPlayerId = await this.getCurrentPlayerId(headers);
    const friendships = await this.prisma.friendConnection.findMany({
      where: {
        status: "accepted",
        OR: [
          { requesterPlayerId: currentPlayerId },
          { addresseePlayerId: currentPlayerId }
        ]
      },
      select: {
        requesterPlayerId: true,
        addresseePlayerId: true
      }
    });

    const friendIds = new Set<string>([currentPlayerId]);
    for (const friendship of friendships) {
      const otherId = friendship.requesterPlayerId === currentPlayerId
        ? friendship.addresseePlayerId
        : friendship.requesterPlayerId;
      if (otherId) friendIds.add(otherId);
    }

    const rows = await this.prisma.playerStats.findMany({
      where: {
        playerId: {
          in: Array.from(friendIds)
        }
      },
      include: {
        player: true
      },
      orderBy: [
        { rating: "desc" },
        { matchesPlayed: "desc" },
        { wins: "desc" },
        { losses: "asc" },
        { playerId: "asc" }
      ],
      take: Math.max(1, Math.min(100, Math.trunc(Number(limit || 10) || 10)))
    });

    return rows.map((row, index) => this.summarizeOverall({
      playerId: row.playerId,
      displayName: row.player?.displayName ?? "Player",
      rating: row.rating ?? 1000,
      points: row.points ?? 0,
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
      draws: row.draws ?? 0,
      matchesPlayed: row.matchesPlayed ?? 0
    }, index + 1, row.playerId === currentPlayerId));
  }

  async getLeaderboard(headers: IncomingHttpHeaders, scope = "overall", limit = 10) {
    const normalizedScope = String(scope || "overall").trim().toLowerCase();
    if (normalizedScope === "weekly") {
      return this.getWeeklyLeaderboard(limit);
    }
    if (normalizedScope === "friends") {
      return this.getFriendsLeaderboard(headers, limit);
    }
    return this.getOverallLeaderboard(limit);
  }
}
