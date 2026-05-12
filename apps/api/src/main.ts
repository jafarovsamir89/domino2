import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import { json, urlencoded, type NextFunction, type Request, type Response } from "express";

import { AppModule } from "./modules/app.module.js";
import { getBetterAuthConfig } from "./modules/auth/better-auth.config.js";
import { auth } from "./modules/auth/auth.instance.js";

async function bootstrap() {
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
  expressApp.all("/api/auth/*splat", toNodeHandler(auth));
  expressApp.use(json());
  expressApp.use(urlencoded({ extended: true }));
  app.setGlobalPrefix("api");
  await app.listen(process.env.API_PORT || 3000);
}

void bootstrap();
