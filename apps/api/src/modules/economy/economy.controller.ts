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

  @Get("economy/cosmetics/table-skins")
  async listTableSkins(@Req() req: Request) {
    return this.economyService.listTableSkins(req.headers);
  }

  @Post("economy/cosmetics/table-skins/purchase")
  async purchaseTableSkin(@Req() req: Request, @Body() body: { key?: string | null }) {
    return this.economyService.purchaseTableSkin(req.headers, body?.key || "");
  }

  @Post("economy/cosmetics/table-skins/equip")
  async equipTableSkin(@Req() req: Request, @Body() body: { key?: string | null }) {
    return this.economyService.equipTableSkin(req.headers, body?.key || "");
  }

  @Get("economy/coin-shop/status")
  async getCoinShopStatus(@Req() req: Request) {
    return this.economyService.getCoinShopStatus(req.headers);
  }

  @Post("economy/coin-shop/video-reward")
  async claimCoinShopVideoReward(@Req() req: Request) {
    return this.economyService.claimCoinShopVideoReward(req.headers);
  }

  @Get("economy/me/wallet")
  async getWallet(@Req() req: Request) {
    return this.economyService.getWallet(req.headers);
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
    return this.economyService.reserveMatchStake(token, body || {});
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
    return this.economyService.settleMatchStake(token, body || {});
  }

  @Post("economy/solo/reserve")
  async reserveSoloMatchStake(
    @Headers("authorization") authorization: string | undefined,
    @Body()
    body: {
      matchId?: string | null;
      stakeKey?: string | null;
      difficulty?: string | null;
    }
  ) {
    const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    return this.economyService.reserveSoloMatchStake(token, body || {});
  }

  @Post("economy/solo/settle")
  async settleSoloMatchStake(
    @Headers("authorization") authorization: string | undefined,
    @Body()
    body: {
      matchId?: string | null;
      stakeKey?: string | null;
      result?: "win" | "draw" | "refund" | "loss" | string | null;
      difficulty?: string | null;
    }
  ) {
    const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    return this.economyService.settleSoloMatchStake(token, body || {});
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

  @Patch("admin/economy/config")
  async updateConfig(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.economyService.updateEconomyConfig(req.headers, body as never);
  }
}
