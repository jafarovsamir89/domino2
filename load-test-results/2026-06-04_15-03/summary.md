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
* **Actual Duration**: 290 seconds

## Status
### Fail Reasons:
- User loadtest_009 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_009 played ranked matches but rating delta is 0 (stayed at 1000).
- User loadtest_009 had economy changes (delta: 180) but stats matches delta is 0.
- User loadtest_010 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_010 played ranked matches but rating delta is 0 (stayed at 1000).
- User loadtest_010 had economy changes (delta: -200) but stats matches delta is 0.
- User loadtest_011 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_011 played ranked matches but rating delta is 0 (stayed at 1000).
- User loadtest_011 had economy changes (delta: -200) but stats matches delta is 0.
- User loadtest_012 completed 1 ranked matches, but matches delta is only 0 in database.
- User loadtest_012 played ranked matches but rating delta is 0 (stayed at 1000).
- User loadtest_012 had economy changes (delta: 180) but stats matches delta is 0.

## Matchmaking & Rooms Summary
* **Rooms Created**: 20
* **Rooms Started**: 20
* **Rooms Completed**: 20
* **Rooms Failed**: 0
* **Average Room Start Time**: 875 ms
* **Average Match Duration**: 127371 ms

## API & WebSocket Latencies
* **Average Auth/Profile Latency**: 1818 ms
* **Average Game Token Mint Latency**: 391 ms
* **WebSocket Disconnects**: 0

## Rating Summary
### Top Gainers:
* **loadtest_004**: +20 (1001 -> 1021)
* **loadtest_005**: +20 (1000 -> 1020)
* **loadtest_014**: +20 (1000 -> 1020)

### Top Losers:
* **loadtest_003**: -20 (999 -> 979)
* **loadtest_006**: -20 (1000 -> 980)
* **loadtest_013**: -20 (1000 -> 980)

## Economy Report
* **Total Coins Spent (Stakes Reserved)**: 2200
* **Total Coins Won (Prizes Distributed)**: 1980
* **Stuck Reserved Coins**: 0
* **Negative Balance Users**: 0

## ELO & PlayerStats Integrity
* **Expected Ranked Participations**: 16
* **Actual PlayerStats Updates (matchesPlayed delta)**: 12
* **Users with Economy Change but No Stats Change**: 8

## Cleanup Status
* `cleanup skipped: no safe delete path`

## Recommendations
* Check `errors.json` for details on stuck rooms or WebSocket disconnects.
* Keep an eye on Colyseus room heartbeat timeouts when scaling above 50 users.
