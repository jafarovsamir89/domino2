import process from "node:process";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function resolveArg(name) {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3).trim() : "";
}

function resolveInput() {
  return {
    email: resolveArg("email"),
    password: resolveArg("password"),
    name: resolveArg("name") || "Domino Admin"
  };
}

function getAuthBaseUrl() {
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}

async function createAdminAccount({ email, password, name }) {
  const response = await fetch(`${getAuthBaseUrl()}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: getAuthBaseUrl()
    },
    body: JSON.stringify({
      email,
      password,
      name,
      rememberMe: true
    })
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    if (!message.includes("already") && !message.includes("exists")) {
      throw new Error(`Better Auth sign-up failed (${response.status}): ${message || response.statusText}`);
    }
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: "admin"
    },
    create: {
      id: randomUUID(),
      name,
      email,
      role: "admin",
      emailVerified: true
    }
  });

  await prisma.player.upsert({
    where: { userId: user.id },
    update: {
      displayName: name,
      isGuest: false
    },
    create: {
      userId: user.id,
      displayName: name,
      isGuest: false
    }
  });

  const player = await prisma.player.findUnique({
    where: { userId: user.id },
    select: { id: true }
  });

  if (player) {
    await prisma.playerStats.upsert({
      where: { playerId: player.id },
      update: {},
      create: {
        playerId: player.id
      }
    });
  }

  return user;
}

async function main() {
  const { email, password, name } = resolveInput();

  if (!email || !password) {
    throw new Error("Usage: node bootstrap-admin-user.mjs --email=user@example.com --password=StrongPassword123 --name='Admin Name'");
  }

  const user = await createAdminAccount({ email, password, name });
  console.log(`Bootstrap admin ready: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
