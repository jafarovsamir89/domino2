import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string) {
    return this.prisma.player.findUnique({
      where: { id },
      include: {
        stats: true
      }
    });
  }
}

