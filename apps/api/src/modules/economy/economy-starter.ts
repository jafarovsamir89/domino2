import type { Prisma, PrismaClient } from "@prisma/client";

export const STARTER_COINS = 1000;

type EconomyDb = PrismaClient | Prisma.TransactionClient;

function starterIdempotencyKey(userId: string) {
  return `starter-coins:${userId}`;
}

export async function grantStarterCoins(
  db: EconomyDb,
  playerId: string,
  userId: string,
  displayName: string,
  source: string
) {
  const idempotencyKey = starterIdempotencyKey(userId);
  const existing = await db.coinLedgerEntry.findUnique({
    where: { idempotencyKey },
    select: { id: true }
  });

  if (existing) {
    return null;
  }

  const wallet = await db.coinWallet.upsert({
    where: { playerId },
    update: {},
    create: { playerId }
  });

  const updated = await db.coinWallet.update({
    where: { playerId },
    data: {
      balance: wallet.balance + STARTER_COINS,
      lifetimeEarned: wallet.lifetimeEarned + STARTER_COINS
    }
  });

  await db.coinLedgerEntry.create({
    data: {
      playerId,
      type: "grant",
      amount: STARTER_COINS,
      balanceBefore: wallet.balance,
      balanceAfter: updated.balance,
      reservedBefore: wallet.reserved,
      reservedAfter: updated.reserved,
      referenceType: "starter_grant",
      referenceId: userId,
      idempotencyKey,
      note: `${displayName} starter coins`,
      payloadJson: {
        amount: STARTER_COINS,
        source,
        displayName
      } as Prisma.InputJsonValue
    }
  });

  return updated;
}
