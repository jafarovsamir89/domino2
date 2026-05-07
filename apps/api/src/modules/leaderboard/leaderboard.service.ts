import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getTopPlayers(limit = 10) {
    const rows = await this.prisma.playerStats.findMany({
      take: limit,
      orderBy: {
        rating: "desc"
      },
      include: {
        player: true
      }
    });

    return rows.map((row: { playerId: string; player: { displayName: string } | null; rating: number; points: number; wins: number; matchesPlayed: number }, index: number) => ({
      rank: index + 1,
      id: row.playerId,
      displayName: row.player?.displayName ?? "Player",
      rating: row.rating,
      points: row.points,
      wins: row.wins,
      matchesPlayed: row.matchesPlayed
    }));
  }
}
