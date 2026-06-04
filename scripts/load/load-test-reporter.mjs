import fs from "node:fs";
import path from "node:path";

export class LoadTestReporter {
    constructor(reportDirParent) {
        this.reportDirParent = reportDirParent;
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const dirName = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
        this.reportDir = path.join(reportDirParent, dirName);

        this.events = [];
        this.latencies = {};
        this.roomDurations = [];
        this.roomStartTimes = [];
        
        this.roomsCreated = 0;
        this.roomsStarted = 0;
        this.roomsCompleted = 0;
        this.roomsFailed = 0;
        this.roomsFailReasons = {};
        
        this.wsDisconnects = 0;
        this.wsReconnects = 0;
        this.errorsLogged = [];

        this.startTime = Date.now();
        this.endTime = null;
    }

    init() {
        if (!fs.existsSync(this.reportDirParent)) {
            fs.mkdirSync(this.reportDirParent, { recursive: true });
        }
        if (!fs.existsSync(this.reportDir)) {
            fs.mkdirSync(this.reportDir, { recursive: true });
        }
        // Write empty events log to start
        fs.writeFileSync(path.join(this.reportDir, "events.jsonl"), "", "utf8");
    }

    logEvent(event, payload = {}) {
        const item = {
            timestamp: Date.now(),
            event,
            ...payload
        };
        this.events.push(item);
        
        // Append to jsonl file
        fs.appendFileSync(
            path.join(this.reportDir, "events.jsonl"),
            JSON.stringify(item) + "\n",
            "utf8"
        );

        if (event === "error") {
            this.errorsLogged.push(payload);
        }
    }

    recordLatency(apiName, durationMs) {
        if (!this.latencies[apiName]) {
            this.latencies[apiName] = [];
        }
        this.latencies[apiName].push(durationMs);
    }

    recordRoomStart(roomId, durationMs) {
        this.roomsCreated++;
        this.roomsStarted++;
        this.roomStartTimes.push(durationMs);
    }

    recordRoomSuccess(roomId, durationMs) {
        this.roomsCompleted++;
        this.roomDurations.push(durationMs);
    }

    recordRoomFailure(roomId, reason, message) {
        this.roomsFailed++;
        if (!this.roomsFailReasons[reason]) {
            this.roomsFailReasons[reason] = 0;
        }
        this.roomsFailReasons[reason]++;
        this.logEvent("error", { phase: "room", roomId, reason, message });
    }

    getAverage(arr) {
        if (!arr || !arr.length) return 0;
        const sum = arr.reduce((a, b) => a + b, 0);
        return Math.round(sum / arr.length);
    }

    getAverageLatency(apiName) {
        return this.getAverage(this.latencies[apiName]);
    }

    generateReports(config, clients, cleanupMsg = "") {
        this.endTime = Date.now();
        const durationSec = Math.round((this.endTime - this.startTime) / 1000);

        // Gather snapshots and diffs
        const ratingReport = [];
        const economyReport = [];
        const playerReport = [];
        
        let allRequiredMinimaMet = true;
        let negativeBalanceAnomalies = false;
        let stuckReservedCoinsAnomalies = false;
        let ratingAnomalies = false;
        
        for (const client of clients) {
            const before = client.beforeSnapshot || { rating: 1000, coins: 10000, reservedCoins: 0, wins: 0, losses: 0, matchesPlayed: 0 };
            const after = client.afterSnapshot || before;

            const ratingDelta = after.rating - before.rating;
            const coinsDelta = after.coins - before.coins;
            const matchesDelta = after.matchesPlayed - before.matchesPlayed;

            const targetDealsMet = client.completedDeals >= config.minDeals;
            const targetMatchesMet = client.completedMatches >= config.minMatches;

            if (!targetDealsMet || !targetMatchesMet) {
                allRequiredMinimaMet = false;
            }

            if (after.coins < 0) {
                negativeBalanceAnomalies = true;
            }

            if (after.reservedCoins > 0) {
                stuckReservedCoinsAnomalies = true;
            }

            // Anomaly: played games changed, but rating was not updated (except if ELO calculation limits matched ratings)
            // Or if matches delta is positive but rating delta is zero in games with human opponent when stake is active.
            // Just mark rating delta > 500 or matches > 0 but rating is 0 as suspicious to audit ELO logic
            const suspiciousRating = matchesDelta > 0 && ratingDelta === 0 && config.stake !== "free";

            ratingReport.push({
                username: client.username,
                before: before.rating,
                after: after.rating,
                delta: ratingDelta,
                matchesPlayedBefore: before.matchesPlayed,
                matchesPlayedAfter: after.matchesPlayed,
                matchesDelta,
                winsBefore: before.wins,
                winsAfter: after.wins,
                lossesBefore: before.losses,
                lossesAfter: after.losses,
                suspicious: suspiciousRating,
                completedRankedMatches: client.completedRankedMatches || 0
            });

            economyReport.push({
                username: client.username,
                before: before.coins,
                after: after.coins,
                delta: coinsDelta,
                reservedBefore: before.reservedCoins,
                reservedAfter: after.reservedCoins,
                stuckReserved: after.reservedCoins > 0,
                negativeBalance: after.coins < 0
            });

            playerReport.push({
                username: client.username,
                completedDeals: client.completedDeals,
                completedMatches: client.completedMatches,
                dealsTargetMet: targetDealsMet,
                matchesTargetMet: targetMatchesMet,
                disconnects: client.wsDisconnects,
                reconnects: client.wsReconnects,
                errors: client.errors
            });
        }

        // Count WS events from all clients
        const totalWsDisconnects = clients.reduce((acc, c) => acc + c.wsDisconnects, 0);

        // Strict PASS/FAIL check
        let isPass = true;
        const failReasons = [];

        if (config.dryRun) {
            isPass = true;
        } else {
            if (!allRequiredMinimaMet) {
                isPass = false;
                failReasons.push("Not all fake users reached required minDeals or minMatches.");
            }
            if (this.roomsFailed > 0) {
                isPass = false;
                failReasons.push(`There were ${this.roomsFailed} failed/stuck rooms.`);
            }
            if (stuckReservedCoinsAnomalies) {
                isPass = false;
                failReasons.push("Detected stuck reserved coins (reservedAfter > 0) after gameplay completion.");
            }
            if (negativeBalanceAnomalies) {
                isPass = false;
                failReasons.push("Detected negative coin balances for one or more users.");
            }
            if (totalWsDisconnects > config.users * 2) { // Too many disconnects indicates unstable WS
                isPass = false;
                failReasons.push(`Unusual number of WebSocket disconnects detected (${totalWsDisconnects}).`);
            }

            // Stronger validation for expected ranked matches:
            for (const client of clients) {
                const before = client.beforeSnapshot || { rating: 1000, coins: 10000, reservedCoins: 0, wins: 0, losses: 0, matchesPlayed: 0 };
                const after = client.afterSnapshot || before;

                const ratingDelta = after.rating - before.rating;
                const coinsDelta = after.coins - before.coins;
                const matchesDelta = after.matchesPlayed - before.matchesPlayed;
                const completedRanked = client.completedRankedMatches || 0;

                const isExpectedRanked = config.stake !== "free" && config.stake !== "stake_free" && completedRanked > 0;
                if (isExpectedRanked) {
                    if (matchesDelta < completedRanked) {
                        isPass = false;
                        failReasons.push(`User ${client.username} completed ${completedRanked} ranked matches, but matches delta is only ${matchesDelta} in database.`);
                    }
                    if (ratingDelta === 0) {
                        isPass = false;
                        failReasons.push(`User ${client.username} played ranked matches but rating delta is 0 (stayed at ${before.rating}).`);
                    }
                    if (coinsDelta !== 0 && matchesDelta === 0) {
                        isPass = false;
                        failReasons.push(`User ${client.username} had economy changes (delta: ${coinsDelta}) but stats matches delta is 0.`);
                    }
                }
            }
        }

        const expectedRanked = ratingReport.reduce((acc, r) => acc + (r.completedRankedMatches || 0), 0);
        const actualStatsUpdates = ratingReport.reduce((acc, r) => acc + r.matchesDelta, 0);
        const economyChangeNoStats = ratingReport.filter((r, idx) => {
            const econ = economyReport[idx];
            return econ.delta !== 0 && r.matchesDelta === 0;
        }).length;

        const summaryMd = this.buildSummaryMarkdown(config, durationSec, isPass, failReasons, playerReport, ratingReport, economyReport, cleanupMsg);
        
        const summaryJson = {
            result: isPass ? "PASS" : "FAIL",
            failReasons,
            config,
            integrity: {
                expectedRankedParticipations: expectedRanked,
                actualPlayerStatsUpdates: actualStatsUpdates,
                usersWithEconomyChangeButNoStatsChange: economyChangeNoStats
            },
            metrics: {
                totalDurationSeconds: durationSec,
                roomsCreated: this.roomsCreated,
                roomsStarted: this.roomsStarted,
                roomsCompleted: this.roomsCompleted,
                roomsFailed: this.roomsFailed,
                roomsFailReasons: this.roomsFailReasons,
                averageRoomStartTimeMs: this.getAverage(this.roomStartTimes),
                averageMatchDurationMs: this.getAverage(this.roomDurations),
                totalWsDisconnects,
                apiLatenciesAverage: {
                    auth: this.getAverageLatency("auth/profile"),
                    mintGameToken: this.getAverageLatency("mintGameToken")
                }
            }
        };

        // Write files to results folder
        fs.writeFileSync(path.join(this.reportDir, "summary.md"), summaryMd, "utf8");
        fs.writeFileSync(path.join(this.reportDir, "summary.json"), JSON.stringify(summaryJson, null, 2), "utf8");
        fs.writeFileSync(path.join(this.reportDir, "players.json"), JSON.stringify(playerReport, null, 2), "utf8");
        fs.writeFileSync(path.join(this.reportDir, "rating.json"), JSON.stringify(ratingReport, null, 2), "utf8");
        fs.writeFileSync(path.join(this.reportDir, "economy.json"), JSON.stringify(economyReport, null, 2), "utf8");
        fs.writeFileSync(path.join(this.reportDir, "errors.json"), JSON.stringify(this.errorsLogged, null, 2), "utf8");
        
        const serverMetricsJson = {
            peakConcurrentRooms: this.roomsCreated - this.roomsCompleted - this.roomsFailed,
            peakConcurrentClients: clients.length,
            websocketDisconnects: totalWsDisconnects,
            reconnects: this.wsReconnects,
            errors: this.errorsLogged
        };
        fs.writeFileSync(path.join(this.reportDir, "server-metrics.json"), JSON.stringify(serverMetricsJson, null, 2), "utf8");

        return { isPass, reportDir: this.reportDir, summaryMd };
    }

    buildSummaryMarkdown(config, durationSec, isPass, failReasons, playerReport, ratingReport, economyReport, cleanupMsg) {
        const title = isPass ? "🟢 LOAD TEST PASS" : "🔴 LOAD TEST FAIL";
        const reasonSection = isPass 
            ? "All test constraints and performance checks passed successfully." 
            : `### Fail Reasons:\n${failReasons.map(r => `- ${r}`).join("\n")}`;

        // Top rating changes
        const sortedRating = [...ratingReport].sort((a, b) => b.delta - a.delta);
        const topGainers = sortedRating.slice(0, 3).map(r => `* **${r.username}**: +${r.delta} (${r.before} -> ${r.after})`).join("\n");
        const topLosers = [...ratingReport].sort((a, b) => a.delta - b.delta).slice(0, 3).map(r => `* **${r.username}**: ${r.delta} (${r.before} -> ${r.after})`).join("\n");

        // Top economy changes
        const totalCoinsSpent = economyReport.filter(e => e.delta < 0).reduce((acc, e) => acc - e.delta, 0);
        const totalCoinsWon = economyReport.filter(e => e.delta > 0).reduce((acc, e) => acc + e.delta, 0);
        const stuckCoinsCount = economyReport.filter(e => e.reservedAfter > 0).reduce((acc, e) => acc + e.reservedAfter, 0);

        // Integrity metrics
        const expectedRanked = ratingReport.reduce((acc, r) => acc + (r.completedRankedMatches || 0), 0);
        const actualStatsUpdates = ratingReport.reduce((acc, r) => acc + r.matchesDelta, 0);
        const economyChangeNoStats = ratingReport.filter((r, idx) => {
            const econ = economyReport[idx];
            return econ.delta !== 0 && r.matchesDelta === 0;
        }).length;

        return `# ${title}

## Test Configuration
* **Target Environment**: Base URL: \`${config.baseUrl}\`, Game URL: \`${config.gameUrl}\`
* **Fake Users Spawned**: ${config.users}
* **Min Target Deals**: ${config.minDeals}
* **Min Target Matches**: ${config.minMatches}
* **Scenario Mode**: \`${config.mode}\`
* **Concurrency Limit**: ${config.concurrency}
* **Stake Key**: \`${config.stake}\`
* **Dry Run**: ${config.dryRun ? "YES" : "NO"}
* **Global Timeout Limit**: ${config.timeoutMinutes} minutes
* **Actual Duration**: ${durationSec} seconds

## Status
${reasonSection}

## Matchmaking & Rooms Summary
* **Rooms Created**: ${this.roomsCreated}
* **Rooms Started**: ${this.roomsStarted}
* **Rooms Completed**: ${this.roomsCompleted}
* **Rooms Failed**: ${this.roomsFailed}
* **Average Room Start Time**: ${this.getAverage(this.roomStartTimes)} ms
* **Average Match Duration**: ${this.getAverage(this.roomDurations)} ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: ${this.getAverageLatency("auth/profile")} ms
* **Average Game Token Mint Latency**: ${this.getAverageLatency("mintGameToken")} ms
* **WebSocket Disconnects**: ${clientsDisconnectCount(playerReport)}

## Rating Summary
### Top Gainers:
${topGainers || "*None*"}

### Top Losers:
${topLosers || "*None*"}

## Economy Report
* **Total Coins Spent (Stakes Reserved)**: ${totalCoinsSpent}
* **Total Coins Won (Prizes Distributed)**: ${totalCoinsWon}
* **Stuck Reserved Coins**: ${stuckCoinsCount}
* **Negative Balance Users**: ${economyReport.filter(e => e.negativeBalance).length}

## ELO & PlayerStats Integrity
* **Expected Ranked Participations**: ${expectedRanked}
* **Actual PlayerStats Updates (matchesPlayed delta)**: ${actualStatsUpdates}
* **Users with Economy Change but No Stats Change**: ${economyChangeNoStats}

## Cleanup Status
* \`${cleanupMsg || "No cleanup message logged"}\`

## Recommendations
${isPass ? "* Server handles current load levels well under normal latency limits." : "* Check `errors.json` for details on stuck rooms or WebSocket disconnects."}
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
`;
    }
}

function clientsDisconnectCount(playerReport) {
    return playerReport.reduce((acc, c) => acc + c.disconnects, 0);
}
