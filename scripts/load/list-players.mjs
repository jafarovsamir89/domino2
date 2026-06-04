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
      matches: {
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
    if (!p.matches || p.matches.length === 0) {
      console.log(`    None`);
    } else {
      for (const mp of p.matches) {
        console.log(`    - MatchId: ${mp.matchId}`);
        console.log(`      Mode: ${mp.match.mode}, isTeamMode: ${mp.match.isTeamMode}, result: ${mp.result}`);
        console.log(`      WinnerKey: ${mp.match.winnerKey}, points: ${mp.points}, roundWins: ${mp.roundWins}`);
        console.log(`      RatingBefore: ${mp.ratingBefore}, ratingDelta: ${mp.ratingDelta}, ratingAfter: ${mp.ratingAfter}`);
      }
    }
    console.log("-----------------------------------------");
  }

  console.log("\n=== RECENT MATCHES ===");
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const recentMatches = await prisma.match.findMany({
    where: {
      createdAt: { gte: fifteenMinutesAgo }
    },
    include: {
      participants: {
        include: {
          player: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  for (const m of recentMatches) {
    console.log(`Match: ${m.id}`);
    console.log(`  Mode: ${m.mode}, isTeamMode: ${m.isTeamMode}, winnerKey: ${m.winnerKey}, result: ${m.result}, points: ${m.totalPoints}, createdAt: ${m.createdAt}`);
    console.log(`  Participants:`);
    for (const p of m.participants) {
      console.log(`    - Player: ${p.player.displayName}`);
      console.log(`      Points: ${p.points}, roundWins: ${p.roundWins}, result: ${p.result}, teamIndex: ${p.teamIndex}`);
      console.log(`      RatingBefore: ${p.ratingBefore}, ratingDelta: ${p.ratingDelta}, ratingAfter: ${p.ratingAfter}`);
    }
    console.log("-----------------------------------------");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
