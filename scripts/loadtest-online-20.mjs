import { Client } from "@colyseus/sdk";

const API_BASE = "https://apid.simplesoft.az/api";
const GAME_BASE = "https://gamed.simplesoft.az";
const PASSWORD = "Domino2-Test-Load-2026!";
const PLAYERS = 20;
const ROOMS = 10;
const TEST_PREFIX = "loadtest.domino2";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cookieHeaderFromSetCookies(setCookies = []) {
  return setCookies
    .map((line) => String(line || "").split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function platformRequest(path, { method = "GET", body = null, cookie = "" } = {}) {
  const headers = {
    "Content-Type": "application/json",
    "Origin": "https://gamed.simplesoft.az",
    "Referer": "https://gamed.simplesoft.az/"
  };
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  const setCookies = response.headers.getSetCookie?.() || [];
  return { ok: response.ok, status: response.status, data, setCookies };
}

async function registerOrLoginUser(index) {
  const email = `${TEST_PREFIX}+u${index}@gmail.com`;
  const name = `LoadUser${index}`;
  let cookie = "";

  const signUp = await platformRequest("/auth/sign-up/email", {
    method: "POST",
    body: {
      name,
      email,
      password: PASSWORD,
      callbackURL: "/dashboard",
      rememberMe: true
    }
  });

  if (signUp.ok) {
    cookie = cookieHeaderFromSetCookies(signUp.setCookies);
  } else {
    const signIn = await platformRequest("/auth/sign-in/email", {
      method: "POST",
      body: {
        email,
        password: PASSWORD,
        callbackURL: "/dashboard",
        rememberMe: true
      }
    });
    if (!signIn.ok) {
      throw new Error(`Auth failed for ${email}: ${signIn.status} ${JSON.stringify(signIn.data)}`);
    }
    cookie = cookieHeaderFromSetCookies(signIn.setCookies);
  }

  if (!cookie) {
    throw new Error(`No auth cookie for ${email}`);
  }

  const tokenRes = await platformRequest("/platform/game-token", {
    method: "GET",
    cookie
  });
  if (!tokenRes.ok || !tokenRes.data?.token) {
    throw new Error(`Game token failed for ${email}: ${tokenRes.status} ${JSON.stringify(tokenRes.data)}`);
  }

  return {
    index,
    email,
    name,
    authToken: tokenRes.data.token
  };
}

function createRoomOptions(player, roomVisibility = "closed") {
  return {
    name: player.name,
    authToken: player.authToken,
    playerCount: 2,
    aiCount: 0,
    isTeamMode: false,
    difficulty: "medium",
    roomVisibility,
    stakeKey: "free",
    instantWinEnabled: true,
    dlossThreshold: 255
  };
}

function attachAutoPilot(room) {
  let currentHand = [];
  let didSchedule = false;

  const safeSend = (type, payload = undefined) => {
    try {
      room.send(type, payload);
    } catch {
      // ignore transient close
    }
  };

  const noisyTypes = ["msg", "sound", "score_popup", "deal_end", "round_end", "room_state", "room_closed"];
  for (const type of noisyTypes) {
    room.onMessage(type, () => {});
  }

  room.onMessage("hand", (hand) => {
    currentHand = Array.isArray(hand) ? hand : [];
  });

  room.onMessage("turn_info", (info) => {
    if (didSchedule) return;
    didSchedule = true;
    setTimeout(() => {
      didSchedule = false;
      const validMoves = Array.isArray(info?.validMoves) ? info.validMoves : [];
      const goshaCombo = info?.goshaCombo;

      if (goshaCombo) {
        safeSend("gosha");
        return;
      }

      if (validMoves.length > 0) {
        const first = validMoves[0];
        const tileIndex = Number(first?.tileIndex ?? 0);
        const openEndIndex = Number(first?.openEndIndex ?? -1);
        safeSend("play", { tileIndex, openEndIndex });
        return;
      }

      if (currentHand.length > 0) {
        safeSend("draw");
        setTimeout(() => safeSend("pass"), 120);
        return;
      }

      safeSend("pass");
    }, 90);
  });
}

async function run() {
  const startedAt = Date.now();
  const metrics = {
    authOk: 0,
    roomsCreated: 0,
    joinsOk: 0,
    gameActiveRooms: 0,
    reconnectAttempts: 0,
    reconnectOk: 0,
    errors: []
  };
  let reported = false;

  const users = [];
  const roomPairs = [];
  const openRooms = [];
  const report = () => {
    if (reported) return;
    reported = true;
    const elapsedMs = Date.now() - startedAt;
    console.log("=== LOADTEST RESULT ===");
    console.log(JSON.stringify({
      elapsedMs,
      playersPlanned: PLAYERS,
      roomsPlanned: ROOMS,
      ...metrics
    }, null, 2));
    setTimeout(() => process.exit(0), 250);
  };
  const hardStop = setTimeout(() => {
    metrics.errors.push("hard_timeout_reached");
    report();
    process.exit(2);
  }, 240000);

  try {
    console.log(`[loadtest] auth bootstrap for ${PLAYERS} users...`);
    for (let i = 1; i <= PLAYERS; i++) {
      try {
        const user = await registerOrLoginUser(i);
        users.push(user);
        metrics.authOk += 1;
      } catch (error) {
        metrics.errors.push(`auth u${i}: ${error.message}`);
      }
      await sleep(80);
    }

    if (users.length < PLAYERS) {
      console.log("[loadtest] auth errors:", metrics.errors.slice(0, 10));
      throw new Error(`Not enough authenticated users: ${users.length}/${PLAYERS}`);
    }

    const client = new Client(GAME_BASE);
    console.log(`[loadtest] creating ${ROOMS} rooms and joining 2 players each...`);

    for (let r = 0; r < ROOMS; r++) {
      const p1 = users[r * 2];
      const p2 = users[r * 2 + 1];

      const host = await client.create("domino", createRoomOptions(p1, "closed"));
      metrics.roomsCreated += 1;

      const guest = await client.joinById(host.roomId, createRoomOptions(p2, "closed"));
      metrics.joinsOk += 1;

      attachAutoPilot(host);
      attachAutoPilot(guest);

      const roomCodeRes = await fetch(`${GAME_BASE}/room-code/${encodeURIComponent(host.roomId)}`)
        .then((r) => r.json())
        .catch(() => ({}));
      roomPairs.push({
        host,
        guest,
        p1,
        p2,
        roomId: host.roomId,
        roomCode: String(roomCodeRes?.roomCode || "").trim().toUpperCase()
      });
      openRooms.push(host, guest);
      await sleep(100);
    }

    console.log("[loadtest] waiting for room states to become active...");
    await sleep(3000);

    for (const pair of roomPairs) {
      try {
        const hostState = pair.host.state;
        if (hostState?.gameActive) {
          metrics.gameActiveRooms += 1;
        }
      } catch {
        // ignore
      }
    }

    console.log("[loadtest] reconnection probe: one player per room...");
    for (const pair of roomPairs) {
      const token = pair.host?.reconnectionToken || "";
      if (!token) {
        metrics.errors.push(`reconnect token missing room=${pair.roomId}`);
        continue;
      }
      metrics.reconnectAttempts += 1;
      try {
        pair.host.connection?.close(4001, "loadtest_disconnect");
        await sleep(120);
        const resumed = await client.reconnect(token);
        attachAutoPilot(resumed);
        pair.host = resumed;
        openRooms.push(resumed);
        metrics.reconnectOk += 1;
      } catch (error) {
        try {
          const restored = await client.joinById(pair.roomId, {
            ...createRoomOptions(pair.p1, "closed"),
            restoreRoomCode: pair.roomCode,
            restoreRoomId: pair.roomId,
            restoreSessionId: String(pair.host?.sessionId || "").trim(),
            restoreReconnectionToken: token
          });
          attachAutoPilot(restored);
          pair.host = restored;
          openRooms.push(restored);
          metrics.reconnectOk += 1;
        } catch (restoreError) {
          metrics.errors.push(`reconnect room=${pair.roomId}: ${error.message}; fallback=${restoreError.message}`);
        }
      }
      await sleep(80);
    }

    await sleep(1500);

    report();
  } finally {
    clearTimeout(hardStop);
    for (const room of openRooms) {
      try {
        await room.leave(true);
      } catch {
        // ignore
      }
    }
  }
}

run().catch((error) => {
  console.error("[loadtest] fatal:", error);
  process.exitCode = 1;
});
