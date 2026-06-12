"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { positionBadge } from "@/lib/ui"

interface YouthMember {
  slotId: string
  playerId: number
  name: string
  position: string
  club: string
  totalPoints: number
  developedHere: boolean
  isOnTradeBlock: boolean
}
interface PoolProspect {
  id: number
  name: string
  position: string
  club: string
  totalPoints: number
  minutes: number
}
interface ProspectData {
  youthSlots: number
  youthEnabled: boolean
  eligibility: { maxAge: number; maxMinutes: number }
  youth: YouthMember[]
  pool: PoolProspect[]
}

export function YouthPanel({ teamId }: { teamId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [signing, setSigning] = useState(false)
  const [search, setSearch] = useState("")

  const { data, refetch } = useQuery({
    queryKey: ["prospects", teamId],
    queryFn: async (): Promise<ProspectData | null> => {
      const res = await fetch(`/api/teams/${teamId}/prospects`)
      return res.ok ? await res.json() : null
    },
  })

  if (!data || !data.youthEnabled) return null

  async function act(url: string, body: object, okMsg: string) {
    setBusy(true)
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setBusy(false)
    const json = await res.json().catch(() => ({}))
    if (res.ok) {
      toast.success(okMsg)
      refetch()
      router.refresh()
    } else {
      toast.error(typeof json.error === "string" ? json.error : "Action failed")
    }
  }

  const youth = data.youth
  const full = youth.length >= data.youthSlots
  const pool = data.pool.filter(
    (p) =>
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.club.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-foreground font-heading font-semibold text-sm">Youth squad 🌱</h2>
        <span className={cn("text-xs font-medium", full ? "text-warn" : "text-muted-foreground")}>
          {youth.length}/{data.youthSlots} prospects
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        U{data.eligibility.maxAge} players, yet to break through. Promote one to your senior squad
        (home-grown promotions keep a permanent +5% bonus), trade them, or keep developing.
      </p>

      <div className="divide-y divide-border">
        {youth.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">No prospects yet — sign one below.</p>
        )}
        {youth.map((p) => (
          <div key={p.slotId} className="flex items-center gap-3 py-2">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", positionBadge(p.position))}>{p.position}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">
                {p.name} <span className="text-muted-foreground">{p.club}</span>
                {p.developedHere && <span className="ml-1 text-[10px] text-success" title="Developed here — keeps a bonus if promoted">homegrown</span>}
              </p>
              <p className="text-xs text-muted-foreground">{p.totalPoints} pts</p>
            </div>
            <button
              onClick={() => act(`/api/teams/${teamId}/promote`, { rosterSlotId: p.slotId }, `${p.name} promoted to the senior squad`)}
              disabled={busy}
              className="px-2.5 py-1 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium transition-colors disabled:opacity-50">
              Promote
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <button
          onClick={() => setSigning((s) => !s)}
          disabled={full}
          className="text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline">
          {full ? "Youth squad full" : signing ? "Close" : "+ Sign a prospect"}
        </button>

        {signing && !full && (
          <div className="mt-2 space-y-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prospects…"
              className="w-full bg-muted border border-border rounded-md px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {pool.length === 0 && (
                <p className="text-xs text-muted-foreground p-3 text-center">No eligible prospects found.</p>
              )}
              {pool.slice(0, 50).map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", positionBadge(p.position))}>{p.position}</span>
                  <span className="text-foreground flex-1 truncate">{p.name}</span>
                  <span className="text-muted-foreground">{p.club}</span>
                  <span className="text-muted-foreground tabular-nums">{p.totalPoints}pts</span>
                  <button
                    onClick={() => act(`/api/teams/${teamId}/prospects`, { playerId: p.id }, `${p.name} signed to your youth squad`)}
                    disabled={busy}
                    className="px-2 py-0.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors disabled:opacity-50">
                    Sign
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
