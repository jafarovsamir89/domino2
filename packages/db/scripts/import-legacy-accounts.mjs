import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { PrismaClient } from "@prisma/client";

import {
  encodeLegacyPasswordFromParts,
  makeLegacyAliasEmail,
  normalizeLegacyName
} from "../../shared/src/legacy-auth.js";

const prisma = new PrismaClient();

function resolveInputPath() {
  const arg = process.argv[2];
  if (arg) return path.resolve(process.cwd(), arg);
  return path.resolve(process.cwd(), "../../server/data/accounts.json");
}

function readLegacyPayload(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function normalizeLegacyNameKey(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24)
    .toLowerCase();
}

async function importPlayers(users = []) {
  const playerMap = new Map();

  for (const legacyUser of users) {
    const displayName = normalizeLegacyName(legacyUser.name);
    const player = await prisma.player.upsert({
      where: { legacyUserId: legacyUser.id },
      update: {
        legacyNameKey: legacyUser.nameKey || normalizeLegacyNameKey(legacyUser.name),
        displayName,
        avatarSeed: legacyUser.avatarSeed || null,
        isGuest: Boolean(legacyUser.isGuest)
      },
      create: {
        legacyUserId: legacyUser.id,
        legacyNameKey: legacyUser.nameKey || normalizeLegacyNameKey(legacyUser.name),
        displayName,
        avatarSeed: legacyUser.avatarSeed || null,
        isGuest: Boolean(legacyUser.isGuest),
        createdAt: legacyUser.createdAt ? new Date(legacyUser.createdAt) : undefined,
        updatedAt: legacyUser.updatedAt ? new Date(legacyUser.updatedAt) : undefined
      }
    });

    await prisma.playerStats.upsert({
      where: { playerId: player.id },
      update: {
        rating: legacyUser.rating || 1000,
        points: legacyUser.points || 0,
        wins: legacyUser.wins || 0,
        losses: legacyUser.losses || 0,
        draws: legacyUser.draws || 0,
        matchesPlayed: legacyUser.matchesPlayed || 0,
        currentStreak: legacyUser.currentStreak || 0,
        bestStreak: legacyUser.bestStreak || 0
      },
      create: {
        playerId: player.id,
        rating: legacyUser.rating || 1000,
        points: legacyUser.points || 0,
        wins: legacyUser.wins || 0,
        losses: legacyUser.losses || 0,
        draws: legacyUser.draws || 0,
        matchesPlayed: legacyUser.matchesPlayed || 0,
        currentStreak: legacyUser.currentStreak || 0,
        bestStreak: legacyUser.bestStreak || 0
      }
    });

    playerMap.set(legacyUser.id, player);
  }

  return playerMap;
}

async function importAuthUsers(users = []) {
  for (const legacyUser of users) {
    if (legacyUser.isGuest) continue;

    const displayName = normalizeLegacyName(legacyUser.name);
    const email = makeLegacyAliasEmail(legacyUser.email || legacyUser.name, displayName);
    const password = encodeLegacyPasswordFromParts(legacyUser.passwordSalt, legacyUser.passwordHash);

    await prisma.user.upsert({
      where: { id: legacyUser.id },
      update: {
        name: displayName,
        email,
        emailVerified: true,
        role: "player"
      },
      create: {
        id: legacyUser.id,
        name: displayName,
        email,
        emailVerified: true,
        role: "player"
      }
    });

    await prisma.account.upsert({
      where: {
        id: legacyUser.id
      },
      update: {
        accountId: legacyUser.id,
        providerId: "credential",
        userId: legacyUser.id,
        password
      },
      create: {
        id: legacyUser.id,
        accountId: legacyUser.id,
        providerId: "credential",
        userId: legacyUser.id,
        password
      }
    });
  }
}

async function importMatches(matches = [], playerMap) {
  for (const legacyMatch of matches) {
    const match = await prisma.match.upsert({
      where: { id: legacyMatch.id },
      update: {
        mode: legacyMatch.mode || "legacy",
        isTeamMode: Boolean(legacyMatch.isTeamMode),
        roomId: legacyMatch.roomId || null,
        winnerKey: legacyMatch.winnerKey || null,
        totalPoints: legacyMatch.totalPoints || 0,
        result: null
      },
      create: {
        id: legacyMatch.id,
        mode: legacyMatch.mode || "legacy",
        isTeamMode: Boolean(legacyMatch.isTeamMode),
        roomId: legacyMatch.roomId || null,
        winnerKey: legacyMatch.winnerKey || null,
        totalPoints: legacyMatch.totalPoints || 0,
        result: null,
        createdAt: legacyMatch.createdAt ? new Date(legacyMatch.createdAt) : undefined
      }
    });

    if (!Array.isArray(legacyMatch.participants)) continue;

    await prisma.matchParticipant.deleteMany({
      where: { matchId: match.id }
    });

    for (const participant of legacyMatch.participants) {
      const linkedPlayer = participant.userId ? playerMap.get(participant.userId) : null;

      await prisma.matchParticipant.create({
        data: {
          matchId: match.id,
          playerId: linkedPlayer?.id || null,
          displayNameSnapshot: participant.name || "Player",
          teamIndex: participant.teamIndex ?? null,
          winnerKey: participant.winnerKey || null,
          result: participant.result || null,
          points: participant.points || 0,
          roundWins: participant.roundWins || 0,
          ratingBefore: participant.ratingBefore ?? null,
          ratingDelta: participant.ratingDelta ?? null,
          ratingAfter: participant.ratingAfter ?? null,
          isBot: false
        }
      });
    }
  }
}

async function main() {
  const inputPath = resolveInputPath();
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Legacy accounts file not found: ${inputPath}`);
  }

  const payload = readLegacyPayload(inputPath);
  const users = Array.isArray(payload.users) ? payload.users : [];
  const matches = Array.isArray(payload.matches) ? payload.matches : [];

  const playerMap = await importPlayers(users);
  await importAuthUsers(users);
  await importMatches(matches, playerMap);

  console.log(`Imported ${users.length} legacy player profiles, auth users, and ${matches.length} matches from ${inputPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
