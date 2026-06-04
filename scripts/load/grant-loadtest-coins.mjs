import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://domino_platform:domino_platform_2026_ChangeMe@localhost:5432/domino2_platform?schema=public"
    }
  }
});

async function main() {
  const players = await prisma.player.findMany({
    where: {
      displayName: {
        startsWith: "loadtest_"
      }
    }
  });

  console.log(`Found ${players.length} loadtest players.`);

  for (const player of players) {
    const wallet = await prisma.coinWallet.upsert({
      where: { playerId: player.id },
      update: {
        balance: 1000000,
        reserved: 0
      },
      create: {
        playerId: player.id,
        balance: 1000000,
        reserved: 0
      }
    });
    console.log(`Updated player ${player.displayName} (id: ${player.id}) to ${wallet.balance} coins.`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
