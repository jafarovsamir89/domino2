import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import { calculatePlayerRating, getPlayerRatingTitleCode } from "../ranking/player-ranking.js";

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      include: {
        stats: true,
        wallet: true
      }
    });

    if (!player) {
      return null;
    }

    const rating = player.stats ? calculatePlayerRating(player.stats) : 1000;
    const { wallet, ...publicPlayer } = player as typeof player & { wallet?: unknown };

    return {
      ...publicPlayer,
      stats: player.stats
        ? {
            ...player.stats,
            rating,
            titleCode: getPlayerRatingTitleCode(rating)
          }
        : null
    };
  }
}
