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
* **Actual Duration**: 402 seconds

## Status
All test constraints and performance checks passed successfully.

## Matchmaking & Rooms Summary
* **Rooms Created**: 8
* **Rooms Started**: 8
* **Rooms Completed**: 8
* **Rooms Failed**: 0
* **Average Room Start Time**: 971 ms
* **Average Match Duration**: 169703 ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: 1243 ms
* **Average Game Token Mint Latency**: 507 ms
* **WebSocket Disconnects**: 0

## Rating Summary
### Top Gainers:
* **loadtest_004**: +23 (978 -> 1001)
* **loadtest_001**: +0 (1054 -> 1054)
* **loadtest_002**: +0 (946 -> 946)

### Top Losers:
* **loadtest_003**: -23 (1022 -> 999)
* **loadtest_001**: 0 (1054 -> 1054)
* **loadtest_002**: 0 (946 -> 946)

## Economy Report
* **Total Coins Spent (Stakes Reserved)**: 800
* **Total Coins Won (Prizes Distributed)**: 720
* **Stuck Reserved Coins**: 0
* **Negative Balance Users**: 0

## ELO & PlayerStats Integrity
* **Expected Ranked Participations**: 2
* **Actual PlayerStats Updates (matchesPlayed delta)**: 2
* **Users with Economy Change but No Stats Change**: 6

## Cleanup Status
* `cleanup skipped: no safe delete path`

## Recommendations
* Server handles current load levels well under normal latency limits.
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
