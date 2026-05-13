import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import { json, urlencoded, type NextFunction, type Request, type Response } from "express";

import { AppModule } from "./modules/app.module.js";
import { getBetterAuthConfig } from "./modules/auth/better-auth.config.js";
import { auth } from "./modules/auth/auth.instance.js";

type RateBucket = {
  count: number;
  resetAt: number;
};

function createRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, RateBucket>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      next();
      return;
    }

    if (current.count >= limit) {
      res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    current.count += 1;
    next();
  };
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === "production";
  const redisUrl = String(process.env.REDIS_URI || "").trim();
  if (isProduction && !redisUrl && process.env.ALLOW_IN_MEMORY_PRESENCE !== "true") {
    throw new Error("REDIS_URI is required in production. Set ALLOW_IN_MEMORY_PRESENCE=true only for local/dev testing.");
  }

  const app = await NestFactory.create(AppModule, {
    bodyParser: false
  });
  const authConfig = getBetterAuthConfig();
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.set("trust proxy", 1);
  expressApp.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      service: "domino2-api",
      status: "ok",
      health: "/api/health",
      realtime: "/api/realtime/summary"
    });
  });
  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!origin || authConfig.trustedOriginSet.has(origin)) {
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin");
      }

      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }

      next();
      return;
    }

    next(new Error(`Origin ${origin} is not allowed by CORS`));
  });
  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    const method = String(req.method || "GET").toUpperCase();
    const isStateChanging = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (!isStateChanging) {
      next();
      return;
    }

    const origin = String(req.headers.origin || "").trim();
    const hasCookie = Boolean(String(req.headers.cookie || "").trim());
    const isAuthRoute = req.path.startsWith("/api/auth/");
    if ((hasCookie || isAuthRoute) && (!origin || !authConfig.trustedOriginSet.has(origin))) {
      res.status(403).json({ error: "Cross-site request rejected" });
      return;
    }

    next();
  });
  expressApp.use("/api/auth", createRateLimiter(30, 60_000));
  expressApp.use("/api", createRateLimiter(240, 60_000));
  expressApp.all("/api/auth/*splat", toNodeHandler(auth));
  expressApp.use(json({ limit: "2mb" }));
  expressApp.use(urlencoded({ extended: true, limit: "2mb" }));
  app.setGlobalPrefix("api");
  await app.listen(process.env.API_PORT || 3000);
}

void bootstrap();
