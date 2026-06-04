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
* **Actual Duration**: 281 seconds

## Status
All test constraints and performance checks passed successfully.

## Matchmaking & Rooms Summary
* **Rooms Created**: 4
* **Rooms Started**: 4
* **Rooms Completed**: 4
* **Rooms Failed**: 0
* **Average Room Start Time**: 852 ms
* **Average Match Duration**: 204645 ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: 1380 ms
* **Average Game Token Mint Latency**: 399 ms
* **WebSocket Disconnects**: 0

## Rating Summary
### Top Gainers:
* **loadtest_003**: +22 (980 -> 1002)
* **loadtest_001**: +18 (1020 -> 1038)
* **loadtest_002**: +-18 (980 -> 962)

### Top Losers:
* **loadtest_004**: -22 (1020 -> 998)
* **loadtest_002**: -18 (980 -> 962)
* **loadtest_001**: 18 (1020 -> 1038)

## Economy Report
* **Total Coins Spent (Stakes Reserved)**: 800
* **Total Coins Won (Prizes Distributed)**: 720
* **Stuck Reserved Coins**: 0
* **Negative Balance Users**: 0

## Cleanup Status
* `cleanup skipped: no safe delete path`

## Recommendations
* Server handles current load levels well under normal latency limits.
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
