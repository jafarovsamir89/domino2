import { Controller, Headers, Post, Body } from "@nestjs/common";

import { MatchesService } from "./matches.service.js";

@Controller()
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post("platform/matches")
  async recordPlatformMatch(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    return this.matchesService.recordPlatformMatch(token, body);
  }
}
