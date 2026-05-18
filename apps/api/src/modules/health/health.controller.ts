import { Controller, Get } from "@nestjs/common";
import RedisImport from "ioredis";

import { PrismaService } from "../prisma/prisma.service.js";

const Redis = RedisImport as any;
let redisClient: any = null;

async function probeRedis() {
  const redisUrl = String(process.env.REDIS_URI || "").trim();
  if (!redisUrl) {
    return { status: "not_configured" as const };
  }

  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      enableReadyCheck: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy(times: number) {
        return Math.min(times * 200, 1000);
      }
    });
  }

  try {
    if (redisClient.status !== "ready") {
      await redisClient.connect();
    }
    const pong = await redisClient.ping();
    return { status: pong === "PONG" ? "reachable" : "degraded" };
  } catch (error) {
    return {
      status: "unreachable",
      error: error instanceof Error ? error.message : "redis probe failed"
    } as const;
  }
}

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth() {
    const db = await this.prisma.$queryRaw`SELECT 1`;
    const redis = await probeRedis();

    return {
      status: "ok",
      service: "domino2-api",
      database: Array.isArray(db) ? "reachable" : "unknown",
      redis: redis.status
    };
  }
}
