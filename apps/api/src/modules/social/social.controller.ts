import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import { SocialService } from "./social.service.js";

@Controller("social")
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get("friends")
  async getFriends(@Req() req: Request) {
    return this.socialService.getFriends(req.headers);
  }

  @Get("players/search")
  async searchPlayers(@Req() req: Request, @Query("query") query?: string) {
    return this.socialService.searchPlayers(req.headers, query);
  }

  @Post("friends/request")
  async requestFriend(@Req() req: Request, @Body() body: { playerId?: string; note?: string }) {
    return this.socialService.requestFriend(req.headers, body);
  }

  @Post("friends/:id/accept")
  async acceptFriend(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.acceptFriend(req.headers, id);
  }

  @Post("friends/:id/decline")
  async declineFriend(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.declineFriend(req.headers, id);
  }

  @Post("friends/:id/remove")
  async removeFriend(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.removeFriend(req.headers, id);
  }

  @Get("invitations")
  async getInvitations(@Req() req: Request) {
    return this.socialService.getRoomInvitations(req.headers);
  }

  @Post("rooms/:roomId/invite")
  async inviteToRoom(
    @Req() req: Request,
    @Param("roomId") roomId: string,
    @Body() body: {
      inviteePlayerId?: string;
      roomCode?: string | null;
      roomMode?: string;
      stakeKey?: string;
      stakeAmount?: number;
      humanSeats?: number;
      totalPlayers?: number;
      isTeamMode?: boolean;
      note?: string;
      payloadJson?: unknown;
      expiresAt?: string | null;
    }
  ) {
    return this.socialService.inviteFriendToRoom(req.headers, roomId, body);
  }

  @Post("invitations/:id/accept")
  async acceptRoomInvitation(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.acceptRoomInvitation(req.headers, id);
  }

  @Post("invitations/:id/decline")
  async declineRoomInvitation(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.declineRoomInvitation(req.headers, id);
  }
}
