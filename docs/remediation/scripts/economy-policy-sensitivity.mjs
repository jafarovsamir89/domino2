// Deterministic synthetic closed population; never reads DB/env or contacts APIs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const sourcePath = 'apps/api/src/modules/economy/economy.service.ts';
const source = fs.readFileSync(sourcePath, 'utf8');
const rewards = JSON.parse(source.match(/const DEFAULT_DAILY_REWARDS = (\[[^\]]+\])/)[1]);
const starter = Number(fs.readFileSync('apps/api/src/modules/economy/economy-starter.ts', 'utf8').match(/STARTER_COINS = (\d+)/)[1]);
const skinPrice = Number(source.match(/TABLE_SKIN_COIN_PRICE = (\d+)/)[1]);
const rows = [];
for (const policy of ['current_cap7', 'scenario_cycle7']) for (const activity of ['daily', 'five_days_per_week']) for (const matchesPerDay of [0, 4, 12]) {
    const balances = Array(20).fill(starter), streaks = Array(20).fill(0), ownedSkins = Array(20).fill(0);
    let activeDays = 0;
    let minted = 0, commission = 0, skins = 0, completed = 0, blocked = 0;
    for (let day = 1; day <= 90; day++) {
        const active = activity === 'daily' || (day - 1) % 7 < 5;
        if (active) activeDays++;
        for (let i = 0; i < balances.length; i++) {
            if (!active) { streaks[i] = 0; continue; }
            streaks[i]++;
            const amount = rewards[policy === 'current_cap7' ? Math.min(streaks[i], 7) - 1 : (streaks[i] - 1) % 7];
            minted += amount; balances[i] += amount;
        }
        if (active) for (let round = 0; round < matchesPerDay; round++) for (let table = 0; table < 5; table++) {
            const seats = [0, 1, 2, 3].map(offset => table * 4 + offset), stake = 50;
            if (seats.some(i => balances[i] < stake)) { blocked++; continue; }
            const winner = seats[(day + round + table) % 4];
            for (const i of seats) balances[i] -= stake;
            const fee = Math.floor((3 * stake) * 1000 / 10000);
            balances[winner] += 4 * stake - fee;
            commission += fee; completed++;
        }
        // Optional, fixed sensitivity: at most one skin per player every7active days.
        if (active) for (let i = 0; i < balances.length; i++) if (activeDays % 7 === 0 && ownedSkins[i] < 8 && balances[i] >= skinPrice + 5 * 50) { balances[i] -= skinPrice; skins += skinPrice; ownedSkins[i]++; }
        const available = balances.reduce((a, b) => a + b, 0);
        const residual = available + commission + skins - balances.length * starter - minted;
        assert.equal(residual, 0, 'all coins stay in wallets or recorded sinks');
        assert.ok(balances.every(value => Number.isInteger(value) && value >= 0));
        if ([7, 30, 90].includes(day)) rows.push({ policy, activity, matchesPerDay, day, players: balances.length, minted, commission, skins, available, residual, completed, blocked, minimumBalance: Math.min(...balances), medianBalance: [...balances].sort((a,b) => a-b)[10], lastClaimStreakDays: streaks[0], minimumStake: 50 });
    }
}
const output = { schemaVersion: 1, sourcePath, sourceSha256: createHash('sha256').update(source).digest('hex'), defaults: { starter, rewards, skinPrice, minimumStake: 50, commissionBps: 1000 }, scope: '20 synthetic wallets. Balanced deterministic winners,4seat tables, no incoming/outgoing population, no ads/IAP/gifts. Matches mean one stake settlement, not each domino deal. Current code defaults only; production overrides unknown.', limitations: ['Not measured retention or real-user profitability.', 'Cycle7 is a scenario, not an approved product change.', 'Fixed activity/skin spending/win rotation are assumptions.', 'No gift sinks:70%exchange is not modelled as100%destruction.', 'Live-wallet accounting was not read or changed.'], rows };
fs.writeFileSync('docs/remediation/evidence/session-038/economy-policy-sensitivity.json', JSON.stringify(output, null, 2) + '\n');
console.log(`${rows.length} scenario/horizon cells, all residuals0`);
