import { Body, Controller, Get, Patch, Req } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "./auth.service.js";

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("platform/status")
  getStatus() {
    return this.authService.getStatus();
  }

  @Get("platform/session")
  async getSession(@Req() req: Request) {
    return this.authService.getSession(req.headers);
  }

  @Get("platform/game-token")
  async getGameToken(@Req() req: Request) {
    return this.authService.mintGameToken(req.headers);
  }

  @Get("me")
  async getCurrentProfile(@Req() req: Request) {
    return this.authService.getCurrentProfile(req.headers);
  }

  @Patch("me")
  async updateCurrentProfileName(
    @Req() req: Request,
    @Body() body: { name?: string }
  ) {
    return this.authService.updateCurrentProfileName(req.headers, body?.name);
  }
}
