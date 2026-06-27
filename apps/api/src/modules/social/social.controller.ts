import { Body, Controller, Delete, Get, Param, Post, Query, Req, Sse } from "@nestjs/common";
import type { MessageEvent } from "@nestjs/common";
import type { Request } from "express";
import type { Observable } from "rxjs";

import { SocialService } from "./social.service.js";
import {
  SocialExchangeGiftDto,
  PlayInviteAttachRoomDto,
  PlayInviteJoinDto,
  PlayInviteDto,
  SocialSendGiftDto,
  SocialSendMessageDto,
  SocialReportPlayerDto,
  RoomInviteDto,
  SocialRequestFriendDto,
  RegisterFcmTokenDto,
  SocialFeedbackDto,
  UnregisterFcmTokenDto
} from "../validation/validation.dto.js";

@Controller("social")
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Sse("sse")
  sse(@Req() req: Request): Observable<MessageEvent> {
    return this.socialService.subscribeToSocialEvents(req.headers);
  }

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

  @Get("players/:id/moderation")
  async getPlayerModeration(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.getPlayerModeration(req.headers, id);
  }

  @Get("messages")
  async getMessageThreads(@Req() req: Request) {
    return this.socialService.getMessageThreads(req.headers);
  }

  @Get("inbox")
  async getInbox(@Req() req: Request, @Query("status") status?: string, @Query("limit") limit?: string) {
    return this.socialService.getInbox(req.headers, { status, limit });
  }

  @Get("summary")
  async getSummary(@Req() req: Request) {
    return this.socialService.getSocialSummary(req.headers);
  }

  @Post("friends/request")
  async requestFriend(@Req() req: Request, @Body() body: SocialRequestFriendDto) {
    return this.socialService.requestFriend(req.headers, body);
  }

  @Post("feedback")
  async submitFeedback(@Req() req: Request, @Body() body: SocialFeedbackDto) {
    return this.socialService.submitFeedback(req.headers, body);
  }

  @Post("reports")
  async reportPlayer(@Req() req: Request, @Body() body: SocialReportPlayerDto) {
    return this.socialService.reportPlayer(req.headers, body);
  }

  @Post("friends/:id/accept")
  async acceptFriend(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.acceptFriend(req.headers, id);
  }

  @Post("friends/:id/decline")
  async declineFriend(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.declineFriend(req.headers, id);
  }

  @Post("friends/:id/cancel")
  async cancelFriendRequest(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.cancelFriendRequest(req.headers, id);
  }

  @Post("friends/:id/remove")
  async removeFriend(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.removeFriend(req.headers, id);
  }

  @Post("players/:id/block")
  async blockPlayer(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.blockPlayer(req.headers, id);
  }

  @Delete("players/:id/block")
  async unblockPlayer(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.unblockPlayer(req.headers, id);
  }

  @Get("invitations")
  async getInvitations(@Req() req: Request) {
    return this.socialService.getRoomInvitations(req.headers);
  }

  @Get("play-invites")
  async getPlayInvites(@Req() req: Request) {
    return this.socialService.getPlayInvites(req.headers);
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

  @Post("inbox/:id/read")
  async markInboxRead(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.markInboxRead(req.headers, id);
  }

  @Post("inbox/:id/claim")
  async claimInboxMessage(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.claimInboxMessage(req.headers, id);
  }

  @Post("inbox/:id/delete")
  async deleteInboxMessage(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.deleteInboxMessage(req.headers, id);
  }

  @Get("messages/:playerId")
  async getMessages(
    @Req() req: Request,
    @Param("playerId") playerId: string,
    @Query("limit") limit?: string,
    @Query("before") before?: string,
    @Query("afterMessageId") afterMessageId?: string
  ) {
    return this.socialService.getDirectMessages(req.headers, playerId, { limit, before, afterMessageId });
  }

  @Post("messages/:playerId/read")
  async markDirectMessageThreadRead(@Req() req: Request, @Param("playerId") playerId: string) {
    return this.socialService.markDirectMessageThreadRead(req.headers, playerId);
  }

  @Post("messages/:playerId")
  async sendMessage(
    @Req() req: Request,
    @Param("playerId") playerId: string,
    @Body() body: SocialSendMessageDto
  ) {
    return this.socialService.sendDirectMessage(req.headers, playerId, body);
  }

  @Post("messages/:playerId/delete")
  async deleteMessageThread(@Req() req: Request, @Param("playerId") playerId: string) {
    return this.socialService.deleteMessageThread(req.headers, playerId);
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

  @Post("play-invites")
  async inviteToPlay(
    @Req() req: Request,
    @Body() body: PlayInviteDto
  ) {
    return this.socialService.createPlayInvite(req.headers, body);
  }

  @Post("play-invites/:id/accept")
  async acceptPlayInvite(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.acceptPlayInvite(req.headers, id);
  }

  @Post("play-invites/:id/decline")
  async declinePlayInvite(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.declinePlayInvite(req.headers, id);
  }

  @Post("play-invites/:id/cancel")
  async cancelPlayInvite(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.cancelPlayInvite(req.headers, id);
  }

  @Post("play-invites/attach-room")
  async attachPlayInviteRoom(@Req() req: Request, @Body() body: PlayInviteAttachRoomDto) {
    return this.socialService.attachPlayInviteRoom(req.headers, body);
  }

  @Post("play-invites/:id/joined")
  async markPlayInviteJoined(@Req() req: Request, @Param("id") id: string, @Body() body: PlayInviteJoinDto) {
    return this.socialService.markPlayInviteJoined(req.headers, id, body);
  }

  @Post("play-invites/:id/failed-to-join")
  async markPlayInviteFailedToJoin(@Req() req: Request, @Param("id") id: string, @Body() body: PlayInviteJoinDto) {
    return this.socialService.markPlayInviteFailedToJoin(req.headers, id, body);
  }

  @Post("invitations/:id/accept")
  async acceptRoomInvitation(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.acceptRoomInvitation(req.headers, id);
  }

  @Post("invitations/:id/decline")
  async declineRoomInvitation(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.declineRoomInvitation(req.headers, id);
  }

  @Post("invitations/:id/cancel")
  async cancelRoomInvitation(@Req() req: Request, @Param("id") id: string) {
    return this.socialService.cancelRoomInvitation(req.headers, id);
  }

  @Post("fcm/register")
  async registerFcmToken(@Req() req: Request, @Body() body: RegisterFcmTokenDto) {
    return this.socialService.registerFcmToken(req.headers, body);
  }

  @Post("fcm/unregister")
  async unregisterFcmToken(@Req() req: Request, @Body() body: UnregisterFcmTokenDto) {
    return this.socialService.unregisterFcmToken(req.headers, body);
  }
}
