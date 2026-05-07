import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { EconomyController } from "./economy.controller.js";
import { EconomyService } from "./economy.service.js";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [EconomyController],
  providers: [EconomyService],
  exports: [EconomyService]
})
export class EconomyModule {}
