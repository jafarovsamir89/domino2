import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";

import { AuthService } from "../auth/auth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

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

    const [players, users, matches, reportsOpen, bansActive] = await Promise.all([
      this.prisma.player.count(),
      this.prisma.user.count(),
      this.prisma.match.count(),
      this.prisma.playerReport.count({ where: { status: "open" } }),
      this.prisma.playerBan.count({ where: { revokedAt: null } })
    ]);

    return {
      phase: "foundation-active",
      metrics: {
        players,
        users,
        matches,
        reportsOpen,
        bansActive
      }
    };
  }

  async listPlayers(headers: AdminHeaders, query: string | undefined, limit: unknown, offset: unknown) {
    await this.requireAdmin(headers);

    const take = normalizePageSize(limit);
    const skip = normalizeOffset(offset);
    const text = String(query || "").trim();

    const players = await this.prisma.player.findMany({
      take,
      skip,
      orderBy: {
        updatedAt: "desc"
      },
      where: text
        ? {
            OR: [
              { displayName: { contains: text, mode: "insensitive" } },
              { user: { email: { contains: text, mode: "insensitive" } } }
            ]
          }
        : undefined,
      include: {
        stats: true,
        user: true
      }
    });

    const items = await Promise.all(players.map(async (player) => {
      const [activeBans, openReports, recentMatches] = await Promise.all([
        this.prisma.playerBan.count({
          where: { playerId: player.id, revokedAt: null }
        }),
        this.prisma.playerReport.count({
          where: { targetPlayerId: player.id, status: "open" }
        }),
        this.prisma.matchParticipant.count({
          where: { playerId: player.id }
        })
      ]);

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
        stats: player.stats,
        activeBans,
        openReports,
        matchCount: recentMatches
      };
    }));

    return {
      items,
      pagination: {
        limit: take,
        offset: skip,
        hasMore: players.length === take
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
      stats: player.stats,
      bans: player.bans,
      reportsIn: player.reportsIn,
      reportsBy: player.reportsBy,
      recentMatches
    };
  }

  async listReports(headers: AdminHeaders) {
    await this.requireAdmin(headers);

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
      items: reports
    };
  }

  async listBans(headers: AdminHeaders) {
    await this.requireAdmin(headers);

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
      items: bans
    };
  }

  async listAuditLogs(headers: AdminHeaders, limit: unknown, offset: unknown) {
    await this.requireAdmin(headers);

    const take = normalizePageSize(limit, 50);
    const skip = normalizeOffset(offset);

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
      items: logs,
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
