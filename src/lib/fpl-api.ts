import type { FplBootstrapResponse, FplFixture, FplLiveResponse } from "@/types/fpl"

const FPL_BASE = "https://fantasy.premierleague.com/api"

const FPL_HEADERS = {
  "User-Agent": "Mozilla/5.0 FantasyPL-App/1.0",
  "Accept": "application/json",
}

async function fplFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${FPL_BASE}${path}`, {
    headers: FPL_HEADERS,
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`FPL API ${path} returned ${res.status}`)
  return res.json() as Promise<T>
}

export async function getBootstrap(): Promise<FplBootstrapResponse> {
  return fplFetch<FplBootstrapResponse>("/bootstrap-static/")
}

export async function getFixtures(eventId?: number): Promise<FplFixture[]> {
  const path = eventId ? `/fixtures/?event=${eventId}` : "/fixtures/"
  return fplFetch<FplFixture[]>(path)
}

export async function getLiveGameweek(eventId: number): Promise<FplLiveResponse> {
  return fplFetch<FplLiveResponse>(`/event/${eventId}/live/`)
}
