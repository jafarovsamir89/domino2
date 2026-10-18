import test from "node:test";
import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";

const { createGameToken } = await import("../src/modules/auth/game-token.js");
const { RealtimeController } = await import("../src/modules/realtime/realtime.controller.js");

test("RealtimeController heartbeat rejects requests without a valid auth token", async () => {
  const controller = new RealtimeController({
    heartbeat: async () => ({ ok: true })
  } as any);

  await assert.rejects(
    () => controller.heartbeat(undefined, {
      sessionId: "session-1",
      provider: "platform",
      displayName: "Alpha",
      roomId: "room-1",
      gameMode: "solo",
      isPlaying: true,
      isConnected: true,
      source: "client-local"
    }),
    /Login required/
  );
});

test("RealtimeController heartbeat accepts a valid auth token", async () => {
  const controller = new RealtimeController({
    heartbeat: async (payload: any) => payload
  } as any);
  const token = createGameToken({
    userId: "user-1",
    playerId: "player-1",
    displayName: "Alpha",
    role: "player",
    sessionId: "session-auth",
    provider: "better-auth",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  });

  const result = await controller.heartbeat(`Bearer ${token}`, {
    sessionId: "session-1",
    provider: "platform",
    displayName: "Alpha",
    roomId: "room-1",
    gameMode: "solo",
    isPlaying: true,
    isConnected: true,
    source: "client-local"
  });

  assert.ok(result.item);
  assert.equal(result.item?.sessionId, "session-1");
});

test("public session status does not expose private identifiers",async()=>{
 const controller=new RealtimeController({getSession:async()=>({sessionId:"secret-session",roomCode:"SECRET",roomId:"secret-room",displayName:"Synthetic",isConnected:true,isPlaying:true})} as any);
 const response=await controller.getSession("secret-session");
 assert.deepEqual(response,{item:{displayName:"Synthetic",isConnected:true,isPlaying:true}});
});

test("platform public summary contains no private room or session identifiers",async()=>{
 const {RealtimeService}=await import("../src/modules/realtime/realtime.service.js");
 const service=new RealtimeService();
 await service.heartbeat({sessionId:"private-summary-test",displayName:"Synthetic",roomId:"private-room",roomCode:"SECRET",provider:"platform",isConnected:true,isPlaying:true});
 try{const summary=await service.summary();const serialized=JSON.stringify(summary);assert(!serialized.includes("private-summary-test"));assert(!serialized.includes("private-room"));assert(!serialized.includes("SECRET"));assert(summary.players.some(p=>p.displayName==="Synthetic"));}finally{service.clear("private-summary-test");}
});
