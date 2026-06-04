import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://domino_platform:domino_platform_2026_ChangeMe@localhost:5432/domino2_platform?schema=public"
    }
  }
});

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "loadtest_009@domino.local" }
  });
  console.log("User loadtest_009:", JSON.stringify(user, null, 2));

  const player = await prisma.player.findFirst({
    where: { displayName: "loadtest_009" }
  });
  console.log("Player loadtest_009:", JSON.stringify(player, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
