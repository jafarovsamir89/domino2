import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import { OAuth2Client } from "google-auth-library";

import { PrismaService } from "../prisma/prisma.service.js";
import { createGameToken, verifyGameToken } from "./game-token.js";
import { getBetterAuthConfig } from "./better-auth.config.js";
import { auth } from "./auth.instance.js";
import { normalizeRatingGameMode } from "../ranking/player-mode-stats.js";
import { calculatePlayerRating, getPlayerRatingTitleCode } from "../ranking/player-ranking.js";
import { grantStarterCoins } from "../economy/economy-starter.js";

@Injectable()
export class AuthService {
  private readonly config = getBetterAuthConfig();
  private readonly googleOAuthClient = new OAuth2Client();

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

  async getCurrentProfile(headers: IncomingHttpHeaders, gameMode?: string) {
    const session = await this.getSession(headers);
    if (session?.user) {
      return this.buildProfileForSessionUser(session.user, session.session, gameMode);
    }

    const bearerToken = String(headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    const claims = verifyGameToken(bearerToken);
    if (!claims?.userId) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.userId }
    });
    if (!user) {
      return null;
    }

    return this.buildProfileForSessionUser(user, {
      id: claims.sessionId || `token:${claims.userId}`,
      expiresAt: new Date(claims.expiresAt)
    }, gameMode);
  }

  private async buildProfileForSessionUser(
    sessionUser: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role?: string | null;
    },
    sessionData: {
      id: string;
      expiresAt: Date;
    },
    gameMode?: string
  ) {
    const displayName = String(sessionUser.name || sessionUser.email?.split("@")?.[0] || "Player").trim() || "Player";
    const player = await this.prisma.player.upsert({
      where: { userId: sessionUser.id },
      update: {
        displayName
      },
      create: {
        userId: sessionUser.id,
        displayName,
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

    await this.prisma.playerModeStats.upsert({
      where: {
        playerId_gameMode: {
          playerId: player.id,
          gameMode: "telefon"
        }
      },
      update: {},
      create: {
        playerId: player.id,
        gameMode: "telefon",
        rating: stats.rating,
        points: stats.points,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        matchesPlayed: stats.matchesPlayed,
        currentStreak: stats.currentStreak,
        bestStreak: stats.bestStreak
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

    await grantStarterCoins(
      this.prisma,
      player.id,
      sessionUser.id,
      player.displayName || displayName,
      "auth_profile_bootstrap"
    );

    const wallet = await this.prisma.coinWallet.upsert({
      where: { playerId: player.id },
      update: {},
      create: {
        playerId: player.id
      }
    });
    const titleCode = getPlayerRatingTitleCode(nextRating);

    const normalizedGameMode = String(gameMode || "").trim();
    const recentMatches = await this.prisma.matchParticipant.findMany({
      where: {
        playerId: player.id,
        ...(normalizedGameMode === "telefon" || normalizedGameMode === "classic101"
          ? { match: { gameMode: normalizeRatingGameMode(normalizedGameMode) } }
          : {})
      },
      orderBy: {
        match: {
          createdAt: "desc"
        }
      },
      take: 20,
      include: {
        match: {
          select: {
            id: true,
            gameMode: true,
            createdAt: true
          }
        }
      }
    });

    return {
      session: {
        id: sessionData.id,
        expiresAt: sessionData.expiresAt
      },
      user: {
        id: sessionUser.id,
        email: sessionUser.email || "",
        name: displayName,
        image: sessionUser.image ?? null,
        role: sessionUser.role ?? "player"
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
      titleCode,
      recentMatches: recentMatches.map((row) => {
        const gameMode = normalizeRatingGameMode(row.match?.gameMode);
        return {
          id: row.id,
          matchId: row.matchId,
          gameMode,
          mode: gameMode,
          createdAt: row.match?.createdAt?.toISOString?.() || null,
          result: String(row.result || "").toLowerCase() || "draw",
          ratingDelta: Number(row.ratingDelta ?? 0)
        };
      })
    };
  }

  async signInWithGoogleIdToken(idTokenInput?: string, gameMode?: string) {
    if (!this.config.google?.clientIds?.length) {
      throw new BadRequestException("Google sign-in is not configured");
    }

    const idToken = String(idTokenInput || "").trim();
    if (!idToken) {
      throw new BadRequestException("Google ID token is required");
    }

    const ticket = await this.googleOAuthClient.verifyIdToken({
      idToken,
      audience: this.config.google.clientIds
    }).catch(() => {
      throw new UnauthorizedException("Invalid Google ID token");
    });
    const payload = ticket.getPayload();
    const googleAccountId = String(payload?.sub || "").trim();
    const email = String(payload?.email || "").trim().toLowerCase();
    if (!googleAccountId || !email) {
      throw new UnauthorizedException("Invalid Google account payload");
    }

    const name = String(payload?.name || email.split("@")[0] || "Player").trim() || "Player";
    const image = String(payload?.picture || "").trim() || null;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const { user, session } = await this.prisma.$transaction(async (tx) => {
      const linkedAccount = await tx.account.findFirst({
        where: {
          providerId: "google",
          accountId: googleAccountId
        },
        include: {
          user: true
        }
      });

      const user = linkedAccount?.user
        ? await tx.user.update({
            where: { id: linkedAccount.user.id },
            data: {
              name,
              image,
              emailVerified: true
            }
          })
        : await tx.user.upsert({
            where: { email },
            update: {
              name,
              image,
              emailVerified: true
            },
            create: {
              id: randomUUID(),
              email,
              name,
              image,
              emailVerified: true,
              role: "player"
            }
          });

      const account = linkedAccount || await tx.account.findFirst({
        where: {
          providerId: "google",
          accountId: googleAccountId
        }
      });

      if (account) {
        await tx.account.update({
          where: { id: account.id },
          data: {
            userId: user.id,
            idToken
          }
        });
      } else {
        await tx.account.create({
          data: {
            id: randomUUID(),
            accountId: googleAccountId,
            providerId: "google",
            userId: user.id,
            idToken
          }
        });
      }

      const session = await tx.session.create({
        data: {
          id: randomUUID(),
          token: randomUUID(),
          userId: user.id,
          expiresAt
        }
      });

      return { user, session };
    });

    const profile = await this.buildProfileForSessionUser(user, session, gameMode);
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
      if (isHttpsUrl) {
        const response = await fetch(avatarUrl, {
          method: "GET",
          redirect: "follow"
        }).catch((error) => {
          throw new BadRequestException(`Avatar URL could not be loaded: ${String(error?.message || error || "fetch failed")}`);
        });
        if (!response.ok) {
          throw new BadRequestException(`Avatar URL could not be loaded: HTTP ${response.status}`);
        }
        const contentType = String(response.headers.get("content-type") || "").trim().toLowerCase();
        if (!contentType.startsWith("image/")) {
          throw new BadRequestException("Avatar URL must point to an image");
        }
        const contentLength = Number(response.headers.get("content-length") || 0);
        const maxBytes = 2 * 1024 * 1024;
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          throw new BadRequestException("Avatar image is too large");
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > maxBytes) {
          throw new BadRequestException("Avatar image is too large");
        }
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

  async mintGameToken(headers: IncomingHttpHeaders, gameMode?: string) {
    const profile = await this.getCurrentProfile(headers, gameMode);
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
