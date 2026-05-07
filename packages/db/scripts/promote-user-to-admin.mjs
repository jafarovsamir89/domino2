import process from "node:process";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function resolveEmail() {
  const arg = process.argv.find((value) => value.startsWith("--email="));
  if (arg) {
    return arg.slice("--email=".length).trim();
  }

  return process.argv[2] ? String(process.argv[2]).trim() : "";
}

async function main() {
  const email = resolveEmail();
  if (!email) {
    throw new Error("Usage: node promote-user-to-admin.mjs --email=user@example.com");
  }

  const user = await prisma.user.update({
    where: { email },
    data: {
      role: "admin"
    }
  });

  console.log(`Promoted ${user.email} to admin`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
