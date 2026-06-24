import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";

import { AdminService } from "./admin.service.js";
import { AdminBanDto, AdminFeedbackResolveDto, AdminReportResolveDto } from "../validation/validation.dto.js";

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
    @Query("offset") offset?: string,
    @Query("scope") scope?: string,
    @Query("sort") sort?: string
  ) {
    return this.adminService.listPlayers(headers, query, limit, offset, scope, sort);
  }

  @Get("players/:id")
  async getPlayer(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string
  ) {
    return this.adminService.getPlayer(headers, id);
  }

  @Get("reports")
  async listReports(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query("status") status?: string,
    @Query("query") query?: string
  ) {
    return this.adminService.listReports(headers, status, query);
  }

  @Get("feedback")
  async listFeedback(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query("status") status?: string,
    @Query("query") query?: string
  ) {
    return this.adminService.listFeedback(headers, status, query);
  }

  @Get("bans")
  async listBans(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query("status") status?: string
  ) {
    return this.adminService.listBans(headers, status);
  }

  @Get("audit-logs")
  async listAuditLogs(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("action") action?: string,
    @Query("entityType") entityType?: string
  ) {
    return this.adminService.listAuditLogs(headers, limit, offset, action, entityType);
  }

  @Get("system-audit-logs")
  async listSystemAuditLogs(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("action") action?: string,
    @Query("entityType") entityType?: string
  ) {
    return this.adminService.listSystemAuditLogs(headers, limit, offset, action, entityType);
  }

  @Post("players/:id/ban")
  async banPlayer(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Body() body: AdminBanDto
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
    @Body() body: AdminReportResolveDto
  ) {
    return this.adminService.resolveReport(headers, id, body);
  }

  @Patch("feedback/:id")
  async resolveFeedback(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Body() body: AdminFeedbackResolveDto
  ) {
    return this.adminService.resolveFeedback(headers, id, body);
  }
}
