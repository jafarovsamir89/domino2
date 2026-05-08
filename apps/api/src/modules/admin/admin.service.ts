import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";

import { AuthService } from "../auth/auth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { calculatePlayerRating, getPlayerRatingTitleCode } from "../ranking/player-ranking.js";

type AdminHeaders = Record<string, string | string[] | undefined>;

function normalizeRole(role: unknown) {
  return String(role || "player");
}

function normalizePageSize(value: unknown, fallback = 25) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, parsed));
}

function normalizeOffset(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeFilter(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

@Injectable()
export class AdminService {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService
  ) {}

  private async requireAdmin(headers: AdminHeaders) {
    const session = await this.authService.getSession(headers as never);
    const role = normalizeRole(session?.user?.role);
    if (!session?.user) {
      throw new UnauthorizedException("Admin session required");
    }
    if (role !== "admin" && role !== "superadmin") {
      throw new ForbiddenException("Admin role required");
    }
    return session;
  }

  async getOverview(headers: AdminHeaders) {
    await this.requireAdmin(headers);

    const [players, users, matches, reportsOpen, bansActive, wallets, balanceAgg, reservedAgg, stakeTables] = await Promise.all([
      this.prisma.player.count(),
      this.prisma.user.count(),
      this.prisma.match.count(),
      this.prisma.playerReport.count({ where: { status: "open" } }),
      this.prisma.playerBan.count({ where: { revokedAt: null } }),
      this.prisma.coinWallet.count(),
      this.prisma.coinWallet.aggregate({ _sum: { balance: true } }),
      this.prisma.coinWallet.aggregate({ _sum: { reserved: true } }),
      this.prisma.coinStakeTable.count({ where: { isActive: true } })
    ]);

    return {
      phase: "foundation-active",
      metrics: {
        players,
        users,
        matches,
        reportsOpen,
        bansActive,
        wallets,
        coinsInCirculation: balanceAgg._sum.balance || 0,
        coinsReserved: reservedAgg._sum.reserved || 0,
        stakeTables
      }
    };
  }

  async listPlayers(
    headers: AdminHeaders,
    query: string | undefined,
    limit: unknown,
    offset: unknown,
    scope?: string,
    sort?: string
  ) {
    await this.requireAdmin(headers);

    const take = normalizePageSize(limit);
    const skip = normalizeOffset(offset);
    const text = String(query || "").trim();
    const nextScope = normalizeFilter(scope);
    const nextSort = normalizeFilter(sort);

    const players = await this.prisma.player.findMany({
      orderBy: {
        updatedAt: "desc"
      },
      include: {
        stats: true,
        user: true,
        bans: {
          where: { revokedAt: null },
          take: 1
        },
        reportsIn: {
          where: { status: "open" },
          take: 1
        },
        wallet: true
      }
    });

    const items = players
      .map((player) => {
        const rating = player.stats ? calculatePlayerRating(player.stats) : 1000;
        return {
          id: player.id,
          userId: player.userId,
          displayName: player.displayName,
          avatarSeed: player.avatarSeed,
          isGuest: player.isGuest,
          language: player.language,
          createdAt: player.createdAt,
          updatedAt: player.updatedAt,
          user: player.user
            ? {
                id: player.user.id,
                email: player.user.email,
                role: player.user.role || "player",
                emailVerified: player.user.emailVerified
              }
            : null,
          stats: player.stats
            ? {
                ...player.stats,
                rating,
                titleCode: getPlayerRatingTitleCode(rating)
              }
            : null,
          wallet: player.wallet,
          activeBans: player.bans.length,
          openReports: player.reportsIn.length
        };
      })
      .filter((item) => {
        const searchable = `${item.displayName} ${item.user?.email ?? ""}`.toLowerCase();
        const matchesText = !text || searchable.includes(text.toLowerCase());
        const matchesScope =
          !nextScope ||
          nextScope === "all" ||
          (nextScope === "guests" && item.isGuest) ||
          (nextScope === "linked" && Boolean(item.userId)) ||
          (nextScope === "flagged" && (item.activeBans > 0 || item.openReports > 0));
        return matchesText && matchesScope;
      })
      .sort((a, b) => {
        switch (nextSort) {
          case "rating":
            return (b.stats?.rating ?? 1000) - (a.stats?.rating ?? 1000);
          case "matches":
            return (b.stats?.matchesPlayed ?? 0) - (a.stats?.matchesPlayed ?? 0);
          case "flags":
            return (b.activeBans + b.openReports) - (a.activeBans + a.openReports);
          case "updated":
          default:
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }
      });

    const pagedItems = items.slice(skip, skip + take);

    return {
      items: pagedItems,
      pagination: {
        limit: take,
        offset: skip,
        hasMore: items.length > skip + take
      }
    };
  }

  async getPlayer(headers: AdminHeaders, id: string) {
    await this.requireAdmin(headers);

    const player = await this.prisma.player.findUnique({
      where: { id },
      include: {
        stats: true,
        user: true,
        bans: {
          orderBy: {
            createdAt: "desc"
          }
        },
        reportsIn: {
          orderBy: {
            createdAt: "desc"
          },
          include: {
            reporter: true,
            match: true
          }
        },
        reportsBy: {
          orderBy: {
            createdAt: "desc"
          },
          include: {
            target: true,
            match: true
          }
        },
        wallet: true,
        dailyClaims: {
          orderBy: {
            createdAt: "desc"
          },
          take: 20
        },
        ledgerEntries: {
          orderBy: {
            createdAt: "desc"
          },
          take: 40
        },
        matchStakes: {
          include: {
            stakeTable: true
          },
          orderBy: {
            reservedAt: "desc"
          },
          take: 20
        }
      }
    });

    if (!player) {
      return null;
    }

    const recentMatches = await this.prisma.matchParticipant.findMany({
      where: { playerId: player.id },
      orderBy: {
        match: {
          createdAt: "desc"
        }
      },
      take: 20,
      include: {
        match: true
      }
    });

    return {
      id: player.id,
      userId: player.userId,
      displayName: player.displayName,
      avatarSeed: player.avatarSeed,
      isGuest: player.isGuest,
      language: player.language,
      createdAt: player.createdAt,
      updatedAt: player.updatedAt,
      user: player.user
        ? {
            id: player.user.id,
            email: player.user.email,
            role: player.user.role || "player",
            emailVerified: player.user.emailVerified,
            image: player.user.image
          }
        : null,
      stats: player.stats
        ? {
            ...player.stats,
            rating: calculatePlayerRating(player.stats),
            titleCode: getPlayerRatingTitleCode(calculatePlayerRating(player.stats))
          }
        : null,
      wallet: player.wallet
        ? {
            ...player.wallet,
            availableBalance: Math.max(0, player.wallet.balance),
            spendableBalance: Math.max(0, player.wallet.balance),
            reservedBalance: player.wallet.reserved
          }
        : null,
      bans: player.bans,
      reportsIn: player.reportsIn,
      reportsBy: player.reportsBy,
      dailyClaims: player.dailyClaims,
      ledgerEntries: player.ledgerEntries,
      matchStakes: player.matchStakes,
      recentMatches
    };
  }

  async listReports(headers: AdminHeaders, status?: string, query?: string) {
    await this.requireAdmin(headers);
    const nextStatus = normalizeFilter(status);
    const nextQuery = normalizeFilter(query);

    const reports = await this.prisma.playerReport.findMany({
      orderBy: {
        createdAt: "desc"
      },
      include: {
        reporter: {
          include: {
            user: true
          }
        },
        target: {
          include: {
            user: true
          }
        },
        match: true
      }
    });

    return {
      items: reports.filter((report) => {
        const matchesStatus = !nextStatus || nextStatus === "all" || report.status === nextStatus;
        const searchable = [
          report.reason,
          report.reporter.displayName,
          report.target.displayName,
          report.reporter.user?.email || "",
          report.target.user?.email || ""
        ].join(" ").toLowerCase();
        const matchesQuery = !nextQuery || searchable.includes(nextQuery);
        return matchesStatus && matchesQuery;
      })
    };
  }

  async listBans(headers: AdminHeaders, status?: string) {
    await this.requireAdmin(headers);
    const nextStatus = normalizeFilter(status);

    const bans = await this.prisma.playerBan.findMany({
      orderBy: {
        createdAt: "desc"
      },
      include: {
        player: {
          include: {
            user: true
          }
        },
        createdByUser: true,
        revokedByUser: true
      }
    });

    return {
      items: bans.filter((ban) => {
        const active = ban.revokedAt === null;
        if (!nextStatus || nextStatus === "all") return true;
        if (nextStatus === "active") return active;
        if (nextStatus === "revoked") return !active;
        return true;
      })
    };
  }

  async listAuditLogs(headers: AdminHeaders, limit: unknown, offset: unknown, action?: string, entityType?: string) {
    await this.requireAdmin(headers);

    const take = normalizePageSize(limit, 50);
    const skip = normalizeOffset(offset);
    const nextAction = normalizeFilter(action);
    const nextEntityType = normalizeFilter(entityType);

    const logs = await this.prisma.adminAuditLog.findMany({
      take,
      skip,
      orderBy: {
        createdAt: "desc"
      },
      include: {
        adminUser: true
      }
    });

    return {
      items: logs.filter((log) => {
        const matchesAction = !nextAction || log.action.toLowerCase().includes(nextAction);
        const matchesEntity = !nextEntityType || log.entityType.toLowerCase().includes(nextEntityType);
        return matchesAction && matchesEntity;
      }),
      pagination: {
        limit: take,
        offset: skip,
        hasMore: logs.length === take
      }
    };
  }

  async banPlayer(headers: AdminHeaders, playerId: string, body: { reason?: string; expiresAt?: string | null }) {
    const session = await this.requireAdmin(headers);
    const reason = String(body.reason || "").trim();
    if (!reason) {
      throw new ForbiddenException("Reason is required");
    }

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const ban = await this.prisma.$transaction(async (tx) => {
      const created = await tx.playerBan.create({
        data: {
          playerId,
          reason,
          expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
          createdByUserId: session.user.id
        },
        include: {
          player: {
            include: {
              user: true
            }
          }
        }
      });

      await tx.adminAuditLog.create({
        data: {
          adminUserId: session.user.id,
          action: "player.ban",
          entityType: "PlayerBan",
          entityId: created.id,
          payloadJson: {
            playerId,
            reason,
            expiresAt: created.expiresAt
          }
        }
      });

      return created;
    });

    return { ban };
  }

  async revokeBan(headers: AdminHeaders, banId: string) {
    const session = await this.requireAdmin(headers);

    const ban = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.playerBan.update({
        where: { id: banId },
        data: {
          revokedAt: new Date(),
          revokedByUserId: session.user.id
        },
        include: {
          player: {
            include: {
              user: true
            }
          }
        }
      });

      await tx.adminAuditLog.create({
        data: {
          adminUserId: session.user.id,
          action: "player.ban.revoke",
          entityType: "PlayerBan",
          entityId: updated.id,
          payloadJson: {
            playerId: updated.playerId
          }
        }
      });

      return updated;
    });

    return { ban };
  }

  async resolveReport(headers: AdminHeaders, reportId: string, body: { status?: "resolved" | "rejected" }) {
    const session = await this.requireAdmin(headers);
    const status = body.status === "rejected" ? "rejected" : "resolved";

    const report = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.playerReport.update({
        where: { id: reportId },
        data: {
          status,
          resolvedAt: new Date(),
          resolvedByUserId: session.user.id
        },
        include: {
          reporter: {
            include: {
              user: true
            }
          },
          target: {
            include: {
              user: true
            }
          },
          match: true
        }
      });

      await tx.adminAuditLog.create({
        data: {
          adminUserId: session.user.id,
          action: `report.${status}`,
          entityType: "PlayerReport",
          entityId: updated.id,
          payloadJson: {
            reportId: updated.id,
            status
          }
        }
      });

      return updated;
    });

    return { report };
  }
}
