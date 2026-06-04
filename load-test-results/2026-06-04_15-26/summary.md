# 🔴 LOAD TEST FAIL

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
* **Actual Duration**: 263 seconds

## Status
### Fail Reasons:
- User loadtest_003 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_003 played ranked matches but rating delta is 0 (stayed at 979).
- User loadtest_003 had economy changes (delta: -200) but stats matches delta is 0.
- User loadtest_004 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_004 played ranked matches but rating delta is 0 (stayed at 1021).
- User loadtest_004 had economy changes (delta: -200) but stats matches delta is 0.
- User loadtest_005 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_005 played ranked matches but rating delta is 0 (stayed at 1020).
- User loadtest_005 had economy changes (delta: 180) but stats matches delta is 0.
- User loadtest_006 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_006 played ranked matches but rating delta is 0 (stayed at 980).
- User loadtest_006 had economy changes (delta: 180) but stats matches delta is 0.

## Matchmaking & Rooms Summary
* **Rooms Created**: 8
* **Rooms Started**: 8
* **Rooms Completed**: 8
* **Rooms Failed**: 0
* **Average Room Start Time**: 906 ms
* **Average Match Duration**: 145116 ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: 1227 ms
* **Average Game Token Mint Latency**: 557 ms
* **WebSocket Disconnects**: 0

## Rating Summary
### Top Gainers:
* **loadtest_001**: +13 (1068 -> 1081)
* **loadtest_003**: +0 (979 -> 979)
* **loadtest_004**: +0 (1021 -> 1021)

### Top Losers:
* **loadtest_002**: -13 (932 -> 919)
* **loadtest_003**: 0 (979 -> 979)
* **loadtest_004**: 0 (1021 -> 1021)

## Economy Report
* **Total Coins Spent (Stakes Reserved)**: 640
* **Total Coins Won (Prizes Distributed)**: 540
* **Stuck Reserved Coins**: 0
* **Negative Balance Users**: 0

## ELO & PlayerStats Integrity
* **Expected Ranked Participations**: 6
* **Actual PlayerStats Updates (matchesPlayed delta)**: 2
* **Users with Economy Change but No Stats Change**: 6

## Cleanup Status
* `cleanup skipped: no safe delete path`

## Recommendations
* Check `errors.json` for details on stuck rooms or WebSocket disconnects.
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
