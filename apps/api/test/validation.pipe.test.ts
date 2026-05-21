import test from "node:test";
import assert from "node:assert/strict";

import { ValidationPipe } from "@nestjs/common";

import { RealtimeHeartbeatDto, UpdateProfileNameDto } from "../src/modules/validation/validation.dto.js";

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
