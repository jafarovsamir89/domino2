import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { EconomyModule } from "./economy/economy.module.js";
import { HealthModule } from "./health/health.module.js";
import { LeaderboardModule } from "./leaderboard/leaderboard.module.js";
import { MatchesModule } from "./matches/matches.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { PlayersModule } from "./players/players.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { SocialModule } from "./social/social.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    EconomyModule,
    PlayersModule,
    LeaderboardModule,
    MatchesModule,
    RealtimeModule,
    SocialModule,
    AdminModule
  ]
})
export class AppModule {}
