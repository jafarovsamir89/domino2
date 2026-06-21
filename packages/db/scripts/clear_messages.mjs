import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning up message tables...");

  try {
    const threadCount = await prisma.$executeRawUnsafe(`TRUNCATE TABLE "direct_message_thread" CASCADE;`);
    console.log("Cleared direct_message_thread table if it existed:", threadCount);
  } catch (err) {
    console.log("direct_message_thread table does not exist yet, skipping.");
  }

  try {
    const dmCount = await prisma.directMessage.deleteMany({});
    console.log("Cleared direct_message table:", dmCount);
  } catch (err) {
    console.log("Error clearing direct_message:", err.message);
  }

  console.log("Cleanup complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
