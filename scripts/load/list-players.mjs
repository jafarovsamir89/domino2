import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://domino_platform:domino_platform_2026_ChangeMe@localhost:5432/domino2_platform?schema=public"
    }
  }
});

async function main() {
  const player = await prisma.player.findFirst({
    where: { displayName: "loadtest_009" }
  });
  console.log("Player loadtest_009:", JSON.stringify(player, null, 2));

  if (player) {
    const stats = await prisma.playerStats.findUnique({
      where: { playerId: player.id }
    });
    console.log("Stats loadtest_009:", JSON.stringify(stats, null, 2));

    const wallet = await prisma.coinWallet.findUnique({
      where: { playerId: player.id }
    });
    console.log("Wallet loadtest_009:", JSON.stringify(wallet, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
