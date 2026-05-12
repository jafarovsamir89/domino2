const API_BASE = "https://apid.simplesoft.az/api";
const PASSWORD = "Domino2-Test-Load-2026!";
const PLAYERS = 20;
const ROOMS = 10;
const TEST_PREFIX = "loadtest.domino2.ecr";
const STAKE_KEY = "stake_50";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cookieHeaderFromSetCookies(setCookies = []) {
  return setCookies
    .map((line) => String(line || "").split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function platformRequest(path, { method = "GET", body = null, cookie = "", token = "" } = {}) {
  const headers = {
    "Content-Type": "application/json",
    "Origin": "https://gamed.simplesoft.az",
    "Referer": "https://gamed.simplesoft.az/"
  };
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  const setCookies = response.headers.getSetCookie?.() || [];
  return { ok: response.ok, status: response.status, data, setCookies };
}

async function registerOrLogin(index) {
  const email = `${TEST_PREFIX}+u${index}@gmail.com`;
  const name = `LoadECRUser${index}`;

  let cookie = "";
  const signUp = await platformRequest("/auth/sign-up/email", {
    method: "POST",
    body: { name, email, password: PASSWORD, callbackURL: "/dashboard", rememberMe: true }
  });

  if (signUp.ok) {
    cookie = cookieHeaderFromSetCookies(signUp.setCookies);
  } else {
    const signIn = await platformRequest("/auth/sign-in/email", {
      method: "POST",
      body: { email, password: PASSWORD, callbackURL: "/dashboard", rememberMe: true }
    });
    if (!signIn.ok) throw new Error(`auth ${email}: ${signIn.status} ${JSON.stringify(signIn.data)}`);
    cookie = cookieHeaderFromSetCookies(signIn.setCookies);
  }

  const tokenRes = await platformRequest("/platform/game-token", { method: "GET", cookie });
  if (!tokenRes.ok || !tokenRes.data?.token) {
    throw new Error(`token ${email}: ${tokenRes.status} ${JSON.stringify(tokenRes.data)}`);
  }
  const p = tokenRes.data.profile || {};
  return {
    email,
    cookie,
    token: tokenRes.data.token,
    userId: String(p.userId || ""),
    playerId: String(p.playerId || ""),
    name: String(p.name || name)
  };
}

async function getSnapshot(user) {
  const res = await platformRequest("/platform/game-token", { method: "GET", cookie: user.cookie });
  if (!res.ok || !res.data?.profile) return null;
  const p = res.data.profile;
  return {
    coins: toNum(p.coins),
    rating: toNum(p.rating, 1000),
    wins: toNum(p.wins),
    losses: toNum(p.losses),
    draws: toNum(p.draws),
    matchesPlayed: toNum(p.matchesPlayed)
  };
}

async function run() {
  const startedAt = Date.now();
  const users = [];
  const metrics = {
    authOk: 0,
    reserveOk: 0,
    reserveFail: 0,
    matchRecordOk: 0,
    matchRecordFail: 0,
    errors: []
  };

  console.log(`[ecr] auth for ${PLAYERS} players...`);
  for (let i = 1; i <= PLAYERS; i++) {
    try {
      users.push(await registerOrLogin(i));
      metrics.authOk += 1;
    } catch (error) {
      metrics.errors.push(String(error?.message || error));
    }
    await sleep(50);
  }
  if (users.length < PLAYERS) {
    throw new Error(`auth incomplete ${users.length}/${PLAYERS}`);
  }

  const before = new Map();
  for (const user of users) {
    const snap = await getSnapshot(user);
    if (!snap) metrics.errors.push(`snapshot_before_missing ${user.email}`);
    else before.set(user.email, snap);
    await sleep(20);
  }

  console.log("[ecr] running 10 synthetic 1v1 matches with stake settlement...");
  const roomResults = [];
  for (let r = 0; r < ROOMS; r++) {
    const a = users[r * 2];
    const b = users[r * 2 + 1];
    const roomId = `ecr-room-${Date.now()}-${r}`;
    const winner = r % 2 === 0 ? a : b;
    const loser = winner === a ? b : a;

    const participants = [
      { userId: a.userId, playerId: a.playerId, displayName: a.name },
      { userId: b.userId, playerId: b.playerId, displayName: b.name }
    ];

    const reserve = await platformRequest("/economy/matches/reserve", {
      method: "POST",
      token: a.token,
      body: { roomId, matchId: `ecr-${r}`, stakeKey: STAKE_KEY, participants }
    });
    if (reserve.ok && reserve.data?.ok) metrics.reserveOk += 1;
    else {
      metrics.reserveFail += 1;
      metrics.errors.push(`reserve r${r}: ${reserve.status} ${JSON.stringify(reserve.data)}`);
    }

    const matchBody = {
      mode: "online",
      isTeamMode: false,
      roomId,
      stakeKey: STAKE_KEY,
      winnerKey: `player:${winner.userId}`,
      participants: [
        {
          userId: a.userId,
          name: a.name,
          winnerKey: `player:${winner.userId}`,
          points: winner === a ? 55 : 20,
          roundWins: winner === a ? 2 : 0,
          result: winner === a ? "win" : "loss",
          isBot: false
        },
        {
          userId: b.userId,
          name: b.name,
          winnerKey: `player:${winner.userId}`,
          points: winner === b ? 55 : 20,
          roundWins: winner === b ? 2 : 0,
          result: winner === b ? "win" : "loss",
          isBot: false
        }
      ]
    };

    const record = await platformRequest("/platform/matches", {
      method: "POST",
      token: a.token,
      body: matchBody
    });

    if (record.ok && record.data?.matchId) {
      metrics.matchRecordOk += 1;
    } else {
      metrics.matchRecordFail += 1;
      metrics.errors.push(`match r${r}: ${record.status} ${JSON.stringify(record.data)}`);
    }

    roomResults.push({
      roomId,
      winner: winner.email,
      loser: loser.email,
      reserveOk: Boolean(reserve.ok && reserve.data?.ok),
      matchOk: Boolean(record.ok && record.data?.matchId),
      economy: record.data?.economy || null
    });
    await sleep(120);
  }

  const after = new Map();
  for (const user of users) {
    const snap = await getSnapshot(user);
    if (!snap) metrics.errors.push(`snapshot_after_missing ${user.email}`);
    else after.set(user.email, snap);
    await sleep(20);
  }

  const economyDelta = { increased: 0, decreased: 0, unchanged: 0 };
  const ratingDelta = { increased: 0, decreased: 0, unchanged: 0 };
  const perUser = [];

  for (const user of users) {
    const b = before.get(user.email);
    const a = after.get(user.email);
    if (!b || !a) continue;
    const dc = a.coins - b.coins;
    const dr = a.rating - b.rating;
    if (dc > 0) economyDelta.increased += 1;
    else if (dc < 0) economyDelta.decreased += 1;
    else economyDelta.unchanged += 1;

    if (dr > 0) ratingDelta.increased += 1;
    else if (dr < 0) ratingDelta.decreased += 1;
    else ratingDelta.unchanged += 1;

    perUser.push({
      email: user.email,
      coinsBefore: b.coins,
      coinsAfter: a.coins,
      coinsDelta: dc,
      ratingBefore: b.rating,
      ratingAfter: a.rating,
      ratingDelta: dr,
      matchesBefore: b.matchesPlayed,
      matchesAfter: a.matchesPlayed
    });
  }

  const elapsedMs = Date.now() - startedAt;
  console.log("=== ECR LOADTEST RESULT ===");
  console.log(JSON.stringify({
    elapsedMs,
    stakeKey: STAKE_KEY,
    metrics,
    economyDelta,
    ratingDelta,
    roomResults,
    perUser
  }, null, 2));
}

run().catch((error) => {
  console.error("[ecr] fatal:", error);
  process.exitCode = 1;
});
