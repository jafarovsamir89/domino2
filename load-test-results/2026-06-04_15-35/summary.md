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
* **Actual Duration**: 380 seconds

## Status
All test constraints and performance checks passed successfully.

## Matchmaking & Rooms Summary
* **Rooms Created**: 8
* **Rooms Started**: 8
* **Rooms Completed**: 8
* **Rooms Failed**: 0
* **Average Room Start Time**: 893 ms
* **Average Match Duration**: 152981 ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: 1158 ms
* **Average Game Token Mint Latency**: 417 ms
* **WebSocket Disconnects**: 0

## Rating Summary
### Top Gainers:
* **loadtest_003**: +22 (979 -> 1001)
* **loadtest_006**: +22 (980 -> 1002)
* **loadtest_001**: +0 (1081 -> 1081)

### Top Losers:
* **loadtest_004**: -22 (1021 -> 999)
* **loadtest_005**: -22 (1020 -> 998)
* **loadtest_001**: 0 (1081 -> 1081)

## Economy Report
* **Total Coins Spent (Stakes Reserved)**: 800
* **Total Coins Won (Prizes Distributed)**: 720
* **Stuck Reserved Coins**: 0
* **Negative Balance Users**: 0

## ELO & PlayerStats Integrity
* **Expected Ranked Participations**: 4
* **Actual PlayerStats Updates (matchesPlayed delta)**: 4
* **Users with Economy Change but No Stats Change**: 4

## Cleanup Status
* `cleanup skipped: no safe delete path`

## Recommendations
* Server handles current load levels well under normal latency limits.
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
