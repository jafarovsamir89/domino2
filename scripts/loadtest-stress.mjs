import { Client } from "@colyseus/sdk";

const API_BASE = "https://apid.simplesoft.az/api";
const GAME_BASE = "https://gamed.simplesoft.az";
const PASSWORD = "Domino2-Test-Load-2026!";
const PLAYERS = Number(process.env.PLAYERS || 40);
const ROOMS = Math.floor(PLAYERS / 2);
const TEST_PREFIX = "loadtest.domino2.stress";
const STAKE_KEY = "stake_50";
const HARD_TIMEOUT_MS = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cookieHeaderFromSetCookies(setCookies = []) {
  return setCookies
    .map((line) => String(line || "").split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
  const name = `LoadStressUser${index}`;
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

  const profile = tokenRes.data?.profile || {};
  return {
    index,
    email,
    name: String(profile.name || name),
    cookie,
    authToken: tokenRes.data.token
  };
}

async function getUserSnapshot(user) {
  const tokenRes = await platformRequest("/platform/game-token", {
    method: "GET",
    cookie: user.cookie
  });
  if (!tokenRes.ok || !tokenRes.data?.profile) {
    return null;
  }
  const profile = tokenRes.data.profile || {};
  return {
    userId: String(profile.userId || ""),
    name: String(profile.name || user.name),
    coins: safeNumber(profile.coins, 0),
    rating: safeNumber(profile.rating, 1000),
    wins: safeNumber(profile.wins, 0),
    losses: safeNumber(profile.losses, 0),
    draws: safeNumber(profile.draws, 0),
    matchesPlayed: safeNumber(profile.matchesPlayed, 0)
  };
}

function createRoomOptions(user, roomVisibility = "closed") {
  return {
    name: user.name,
    authToken: user.authToken,
    playerCount: 2,
    aiCount: 0,
    isTeamMode: false,
    difficulty: "medium",
    roomVisibility,
    stakeKey: STAKE_KEY,
    instantWinEnabled: true,
    dlossThreshold: 255
  };
}

function attachAutoPilot(room, roomStats, globalErrors) {
  let currentHand = [];
  let didSchedule = false;

  const safeSend = (type, payload = undefined) => {
    try {
      room.send(type, payload);
    } catch (error) {
      globalErrors.push(`send ${type} room=${room.roomId}: ${error.message}`);
    }
  };

  const silentTypes = ["msg", "sound", "score_popup", "room_state"];
  for (const type of silentTypes) {
    room.onMessage(type, () => {});
  }

  room.onMessage("room_closed", (payload) => {
    const reason = String(payload?.reason || "room_closed");
    roomStats.roomClosed = reason;
  });

  room.onMessage("deal_end", () => {
    roomStats.deals += 1;
  });

  room.onMessage("round_end", (data) => {
    roomStats.roundEnds += 1;
    if (data?.isMatchOver) {
      roomStats.matchOver = true;
    }
  });

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
        safeSend("play", {
          tileIndex: safeNumber(first?.tileIndex, 0),
          openEndIndex: safeNumber(first?.openEndIndex, -1)
        });
        return;
      }

      if (currentHand.length > 0) {
        safeSend("draw");
        setTimeout(() => safeSend("pass"), 100);
        return;
      }

      safeSend("pass");
    }, 80);
  });
}

async function run() {
  const startedAt = Date.now();
  const metrics = {
    authOk: 0,
    profilesBeforeOk: 0,
    roomsCreated: 0,
    joinsOk: 0,
    reconnectAttempts: 0,
    reconnectOk: 0,
    roundEndsObserved: 0,
    matchOverObserved: 0,
    roomClosedCount: 0,
    errors: []
  };

  let reported = false;
  const users = [];
  const roomPairs = [];
  const openRooms = [];
  const profileBefore = new Map();
  const profileAfter = new Map();

  const report = () => {
    if (reported) return;
    reported = true;
    const elapsedMs = Date.now() - startedAt;

    const economy = {
      increased: 0,
      decreased: 0,
      unchanged: 0
    };
    const rating = {
      increased: 0,
      decreased: 0,
      unchanged: 0
    };

    for (const user of users) {
      const before = profileBefore.get(user.email);
      const after = profileAfter.get(user.email);
      if (!before || !after) continue;
      const coinDelta = after.coins - before.coins;
      const ratingDelta = after.rating - before.rating;
      if (coinDelta > 0) economy.increased += 1;
      else if (coinDelta < 0) economy.decreased += 1;
      else economy.unchanged += 1;

      if (ratingDelta > 0) rating.increased += 1;
      else if (ratingDelta < 0) rating.decreased += 1;
      else rating.unchanged += 1;
    }

    const perRoom = roomPairs.map((pair) => ({
      roomId: pair.roomId,
      roomCode: pair.roomCode,
      deals: pair.stats.deals,
      roundEnds: pair.stats.roundEnds,
      matchOver: pair.stats.matchOver,
      roomClosed: pair.stats.roomClosed || null,
      reconnectOk: pair.stats.reconnectOk
    }));

    console.log("=== LOADTEST STRESS RESULT ===");
    console.log(JSON.stringify({
      elapsedMs,
      playersPlanned: PLAYERS,
      roomsPlanned: ROOMS,
      stakeKey: STAKE_KEY,
      metrics,
      economy,
      rating,
      perRoom
    }, null, 2));
  };

  const hardStop = setTimeout(() => {
    metrics.errors.push("hard_timeout_reached");
    report();
    process.exit(2);
  }, HARD_TIMEOUT_MS);

  try {
    console.log(`[stress-loadtest] auth bootstrap for ${PLAYERS} users...`);
    for (let i = 1; i <= PLAYERS; i++) {
      try {
        const user = await registerOrLoginUser(i);
        users.push(user);
        metrics.authOk += 1;
      } catch (error) {
        metrics.errors.push(`auth u${i}: ${error.message}`);
      }
      await sleep(2500); // Stagger auth requests to stay below the 30/min rate limit (24/min)
    }

    if (users.length < PLAYERS) {
      console.error("[stress-loadtest] Auth errors details:", metrics.errors);
      throw new Error(`Not enough authenticated users: ${users.length}/${PLAYERS}`);
    }

    for (const user of users) {
      const snap = await getUserSnapshot(user);
      if (snap) {
        profileBefore.set(user.email, snap);
        metrics.profilesBeforeOk += 1;
      } else {
        metrics.errors.push(`profile_before_missing ${user.email}`);
      }
      await sleep(15);
    }

    const client = new Client(GAME_BASE);
    console.log(`[stress-loadtest] creating ${ROOMS} stake rooms and joining 2 players each...`);

    for (let r = 0; r < ROOMS; r++) {
      const p1 = users[r * 2];
      const p2 = users[r * 2 + 1];
      const stats = {
        deals: 0,
        roundEnds: 0,
        matchOver: false,
        roomClosed: "",
        reconnectOk: false
      };

      try {
        const host = await client.create("domino", createRoomOptions(p1, "closed"));
        metrics.roomsCreated += 1;
        const guest = await client.joinById(host.roomId, createRoomOptions(p2, "closed"));
        metrics.joinsOk += 1;

        attachAutoPilot(host, stats, metrics.errors);
        attachAutoPilot(guest, stats, metrics.errors);

        const roomCodeRes = await fetch(`${GAME_BASE}/room-code/${encodeURIComponent(host.roomId)}`)
          .then((res) => res.json())
          .catch(() => ({}));

        roomPairs.push({
          host,
          guest,
          p1,
          p2,
          roomId: host.roomId,
          roomCode: String(roomCodeRes?.roomCode || "").trim().toUpperCase(),
          stats
        });
        openRooms.push(host, guest);
      } catch (err) {
        metrics.errors.push(`room_create_or_join r${r}: ${err.message}`);
      }
      await sleep(50); // Stagger joins to simulate natural load arrival
    }

    // Play for 3 minutes to evaluate stability and resource utilization
    console.log(`[stress-loadtest] active gameplay in progress for ${ROOMS} rooms...`);
    const playUntil = Date.now() + (3 * 60 * 1000);
    while (Date.now() < playUntil) {
      let allResolved = true;
      for (const pair of roomPairs) {
        if (pair.stats.roomClosed || pair.stats.matchOver) continue;
        allResolved = false;
      }
      if (allResolved) break;
      await sleep(2000);
    }

    for (const pair of roomPairs) {
      metrics.roundEndsObserved += pair.stats.roundEnds;
      if (pair.stats.matchOver) metrics.matchOverObserved += 1;
      if (pair.stats.roomClosed) metrics.roomClosedCount += 1;
    }

    for (const user of users) {
      const snap = await getUserSnapshot(user);
      if (snap) {
        profileAfter.set(user.email, snap);
      } else {
        metrics.errors.push(`profile_after_missing ${user.email}`);
      }
      await sleep(15);
    }

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
  console.error("[stress-loadtest] fatal:", error);
  process.exitCode = 1;
});
