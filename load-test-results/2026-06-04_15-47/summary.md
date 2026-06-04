# 🔴 LOAD TEST FAIL

## Test Configuration
* **Target Environment**: Base URL: `https://apid.simplesoft.az`, Game URL: `wss://gamed.simplesoft.az`
* **Fake Users Spawned**: 20
* **Min Target Deals**: 3
* **Min Target Matches**: 1
* **Scenario Mode**: `mixed`
* **Concurrency Limit**: 5
* **Stake Key**: `stake_200`
* **Dry Run**: NO
* **Global Timeout Limit**: 60 minutes
* **Actual Duration**: 285 seconds

## Status
### Fail Reasons:
- User loadtest_005 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_005 played ranked matches but rating delta is 0 (stayed at 998).
- User loadtest_005 had economy changes (delta: -200) but stats matches delta is 0.
- User loadtest_006 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_006 played ranked matches but rating delta is 0 (stayed at 1002).
- User loadtest_006 had economy changes (delta: 180) but stats matches delta is 0.
- User loadtest_007 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_007 played ranked matches but rating delta is 0 (stayed at 1000).
- User loadtest_007 had economy changes (delta: 180) but stats matches delta is 0.
- User loadtest_008 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_008 played ranked matches but rating delta is 0 (stayed at 1000).
- User loadtest_008 had economy changes (delta: -200) but stats matches delta is 0.

## Matchmaking & Rooms Summary
* **Rooms Created**: 20
* **Rooms Started**: 20
* **Rooms Completed**: 20
* **Rooms Failed**: 0
* **Average Room Start Time**: 865 ms
* **Average Match Duration**: 123157 ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: 1236 ms
* **Average Game Token Mint Latency**: 410 ms
* **WebSocket Disconnects**: 0

## Rating Summary
### Top Gainers:
* **loadtest_002**: +29 (919 -> 948)
* **loadtest_013**: +22 (980 -> 1002)
* **loadtest_020**: +22 (980 -> 1002)

### Top Losers:
* **loadtest_001**: -29 (1081 -> 1052)
* **loadtest_014**: -22 (1020 -> 998)
* **loadtest_019**: -22 (1020 -> 998)

## Economy Report
* **Total Coins Spent (Stakes Reserved)**: 2000
* **Total Coins Won (Prizes Distributed)**: 1800
* **Stuck Reserved Coins**: 0
* **Negative Balance Users**: 0

## ELO & PlayerStats Integrity
* **Expected Ranked Participations**: 18
* **Actual PlayerStats Updates (matchesPlayed delta)**: 14
* **Users with Economy Change but No Stats Change**: 6

## Cleanup Status
* `cleanup skipped: no safe delete path`

## Recommendations
* Check `errors.json` for details on stuck rooms or WebSocket disconnects.
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
