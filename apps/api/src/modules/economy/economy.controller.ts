import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import { EconomyService } from "./economy.service.js";

@Controller()
export class EconomyController {
  constructor(private readonly economyService: EconomyService) {}

  @Get("economy/config")
  async getPublicConfig() {
    return this.economyService.getPublicConfig();
  }

  @Get("economy/stakes")
  async listPublicStakes() {
    return this.economyService.listPublicStakes();
  }

  @Get("economy/quests")
  async listPublicQuests(@Req() req: Request) {
    return this.economyService.listPublicQuests(req.headers);
  }

  @Get("economy/me/wallet")
  async getWallet(@Req() req: Request) {
    return this.economyService.getWallet(req.headers);
  }

  @Post("economy/me/daily/claim")
  async claimDailyBonus(@Req() req: Request) {
    return this.economyService.claimDailyBonus(req.headers);
  }

  @Post("economy/me/quests/:key/advance")
  async advanceQuest(
    @Req() req: Request,
    @Param("key") key: string,
    @Body() body: { amount?: number }
  ) {
    return this.economyService.advanceQuest(req.headers, key, body.amount ?? 1);
  }

  @Post("economy/me/quests/:key/claim")
  async claimQuestReward(@Req() req: Request, @Param("key") key: string) {
    return this.economyService.claimQuestReward(req.headers, key);
  }

  @Post("economy/me/shop/purchase/:productKey")
  async purchaseCosmetic(
    @Req() req: Request,
    @Param("productKey") productKey: string,
    @Body() body: { quantity?: number }
  ) {
    return this.economyService.purchaseCosmetic(req.headers, productKey, body.quantity ?? 1);
  }

  @Post("economy/matches/reserve")
  async reserveMatchStake(
    @Headers("authorization") authorization: string | undefined,
    @Body()
    body: {
      roomId?: string | null;
      roomCode?: string | null;
      matchId?: string | null;
      stakeKey?: string | null;
      participants?: Array<{ playerId?: string; userId?: string; displayName?: string }>;
    }
  ) {
    const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    return this.economyService.reserveMatchStake(token, body);
  }

  @Post("economy/matches/settle")
  async settleMatchStake(
    @Headers("authorization") authorization: string | undefined,
    @Body()
    body: {
      roomId?: string | null;
      roomCode?: string | null;
      matchId?: string | null;
      stakeKey?: string | null;
      result?: "win" | "draw" | "refund" | string | null;
      winnerPlayerIds?: string[];
      winnerUserIds?: string[];
      participants?: Array<{ playerId?: string; userId?: string; displayName?: string }>;
    }
  ) {
    const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    return this.economyService.settleMatchStake(token, body);
  }

  @Get("admin/economy/overview")
  async getAdminOverview(@Req() req: Request) {
    return this.economyService.getAdminOverview(req.headers);
  }

  @Get("admin/economy/wallets")
  async listAdminWallets(
    @Req() req: Request,
    @Query("query") query?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.economyService.listAdminWallets(req.headers, query, limit, offset);
  }

  @Get("admin/economy/wallets/:playerId")
  async getAdminWallet(@Req() req: Request, @Param("playerId") playerId: string) {
    return this.economyService.getAdminWallet(req.headers, playerId);
  }

  @Post("admin/economy/wallets/:playerId/grant")
  async grantCoins(
    @Req() req: Request,
    @Param("playerId") playerId: string,
    @Body() body: { amount?: number; reason?: string; note?: string | null; idempotencyKey?: string | null }
  ) {
    return this.economyService.grantCoins(req.headers, playerId, body);
  }

  @Post("admin/economy/wallets/:playerId/spend")
  async spendCoins(
    @Req() req: Request,
    @Param("playerId") playerId: string,
    @Body() body: { amount?: number; reason?: string; note?: string | null; idempotencyKey?: string | null }
  ) {
    return this.economyService.spendCoins(req.headers, playerId, body);
  }

  @Get("admin/economy/stakes")
  async listAdminStakes(@Req() req: Request) {
    return this.economyService.getMatchStakeOverview(req.headers);
  }

  @Post("admin/economy/stakes")
  async createStake(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.economyService.upsertStakeTable(req.headers, body as never);
  }

  @Patch("admin/economy/stakes/:id")
  async updateStake(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.economyService.upsertStakeTable(req.headers, { ...(body as Record<string, unknown>), id } as never);
  }

  @Get("admin/economy/quests")
  async listAdminQuests(@Req() req: Request) {
    return this.economyService.listAdminQuests(req.headers);
  }

  @Post("admin/economy/quests")
  async createQuest(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.economyService.upsertQuest(req.headers, body as never);
  }

  @Patch("admin/economy/quests/:id")
  async updateQuest(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.economyService.upsertQuest(req.headers, { ...(body as Record<string, unknown>), id } as never);
  }

  @Get("admin/economy/catalog")
  async listCatalog(@Req() req: Request) {
    return this.economyService.listCatalog(req.headers);
  }

  @Post("admin/economy/catalog")
  async createCatalog(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.economyService.upsertCatalog(req.headers, body as never);
  }

  @Patch("admin/economy/catalog/:id")
  async updateCatalog(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.economyService.upsertCatalog(req.headers, { ...(body as Record<string, unknown>), id } as never);
  }

  @Patch("admin/economy/config")
  async updateConfig(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.economyService.updateEconomyConfig(req.headers, body as never);
  }

  @Post("admin/economy/tournaments")
  async createTournament(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.economyService.upsertTournament(req.headers, body as never);
  }

  @Get("admin/economy/tournaments")
  async listTournaments(@Req() req: Request) {
    return this.economyService.listAdminTournaments(req.headers);
  }

  @Patch("admin/economy/tournaments/:id")
  async updateTournament(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.economyService.upsertTournament(req.headers, { ...(body as Record<string, unknown>), id } as never);
  }
}
