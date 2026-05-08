import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import { calculatePlayerRating, getPlayerRatingTitleCode } from "../ranking/player-ranking.js";

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getTopPlayers(limit = 10) {
    const rows = await this.prisma.playerStats.findMany({
      include: {
        player: true
      }
    });

    return rows
      .map((row: { playerId: string; player: { displayName: string } | null; points: number; wins: number; losses: number; draws: number; matchesPlayed: number; currentStreak: number; bestStreak: number }) => {
        const rating = calculatePlayerRating(row);
        return {
          id: row.playerId,
          displayName: row.player?.displayName ?? "Player",
          rating,
          titleCode: getPlayerRatingTitleCode(rating),
          points: row.points,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          matchesPlayed: row.matchesPlayed
        };
      })
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit)
      .map((row, index) => ({
        ...row,
        rank: index + 1
      }));
  }
}
