import { parseArgs } from "./load-test-config.mjs";
import { LoadTestClient, cleanupDatabase } from "./load-test-client.mjs";
import { LoadTestReporter } from "./load-test-reporter.mjs";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const config = parseArgs(process.argv);
    
    // Create and initialize reporter
    const reporter = new LoadTestReporter(config.reportDir);
    reporter.init();
    
    // Handle cleanup mode
    if (config.cleanup) {
        console.log("[LOAD_TEST] Running cleanup mode...");
        const msg = await cleanupDatabase(config);
        console.log(`[LOAD_TEST] ${msg}`);
        process.exit(0);
    }

    console.log("=================================================");
    console.log("      DOMINO TELEFON GAMEPLAY LOAD TEST HARNESS  ");
    console.log("=================================================");
    console.log(`Target Base URL:     ${config.baseUrl}`);
    console.log(`Target Game URL:     ${config.gameUrl}`);
    console.log(`Fake Users:          ${config.users}`);
    console.log(`Min deals/rounds:    ${config.minDeals}`);
    console.log(`Min matches:         ${config.minMatches}`);
    console.log(`Mode:                ${config.mode}`);
    console.log(`Concurrency:         ${config.concurrency} rooms`);
    console.log(`Stake key:           ${config.stake}`);
    console.log(`Dry-run:             ${config.dryRun ? "YES" : "NO"}`);
    console.log(`DB seed enabled:     ${config.seedEnabled ? "YES" : "NO"}`);
    console.log(`Local auth helper:   ${config.authHelperEnabled ? "YES" : "NO"}`);
    console.log("=================================================");

    reporter.logEvent("test_started", {
        users: config.users,
        minDeals: config.minDeals,
        minMatches: config.minMatches,
        mode: config.mode,
        concurrency: config.concurrency,
        stake: config.stake,
        dryRun: config.dryRun
    });

    // Create fake clients
    const clients = [];
    for (let i = 1; i <= config.users; i++) {
        const username = `loadtest_${String(i).padStart(3, "0")}`;
        const client = new LoadTestClient(username, config, reporter);
        clients.push(client);
    }

    // Initialize clients (Auth/Seed/Snapshot)
    if (!config.dryRun) {
        console.log("[LOAD_TEST] Initializing fake users (auth & seed)...");
        try {
            await Promise.all(clients.map(c => c.init()));
            console.log(`[LOAD_TEST] Successfully initialized ${clients.length} fake users.`);
        } catch (err) {
            console.error(`[LOAD_TEST] Fatal error during initialization: ${err.message}`);
            reporter.logEvent("error", { phase: "initialization", error: err.message });
            
            // Generate failed report
            const reports = reporter.generateReports(config, clients, "Init failed");
            console.log(reports.summaryMd);
            process.exit(1);
        }
    } else {
        console.log("[LOAD_TEST] Dry-run enabled. Skipping active connections.");
        // Fill before snapshots with mock values for dry-run
        for (const c of clients) {
            c.beforeSnapshot = { rating: 1000, coins: 10000, reservedCoins: 0, wins: 0, losses: 0, matchesPlayed: 0 };
            c.afterSnapshot = c.beforeSnapshot;
        }
    }

    let isSuccess = true;
    let cleanupMsg = "cleanup skipped: no safe delete path";

    // Play matches (only if not dry run)
    if (!config.dryRun) {
        const startMs = Date.now();
        const globalTimeoutMs = config.limits.globalTimeoutMs;
        const activeGames = new Set();

        console.log("[LOAD_TEST] Starting match orchestration loop...");

        while (true) {
            const elapsed = Date.now() - startMs;
            if (elapsed >= globalTimeoutMs) {
                console.error(`[LOAD_TEST] Global timeout of ${config.timeoutMinutes} minutes reached!`);
                reporter.logEvent("error", { phase: "global_timeout", message: "Global timeout reached" });
                isSuccess = false;
                break;
            }

            // Check if all players completed their target deals and matches
            const allFinished = clients.every(c => c.completedDeals >= config.minDeals && c.completedMatches >= config.minMatches);
            if (allFinished && activeGames.size === 0) {
                console.log("[LOAD_TEST] All fake users completed required deals and matches!");
                break;
            }

            if (activeGames.size < config.concurrency) {
                // Find idle players who still need games
                const idlePlayers = clients.filter(c => !c.inGame && (c.completedDeals < config.minDeals || c.completedMatches < config.minMatches));
                
                if (idlePlayers.length === 0 && activeGames.size === 0) {
                    break;
                }

                // Choose mode
                let gameMode = config.mode;
                if (gameMode === "mixed") {
                    const modes = ["1v1", "2v2", "2v2-ai", "open"];
                    gameMode = modes[Math.floor(Math.random() * modes.length)];
                }

                const reqPlayers = (gameMode === "2v2") ? 4 : 2;

                if (idlePlayers.length >= reqPlayers) {
                    const picked = idlePlayers.slice(0, reqPlayers);
                    picked.forEach(p => p.inGame = true);

                    const gamePromise = (async () => {
                        const host = picked[0];
                        const guests = picked.slice(1);
                        
                        try {
                            const hostPromise = host.playMatch(gameMode);
                            
                            // Wait for host room ID to be populated
                            let attempts = 0;
                            while (!host.room?.id && attempts < 100) {
                                await sleep(100);
                                attempts++;
                            }
                            
                            if (!host.room?.id) {
                                throw new Error("Host failed to create room");
                            }

                            // Guests join the host's room ID
                            const guestPromises = guests.map(g => g.playMatch(gameMode, host.room.id));
                            await Promise.all([hostPromise, ...guestPromises]);
                        } catch (err) {
                            console.error(`[LOAD_TEST] Game failed in mode ${gameMode}: ${err.message}`);
                        } finally {
                            picked.forEach(p => p.inGame = false);
                        }
                    })();

                    activeGames.add(gamePromise);
                    gamePromise.then(() => activeGames.delete(gamePromise));
                } else {
                    // Wait a bit for other players to finish games
                    await sleep(500);
                }
            } else {
                // Concurrency limit reached, wait for some rooms to complete
                await sleep(500);
            }
        }

        // Cleanup active connections
        for (const c of clients) {
            if (c.room) {
                try { c.room.leave(); } catch {}
            }
        }

        // Wait a bit for server economy updates to settle
        console.log("[LOAD_TEST] Waiting for database transactions to finalize...");
        await sleep(2000);

        // Capture AFTER snapshots
        console.log("[LOAD_TEST] Fetching post-test player profiles...");
        await Promise.all(clients.map(c => c.snapshotAfter()));

        // Run database cleanup if enabled
        if (config.seedEnabled) {
            console.log("[LOAD_TEST] Cleaning up seeded data...");
            cleanupMsg = await cleanupDatabase(config);
            console.log(`[LOAD_TEST] ${cleanupMsg}`);
        }
    }

    // Generate final reports
    const reportData = reporter.generateReports(config, clients, cleanupMsg);
    
    console.log("\n=================================================");
    console.log("               LOAD TEST RESULT                  ");
    console.log("=================================================");
    console.log(reportData.summaryMd);
    console.log(`Detailed reports saved in: ${reportData.reportDir}/`);
    console.log("=================================================");

    process.exit(isSuccess && reportData.isPass ? 0 : 1);
}

main().catch(err => {
    console.error(`[LOAD_TEST] Unhandled harness failure: ${err.stack}`);
    process.exit(1);
});
