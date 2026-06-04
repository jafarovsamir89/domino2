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
      NOT: {
        displayName: {
          startsWith: "loadtest_"
        }
      }
    },
    select: {
      id: true,
      displayName: true,
      userId: true
    }
  });
  console.log("Non-loadtest players:", JSON.stringify(players, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
