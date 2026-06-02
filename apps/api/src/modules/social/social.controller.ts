import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import { SocialService } from "./social.service.js";
import {
  SocialExchangeGiftDto,
  SocialSendGiftDto,
  SocialSendMessageDto,
  RoomInviteDto,
  SocialRequestFriendDto
} from "../validation/validation.dto.js";

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

  @Get("players/:id/profile")
  async getPlayerProfile(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.getPlayerProfile(req.headers, id);
  }

  @Get("messages")
  async getMessageThreads(@Req() req: Request) {
    return this.socialService.getMessageThreads(req.headers);
  }

  @Post("friends/request")
  async requestFriend(@Req() req: Request, @Body() body: SocialRequestFriendDto) {
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

  @Get("gifts/catalog")
  async getGiftCatalog(@Req() req: Request) {
    return this.socialService.getGiftCatalog(req.headers);
  }

  @Get("gifts/inventory")
  async getGiftInventory(@Req() req: Request) {
    return this.socialService.getGiftInventory(req.headers);
  }

  @Get("gifts/history")
  async getGiftHistory(@Req() req: Request) {
    return this.socialService.getGiftHistory(req.headers);
  }

  @Post("gifts/send")
  async sendGift(
    @Req() req: Request,
    @Body() body: SocialSendGiftDto
  ) {
    return this.socialService.sendGift(req.headers, body);
  }

  @Get("messages/:playerId")
  async getMessages(@Req() req: Request, @Param("playerId") playerId: string) {
    return this.socialService.getDirectMessages(req.headers, playerId);
  }

  @Post("messages/:playerId")
  async sendMessage(
    @Req() req: Request,
    @Param("playerId") playerId: string,
    @Body() body: SocialSendMessageDto
  ) {
    return this.socialService.sendDirectMessage(req.headers, playerId, body);
  }

  @Post("gifts/exchange")
  async exchangeGift(
    @Req() req: Request,
    @Body() body: SocialExchangeGiftDto
  ) {
    return this.socialService.exchangeGift(req.headers, body);
  }

  @Post("rooms/:roomId/invite")
  async inviteToRoom(
    @Req() req: Request,
    @Param("roomId") roomId: string,
    @Body() body: RoomInviteDto
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
