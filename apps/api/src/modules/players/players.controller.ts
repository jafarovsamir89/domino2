import { Controller, Get, NotFoundException, Param } from "@nestjs/common";

import { PlayersService } from "./players.service.js";

@Controller("players")
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get(":id")
  async getPlayer(@Param("id") id: string) {
    const player = await this.playersService.getById(id);
    if (!player) {
      throw new NotFoundException("Player not found");
    }
    return player;
  }
}

