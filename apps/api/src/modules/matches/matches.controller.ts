import { Body, Controller, Headers, Post } from "@nestjs/common";

import { MatchesService } from "./matches.service.js";
import { PlatformMatchDto } from "../validation/validation.dto.js";

@Controller()
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post("platform/matches")
  async recordPlatformMatch(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: PlatformMatchDto
  ) {
    const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    return this.matchesService.recordPlatformMatch(token, body);
  }
}
