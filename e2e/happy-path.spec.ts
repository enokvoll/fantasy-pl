import { test, expect } from "@playwright/test"

/**
 * Core user-journey smoke test:
 *   register → create league → fill with bots → simulate a season → standings render.
 *
 * Prerequisite: the database must be migrated and seeded (`npm run db:migrate && npm run db:seed`)
 * so players/fixtures/stats exist. API calls reuse the browser's auth cookie set at registration.
 */
test("happy path: register, create league, simulate, view standings", async ({ page }) => {
  const stamp = Date.now()
  const email = `e2e-${stamp}@example.com`
  const teamName = `E2E FC ${stamp}`

  // 1. Register (sets the session cookie, then redirects to /home).
  await page.goto("/register")
  await page.fill("#name", "E2E Tester")
  await page.fill("#email", email)
  await page.fill("#password", "password123")
  await page.click('button[type="submit"]')
  await page.waitForURL("**/home", { timeout: 30_000 })

  // 2. Create a small league via the API (uses the authenticated browser cookies).
  const createRes = await page.request.post("/api/leagues", {
    data: { name: `E2E League ${stamp}`, teamName, maxTeams: 4, type: "REDRAFT" },
  })
  expect(createRes.ok()).toBeTruthy()
  const { league } = await createRes.json()
  expect(league?.id).toBeTruthy()

  // 3. Fill the remaining 3 spots with bots.
  for (let i = 0; i < 3; i++) {
    const botRes = await page.request.post(`/api/leagues/${league.id}/bots`)
    expect(botRes.ok()).toBeTruthy()
  }

  // 4. Run the full-season simulation (auto-drafts if needed, processes finished gameweeks).
  const simRes = await page.request.post(`/api/simulate/${league.id}`)
  expect(simRes.ok()).toBeTruthy()
  const sim = await simRes.json()
  expect(sim.ok).toBeTruthy()
  // Four teams should be in the standings regardless of how many gameweeks had stat data.
  expect(Array.isArray(sim.standings) && sim.standings.length).toBe(4)

  // 5. The standings page renders with our team listed.
  await page.goto(`/league/${league.id}/standings`)
  await expect(page.getByText(teamName)).toBeVisible()
})
