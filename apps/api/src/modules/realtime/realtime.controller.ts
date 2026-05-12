import { Body, Controller, Get, Post } from "@nestjs/common";

import { RealtimeService } from "./realtime.service.js";

@Controller("realtime")
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Get("summary")
  async getSummary() {
    return this.realtimeService.summary();
  }

  @Post("heartbeat")
  async heartbeat(@Body() body: {
    sessionId?: string;
    provider?: string;
    displayName?: string;
    roomId?: string | null;
    roomCode?: string | null;
    gameMode?: string;
    isPlaying?: boolean;
    isConnected?: boolean;
    source?: string;
  }) {
    return { item: await this.realtimeService.heartbeat(body) };
  }
}
