"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

const STEPS = ["League basics", "Draft settings", "Roster & scoring", "Waivers", "Review"]

export default function CreateLeaguePage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: "",
    teamName: "",
    type: "REDRAFT",
    scoringType: "H2H",
    maxTeams: "10",
    season: "2026-27",
    draftType: "SNAKE",
    draftPickTimeSeconds: "90",
    waiverType: "ROLLING",
    faabBudget: "1000",
    botCount: "0",
    rookieDraftRounds: "3",
    rookieDraftOrder: "REVERSE_STANDINGS",
    youthSquadEnabled: false,
    youthSlots: "3",
    youthDraftRounds: "3",
    formationBoosts: true,
    rosterConfig: { GK: 1, DEF: 4, MID: 4, FWD: 2, BENCH: 5, FLEX: 0 },
  })

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function submit() {
    setLoading(true)
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          maxTeams: parseInt(form.maxTeams),
          draftPickTimeSeconds: parseInt(form.draftPickTimeSeconds),
          faabBudget: form.waiverType === "FAAB" || form.waiverType === "MARKETPLACE" ? parseInt(form.faabBudget) : undefined,
          rookieDraftRounds: parseInt(form.rookieDraftRounds),
          youthSlots: parseInt(form.youthSlots),
          youthDraftRounds: parseInt(form.youthDraftRounds),
        }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        toast.error(typeof error === "string" ? error : "Failed to create league")
        return
      }
      const { league } = await res.json()
      // Add bots
      const bots = parseInt(form.botCount)
      for (let i = 0; i < bots; i++) {
        await fetch(`/api/leagues/${league.id}/bots`, { method: "POST" })
      }
      toast.success(`League created${bots > 0 ? ` with ${bots} bot${bots > 1 ? "s" : ""}` : ""}!`)
      router.push(`/league/${league.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Create a league</h1>
        {/* Step indicator */}
        <div className="flex items-center gap-2 mt-4">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {i < step ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 w-8 ${i < step ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-sm mt-3">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 && (
            <>
              <Field label="League name">
                <Input value={form.name} onChange={e => set("name", e.target.value)}
                  placeholder="e.g. The Gaffer's Cup" className="bg-muted border-border text-foreground" />
              </Field>
              <Field label="Your team name">
                <Input value={form.teamName} onChange={e => set("teamName", e.target.value)}
                  placeholder="e.g. Salah's Saviors" className="bg-muted border-border text-foreground" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="League type">
                  <SelectField value={form.type} onChange={v => set("type", v)}
                    options={[["REDRAFT","Redraft"],["KEEPER","Keeper"],["DYNASTY","Dynasty"]]} />
                </Field>
                <Field label="Max teams">
                  <SelectField value={form.maxTeams} onChange={v => set("maxTeams", v)}
                    options={["4","6","8","10","12","14","16"].map(n => [n, `${n} teams`])} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Scoring type">
                  <SelectField value={form.scoringType} onChange={v => set("scoringType", v)}
                    options={[["H2H","Head-to-head"],["TOTAL_POINTS","Total points"],["ROTO","Rotisserie"]]} />
                </Field>
                <Field label="Season">
                  <SelectField value={form.season} onChange={v => set("season", v)}
                    options={[["2025-26","2025-26"],["2026-27","2026-27"]]} />
                </Field>
              </div>

              <Field label="Fill remaining spots with bots 🤖">
                <div className="space-y-2">
                  <SelectField
                    value={form.botCount}
                    onChange={v => set("botCount", v)}
                    options={Array.from({ length: parseInt(form.maxTeams) }, (_, i) => [
                      String(i),
                      i === 0 ? "No bots — human players only" : `${i} bot${i > 1 ? "s" : ""}`
                    ])}
                  />
                  {parseInt(form.botCount) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Bots auto-pick using best-available-player logic. Great for testing or filling empty spots.
                    </p>
                  )}
                </div>
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Draft format">
                <SelectField value={form.draftType} onChange={v => set("draftType", v)}
                  options={[["SNAKE","Snake draft"],["SLOW","Slow draft (email)"],["AUCTION","Auction draft"]]} />
              </Field>
              <Field label="Pick time limit (seconds)">
                <SelectField value={form.draftPickTimeSeconds} onChange={v => set("draftPickTimeSeconds", v)}
                  options={[["30","30s"],["60","60s"],["90","90s (default)"],["120","2 min"],["180","3 min"]]} />
              </Field>
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-foreground text-sm">
                  <span className="font-semibold text-foreground">Snake draft:</span> Teams pick in a serpentine order. Round 1 is 1→N, round 2 is N→1, etc. Each player can only be on one team.
                </p>
              </div>

              {form.type === "DYNASTY" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Rookie draft rounds">
                      <SelectField value={form.rookieDraftRounds} onChange={v => set("rookieDraftRounds", v)}
                        options={["1","2","3","4","5"].map(n => [n, `${n} round${n === "1" ? "" : "s"}`])} />
                    </Field>
                    <Field label="Rookie draft order">
                      <SelectField value={form.rookieDraftOrder} onChange={v => set("rookieDraftOrder", v)}
                        options={[
                          ["REVERSE_STANDINGS","Reverse standings (linear)"],
                          ["REVERSE_STANDINGS_SNAKE","Reverse standings (snake)"],
                          ["KEEP_ORDER","Keep prior order"],
                        ]} />
                    </Field>
                  </div>
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/40 text-sm text-foreground">
                    <strong className="text-primary">Dynasty:</strong> Rosters carry over every season. Each new season runs only a short rookie draft of un-rostered players — worst teams pick first. Teams at their roster limit must cut a player to make room.
                  </div>

                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, youthSquadEnabled: !f.youthSquadEnabled }))}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border border-border text-left hover:bg-muted transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">Youth squad 🌱</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Extra slots for U21 prospects. Draft them, then promote, trade, or develop — home-grown promotions keep a permanent +5% bonus.
                      </p>
                    </div>
                    <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${form.youthSquadEnabled ? "bg-accent2" : "bg-muted-foreground/40"}`}>
                      <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${form.youthSquadEnabled ? "translate-x-5" : ""}`} />
                    </span>
                  </button>

                  {form.youthSquadEnabled && (
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Youth squad size">
                        <SelectField value={form.youthSlots} onChange={v => set("youthSlots", v)}
                          options={["2","3","4","5"].map(n => [n, `${n} prospects`])} />
                      </Field>
                      <Field label="Youth draft rounds">
                        <SelectField value={form.youthDraftRounds} onChange={v => set("youthDraftRounds", v)}
                          options={["1","2","3","4","5"].map(n => [n, `${n} round${n === "1" ? "" : "s"}`])} />
                      </Field>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-muted-foreground text-sm">Default FPL roster: 1 GK, 4 DEF, 4 MID, 2 FWD + 5 bench</p>
              <div className="grid grid-cols-3 gap-4">
                {(["GK","DEF","MID","FWD","BENCH"] as const).map(pos => (
                  <Field key={pos} label={pos === "BENCH" ? "Bench spots" : `${pos} starters`}>
                    <Input type="number" min={pos === "GK" ? 1 : 0} max={10}
                      value={form.rosterConfig[pos]}
                      onChange={e => setForm(f => ({ ...f, rosterConfig: { ...f.rosterConfig, [pos]: parseInt(e.target.value) || 0 } }))}
                      className="bg-muted border-border text-foreground" />
                  </Field>
                ))}
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border text-sm text-foreground">
                Scoring uses the official <span className="text-foreground font-medium">FPL points system</span> — goals, assists, clean sheets, bonus points, etc.
              </div>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, formationBoosts: !f.formationBoosts }))}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border border-border text-left hover:bg-muted transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">Tactical formation boosts</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Reward formations — e.g. 3-4-3 gives forwards +10% on goals, 4-4-2 gives all starters +3%.
                  </p>
                </div>
                <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${form.formationBoosts ? "bg-primary" : "bg-muted"}`}>
                  <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${form.formationBoosts ? "translate-x-5" : ""}`} />
                </span>
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <Field label="Waiver type">
                <SelectField value={form.waiverType} onChange={v => set("waiverType", v)}
                  options={[
                    ["ROLLING","Rolling waivers"],
                    ["FAAB","FAAB bidding"],
                    ["REVERSE_STANDINGS","Reverse standings"],
                    ["CONTINUOUS","Continuous waivers"],
                    ["FREE_AGENT","Free agents (no waivers)"],
                    ["MARKETPLACE","Transfer market (live auctions)"],
                  ]} />
              </Field>
              {(form.waiverType === "FAAB" || form.waiverType === "MARKETPLACE") && (
                <Field label="FAAB budget per team (£)">
                  <Input type="number" min={100} value={form.faabBudget} onChange={e => set("faabBudget", e.target.value)}
                    className="bg-muted border-border text-foreground" />
                </Field>
              )}
              <div className="p-3 rounded-lg bg-muted/50 border border-border text-sm text-foreground">
                {form.waiverType === "MARKETPLACE" ? (
                  <><strong className="text-foreground">Transfer market:</strong> Free agents go to open, eBay-style auctions — managers outbid each other with their FAAB budget until the deadline (late bids extend it). Plus team-to-team trades with counter-offers and package deals.</>
                ) : (
                  <><strong className="text-foreground">Rolling waivers:</strong> Priority order rotates — teams who win a claim move to last place.</>
                )}
              </div>
            </>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <ReviewRow label="League name" value={form.name} />
              <ReviewRow label="Your team" value={form.teamName} />
              <ReviewRow label="League type" value={form.type} />
              {form.type === "DYNASTY" && (
                <>
                  <ReviewRow label="Rookie draft" value={`${form.rookieDraftRounds} round${form.rookieDraftRounds === "1" ? "" : "s"}`} />
                  <ReviewRow label="Rookie order" value={form.rookieDraftOrder.replace(/_/g, " ").toLowerCase()} />
                  <ReviewRow label="Youth squad" value={form.youthSquadEnabled ? `${form.youthSlots} prospects · ${form.youthDraftRounds}-round draft` : "Disabled"} />
                </>
              )}
              <ReviewRow label="Scoring" value={form.scoringType} />
              <ReviewRow label="Max teams" value={`${form.maxTeams} teams`} />
              <ReviewRow label="Draft format" value={form.draftType} />
              <ReviewRow label="Pick time" value={`${form.draftPickTimeSeconds}s`} />
              <ReviewRow label="Roster" value={`${form.rosterConfig.GK}GK ${form.rosterConfig.DEF}DEF ${form.rosterConfig.MID}MID ${form.rosterConfig.FWD}FWD + ${form.rosterConfig.BENCH} bench`} />
              <ReviewRow label="Formation boosts" value={form.formationBoosts ? "Enabled" : "Disabled"} />
              <ReviewRow label="Waivers" value={form.waiverType} />
              {parseInt(form.botCount) > 0 && (
                <ReviewRow label="Bots" value={`${form.botCount} auto-pick bot${parseInt(form.botCount) > 1 ? "s" : ""} 🤖`} />
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <Button variant="outline" className="border-border text-foreground hover:bg-muted" onClick={() => setStep(s => s - 1)}>
                Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold ml-auto"
                onClick={() => setStep(s => s + 1)}
                disabled={step === 0 && (!form.name.trim() || !form.teamName.trim())}>
                Continue →
              </Button>
            ) : (
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold ml-auto"
                onClick={submit} disabled={loading}>
                {loading ? "Creating…" : "Create league"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-foreground text-sm font-medium">{label}</Label>
      {children}
    </div>
  )
}

function SelectField({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: (string | [string, string])[]
}) {
  return (
    <Select value={value} onValueChange={(v) => { if (v !== null) onChange(v) }}>
      <SelectTrigger className="bg-muted border-border text-foreground">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-muted border-border">
        {options.map(opt => {
          const [val, label] = Array.isArray(opt) ? opt : [opt, opt]
          return <SelectItem key={val} value={val} className="text-foreground hover:bg-muted focus:bg-muted">{label}</SelectItem>
        })}
      </SelectContent>
    </Select>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-border">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-foreground text-sm font-medium">{value}</span>
    </div>
  )
}
