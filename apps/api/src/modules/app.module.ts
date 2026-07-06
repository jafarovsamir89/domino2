import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { SentryModule, SentryGlobalFilter } from "@sentry/nestjs/setup";

import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { EconomyModule } from "./economy/economy.module.js";
import { HealthModule } from "./health/health.module.js";
import { LeaderboardModule } from "./leaderboard/leaderboard.module.js";
import { MatchesModule } from "./matches/matches.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { SocialRealtimeModule } from "./social-realtime/social-realtime.module.js";
import { PlayersModule } from "./players/players.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { SocialModule } from "./social/social.module.js";

@Module({
  imports: [
    // Sentry must be registered first so it can instrument the other modules.
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    EconomyModule,
    PlayersModule,
    LeaderboardModule,
    MatchesModule,
    RealtimeModule,
    SocialRealtimeModule,
    SocialModule,
    AdminModule
  ],
  providers: [
    {
      // Captures unhandled exceptions thrown by controllers/handlers.
      provide: APP_FILTER,
      useClass: SentryGlobalFilter
    }
  ]
})
export class AppModule {}
