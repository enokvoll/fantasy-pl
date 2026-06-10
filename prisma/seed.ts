/**
 * Seed the database with real FPL source data (teams, players, gameweeks,
 * fixtures, and historical gameweek stats). This is "FPL data only" — it does
 * NOT create any demo users or leagues; you create those live in the app.
 *
 * Run with: npm run db:seed   (requires DATABASE_URL in .env and an applied schema)
 */
import { syncPlayers, syncGameweeks, syncFixtures } from "@/lib/fpl-sync"
import { syncAllHistoricalGameweeks } from "@/lib/sim-runner"

async function main() {
  console.log("⏳ Seeding FPL data — this hits the public FPL API and may take a minute…\n")

  const { teams, players } = await syncPlayers()
  console.log(`✓ Teams synced:     ${teams}`)
  console.log(`✓ Players synced:   ${players}`)

  const gameweeks = await syncGameweeks()
  console.log(`✓ Gameweeks synced: ${gameweeks}`)

  const fixtures = await syncFixtures()
  console.log(`✓ Fixtures synced:  ${fixtures}`)

  // Backfill per-gameweek player stats so season simulation has data to score.
  const { synced, skipped } = await syncAllHistoricalGameweeks()
  console.log(`✓ Stat gameweeks:   ${synced.length} synced, ${skipped.length} skipped`)

  if (players === 0) {
    throw new Error("No players synced — the FPL API may be unavailable or the season not started.")
  }

  console.log("\n✅ Seed complete. Create a league in the app to start drafting.")
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e instanceof Error ? e.message : e)
    process.exit(1)
  })
