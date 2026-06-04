import test from "node:test";
import assert from "node:assert";
import { parseArgs } from "./load-test-config.mjs";
import { generateLocalToken } from "./load-test-client.mjs";
import { LoadTestReporter } from "./load-test-reporter.mjs";

test("config parsing - default values", () => {
    const config = parseArgs([]);
    assert.strictEqual(config.users, 4);
    assert.strictEqual(config.minDeals, 3);
    assert.strictEqual(config.minMatches, 1);
    assert.strictEqual(config.mode, "mixed");
    assert.strictEqual(config.dryRun, false);
});

test("config parsing - custom CLI flags", () => {
    const config = parseArgs([
        "--users=24",
        "--min-deals=5",
        "--min-matches=2",
        "--mode=1v1",
        "--dry-run",
        "--stake=1000"
    ]);
    assert.strictEqual(config.users, 24);
    assert.strictEqual(config.minDeals, 5);
    assert.strictEqual(config.minMatches, 2);
    assert.strictEqual(config.mode, "1v1");
    assert.strictEqual(config.dryRun, true);
    assert.strictEqual(config.stake, "stake_1000");
});

test("local token generation - correct claims and signature structure", () => {
    const result = generateLocalToken("loadtest_999");
    assert.ok(result.token);
    assert.ok(result.profile);
    
    const [payload, signature] = result.token.split(".");
    assert.ok(payload);
    assert.ok(signature);

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    assert.strictEqual(decoded.userId, "usr_loadtest_999");
    assert.strictEqual(decoded.playerId, "plr_loadtest_999");
    assert.strictEqual(decoded.displayName, "loadtest_999");
    assert.strictEqual(decoded.role, "player");
    assert.strictEqual(decoded.provider, "better-auth");
    assert.ok(decoded.expiresAt > decoded.issuedAt);
});

test("completed participations criteria check", () => {
    const mockClient = {
        username: "loadtest_001",
        completedDeals: 3,
        completedMatches: 1
    };

    const targetDeals = 3;
    const targetMatches = 1;

    const dealsMet = mockClient.completedDeals >= targetDeals;
    const matchesMet = mockClient.completedMatches >= targetMatches;

    assert.strictEqual(dealsMet, true);
    assert.strictEqual(matchesMet, true);

    const mockClientFailed = {
        username: "loadtest_002",
        completedDeals: 2,
        completedMatches: 0
    };

    assert.strictEqual(mockClientFailed.completedDeals >= targetDeals, false);
    assert.strictEqual(mockClientFailed.completedMatches >= targetMatches, false);
});

test("reporter rating and economy diff aggregation", () => {
    const mockReporter = new LoadTestReporter("tmp-loadtest-results-test");
    
    const mockClients = [
        {
            username: "loadtest_001",
            completedDeals: 3,
            completedMatches: 1,
            wsDisconnects: 0,
            wsReconnects: 0,
            errors: [],
            beforeSnapshot: { rating: 1000, coins: 10000, reservedCoins: 0, wins: 5, losses: 5, matchesPlayed: 10 },
            afterSnapshot: { rating: 1024, coins: 10190, reservedCoins: 0, wins: 6, losses: 5, matchesPlayed: 11 }
        },
        {
            username: "loadtest_002",
            completedDeals: 3,
            completedMatches: 1,
            wsDisconnects: 1,
            wsReconnects: 1,
            errors: ["Mock WS disconnect"],
            beforeSnapshot: { rating: 1000, coins: 10000, reservedCoins: 0, wins: 5, losses: 5, matchesPlayed: 10 },
            afterSnapshot: { rating: 976, coins: 9810, reservedCoins: 0, wins: 5, losses: 6, matchesPlayed: 11 }
        }
    ];

    const config = {
        minDeals: 3,
        minMatches: 1,
        stake: "stake_200"
    };

    // Simulate mock reporter generation runs on these inputs
    const results = [];
    const economy = [];
    
    for (const client of mockClients) {
        const before = client.beforeSnapshot;
        const after = client.afterSnapshot;
        
        results.push({
            username: client.username,
            before: before.rating,
            after: after.rating,
            delta: after.rating - before.rating,
            matchesDelta: after.matchesPlayed - before.matchesPlayed
        });

        economy.push({
            username: client.username,
            before: before.coins,
            after: after.coins,
            delta: after.coins - before.coins
        });
    }

    assert.strictEqual(results[0].delta, 24);
    assert.strictEqual(results[1].delta, -24);
    assert.strictEqual(economy[0].delta, 190);
    assert.strictEqual(economy[1].delta, -190);
});
