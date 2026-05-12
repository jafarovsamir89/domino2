import process from "node:process";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_CONFIG_KEY = "default";
const STARTER_COINS = 1000;

const DEFAULT_STAKES = [
  { key: "free", title: "Free table", stakeAmount: 0, commissionBps: 0, isFree: true, isActive: true, sortOrder: 0 },
  { key: "stake_50", title: "50 coins", stakeAmount: 50, commissionBps: 500, isFree: false, isActive: true, sortOrder: 1 },
  { key: "stake_100", title: "100 coins", stakeAmount: 100, commissionBps: 500, isFree: false, isActive: true, sortOrder: 2 },
  { key: "stake_200", title: "200 coins", stakeAmount: 200, commissionBps: 500, isFree: false, isActive: true, sortOrder: 3 },
  { key: "stake_500", title: "500 coins", stakeAmount: 500, commissionBps: 500, isFree: false, isActive: true, sortOrder: 4 },
  { key: "stake_1000", title: "1,000 coins", stakeAmount: 1000, commissionBps: 500, isFree: false, isActive: true, sortOrder: 5 },
  { key: "stake_5000", title: "5,000 coins", stakeAmount: 5000, commissionBps: 500, isFree: false, isActive: true, sortOrder: 6 }
];

function resolveAdminEmail() {
  const arg = process.argv.find((value) => value.startsWith("--email="));
  if (arg) {
    return arg.slice("--email=".length).trim();
  }

  return process.argv[2] ? String(process.argv[2]).trim() : "jafarovsamir@gmail.com";
}

async function main() {
  const adminEmail = resolveAdminEmail();
  const user = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  if (!user) {
    throw new Error(`Admin user not found: ${adminEmail}`);
  }

  const player = await prisma.player.upsert({
    where: { userId: user.id },
    update: {
      displayName: user.name,
      isGuest: false
    },
    create: {
      userId: user.id,
      displayName: user.name,
      isGuest: false
    }
  });

  const stats = await prisma.playerStats.upsert({
    where: { playerId: player.id },
    update: {},
    create: {
      playerId: player.id
    }
  });

  await prisma.$transaction(async (tx) => {
    await tx.coinEconomyConfig.upsert({
      where: { key: DEFAULT_CONFIG_KEY },
      update: {},
      create: { key: DEFAULT_CONFIG_KEY }
    });

    for (const stake of DEFAULT_STAKES) {
      await tx.coinStakeTable.upsert({
        where: { key: stake.key },
        update: {
          title: stake.title,
          stakeAmount: stake.stakeAmount,
          commissionBps: stake.commissionBps,
          isFree: stake.isFree,
          isActive: stake.isActive,
          sortOrder: stake.sortOrder
        },
        create: stake
      });
    }

    const idempotencyKey = `starter-coins:${user.id}`;
    const existing = await tx.coinLedgerEntry.findUnique({
      where: { idempotencyKey },
      select: { id: true }
    });

    const wallet = await tx.coinWallet.upsert({
      where: { playerId: player.id },
      update: {},
      create: { playerId: player.id }
    });

    if (!existing) {
      const updated = await tx.coinWallet.update({
        where: { playerId: player.id },
        data: {
          balance: wallet.balance + STARTER_COINS,
          lifetimeEarned: wallet.lifetimeEarned + STARTER_COINS
        }
      });

      await tx.coinLedgerEntry.create({
        data: {
          playerId: player.id,
          type: "grant",
          amount: STARTER_COINS,
          balanceBefore: wallet.balance,
          balanceAfter: updated.balance,
          reservedBefore: wallet.reserved,
          reservedAfter: updated.reserved,
          referenceType: "starter_grant",
          referenceId: user.id,
          idempotencyKey,
          note: `${user.name} starter coins`,
          payloadJson: {
            amount: STARTER_COINS,
            source: "bootstrap-economy-and-rating",
            displayName: user.name
          }
        }
      });
    }
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      role: "admin",
      emailVerified: true
    }
  });

  await prisma.player.update({
    where: { id: player.id },
    data: {
      isGuest: false
    }
  });

  console.log(
    JSON.stringify(
      {
        adminEmail,
        playerId: player.id,
        rating: stats.rating,
        coinsSeeded: true
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
