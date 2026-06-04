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
* **Actual Duration**: 625 seconds

## Status
All test constraints and performance checks passed successfully.

## Matchmaking & Rooms Summary
* **Rooms Created**: 4
* **Rooms Started**: 4
* **Rooms Completed**: 4
* **Rooms Failed**: 0
* **Average Room Start Time**: 892 ms
* **Average Match Duration**: 427137 ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: 997 ms
* **Average Game Token Mint Latency**: 403 ms
* **WebSocket Disconnects**: 0

## Rating Summary
### Top Gainers:
* **loadtest_003**: +20 (1002 -> 1022)
* **loadtest_001**: +16 (1038 -> 1054)
* **loadtest_002**: +-16 (962 -> 946)

### Top Losers:
* **loadtest_004**: -20 (998 -> 978)
* **loadtest_002**: -16 (962 -> 946)
* **loadtest_001**: 16 (1038 -> 1054)

## Economy Report
* **Total Coins Spent (Stakes Reserved)**: 660
* **Total Coins Won (Prizes Distributed)**: 520
* **Stuck Reserved Coins**: 0
* **Negative Balance Users**: 0

## ELO & PlayerStats Integrity
* **Expected Ranked Participations**: 4
* **Actual PlayerStats Updates (matchesPlayed delta)**: 4
* **Users with Economy Change but No Stats Change**: 0

## Cleanup Status
* `cleanup skipped: no safe delete path`

## Recommendations
* Server handles current load levels well under normal latency limits.
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
