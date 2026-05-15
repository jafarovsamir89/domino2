import type { IncomingHttpHeaders } from "node:http";

import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";

import { PrismaService } from "../prisma/prisma.service.js";
import { createGameToken } from "./game-token.js";
import { getBetterAuthConfig } from "./better-auth.config.js";
import { auth } from "./auth.instance.js";
import { calculatePlayerRating, getPlayerRatingTitleCode } from "../ranking/player-ranking.js";

@Injectable()
export class AuthService {
  private readonly config = getBetterAuthConfig();

  constructor(private readonly prisma: PrismaService) {}

  getStatus() {
    return {
      provider: "better-auth",
      phase: "active",
      googleEnabled: Boolean(this.config.google),
      googleClientId: this.config.google?.clientIds?.[0] || null,
      appleEnabled: Boolean(this.config.apple),
      emailRecoveryEnabled: true,
      passwordResetEnabled: true,
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

    const nextRating = calculatePlayerRating(stats);
    if (stats.rating !== nextRating) {
      await this.prisma.playerStats.update({
        where: { playerId: player.id },
        data: {
          rating: nextRating
        }
      });
    }

    const wallet = await this.prisma.coinWallet.upsert({
      where: { playerId: player.id },
      update: {},
      create: {
        playerId: player.id
      }
    });
    const titleCode = getPlayerRatingTitleCode(nextRating);

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
        avatarUrl: player.avatarUrl,
        tableSkinKey: player.tableSkinKey,
        language: player.language,
        createdAt: player.createdAt,
        updatedAt: player.updatedAt
      },
      stats: {
        ...stats,
        rating: nextRating,
        titleCode
      },
      wallet: {
        ...wallet,
        availableBalance: Math.max(0, wallet.balance),
        spendableBalance: Math.max(0, wallet.balance),
        reservedBalance: wallet.reserved
      },
      coins: wallet.balance,
      titleCode
    };
  }

  async updateCurrentProfileName(headers: IncomingHttpHeaders, nameInput?: string) {
    const session = await this.getSession(headers);
    if (!session?.user?.id) {
      throw new UnauthorizedException("Not authenticated");
    }

    const name = String(nameInput || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/[^\p{L}\p{N} _.-]/gu, "")
      .trim()
      .slice(0, 24);
    if (!name) {
      throw new BadRequestException("Name is required");
    }

    await this.prisma.user.update({
      where: { id: session.user.id },
      data: { name }
    });

    await this.prisma.player.updateMany({
      where: { userId: session.user.id },
      data: { displayName: name }
    });

    return this.getCurrentProfile(headers);
  }

  async updateCurrentProfileAvatar(headers: IncomingHttpHeaders, avatarUrlInput?: string | null) {
    const session = await this.getSession(headers);
    if (!session?.user?.id) {
      throw new UnauthorizedException("Not authenticated");
    }

    const raw = avatarUrlInput === null || avatarUrlInput === undefined ? null : String(avatarUrlInput).trim();
    const avatarUrl = raw
      ? raw.slice(0, 120_000)
      : null;

    if (avatarUrl) {
      const isDataUrl = /^data:image\/(png|jpe?g|webp);base64,/i.test(avatarUrl);
      const isHttpsUrl = /^https:\/\/[^\s"']+$/i.test(avatarUrl);
      if (!isDataUrl && !isHttpsUrl) {
        throw new BadRequestException("Unsupported avatar image format");
      }
    }

    await this.prisma.player.upsert({
      where: { userId: session.user.id },
      update: { avatarUrl },
      create: {
        userId: session.user.id,
        displayName: session.user.name,
        isGuest: false,
        avatarUrl
      }
    });

    return this.getCurrentProfile(headers);
  }

  async mintGameToken(headers: IncomingHttpHeaders) {
    const profile = await this.getCurrentProfile(headers);
    if (!profile) {
      return null;
    }

    return {
      profile,
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
      session: profile.session,
      stats: profile.stats,
      wallet: profile.wallet,
      coins: profile.coins,
      titleCode: profile.titleCode
    };
  }
}
