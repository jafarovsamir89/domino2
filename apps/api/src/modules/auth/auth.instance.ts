import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth";

import { getBetterAuthConfig } from "./better-auth.config.js";
import { grantStarterCoins } from "../economy/economy-starter.js";

const prisma = new PrismaClient();
const config = getBetterAuthConfig();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  secret: config.secret,
  baseURL: config.baseURL,
  trustedOrigins: config.trustedOrigins,
  advanced: {
    crossSubDomainCookies: {
      enabled: true,
      domain: "simplesoft.az",
      additionalCookies: ["session_token", "session_data", "dont_remember", "account_data"]
    }
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await prisma.player.upsert({
            where: { userId: user.id },
            update: {
              displayName: user.name
            },
            create: {
              userId: user.id,
              displayName: user.name,
              isGuest: false
            }
          });

          const player = await prisma.player.findUnique({
            where: { userId: user.id },
            select: { id: true, displayName: true }
          });

          if (!player) return;

          await prisma.playerStats.upsert({
            where: { playerId: player.id },
            update: {},
            create: {
              playerId: player.id
            }
          });

          await grantStarterCoins(
            prisma,
            player.id,
            user.id,
            player.displayName || user.name || "Player",
            "auth_user_create"
          );
        }
      },
      update: {
        after: async (user) => {
          await prisma.player.updateMany({
            where: { userId: user.id },
            data: {
              displayName: user.name
            }
          });
        }
      }
    }
  },
  emailAndPassword: {
    enabled: true,
    password: {
      hash: config.hashPassword,
      verify: config.verifyPassword
    }
  },
  socialProviders: {
    ...(config.google
      ? {
          google: {
            clientId: config.google.clientId,
            clientSecret: config.google.clientSecret
          }
        }
      : {}),
    ...(config.apple
      ? {
          apple: {
            clientId: config.apple.clientId,
            clientSecret: config.apple.clientSecret
          }
        }
      : {})
  },
  user: {
    additionalFields: {
      role: {
        type: ["player", "moderator", "admin", "superadmin"],
        required: false,
        defaultValue: "player",
        input: false
      }
    }
  }
});
