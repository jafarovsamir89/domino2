import type { IncomingHttpHeaders } from "node:http";

import { Injectable, UnauthorizedException } from "@nestjs/common";

import { AuthService } from "../auth/auth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { getPlayerRatingTitleCode } from "../ranking/player-ranking.js";
import { createPlayerModeStatsSnapshot, normalizeRatingGameMode } from "../ranking/player-mode-stats.js";

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

type ModeStatsRow = {
  playerId: string;
  rating: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  displayName: string;
};

type PlayerModeRecord = {
  playerId: string;
  displayName: string;
  rating: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  titleCode: string;
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

  private normalizeModeStatsRow(row: Partial<ModeStatsRow> | null | undefined, fallbackDisplayName = "Player"): PlayerModeRecord {
    const snapshot = createPlayerModeStatsSnapshot(row || {});
    const displayName = String(row?.displayName || fallbackDisplayName || "Player").trim() || "Player";
    return {
      playerId: String(row?.playerId || ""),
      displayName,
      rating: Number(snapshot.rating ?? 1000),
      points: Number(snapshot.points ?? 0),
      wins: Number(snapshot.wins ?? 0),
      losses: Number(snapshot.losses ?? 0),
      draws: Number(snapshot.draws ?? 0),
      matchesPlayed: Number(snapshot.matchesPlayed ?? 0),
      titleCode: getPlayerRatingTitleCode(Number(snapshot.rating ?? 1000))
    };
  }

  private summarizeRow(row: PlayerModeRecord, rank: number, isSelf = false, weekly?: Partial<LeaderboardRow>): LeaderboardRow {
    return {
      id: row.playerId,
      displayName: row.displayName || "Player",
      rating: Number(row.rating ?? 1000),
      titleCode: row.titleCode || getPlayerRatingTitleCode(Number(row.rating ?? 1000)),
      points: Number(row.points ?? 0),
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      draws: Number(row.draws ?? 0),
      matchesPlayed: Number(row.matchesPlayed ?? 0),
      rank,
      isSelf,
      weeklyRatingDelta: weekly?.weeklyRatingDelta,
      weeklyWins: weekly?.weeklyWins,
      weeklyLosses: weekly?.weeklyLosses,
      weeklyMatchesPlayed: weekly?.weeklyMatchesPlayed
    };
  }

  private normalizeLimit(limit = 10) {
    return Math.max(1, Math.min(100, Math.trunc(Number(limit || 10) || 10)));
  }

  private async getOverallLeaderboard(gameMode = "telefon", limit = 10) {
    const normalizedGameMode = normalizeRatingGameMode(gameMode);
    const players = await this.prisma.player.findMany({
      select: {
        id: true,
        displayName: true,
        modeStats: {
          where: {
            gameMode: normalizedGameMode
          },
          take: 1
        }
      }
    });

    const rows = players.map((player) => {
      const row = player.modeStats?.[0] || null;
      return this.normalizeModeStatsRow({
        playerId: player.id,
        displayName: player.displayName,
        rating: row?.rating ?? 1000,
        points: row?.points ?? 0,
        wins: row?.wins ?? 0,
        losses: row?.losses ?? 0,
        draws: row?.draws ?? 0,
        matchesPlayed: row?.matchesPlayed ?? 0
      }, player.displayName);
    });

    return rows
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (a.losses !== b.losses) return a.losses - b.losses;
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, this.normalizeLimit(limit))
      .map((row, index) => this.summarizeRow(row, index + 1));
  }

  private async getWeeklyLeaderboard(gameMode = "telefon", limit = 10) {
    const normalizedGameMode = normalizeRatingGameMode(gameMode);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const matches = await this.prisma.match.findMany({
      where: {
        createdAt: {
          gte: since
        },
        gameMode: normalizedGameMode
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
    const statsRows = playerIds.length ? await this.prisma.playerModeStats.findMany({
      where: {
        gameMode: normalizedGameMode,
        playerId: {
          in: playerIds
        }
      },
      include: {
        player: true
      }
    }) : [];
    const statsMap = new Map(statsRows.map((row) => [row.playerId, row]));

    return rows
      .map((row) => {
        const stats = statsMap.get(row.playerId);
        const normalized = this.normalizeModeStatsRow({
          playerId: row.playerId,
          displayName: stats?.player?.displayName ?? row.displayName ?? "Player",
          rating: stats?.rating ?? 1000,
          points: stats?.points ?? 0,
          wins: stats?.wins ?? row.wins ?? 0,
          losses: stats?.losses ?? row.losses ?? 0,
          draws: stats?.draws ?? 0,
          matchesPlayed: stats?.matchesPlayed ?? row.matchesPlayed ?? 0
        }, stats?.player?.displayName ?? row.displayName ?? "Player");
        return this.summarizeRow(normalized, 0, false, {
          weeklyRatingDelta: row.ratingDelta,
          weeklyWins: row.wins,
          weeklyLosses: row.losses,
          weeklyMatchesPlayed: row.matchesPlayed
        });
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
      .slice(0, this.normalizeLimit(limit))
      .map((row, index) => ({
        ...row,
        rank: index + 1
      }));
  }

  private async getFriendsLeaderboard(headers: IncomingHttpHeaders, gameMode = "telefon", limit = 10) {
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

    const players = await this.prisma.player.findMany({
      where: {
        id: {
          in: Array.from(friendIds)
        }
      },
      select: {
        id: true,
        displayName: true,
        modeStats: {
          where: {
            gameMode: normalizeRatingGameMode(gameMode)
          },
          take: 1
        }
      }
    });

    const rows = players.map((player) => {
      const row = player.modeStats?.[0] || null;
      const normalized = this.normalizeModeStatsRow({
        playerId: player.id,
        displayName: player.displayName,
        rating: row?.rating ?? 1000,
        points: row?.points ?? 0,
        wins: row?.wins ?? 0,
        losses: row?.losses ?? 0,
        draws: row?.draws ?? 0,
        matchesPlayed: row?.matchesPlayed ?? 0
      }, player.displayName);
      return this.summarizeRow(normalized, 0, player.id === currentPlayerId);
    });

    return rows
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (a.losses !== b.losses) return a.losses - b.losses;
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, this.normalizeLimit(limit))
      .map((row, index) => ({
        ...row,
        rank: index + 1,
        isSelf: row.id === currentPlayerId
      }));
  }

  async getLeaderboard(headers: IncomingHttpHeaders, scope = "overall", gameMode = "telefon", limit = 10) {
    const normalizedScope = String(scope || "overall").trim().toLowerCase();
    const normalizedGameMode = normalizeRatingGameMode(gameMode);
    if (normalizedScope === "weekly") {
      return this.getWeeklyLeaderboard(normalizedGameMode, limit);
    }
    if (normalizedScope === "friends") {
      return this.getFriendsLeaderboard(headers, normalizedGameMode, limit);
    }
    return this.getOverallLeaderboard(normalizedGameMode, limit);
  }
}
