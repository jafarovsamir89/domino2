import { Module } from "@nestjs/common";

import { EconomyModule } from "../economy/economy.module.js";
import { MatchesController } from "./matches.controller.js";
import { MatchesService } from "./matches.service.js";

@Module({
  imports: [EconomyModule],
  controllers: [MatchesController],
  providers: [MatchesService]
})
export class MatchesModule {}
