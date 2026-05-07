# Economy System for Domino

## Goal
Add a server-authoritative coin economy on top of Domino2 so coins support progression, matchmaking stakes, cosmetics, quests and tournaments without affecting match fairness.

Coins must never:
- change tile outcomes
- change turn order
- give gameplay advantages
- replace rating

## Scope
The economy lives in PostgreSQL and is exposed through the NestJS platform API and the admin panel.

### Included
- wallet balances
- immutable ledger entries
- daily login rewards
- quest progress and quest rewards
- match stakes and settlements
- tournament entry and payout records
- cosmetic shop items and entitlements
- admin dashboards and config editing
- future hooks for ads and Stripe coin packs

### Excluded for v1
- paid checkout flow
- ad network integration
- tournament bracket engine
- anything that changes core domino logic

## Principles
1. The server is the source of truth.
2. Every balance change must create a ledger row.
3. Idempotency is required for grants and settlements.
4. Free play must always remain available.
5. Ratings and coins are separate systems.
6. Guests can play free tables, but only linked platform identities participate in stakes.

## Data Model
### Core tables
- `CoinEconomyConfig`
- `CoinWallet`
- `CoinLedgerEntry`
- `CoinDailyBonusClaim`
- `CoinQuest`
- `CoinQuestProgress`
- `CoinStakeTable`
- `CoinMatchStake`
- `CoinTournament`
- `CoinTournamentEntry`
- `CatalogProduct`
- `CatalogPrice`
- `Order`
- `Payment`
- `PaymentEvent`
- `PlayerEntitlement`

### Ledger types
- `grant`
- `spend`
- `reserve`
- `release`
- `payout`
- `refund`
- `daily_bonus`
- `quest_reward`
- `achievement_reward`
- `tournament_entry`
- `tournament_prize`
- `admin_adjustment`
- `shop_purchase`
- `ad_reward`

## Match Stakes
### Stake flow
1. Room starts with a selected stake table.
2. The server reserves coins for each eligible player before the match starts.
3. If a player lacks balance, the room falls back to free play.
4. At the end of the match the bank is settled.
5. Winners get the bank minus commission.
6. Draws and aborted matches refund reserved stake.

### Rules
- stake coins are reserved, not silently deducted
- settlement must be server-verified
- game logic remains unchanged by economy state

## Rewards
### Sources
- daily login bonus
- quests
- achievements
- tournament rewards
- admin grants
- future ad rewards

### Anti-abuse
- one daily claim per UTC day
- quest progress is server-side
- reward actions are idempotent
- no client-authoritative balance edits

## Admin Panel
Required views:
- economy overview
- wallet list
- wallet detail with ledger trail
- stake table management
- quest management
- catalog management
- tournament management
- suspicious activity / audit trail

## Future Monetization Hooks
Prepare but do not enable:
- coin packs
- ad rewards
- stripe checkout
- webhook-based entitlements

## Current Implementation Notes
- PostgreSQL schema and migration added
- Economy API module added to NestJS
- Match reservation and settlement integrated into room flow
- Admin surface is being expanded
- Online room now supports stake selection

## Open Risks
- wallet and ledger entries must remain consistent under retries
- settlement must never double-pay
- guest fallback must stay on free tables
- admin edits must be audited
- coin economy must stay independent from rating logic

