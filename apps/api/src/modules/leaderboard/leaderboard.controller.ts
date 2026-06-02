import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import { LeaderboardService } from "./leaderboard.service.js";

@Controller("leaderboard")
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  async getLeaderboard(@Req() req: Request, @Query("scope") scope?: string) {
    return {
      items: await this.leaderboardService.getLeaderboard(req.headers, scope)
    };
  }
}
