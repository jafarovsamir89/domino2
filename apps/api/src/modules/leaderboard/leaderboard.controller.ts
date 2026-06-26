import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import { LeaderboardService } from "./leaderboard.service.js";

@Controller("leaderboard")
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  async getLeaderboard(
    @Req() req: Request,
    @Query("scope") scope?: string,
    @Query("mode") mode?: string,
    @Query("gameMode") gameMode?: string,
    @Query("limit") limit?: string
  ) {
    const selectedMode = String(mode || gameMode || "telefon").trim() || "telefon";
    const selectedLimit = Number(limit || 10);
    return {
      items: await this.leaderboardService.getLeaderboard(req.headers, scope, selectedMode, selectedLimit)
    };
  }
}
