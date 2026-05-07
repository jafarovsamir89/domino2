import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import { json, urlencoded } from "express";

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
  expressApp.all("/api/auth/*splat", toNodeHandler(auth));
  expressApp.use(json());
  expressApp.use(urlencoded({ extended: true }));

  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void
    ) {
      if (!origin || authConfig.trustedOriginSet.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true
  });
  app.setGlobalPrefix("api");
  await app.listen(process.env.API_PORT || 3000);
}

void bootstrap();
