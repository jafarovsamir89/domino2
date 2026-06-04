# 🟢 LOAD TEST PASS

## Test Configuration
* **Target Environment**: Base URL: `https://apid.simplesoft.az`, Game URL: `wss://gamed.simplesoft.az`
* **Fake Users Spawned**: 8
* **Min Target Deals**: 2
* **Min Target Matches**: 1
* **Scenario Mode**: `mixed`
* **Concurrency Limit**: 2
* **Stake Key**: `stake_200`
* **Dry Run**: NO
* **Global Timeout Limit**: 60 minutes
* **Actual Duration**: 282 seconds

## Status
All test constraints and performance checks passed successfully.

## Matchmaking & Rooms Summary
* **Rooms Created**: 8
* **Rooms Started**: 8
* **Rooms Completed**: 8
* **Rooms Failed**: 0
* **Average Room Start Time**: 855 ms
* **Average Match Duration**: 139986 ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: 901 ms
* **Average Game Token Mint Latency**: 248 ms
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
* **Total Coins Spent (Stakes Reserved)**: 1000
* **Total Coins Won (Prizes Distributed)**: 900
* **Stuck Reserved Coins**: 0
* **Negative Balance Users**: 0

## Cleanup Status
* `cleanup skipped: no safe delete path`

## Recommendations
* Server handles current load levels well under normal latency limits.
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
