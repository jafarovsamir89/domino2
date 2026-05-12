import process from "node:process";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function resolveAdminEmail() {
  const arg = process.argv.find((value) => value.startsWith("--email="));
  if (arg) {
    return arg.slice("--email=".length).trim();
  }

  return process.argv[2] ? String(process.argv[2]).trim() : "jafarovsamir@gmail.com";
}

async function main() {
  const adminEmail = resolveAdminEmail();
  const adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, email: true, role: true }
  });

  if (!adminUser) {
    throw new Error(`Admin user not found: ${adminEmail}`);
  }

  const adminPlayer = await prisma.player.findFirst({
    where: { userId: adminUser.id },
    select: { id: true }
  });

  if (!adminPlayer) {
    throw new Error(`Admin player profile not found for user: ${adminEmail}`);
  }

  const before = await Promise.all([
    prisma.user.count(),
    prisma.player.count(),
    prisma.session.count(),
    prisma.account.count(),
    prisma.match.count(),
    prisma.playerReport.count(),
    prisma.playerBan.count(),
    prisma.order.count(),
    prisma.payment.count(),
    prisma.coinLedgerEntry.count()
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.paymentEvent.deleteMany({});
    await tx.payment.deleteMany({});
    await tx.order.deleteMany({});

    await tx.matchParticipant.deleteMany({});
    await tx.playerReport.deleteMany({});
    await tx.match.deleteMany({});

    await tx.friendConnection.deleteMany({});
    await tx.roomInvitation.deleteMany({});
    await tx.playerBan.deleteMany({});
    await tx.adminAuditLog.deleteMany({});

    await tx.coinLedgerEntry.deleteMany({});
    await tx.coinDailyBonusClaim.deleteMany({});
    await tx.coinQuestProgress.deleteMany({});
    await tx.coinMatchStake.deleteMany({});
    await tx.coinTournamentEntry.deleteMany({});
    await tx.playerEntitlement.deleteMany({});

    await tx.playerStats.deleteMany({
      where: {
        playerId: {
          not: adminPlayer.id
        }
      }
    });

    await tx.coinWallet.deleteMany({
      where: {
        playerId: {
          not: adminPlayer.id
        }
      }
    });

    await tx.player.deleteMany({
      where: {
        id: {
          not: adminPlayer.id
        }
      }
    });

    await tx.session.deleteMany({
      where: {
        userId: {
          not: adminUser.id
        }
      }
    });

    await tx.account.deleteMany({
      where: {
        userId: {
          not: adminUser.id
        }
      }
    });

    await tx.verification.deleteMany({});

    await tx.user.deleteMany({
      where: {
        id: {
          not: adminUser.id
        }
      }
    });

    await tx.user.update({
      where: { id: adminUser.id },
      data: {
        role: "admin",
        emailVerified: true
      }
    });

    await tx.player.update({
      where: { id: adminPlayer.id },
      data: {
        isGuest: false
      }
    });
  });

  const after = await Promise.all([
    prisma.user.count(),
    prisma.player.count(),
    prisma.session.count(),
    prisma.account.count(),
    prisma.match.count(),
    prisma.playerReport.count(),
    prisma.playerBan.count(),
    prisma.order.count(),
    prisma.payment.count(),
    prisma.coinLedgerEntry.count()
  ]);

  console.log(
    JSON.stringify(
      {
        adminEmail,
        before: {
          users: before[0],
          players: before[1],
          sessions: before[2],
          accounts: before[3],
          matches: before[4],
          reports: before[5],
          bans: before[6],
          orders: before[7],
          payments: before[8],
          ledgerEntries: before[9]
        },
        after: {
          users: after[0],
          players: after[1],
          sessions: after[2],
          accounts: after[3],
          matches: after[4],
          reports: after[5],
          bans: after[6],
          orders: after[7],
          payments: after[8],
          ledgerEntries: after[9]
        }
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
