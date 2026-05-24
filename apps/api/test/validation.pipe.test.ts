import test from "node:test";
import assert from "node:assert/strict";

import { ValidationPipe } from "@nestjs/common";

import {
  EconomyReserveMatchDto,
  EconomySettleMatchDto,
  RealtimeHeartbeatDto,
  UpdateProfileNameDto
} from "../src/modules/validation/validation.dto.js";

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  transformOptions: {
    enableImplicitConversion: true
  }
});

test("ValidationPipe rejects unknown properties on DTO payloads", async () => {
  await assert.rejects(
    () => pipe.transform({ name: "Alpha", extra: "x" }, {
      type: "body",
      metatype: UpdateProfileNameDto,
      data: ""
    } as any),
    /Bad Request Exception/i
  );
});

test("ValidationPipe accepts a valid heartbeat DTO payload", async () => {
  const result = await pipe.transform({
    sessionId: "session-1",
    provider: "platform",
    displayName: "Alpha",
    roomId: "room-1",
    roomCode: "ABCD",
    gameMode: "solo",
    roomMode: "solo",
    stakeKey: "stake_200",
    stakeAmount: 200,
    humanSeats: 2,
    totalPlayers: 2,
    aiCount: 0,
    isTeamMode: false,
    isPlaying: true,
    isConnected: true,
    source: "client-local"
  }, {
    type: "body",
    metatype: RealtimeHeartbeatDto,
    data: ""
  } as any);

  assert.equal(result.sessionId, "session-1");
  assert.equal(result.provider, "platform");
});

test("ValidationPipe accepts signed economy reserve payload fields", async () => {
  const result = await pipe.transform({
    roomId: "room-1",
    roomCode: "ABCD",
    matchId: "match-1",
    stakeKey: "stake_200",
    integrityScope: "economy.reserve",
    proof: "signed-proof-value",
    participants: [
      {
        playerId: "player-1",
        userId: "user-1",
        displayName: "Alice",
        teamIndex: 0
      },
      {
        playerId: "player-2",
        userId: "user-2",
        displayName: "Bob",
        teamIndex: 1
      }
    ]
  }, {
    type: "body",
    metatype: EconomyReserveMatchDto,
    data: ""
  } as any);

  assert.equal(result.roomId, "room-1");
  assert.equal(result.integrityScope, "economy.reserve");
  assert.equal(result.proof, "signed-proof-value");
  assert.equal(result.participants?.[0]?.teamIndex, 0);
  assert.equal(result.participants?.[1]?.teamIndex, 1);
});

test("ValidationPipe accepts signed economy settle payload fields", async () => {
  const result = await pipe.transform({
    roomId: "room-1",
    roomCode: "ABCD",
    matchId: "match-1",
    stakeKey: "stake_200",
    integrityScope: "economy.settle",
    proof: "signed-proof-value",
    result: "win",
    winnerUserIds: ["user-1", "user-2"]
  }, {
    type: "body",
    metatype: EconomySettleMatchDto,
    data: ""
  } as any);

  assert.equal(result.roomId, "room-1");
  assert.equal(result.integrityScope, "economy.settle");
  assert.equal(result.proof, "signed-proof-value");
  assert.equal(result.result, "win");
  assert.deepEqual(result.winnerUserIds, ["user-1", "user-2"]);
});
