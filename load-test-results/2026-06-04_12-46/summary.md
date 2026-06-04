# 🟢 LOAD TEST PASS

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
* **Actual Duration**: 133 seconds

## Status
All test constraints and performance checks passed successfully.

## Matchmaking & Rooms Summary
* **Rooms Created**: 4
* **Rooms Started**: 4
* **Rooms Completed**: 4
* **Rooms Failed**: 0
* **Average Room Start Time**: 1139 ms
* **Average Match Duration**: 122423 ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: 1183 ms
* **Average Game Token Mint Latency**: 525 ms
* **WebSocket Disconnects**: 0

## Rating Summary
### Top Gainers:
* **loadtest_001**: +20 (1000 -> 1020)
* **loadtest_004**: +20 (1000 -> 1020)
* **loadtest_002**: +-20 (1000 -> 980)

### Top Losers:
* **loadtest_002**: -20 (1000 -> 980)
* **loadtest_003**: -20 (1000 -> 980)
* **loadtest_001**: 20 (1000 -> 1020)

## Economy Report
* **Total Coins Spent (Stakes Reserved)**: 400
* **Total Coins Won (Prizes Distributed)**: 360
* **Stuck Reserved Coins**: 0
* **Negative Balance Users**: 0

## Cleanup Status
* `cleanup skipped: no safe delete path`

## Recommendations
* Server handles current load levels well under normal latency limits.
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
