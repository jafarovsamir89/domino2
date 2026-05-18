import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import { getPlayerRatingTitleCode } from "../ranking/player-ranking.js";

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getTopPlayers(limit = 10) {
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

    return rows.map((row, index) => ({
      id: row.playerId,
      displayName: row.player?.displayName ?? "Player",
      rating: row.rating ?? 1000,
      titleCode: getPlayerRatingTitleCode(row.rating ?? 1000),
      points: row.points,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      matchesPlayed: row.matchesPlayed,
      rank: index + 1
    }));
  }
}
