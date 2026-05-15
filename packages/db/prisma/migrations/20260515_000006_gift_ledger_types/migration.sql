-- Add gift-specific ledger types for social economy events
ALTER TYPE "CoinLedgerType" ADD VALUE IF NOT EXISTS 'gift_send';
ALTER TYPE "CoinLedgerType" ADD VALUE IF NOT EXISTS 'gift_exchange';
