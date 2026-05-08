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

    return {
      ...player,
      stats: player.stats
        ? {
            ...player.stats,
            rating,
            titleCode: getPlayerRatingTitleCode(rating)
          }
        : null,
      wallet: player.wallet
        ? {
            ...player.wallet,
            availableBalance: Math.max(0, player.wallet.balance),
            spendableBalance: Math.max(0, player.wallet.balance),
            reservedBalance: player.wallet.reserved
          }
        : null
    };
  }
}
