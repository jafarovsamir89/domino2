import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadEnvFile(envPath) {
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, "utf8");
    const env = {};
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index === -1) continue;
        const key = trimmed.substring(0, index).trim();
        let val = trimmed.substring(index + 1).trim();
        // Remove surrounding quotes if any
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
        }
        env[key] = val;
    }
    return env;
}

export function parseArgs(args) {
    const config = {
        users: 4,
        minDeals: 3,
        minMatches: 1,
        concurrency: 10,
        stake: "stake_200", // Matches the key name (e.g. stake_200, stake_1000, etc.)
        baseUrl: "http://127.0.0.1:3000",
        gameUrl: "ws://127.0.0.1:2567",
        mode: "mixed",
        reportDir: "load-test-results",
        timeoutMinutes: 60,
        dryRun: false,
        cleanup: false,
        allowProd: process.env.LOAD_TEST_ALLOW_PROD === "true",
        seedEnabled: process.env.LOAD_TEST_SEED_ENABLED === "true",
        authHelperEnabled: process.env.LOAD_TEST_AUTH_HELPER_ENABLED === "true"
    };

    // Load environment from apps/api/.env or root env
    const apiEnvPath = path.resolve(__dirname, "../../apps/api/.env");
    const loadedEnv = loadEnvFile(apiEnvPath);
    
    // Inject loaded env if not already in process.env
    for (const [k, v] of Object.entries(loadedEnv)) {
        if (!process.env[k]) {
            process.env[k] = v;
        }
    }

    // Direct check of cli options
    for (const arg of args) {
        if (arg === "--dry-run") {
            config.dryRun = true;
            continue;
        }
        if (arg === "--cleanup") {
            config.cleanup = true;
            continue;
        }
        if (arg.startsWith("--users=")) {
            config.users = parseInt(arg.split("=")[1], 10);
            continue;
        }
        if (arg.startsWith("--min-deals=")) {
            config.minDeals = parseInt(arg.split("=")[1], 10);
            continue;
        }
        if (arg.startsWith("--min-matches=")) {
            config.minMatches = parseInt(arg.split("=")[1], 10);
            continue;
        }
        if (arg.startsWith("--concurrency=")) {
            config.concurrency = parseInt(arg.split("=")[1], 10);
            continue;
        }
        if (arg.startsWith("--stake=")) {
            const rawVal = arg.split("=")[1];
            // Format stake to table key (e.g. stake_50 or stake_200)
            config.stake = rawVal.startsWith("stake_") ? rawVal : `stake_${rawVal}`;
            continue;
        }
        if (arg.startsWith("--base-url=")) {
            config.baseUrl = arg.split("=")[1].replace(/\/$/, "");
            continue;
        }
        if (arg.startsWith("--game-url=")) {
            config.gameUrl = arg.split("=")[1].replace(/\/$/, "");
            continue;
        }
        if (arg.startsWith("--mode=")) {
            config.mode = arg.split("=")[1];
            continue;
        }
        if (arg.startsWith("--report-dir=")) {
            config.reportDir = arg.split("=")[1];
            continue;
        }
        if (arg.startsWith("--timeout-minutes=")) {
            config.timeoutMinutes = parseInt(arg.split("=")[1], 10);
            continue;
        }
    }

    // Safety guards against accidental production run
    const isProductionUrl = (url) => {
        if (!url) return false;
        const normalized = url.toLowerCase();
        return normalized.includes("simplesoft.az") || 
               (!normalized.includes("localhost") && !normalized.includes("127.0.0.1") && !normalized.includes("0.0.0.0"));
    };

    const isBaseProd = isProductionUrl(config.baseUrl);
    const isGameProd = isProductionUrl(config.gameUrl);

    if ((isBaseProd || isGameProd) && !config.allowProd) {
        console.error("======================================================================");
        console.error("FATAL ERROR: Accidental production launch detected!");
        console.error(`Base URL: ${config.baseUrl}`);
        console.error(`Game URL: ${config.gameUrl}`);
        console.error("To run the test on this target, set the env variable: LOAD_TEST_ALLOW_PROD=true");
        console.error("======================================================================");
        process.exit(1);
    }

    // Database seeding validation
    config.isDatabaseLocal = !isBaseProd && !isGameProd;
    if (config.seedEnabled && (isBaseProd || isGameProd)) {
        console.warn("WARNING: Seeding database is NOT allowed on production-like environments.");
        console.warn("Direct DB inserts will be disabled, and only pre-created user credentials will be used.");
        config.seedEnabled = false; // Block it for safety
    }

    // Hard stop conditions / limits
    config.limits = {
        maxRoomDurationMs: 20 * 60 * 1000,   // 20 minutes
        maxDealDurationMs: 3 * 60 * 1000,    // 3 minutes
        maxStuckTurnMs: 45 * 1000,           // 45 seconds (server TURN_TIMEOUT_MS is 30s)
        maxMovesPerDeal: 50,
        maxReconnectAttempts: 5,
        globalTimeoutMs: config.timeoutMinutes * 60 * 1000
    };

    return config;
}
