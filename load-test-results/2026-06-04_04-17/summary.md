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
* **Actual Duration**: 3604 seconds

## Status
### Fail Reasons:
- Not all fake users reached required minDeals or minMatches.
- There were 536 failed/stuck rooms.
- Detected stuck reserved coins (reservedAfter > 0) after gameplay completion.
- Unusual number of WebSocket disconnects detected (538).

## Matchmaking & Rooms Summary
* **Rooms Created**: 642
* **Rooms Started**: 642
* **Rooms Completed**: 0
* **Rooms Failed**: 536
* **Average Room Start Time**: 1107 ms
* **Average Match Duration**: 0 ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: 789 ms
* **Average Game Token Mint Latency**: 294 ms
* **WebSocket Disconnects**: 538

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
* **Total Coins Won (Prizes Distributed)**: 3959500
* **Stuck Reserved Coins**: 400
* **Negative Balance Users**: 0

## Cleanup Status
* `cleanup skipped: no safe delete path`

## Recommendations
* Check `errors.json` for details on stuck rooms or WebSocket disconnects.
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
