# 🔴 LOAD TEST FAIL

## Test Configuration
* **Target Environment**: Base URL: `https://apid.simplesoft.az`, Game URL: `wss://gamed.simplesoft.az`
* **Fake Users Spawned**: 4
* **Min Target Deals**: 1
* **Min Target Matches**: 1
* **Scenario Mode**: `1v1`
* **Concurrency Limit**: 10
* **Stake Key**: `stake_200`
* **Dry Run**: NO
* **Global Timeout Limit**: 60 minutes
* **Actual Duration**: 3605 seconds

## Status
### Fail Reasons:
- Not all fake users reached required minDeals or minMatches.
- Detected stuck reserved coins (reservedAfter > 0) after gameplay completion.

## Matchmaking & Rooms Summary
* **Rooms Created**: 0
* **Rooms Started**: 0
* **Rooms Completed**: 0
* **Rooms Failed**: 0
* **Average Room Start Time**: 0 ms
* **Average Match Duration**: 0 ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: 1436 ms
* **Average Game Token Mint Latency**: 225 ms
* **WebSocket Disconnects**: 0

## Rating Summary
### Top Gainers:
* **loadtest_001**: +0 (1000 -> 1000)
* **loadtest_002**: +0 (1000 -> 1000)
* **loadtest_003**: +0 (1000 -> 1000)

### Top Losers:
* **loadtest_001**: 0 (1000 -> 1000)
* **loadtest_002**: 0 (1000 -> 1000)
* **loadtest_003**: 0 (1000 -> 1000)

## Economy Report
* **Total Coins Spent (Stakes Reserved)**: 0
* **Total Coins Won (Prizes Distributed)**: 3959160
* **Stuck Reserved Coins**: 800
* **Negative Balance Users**: 0

## Cleanup Status
* `cleanup skipped: no safe delete path`

## Recommendations
* Check `errors.json` for details on stuck rooms or WebSocket disconnects.
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
