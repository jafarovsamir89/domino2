import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import { createPlayerModeStatsSnapshot, normalizeRatingGameMode } from "../ranking/player-mode-stats.js";
import { calculatePlayerRating, getPlayerRatingTitleCode } from "../ranking/player-ranking.js";

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      include: {
        stats: true,
        modeStats: true,
        wallet: true
      }
    });

    if (!player) {
      return null;
    }

    const modeStatsMap = new Map((player.modeStats || []).map((row) => [normalizeRatingGameMode(row.gameMode), row]));
    const telefonStats = player.stats ? createPlayerModeStatsSnapshot(player.stats) : createPlayerModeStatsSnapshot(modeStatsMap.get("telefon") || {});
    const classic101Stats = createPlayerModeStatsSnapshot(modeStatsMap.get("classic101") || {});
    const ratings = {
      telefon: {
        ...telefonStats,
        titleCode: getPlayerRatingTitleCode(calculatePlayerRating(telefonStats))
      },
      classic101: {
        ...classic101Stats,
        titleCode: getPlayerRatingTitleCode(calculatePlayerRating(classic101Stats))
      }
    };
    const rating = ratings.telefon.rating;
    const { wallet, modeStats, ...publicPlayer } = player as typeof player & { wallet?: unknown; modeStats?: unknown };

    return {
      ...publicPlayer,
      rating,
      titleCode: ratings.telefon.titleCode,
      stats: {
        ...ratings.telefon
      },
      ratings
    };
  }
}
