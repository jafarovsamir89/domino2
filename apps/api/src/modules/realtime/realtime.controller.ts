import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";

import { verifyGameToken } from "../auth/game-token.js";
import { RealtimeService } from "./realtime.service.js";
import { RealtimeHeartbeatDto } from "../validation/validation.dto.js";

@Controller("realtime")
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Get("summary")
  async getSummary() {
    return this.realtimeService.summary();
  }

  @Get("sessions/:sessionId")
  async getSession(@Param("sessionId") sessionId: string) {
    return { item: await this.realtimeService.getSession(sessionId) };
  }

  @Post("heartbeat")
  async heartbeat(@Headers("authorization") authorization: string | undefined, @Body() body: RealtimeHeartbeatDto) {
    const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!verifyGameToken(token)) {
      throw new UnauthorizedException("Login required");
    }
    return { item: await this.realtimeService.heartbeat(body) };
  }
}
