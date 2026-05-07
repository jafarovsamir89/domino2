import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { HealthModule } from "./health/health.module.js";
import { LeaderboardModule } from "./leaderboard/leaderboard.module.js";
import { MatchesModule } from "./matches/matches.module.js";
import { PlayersModule } from "./players/players.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    PlayersModule,
    LeaderboardModule,
    MatchesModule,
    AdminModule
  ]
})
export class AppModule {}
