import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://domino_platform:domino_platform_2026_ChangeMe@localhost:5432/domino2_platform?schema=public"
    }
  }
});

async function main() {
  const players = await prisma.player.findMany({
    where: { displayName: { startsWith: "loadtest_" } },
    include: {
      stats: true,
      wallet: true,
      matchParticipants: {
        include: {
          match: true
        }
      }
    },
    orderBy: { displayName: "asc" }
  });

  console.log("=== LOADTEST PLAYERS DIAGNOSTICS ===");
  for (const p of players) {
    console.log(`Player: ${p.displayName} (ID: ${p.id})`);
    console.log(`  Stats: rating=${p.stats?.rating}, matchesPlayed=${p.stats?.matchesPlayed}, wins=${p.stats?.wins}, losses=${p.stats?.losses}`);
    console.log(`  Wallet: balance=${p.wallet?.balance}, reserved=${p.wallet?.reserved}`);
    console.log(`  Matches:`);
    if (!p.matchParticipants || p.matchParticipants.length === 0) {
      console.log(`    None`);
    } else {
      for (const mp of p.matchParticipants) {
        console.log(`    - MatchId: ${mp.matchId}`);
        console.log(`      Mode: ${mp.match.mode}, isTeamMode: ${mp.match.isTeamMode}, result: ${mp.result}`);
        console.log(`      WinnerKey: ${mp.match.winnerKey}, points: ${mp.points}, roundWins: ${mp.roundWins}`);
        console.log(`      RatingBefore: ${mp.ratingBefore}, ratingDelta: ${mp.ratingDelta}, ratingAfter: ${mp.ratingAfter}`);
      }
    }
    console.log("-----------------------------------------");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
