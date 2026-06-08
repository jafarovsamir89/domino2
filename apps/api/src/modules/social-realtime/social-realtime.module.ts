import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { SocialModule } from "../social/social.module.js";
import { SocialRealtimeGateway } from "./social-realtime.gateway.js";
import { SocialRealtimeService } from "./social-realtime.service.js";

@Module({
  imports: [AuthModule, PrismaModule, SocialModule],
  providers: [SocialRealtimeGateway, SocialRealtimeService],
  exports: [SocialRealtimeService]
})
export class SocialRealtimeModule {}
