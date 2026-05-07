import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";

import { AdminService } from "./admin.service.js";

@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("overview")
  async getOverview(@Headers() headers: Record<string, string | string[] | undefined>) {
    return this.adminService.getOverview(headers);
  }

  @Get("players")
  async listPlayers(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query("query") query?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.adminService.listPlayers(headers, query, limit, offset);
  }

  @Get("players/:id")
  async getPlayer(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string
  ) {
    return this.adminService.getPlayer(headers, id);
  }

  @Get("reports")
  async listReports(@Headers() headers: Record<string, string | string[] | undefined>) {
    return this.adminService.listReports(headers);
  }

  @Get("bans")
  async listBans(@Headers() headers: Record<string, string | string[] | undefined>) {
    return this.adminService.listBans(headers);
  }

  @Get("audit-logs")
  async listAuditLogs(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.adminService.listAuditLogs(headers, limit, offset);
  }

  @Post("players/:id/ban")
  async banPlayer(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Body() body: { reason?: string; expiresAt?: string | null }
  ) {
    return this.adminService.banPlayer(headers, id, body);
  }

  @Patch("bans/:id/revoke")
  async revokeBan(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string
  ) {
    return this.adminService.revokeBan(headers, id);
  }

  @Patch("reports/:id")
  async resolveReport(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Body() body: { status?: "resolved" | "rejected" }
  ) {
    return this.adminService.resolveReport(headers, id, body);
  }
}
