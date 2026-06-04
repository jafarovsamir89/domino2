import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://domino_platform:domino_platform_2026_ChangeMe@localhost:5432/domino2_platform?schema=public"
    }
  }
});

async function main() {
  console.log("=== QUERY 1: PlayerStats for loadtest users ===");
  const query1 = `
    SELECT
      p.id,
      p."displayName",
      p."isGuest",
      p."userId",
      s."rating",
      s."matchesPlayed",
      s."wins",
      s."losses",
      s."draws",
      s."currentStreak",
      s."bestStreak"
    FROM "Player" p
    LEFT JOIN "PlayerStats" s ON s."playerId" = p.id
    WHERE p."displayName" LIKE 'loadtest_%'
    ORDER BY p."displayName";
  `;
  const players = await prisma.$queryRawUnsafe(query1);
  console.table(players);

  console.log("\n=== QUERY 2: MatchParticipant for loadtest users ===");
  const query2 = `
    SELECT
      mp."matchId",
      mp."playerId",
      p."displayName",
      mp."displayNameSnapshot",
      mp."isBot",
      mp."teamIndex",
      mp."result",
      mp."winnerKey",
      mp."points",
      mp."ratingBefore",
      mp."ratingDelta",
      mp."ratingAfter",
      m."mode",
      m."isTeamMode",
      m."winnerKey" AS "matchWinnerKey",
      m."result" AS "matchResult",
      m."createdAt"
    FROM "MatchParticipant" mp
    LEFT JOIN "Player" p ON p.id = mp."playerId"
    LEFT JOIN "Match" m ON m.id = mp."matchId"
    WHERE
      p."displayName" LIKE 'loadtest_%'
      OR mp."displayNameSnapshot" LIKE 'loadtest_%'
    ORDER BY m."createdAt" DESC
    LIMIT 100;
  `;
  const participants = await prisma.$queryRawUnsafe(query2);
  console.table(participants);

  console.log("\n=== QUERY 3: Match Rows ===");
  const query3 = `
    SELECT
      m.id,
      m.mode,
      m."isTeamMode",
      m."roomId",
      m."winnerKey",
      m.result,
      m."totalPoints",
      m."createdAt",
      COUNT(mp.id)::int AS participants
    FROM "Match" m
    LEFT JOIN "MatchParticipant" mp ON mp."matchId" = m.id
    GROUP BY m.id
    ORDER BY m."createdAt" DESC
    LIMIT 50;
  `;
  const matches = await prisma.$queryRawUnsafe(query3);
  console.table(matches);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
