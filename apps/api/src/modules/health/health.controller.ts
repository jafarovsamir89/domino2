import { Controller, Get } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth() {
    const db = await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: "ok",
      service: "domino2-api",
      database: Array.isArray(db) ? "reachable" : "unknown"
    };
  }
}
