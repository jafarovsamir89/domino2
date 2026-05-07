import type { IncomingHttpHeaders } from "node:http";

import { Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";

import { PrismaService } from "../prisma/prisma.service.js";
import { createGameToken } from "./game-token.js";
import { getBetterAuthConfig } from "./better-auth.config.js";
import { auth } from "./auth.instance.js";

@Injectable()
export class AuthService {
  private readonly config = getBetterAuthConfig();

  constructor(private readonly prisma: PrismaService) {}

  getStatus() {
    return {
      provider: "better-auth",
      phase: "active",
      googleEnabled: Boolean(this.config.google),
      trustedOrigins: this.config.trustedOrigins
    };
  }

  async getSession(headers: IncomingHttpHeaders) {
    return auth.api.getSession({
      headers: fromNodeHeaders(headers)
    });
  }

  async getCurrentProfile(headers: IncomingHttpHeaders) {
    const session = await this.getSession(headers);
    if (!session?.user) {
      return null;
    }

    const player = await this.prisma.player.upsert({
      where: { userId: session.user.id },
      update: {
        displayName: session.user.name
      },
      create: {
        userId: session.user.id,
        displayName: session.user.name,
        isGuest: false
      },
      include: {
        stats: true
      }
    });

    const stats = player.stats
      ? player.stats
      : await this.prisma.playerStats.create({
          data: {
            playerId: player.id
          }
        });

    return {
      session: {
        id: session.session.id,
        expiresAt: session.session.expiresAt
      },
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image ?? null,
        role: session.user.role ?? "player"
      },
      player: {
        id: player.id,
        displayName: player.displayName,
        avatarSeed: player.avatarSeed,
        language: player.language,
        createdAt: player.createdAt,
        updatedAt: player.updatedAt
      },
      stats
    };
  }

  async mintGameToken(headers: IncomingHttpHeaders) {
    const profile = await this.getCurrentProfile(headers);
    if (!profile) {
      return null;
    }

    return {
      token: createGameToken({
        userId: profile.user.id,
        playerId: profile.player.id,
        displayName: profile.player.displayName,
        role: profile.user.role,
        sessionId: profile.session.id,
        provider: "better-auth",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 1000 * 60 * 60 * 12
      }),
      user: profile.user,
      player: profile.player,
      session: profile.session
    };
  }
}
