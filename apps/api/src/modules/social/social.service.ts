import type { IncomingHttpHeaders } from "node:http";

import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AuthService } from "../auth/auth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

type PlayerSummary = {
  id: string;
  displayName: string;
  avatarSeed: string | null;
  isGuest: boolean;
  createdAt?: Date | string | null;
};

type FriendRow = {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  relation: "incoming" | "outgoing" | "accepted";
  friend: PlayerSummary;
};

type RoomInviteRow = {
  id: string;
  status: string;
  roomId: string;
  roomCode: string | null;
  roomMode: string;
  stakeKey: string | null;
  stakeAmount: number;
  humanSeats: number;
  totalPlayers: number;
  isTeamMode: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  expiresAt: string | null;
  inviter: PlayerSummary;
  invitee: PlayerSummary;
};

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  private async getCurrentPlayer(headers: IncomingHttpHeaders) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player?.id) {
      throw new UnauthorizedException("Sign in required");
    }

    return profile.player;
  }

  private playerSelect() {
    return {
      id: true,
      displayName: true,
      avatarSeed: true,
      isGuest: true,
      createdAt: true
    } as const;
  }

  private summarizePlayer(player: { id: string; displayName: string; avatarSeed?: string | null; isGuest?: boolean; createdAt?: Date | string | null }): PlayerSummary {
    return {
      id: player.id,
      displayName: player.displayName,
      avatarSeed: player.avatarSeed ?? null,
      isGuest: Boolean(player.isGuest),
      createdAt: player.createdAt ?? null
    };
  }

  private summarizeFriend(
    currentPlayerId: string,
    row: {
      id: string;
      requesterPlayerId: string;
      addresseePlayerId: string;
      status: string;
      note: string | null;
      createdAt: Date;
      updatedAt: Date;
      respondedAt: Date | null;
      requester: { id: string; displayName: string; avatarSeed: string | null; isGuest: boolean };
      addressee: { id: string; displayName: string; avatarSeed: string | null; isGuest: boolean };
    }
  ): FriendRow {
    const isRequester = row.requesterPlayerId === currentPlayerId;
    const friend = isRequester ? row.addressee : row.requester;
    const relation = row.status === "accepted"
      ? "accepted"
      : isRequester
        ? "outgoing"
        : "incoming";

    return {
      id: row.id,
      status: row.status,
      note: row.note ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      relation,
      friend: this.summarizePlayer(friend)
    };
  }

  private summarizeInvite(
    row: {
      id: string;
      roomId: string;
      roomCode: string | null;
      roomMode: string;
      stakeKey: string | null;
      stakeAmount: number;
      humanSeats: number;
      totalPlayers: number;
      isTeamMode: boolean;
      status: string;
      note: string | null;
      createdAt: Date;
      updatedAt: Date;
      respondedAt: Date | null;
      expiresAt: Date | null;
      inviter: { id: string; displayName: string; avatarSeed: string | null; isGuest: boolean };
      invitee: { id: string; displayName: string; avatarSeed: string | null; isGuest: boolean };
    }
  ): RoomInviteRow {
    return {
      id: row.id,
      status: row.status,
      roomId: row.roomId,
      roomCode: row.roomCode,
      roomMode: row.roomMode,
      stakeKey: row.stakeKey ?? null,
      stakeAmount: row.stakeAmount,
      humanSeats: row.humanSeats,
      totalPlayers: row.totalPlayers,
      isTeamMode: row.isTeamMode,
      note: row.note ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      inviter: this.summarizePlayer(row.inviter),
      invitee: this.summarizePlayer(row.invitee)
    };
  }

  async getFriends(headers: IncomingHttpHeaders) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const currentPlayerId = currentPlayer.id;
    const rows = await this.prisma.friendConnection.findMany({
      where: {
        OR: [
          { requesterPlayerId: currentPlayerId },
          { addresseePlayerId: currentPlayerId }
        ]
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" }
      ]
    });

    const accepted = rows
      .filter((row) => row.status === "accepted")
      .map((row) => this.summarizeFriend(currentPlayerId, row));
    const incoming = rows
      .filter((row) => row.status === "pending" && row.addresseePlayerId === currentPlayerId)
      .map((row) => this.summarizeFriend(currentPlayerId, row));
    const outgoing = rows
      .filter((row) => row.status === "pending" && row.requesterPlayerId === currentPlayerId)
      .map((row) => this.summarizeFriend(currentPlayerId, row));

    return {
      accepted,
      incoming,
      outgoing,
      items: rows.map((row) => this.summarizeFriend(currentPlayerId, row))
    };
  }

  async searchPlayers(headers: IncomingHttpHeaders, query?: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const search = String(query || "").trim();
    if (!search) {
      return { items: [] };
    }

    const players = await this.prisma.player.findMany({
      where: {
        id: { not: currentPlayer.id },
        isGuest: false,
        displayName: {
          contains: search,
          mode: "insensitive"
        }
      },
      select: this.playerSelect(),
      orderBy: [
        { displayName: "asc" }
      ],
      take: 12
    });

    return {
      items: players.map((player) => this.summarizePlayer(player))
    };
  }

  async requestFriend(headers: IncomingHttpHeaders, body: { playerId?: string; note?: string }) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const targetPlayerId = String(body?.playerId || "").trim();
    const note = String(body?.note || "").trim() || null;
    if (!targetPlayerId) {
      throw new NotFoundException("Player not found");
    }
    if (targetPlayerId === currentPlayer.id) {
      throw new ForbiddenException("You cannot add yourself");
    }

    const targetPlayer = await this.prisma.player.findUnique({
      where: { id: targetPlayerId },
      select: this.playerSelect()
    });
    if (!targetPlayer) {
      throw new NotFoundException("Player not found");
    }
    if (targetPlayer.isGuest) {
      throw new ForbiddenException("Guest players cannot be added as friends");
    }

    const acceptedFriendship = await this.prisma.friendConnection.findFirst({
      where: {
        status: "accepted",
        OR: [
          { requesterPlayerId: currentPlayer.id, addresseePlayerId: targetPlayerId },
          { requesterPlayerId: targetPlayerId, addresseePlayerId: currentPlayer.id }
        ]
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });
    if (acceptedFriendship) {
      return {
        item: this.summarizeFriend(currentPlayer.id, acceptedFriendship)
      };
    }

    const reversePending = await this.prisma.friendConnection.findFirst({
      where: {
        status: "pending",
        requesterPlayerId: targetPlayerId,
        addresseePlayerId: currentPlayer.id
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });
    if (reversePending) {
      const accepted = await this.prisma.friendConnection.update({
        where: { id: reversePending.id },
        data: {
          status: "accepted",
          respondedAt: new Date(),
          note
        },
        include: {
          requester: { select: this.playerSelect() },
          addressee: { select: this.playerSelect() }
        }
      });
      return {
        item: this.summarizeFriend(currentPlayer.id, accepted)
      };
    }

    const pending = await this.prisma.friendConnection.upsert({
      where: {
        requesterPlayerId_addresseePlayerId: {
          requesterPlayerId: currentPlayer.id,
          addresseePlayerId: targetPlayerId
        }
      },
      create: {
        requesterPlayerId: currentPlayer.id,
        addresseePlayerId: targetPlayerId,
        status: "pending",
        note
      },
      update: {
        status: "pending",
        note
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });

    return {
      item: this.summarizeFriend(currentPlayer.id, pending)
    };
  }

  async acceptFriend(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const row = await this.prisma.friendConnection.findUnique({
      where: { id },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });
    if (!row) {
      throw new NotFoundException("Friend request not found");
    }
    if (row.addresseePlayerId !== currentPlayer.id && row.requesterPlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Friend request not found");
    }

    const accepted = await this.prisma.friendConnection.update({
      where: { id },
      data: {
        status: "accepted",
        respondedAt: new Date()
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });

    return { item: this.summarizeFriend(currentPlayer.id, accepted) };
  }

  async declineFriend(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const row = await this.prisma.friendConnection.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException("Friend request not found");
    }
    if (row.addresseePlayerId !== currentPlayer.id && row.requesterPlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Friend request not found");
    }

    const declined = await this.prisma.friendConnection.update({
      where: { id },
      data: {
        status: "rejected",
        respondedAt: new Date()
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });

    return { item: this.summarizeFriend(currentPlayer.id, declined) };
  }

  async removeFriend(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const row = await this.prisma.friendConnection.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException("Friend relationship not found");
    }
    if (row.addresseePlayerId !== currentPlayer.id && row.requesterPlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Friend relationship not found");
    }

    await this.prisma.friendConnection.delete({ where: { id } });
    return { ok: true };
  }

  async getRoomInvitations(headers: IncomingHttpHeaders) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const rows = await this.prisma.roomInvitation.findMany({
      where: {
        OR: [
          { inviterPlayerId: currentPlayer.id },
          { inviteePlayerId: currentPlayer.id }
        ]
      },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" }
      ]
    });

    const incoming = rows
      .filter((row) => row.inviteePlayerId === currentPlayer.id)
      .map((row) => this.summarizeInvite(row));
    const sent = rows
      .filter((row) => row.inviterPlayerId === currentPlayer.id)
      .map((row) => this.summarizeInvite(row));

    return { incoming, sent, items: rows.map((row) => this.summarizeInvite(row)) };
  }

  async inviteFriendToRoom(
    headers: IncomingHttpHeaders,
    roomId: string,
    body: {
      inviteePlayerId?: string;
      roomCode?: string | null;
      roomMode?: string;
      stakeKey?: string;
      stakeAmount?: number;
      humanSeats?: number;
      totalPlayers?: number;
      isTeamMode?: boolean;
      note?: string;
      payloadJson?: unknown;
      expiresAt?: string | null;
    }
  ) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const cleanRoomId = String(roomId || "").trim();
    if (!cleanRoomId) {
      throw new NotFoundException("Room not found");
    }
    const inviteePlayerId = String(body?.inviteePlayerId || "").trim();
    if (!inviteePlayerId) {
      throw new NotFoundException("Invitee not found");
    }
    if (inviteePlayerId === currentPlayer.id) {
      throw new ForbiddenException("You cannot invite yourself");
    }

    const invitee = await this.prisma.player.findUnique({
      where: { id: inviteePlayerId },
      select: this.playerSelect()
    });
    if (!invitee) {
      throw new NotFoundException("Invitee not found");
    }
    if (invitee.isGuest) {
      throw new ForbiddenException("Guest players cannot receive room invitations");
    }

    const isFriend = await this.prisma.friendConnection.findFirst({
      where: {
        status: "accepted",
        OR: [
          { requesterPlayerId: currentPlayer.id, addresseePlayerId: inviteePlayerId },
          { requesterPlayerId: inviteePlayerId, addresseePlayerId: currentPlayer.id }
        ]
      }
    });
    if (!isFriend) {
      throw new ForbiddenException("Invitee must be your friend");
    }

    const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 1000 * 60 * 60 * 24);
    const payloadJson = body?.payloadJson === undefined ? null : body.payloadJson;
    const payloadJsonData = payloadJson === null ? {} : { payloadJson: payloadJson as Prisma.InputJsonValue };
    const roomCode = String(body?.roomCode || "").trim() || null;
    const roomMode = String(body?.roomMode || (body?.isTeamMode ? "team" : "ffa") || "ffa").trim();
    const note = String(body?.note || "").trim() || null;

    const existing = await this.prisma.roomInvitation.findFirst({
      where: {
        roomId: cleanRoomId,
        inviterPlayerId: currentPlayer.id,
        inviteePlayerId,
        status: "pending"
      },
      orderBy: { createdAt: "desc" }
    });

    const row = existing
      ? await this.prisma.roomInvitation.update({
          where: { id: existing.id },
          data: {
            roomCode,
            roomMode,
            stakeKey: String(body?.stakeKey || "").trim() || null,
            stakeAmount: Math.max(0, Number(body?.stakeAmount || 0)),
            humanSeats: Math.max(0, Number(body?.humanSeats || 0)),
            totalPlayers: Math.max(0, Number(body?.totalPlayers || 0)),
            isTeamMode: Boolean(body?.isTeamMode),
            note,
            ...payloadJsonData,
            expiresAt
          },
          include: {
            inviter: { select: this.playerSelect() },
            invitee: { select: this.playerSelect() }
          }
        })
      : await this.prisma.roomInvitation.create({
          data: {
            roomId: cleanRoomId,
            roomCode,
            roomMode,
            stakeKey: String(body?.stakeKey || "").trim() || null,
            stakeAmount: Math.max(0, Number(body?.stakeAmount || 0)),
            humanSeats: Math.max(0, Number(body?.humanSeats || 0)),
            totalPlayers: Math.max(0, Number(body?.totalPlayers || 0)),
            isTeamMode: Boolean(body?.isTeamMode),
            inviterPlayerId: currentPlayer.id,
            inviteePlayerId,
            note,
            ...payloadJsonData,
            expiresAt
          },
          include: {
            inviter: { select: this.playerSelect() },
            invitee: { select: this.playerSelect() }
          }
        });

    return { item: this.summarizeInvite(row as any) };
  }

  async acceptRoomInvitation(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const row = await this.prisma.roomInvitation.findUnique({
      where: { id },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });
    if (!row) {
      throw new NotFoundException("Invitation not found");
    }
    if (row.inviteePlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Invitation not found");
    }

    const accepted = await this.prisma.roomInvitation.update({
      where: { id },
      data: {
        status: "accepted",
        respondedAt: new Date()
      },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });

    return { item: this.summarizeInvite(accepted) };
  }

  async declineRoomInvitation(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const row = await this.prisma.roomInvitation.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException("Invitation not found");
    }
    if (row.inviteePlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Invitation not found");
    }

    const declined = await this.prisma.roomInvitation.update({
      where: { id },
      data: {
        status: "declined",
        respondedAt: new Date()
      },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });

    return { item: this.summarizeInvite(declined) };
  }
}
