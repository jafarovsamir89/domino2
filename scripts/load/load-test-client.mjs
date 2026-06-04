import { Client } from "@colyseus/sdk";
import WebSocket from "ws";
import crypto from "node:crypto";

// Ensure WebSocket is available globally for colyseus.js in Node
globalThis.WebSocket = WebSocket;

// Simple helper to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function base64UrlEncode(value) {
    return Buffer.from(value, "utf8").toString("base64url");
}

function signPayload(payload, secret) {
    return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Generate a JWT-like game token locally. Used only in dev/local environments.
 */
export function generateLocalToken(username) {
    const secret = process.env.BETTER_AUTH_SECRET || "domino-dev-secret";
    const userId = `usr_${username}`;
    const playerId = `plr_${username}`;
    const displayName = username;
    
    const claims = {
        userId,
        playerId,
        displayName,
        role: "player",
        sessionId: `sess_${username}_${Date.now()}`,
        provider: "better-auth",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 1000 * 60 * 60 * 24
    };
    
    const payload = base64UrlEncode(JSON.stringify(claims));
    const signature = signPayload(payload, secret);
    const token = `${payload}.${signature}`;
    
    return {
        token,
        profile: {
            user: { id: userId, email: `${username}@domino.local`, name: displayName, role: "player" },
            player: { id: playerId, displayName },
            stats: { rating: 1000 },
            wallet: { balance: 10000, reserved: 0 },
            coins: 10000
        }
    };
}

/**
 * Direct DB seed helper. Allowed only when LOAD_TEST_SEED_ENABLED=true.
 */
export async function seedUserInDb(username, config) {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required to seed database.");
    }
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    
    const userId = `usr_${username}`;
    const playerId = `plr_${username}`;
    const displayName = username;
    const email = `${username}@domino.local`;
    
    try {
        // Upsert User
        await prisma.user.upsert({
            where: { id: userId },
            update: { name: displayName },
            create: {
                id: userId,
                name: displayName,
                email,
                emailVerified: true,
                role: "player"
            }
        });
        
        // Upsert Player
        await prisma.player.upsert({
            where: { id: playerId },
            update: { displayName },
            create: {
                id: playerId,
                userId,
                displayName,
                isGuest: false
            }
        });
        
        // Upsert Stats
        await prisma.playerStats.upsert({
            where: { playerId },
            update: {},
            create: {
                playerId
            }
        });
        
        // Upsert Wallet with 10,000 coins
        const coins = 10000;
        await prisma.coinWallet.upsert({
            where: { playerId },
            update: {
                balance: coins,
                reserved: 0
            },
            create: {
                playerId,
                balance: coins,
                reserved: 0,
                lifetimeEarned: coins
            }
        });
        
        // Add a ledger entry
        await prisma.coinLedgerEntry.upsert({
            where: { idempotencyKey: `loadtest-seed:${playerId}` },
            update: {
                balanceBefore: 0,
                balanceAfter: coins,
                amount: coins
            },
            create: {
                playerId,
                type: "grant",
                amount: coins,
                balanceBefore: 0,
                balanceAfter: coins,
                reservedBefore: 0,
                reservedAfter: 0,
                referenceType: "load_test_seed",
                referenceId: username,
                idempotencyKey: `loadtest-seed:${playerId}`,
                note: "load_test_seed"
            }
        });
    } finally {
        await prisma.$disconnect();
    }
}

/**
 * Capture player profile details via DB or API.
 */
export async function getPlayerProfileSnapshot(username, cookies, config) {
    // If DB is local/accessible, read DB directly
    if (process.env.DATABASE_URL && config.isDatabaseLocal) {
        const { PrismaClient } = await import("@prisma/client");
        const prisma = new PrismaClient();
        const playerId = `plr_${username}`;
        try {
            const player = await prisma.player.findUnique({
                where: { id: playerId },
                include: { stats: true, wallet: true }
            });
            if (player) {
                return {
                    rating: player.stats?.rating ?? 1000,
                    matchesPlayed: player.stats?.matchesPlayed ?? 0,
                    wins: player.stats?.wins ?? 0,
                    losses: player.stats?.losses ?? 0,
                    coins: player.wallet?.balance ?? 0,
                    reservedCoins: player.wallet?.reserved ?? 0
                };
            }
        } catch (e) {
            // Log warning but fallback to mock/API
            console.warn(`[LOAD_TEST] DB read failed for ${username}: ${e.message}`);
        } finally {
            await prisma.$disconnect();
        }
    }

    // Fallback: Query HTTP /api/me using session cookies
    if (cookies && cookies.length > 0) {
        try {
            const origin = new URL(config.baseUrl).origin;
            const res = await fetch(`${config.baseUrl}/api/me`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Cookie": cookies.join("; "),
                    "Origin": origin,
                    "Referer": origin + "/"
                }
            });
            if (res.ok) {
                const data = await res.json();
                return {
                    rating: data.stats?.rating ?? 1000,
                    matchesPlayed: data.stats?.matchesPlayed ?? 0,
                    wins: data.stats?.wins ?? 0,
                    losses: data.stats?.losses ?? 0,
                    coins: data.coins ?? data.wallet?.balance ?? 0,
                    reservedCoins: data.wallet?.reservedBalance ?? data.wallet?.reserved ?? 0
                };
            }
        } catch (e) {
            console.warn(`[LOAD_TEST] HTTP /api/me failed for ${username}: ${e.message}`);
        }
    }

    // Default mock data if unavailable
    return {
        rating: 1000,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        coins: 10000,
        reservedCoins: 0
    };
}

/**
 * Clean up database records starting with loadtest_. Allowed only on local database.
 */
export async function cleanupDatabase(config) {
    if (!config.seedEnabled || !process.env.DATABASE_URL || !config.isDatabaseLocal) {
        return "cleanup skipped: no safe delete path";
    }
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
        // Delete players first (due to onDelete relations)
        const playersDeleted = await prisma.player.deleteMany({
            where: {
                displayName: {
                    startsWith: "loadtest_"
                }
            }
        });
        const usersDeleted = await prisma.user.deleteMany({
            where: {
                email: {
                    startsWith: "loadtest_"
                }
            }
        });
        return `cleanup completed: deleted ${playersDeleted.count} players and ${usersDeleted.count} users`;
    } catch (e) {
        console.error(`[LOAD_TEST] DB cleanup failed: ${e.message}`);
        return "cleanup failed: error during database delete";
    } finally {
        await prisma.$disconnect();
    }
}

/**
 * Standard HTTP signup/login flow
 */
export async function authenticateViaHttp(username, config) {
    const email = `${username}@domino.local`;
    const password = process.env.LOAD_TEST_USER_PASSWORD || "loadtestpassword123";
    const displayName = username;
    
    let cookies = [];
    const origin = new URL(config.baseUrl).origin;
    
    // Attempt sign-in first
    const t0 = Date.now();
    let response = await fetch(`${config.baseUrl}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Origin": origin,
            "Referer": origin + "/"
        },
        body: JSON.stringify({ email, password, rememberMe: true })
    });
    
    if (!response.ok) {
        // If sign-in fails, attempt sign-up
        response = await fetch(`${config.baseUrl}/api/auth/sign-up/email`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Origin": origin,
                "Referer": origin + "/"
            },
            body: JSON.stringify({ name: displayName, email, password, callbackURL: "/dashboard", rememberMe: true })
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`HTTP Authentication failed for user ${username}: ${body}`);
        }
    }
    
    const latencyAuth = Date.now() - t0;
    
    // Extract cookies
    const setCookieHeaders = response.headers.getSetCookie 
        ? response.headers.getSetCookie() 
        : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")] : []);
        
    cookies = setCookieHeaders.map(c => c.split(";")[0]);
    
    // Now call platform/game-token to fetch game token
    const t1 = Date.now();
    const tokenResponse = await fetch(`${config.baseUrl}/api/platform/game-token`, {
        method: "GET",
        headers: {
            "Cookie": cookies.join("; "),
            "Origin": origin,
            "Referer": origin + "/"
        }
    });
    
    if (!tokenResponse.ok) {
        throw new Error(`Failed to fetch game token for ${username}: ${await tokenResponse.text()}`);
    }
    
    const latencyToken = Date.now() - t1;
    const data = await tokenResponse.json();
    
    return {
        token: data.token,
        profile: data.profile || data,
        cookies,
        latencies: {
            auth: latencyAuth,
            token: latencyToken
        }
    };
}

export class LoadTestClient {
    constructor(username, config, reporter) {
        this.username = username;
        this.config = config;
        this.reporter = reporter;
        this.client = null;
        this.room = null;
        
        this.token = null;
        this.profile = null;
        this.cookies = [];
        
        this.completedDeals = 0;
        this.completedMatches = 0;
        this.completedRankedMatches = 0;
        this.matchHistory = [];
        this.errors = [];
        this.wsDisconnects = 0;
        this.wsReconnects = 0;
        
        this.beforeSnapshot = null;
        this.afterSnapshot = null;
    }

    async init() {
        const isLocalHost = this.config.baseUrl.includes("localhost") || this.config.baseUrl.includes("127.0.0.1");
        const mode = (this.config.authHelperEnabled || (process.env.NODE_ENV !== "production" && process.env.BETTER_AUTH_SECRET)) && isLocalHost
            ? "local"
            : "http";

        this.reporter.logEvent("user_created", { username: this.username, authMode: mode });

        if (this.config.seedEnabled) {
            await seedUserInDb(this.username, this.config);
            this.reporter.logEvent("economy_checked", { username: this.username, action: "seeded" });
        }

        if (mode === "local") {
            const res = generateLocalToken(this.username);
            this.token = res.token;
            this.profile = res.profile;
        } else {
            try {
                const res = await this.authenticateWithRetry();
                this.token = res.token;
                this.profile = res.profile;
                this.cookies = res.cookies;
                this.reporter.recordLatency("auth/profile", res.latencies.auth);
                this.reporter.recordLatency("mintGameToken", res.latencies.token);
            } catch (e) {
                this.wsDisconnects++;
                this.errors.push(`Auth Error: ${e.message}`);
                this.reporter.logEvent("error", { username: this.username, phase: "auth", error: e.message });
                throw e;
            }
        }

        // Snapshot rating & balance BEFORE the test
        this.beforeSnapshot = await getPlayerProfileSnapshot(this.username, this.cookies, this.config);

        this.client = new Client(this.config.gameUrl);
    }

    async authenticateWithRetry(retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                return await authenticateViaHttp(this.username, this.config);
            } catch (e) {
                if (i === retries - 1) throw e;
                await sleep(1000 * (i + 1));
            }
        }
    }

    async snapshotAfter() {
        this.afterSnapshot = await getPlayerProfileSnapshot(this.username, this.cookies, this.config);
        this.reporter.logEvent("rating_checked", { 
            username: this.username, 
            ratingBefore: this.beforeSnapshot?.rating, 
            ratingAfter: this.afterSnapshot?.rating 
        });
        this.reporter.logEvent("economy_checked", { 
            username: this.username, 
            coinsBefore: this.beforeSnapshot?.coins, 
            coinsAfter: this.afterSnapshot?.coins 
        });
    }

    async playMatch(mode, roomToJoin = null) {
        this.room = null;
        return new Promise(async (resolve, reject) => {
            let room;
            const options = {
                name: this.username,
                authToken: this.token,
                isTeamMode: mode === "2v2" || mode === "2v2-ai",
                playerCount: (mode === "2v2" || mode === "2v2-ai") ? 4 : 2,
                aiCount: mode === "2v2-ai" ? 2 : 0,
                roomVisibility: (mode === "open") ? "open" : "closed",
                stakeKey: this.config.stake,
                instantWinEnabled: true,
                dlossThreshold: 255
            };

            const tStart = Date.now();
            let isHost = false;
            let movesInDealCount = 0;
            let lastTurnTime = Date.now();
            let currentDealId = 0;
            let roomCleanupTimer = null;
            let turnWatchdog = null;
            let dealWatchdog = null;
            let lastUsedTurnVersion = 0;
            let matchCompleted = false;

            const setupWatchdogs = () => {
                // Global room timeout watchdog
                roomCleanupTimer = setTimeout(() => {
                    handleStuck("room_timeout", `Room exceeded max duration of ${this.config.limits.maxRoomDurationMs}ms`);
                }, this.config.limits.maxRoomDurationMs);

                // Turn timeout watchdog
                turnWatchdog = setInterval(() => {
                    const elapsed = Date.now() - lastTurnTime;
                    if (this.room?.state?.gameActive && elapsed > this.config.limits.maxStuckTurnMs) {
                        handleStuck("turn_stuck", `Turn took longer than ${this.config.limits.maxStuckTurnMs}ms`);
                    }
                }, 5000);
            };

            const clearWatchdogs = () => {
                if (roomCleanupTimer) clearTimeout(roomCleanupTimer);
                if (turnWatchdog) clearInterval(turnWatchdog);
                if (dealWatchdog) clearTimeout(dealWatchdog);
            };

            const handleStuck = (reasonKey, message) => {
                clearWatchdogs();
                this.errors.push(`Stuck: ${message}`);
                this.reporter.logEvent("error", { username: this.username, roomId: room?.roomId, phase: "gameplay", reason: reasonKey, error: message });
                this.reporter.recordRoomFailure(room?.roomId || "unknown", reasonKey, message);
                
                if (room) {
                    try { room.leave(); } catch {}
                }
                resolve({ success: false, reason: reasonKey });
            };

            try {
                if (roomToJoin) {
                    this.reporter.logEvent("room_joined", { username: this.username, roomId: roomToJoin });
                    room = await this.client.joinById(roomToJoin, options);
                } else {
                    this.reporter.logEvent("room_created", { username: this.username });
                    room = await this.client.create("domino", options);
                    isHost = true;
                }

                this.room = room;
                this.reporter.recordRoomStart(room.roomId, Date.now() - tStart);

                setupWatchdogs();

                // Listen to room events
                room.onStateChange((state) => {
                    if (state.matchOver) {
                        matchCompleted = true;
                        clearWatchdogs();
                        const duration = Date.now() - tStart;
                        this.completedMatches++;
                        if (mode !== "2v2-ai") {
                            this.completedRankedMatches++;
                        }
                        this.reporter.logEvent("match_completed", { username: this.username, roomId: room.roomId, duration });
                        this.reporter.recordRoomSuccess(room.roomId, duration);
                        room.leave();
                        resolve({ success: true });
                    }
                });

                room.onMessage("room_state", (roomState) => {
                    // Matchmaker checks if client is seated
                    const me = roomState?.players?.find(p => p.sessionId === room.sessionId);
                    if (me && me.seatIndex === -1) {
                        // Choose first available seat
                        const occupiedSeats = new Set(roomState.players.map(p => p.seatIndex).filter(s => s >= 0));
                        let availableSeat = -1;
                        for (let i = 0; i < roomState.totalPlayers; i++) {
                            if (!occupiedSeats.has(i)) {
                                availableSeat = i;
                                break;
                            }
                        }
                        if (availableSeat !== -1) {
                            room.send("choose_seat", { seatIndex: availableSeat });
                        }
                    }
                });

                 room.onMessage("turn_info", async (info) => {
                    lastTurnTime = Date.now();
                    this.reporter.logEvent("turn_received", { username: this.username, roomId: room.roomId });
                    
                    movesInDealCount++;
                    if (movesInDealCount > this.config.limits.maxMovesPerDeal) {
                        handleStuck("max_moves_exceeded", `Moves count in deal exceeded ${this.config.limits.maxMovesPerDeal}`);
                        return;
                    }

                    // Wait for state to sync turnVersion and currentPlayerIndex
                    const tStartWait = Date.now();
                    while (true) {
                        const myIndex = room.state?.playerOrder?.indexOf(room.sessionId);
                        if (myIndex !== undefined && myIndex !== -1 && room.state.currentPlayerIndex === myIndex && (room.state.turnVersion || 0) > lastUsedTurnVersion) {
                            break;
                        }
                        if (Date.now() - tStartWait > 500) {
                            break;
                        }
                        await sleep(10);
                    }
                    const currentVersion = room.state?.turnVersion || lastUsedTurnVersion + 1;

                    // Simulate human think time (60ms - 100ms)
                    await sleep(60 + Math.random() * 40);

                    try {
                        if (info.validMoves && info.validMoves.length > 0) {
                            const move = info.validMoves[0]; // Greedily play the first valid move
                            room.send("play", {
                                tileIndex: move.tileIndex,
                                openEndIndex: move.openEndIndex,
                                turnVersion: currentVersion
                            });
                            this.reporter.logEvent("move_sent", { username: this.username, roomId: room.roomId, tileIndex: move.tileIndex, openEndIndex: move.openEndIndex });
                        } else {
                            // If no valid moves, draw or pass
                            const boneyardCount = room.state.boneyardCount;
                            if (boneyardCount > 0) {
                                room.send("draw", { turnVersion: currentVersion });
                            } else {
                                room.send("pass", { turnVersion: currentVersion });
                            }
                        }
                        lastUsedTurnVersion = currentVersion;
                    } catch (err) {
                        this.reporter.logEvent("error", { username: this.username, phase: "move_execution", error: err.message });
                    }
                });

                room.onMessage("deal_end", async (data) => {
                    this.completedDeals++;
                    movesInDealCount = 0;
                    lastUsedTurnVersion = 0;
                    if (dealWatchdog) clearTimeout(dealWatchdog);
                    
                    // Host must advance deal
                    if (isHost) {
                        await sleep(200); // Wait for modal
                        room.send("next_deal", { turnVersion: room.state.turnVersion });
                    }

                    // Reset stuck turn timer
                    lastTurnTime = Date.now();
                });

                room.onMessage("round_end", async (data) => {
                    this.completedDeals++;
                    movesInDealCount = 0;
                    lastUsedTurnVersion = 0;
                    if (dealWatchdog) clearTimeout(dealWatchdog);
                    
                    if (data?.isMatchOver) {
                        matchCompleted = true;
                        clearWatchdogs();
                        const duration = Date.now() - tStart;
                        this.completedMatches++;
                        if (mode !== "2v2-ai") {
                            this.completedRankedMatches++;
                        }
                        this.reporter.logEvent("match_completed", { username: this.username, roomId: room.roomId, duration });
                        this.reporter.recordRoomSuccess(room.roomId, duration);
                        room.leave();
                        resolve({ success: true });
                        return;
                    }
                    
                    // Host must advance round
                    if (isHost) {
                        await sleep(200); // Wait for modal
                        room.send("next_deal", { turnVersion: room.state.turnVersion });
                    }

                    lastTurnTime = Date.now();
                });

                room.onLeave((code) => {
                    clearWatchdogs();
                    if (!matchCompleted) {
                        this.wsDisconnects++;
                        this.reporter.logEvent("error", { username: this.username, roomId: room.roomId, phase: "websocket", error: `Closed with code ${code}` });
                        resolve({ success: false, reason: "websocket_disconnect" });
                    }
                });

                room.onError((code, message) => {
                    clearWatchdogs();
                    this.errors.push(`Room Error: [${code}] ${message}`);
                    this.reporter.logEvent("error", { username: this.username, roomId: room.roomId, phase: "colyseus_error", error: message });
                    resolve({ success: false, reason: "room_error" });
                });

            } catch (e) {
                clearWatchdogs();
                this.errors.push(`Join Error: ${e.stack || e.message}`);
                this.reporter.logEvent("error", { username: this.username, phase: "join", error: e.stack || e.message });
                resolve({ success: false, reason: "join_error" });
            }
        });
    }
}
