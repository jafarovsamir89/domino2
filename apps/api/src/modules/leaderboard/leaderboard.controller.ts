import { Controller, Get } from "@nestjs/common";

import { LeaderboardService } from "./leaderboard.service.js";

@Controller("leaderboard")
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  async getLeaderboard() {
    return {
      items: await this.leaderboardService.getTopPlayers()
    };
  }
}

