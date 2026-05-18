-- Harden money and invite integrity

DO $$ BEGIN
    ALTER TABLE "CoinWallet"
        ADD CONSTRAINT "CoinWallet_balance_non_negative_chk" CHECK ("balance" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CoinWallet"
        ADD CONSTRAINT "CoinWallet_reserved_non_negative_chk" CHECK ("reserved" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CoinWallet"
        ADD CONSTRAINT "CoinWallet_lifetimeEarned_non_negative_chk" CHECK ("lifetimeEarned" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CoinWallet"
        ADD CONSTRAINT "CoinWallet_lifetimeSpent_non_negative_chk" CHECK ("lifetimeSpent" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CoinLedgerEntry"
        ADD CONSTRAINT "CoinLedgerEntry_balanceBefore_non_negative_chk" CHECK ("balanceBefore" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CoinLedgerEntry"
        ADD CONSTRAINT "CoinLedgerEntry_balanceAfter_non_negative_chk" CHECK ("balanceAfter" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CoinLedgerEntry"
        ADD CONSTRAINT "CoinLedgerEntry_reservedBefore_non_negative_chk" CHECK ("reservedBefore" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CoinLedgerEntry"
        ADD CONSTRAINT "CoinLedgerEntry_reservedAfter_non_negative_chk" CHECK ("reservedAfter" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CoinStakeTable"
        ADD CONSTRAINT "CoinStakeTable_stakeAmount_non_negative_chk" CHECK ("stakeAmount" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CoinStakeTable"
        ADD CONSTRAINT "CoinStakeTable_commissionBps_range_chk" CHECK ("commissionBps" >= 0 AND "commissionBps" <= 10000);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CoinMatchStake"
        ADD CONSTRAINT "CoinMatchStake_stakeAmount_non_negative_chk" CHECK ("stakeAmount" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CoinMatchStake"
        ADD CONSTRAINT "CoinMatchStake_commissionBps_range_chk" CHECK ("commissionBps" >= 0 AND "commissionBps" <= 10000);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "RoomInvitation"
        ADD CONSTRAINT "RoomInvitation_stakeAmount_non_negative_chk" CHECK ("stakeAmount" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "RoomInvitation"
        ADD CONSTRAINT "RoomInvitation_humanSeats_non_negative_chk" CHECK ("humanSeats" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "RoomInvitation"
        ADD CONSTRAINT "RoomInvitation_totalPlayers_non_negative_chk" CHECK ("totalPlayers" >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "MatchParticipant_matchId_playerId_key" ON "MatchParticipant"("matchId", "playerId");

CREATE UNIQUE INDEX IF NOT EXISTS "RoomInvitation_pending_unique_idx"
    ON "RoomInvitation"("roomId", "inviterPlayerId", "inviteePlayerId")
    WHERE "status" = 'pending';
