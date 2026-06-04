import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const players = await prisma.player.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log("=== PLAYERS ===");
  console.log(JSON.stringify(players, null, 2));

  const inbox = await prisma.inboxMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  console.log("=== INBOX MESSAGES ===");
  console.log(JSON.stringify(inbox, null, 2));

  const dm = await prisma.directMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  console.log("=== DIRECT MESSAGES ===");
  console.log(JSON.stringify(dm, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
