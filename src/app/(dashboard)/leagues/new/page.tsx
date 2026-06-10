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
    season: "2025-26",
    draftType: "SNAKE",
    draftPickTimeSeconds: "90",
    waiverType: "ROLLING",
    faabBudget: "1000",
    botCount: "0",
    rookieDraftRounds: "3",
    rookieDraftOrder: "REVERSE_STANDINGS",
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
          faabBudget: form.waiverType === "FAAB" ? parseInt(form.faabBudget) : undefined,
          rookieDraftRounds: parseInt(form.rookieDraftRounds),
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
        <h1 className="text-3xl font-black text-white mb-2">Create a league</h1>
        {/* Step indicator */}
        <div className="flex items-center gap-2 mt-4">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${i < step ? "bg-emerald-600 text-white" : i === step ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-500"}`}>
                {i < step ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 w-8 ${i < step ? "bg-emerald-600" : "bg-slate-800"}`} />}
            </div>
          ))}
        </div>
        <p className="text-slate-400 text-sm mt-3">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 && (
            <>
              <Field label="League name">
                <Input value={form.name} onChange={e => set("name", e.target.value)}
                  placeholder="e.g. The Gaffer's Cup" className="bg-slate-800 border-slate-700 text-white" />
              </Field>
              <Field label="Your team name">
                <Input value={form.teamName} onChange={e => set("teamName", e.target.value)}
                  placeholder="e.g. Salah's Saviors" className="bg-slate-800 border-slate-700 text-white" />
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
                    <p className="text-xs text-slate-400">
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
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <p className="text-slate-300 text-sm">
                  <span className="font-semibold text-white">Snake draft:</span> Teams pick in a serpentine order. Round 1 is 1→N, round 2 is N→1, etc. Each player can only be on one team.
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
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-700/50 text-sm text-slate-300">
                    <strong className="text-emerald-400">Dynasty:</strong> Rosters carry over every season. Each new season runs only a short rookie draft of un-rostered players — worst teams pick first. Teams at their roster limit must cut a player to make room.
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-slate-400 text-sm">Default FPL roster: 1 GK, 4 DEF, 4 MID, 2 FWD + 5 bench</p>
              <div className="grid grid-cols-3 gap-4">
                {(["GK","DEF","MID","FWD","BENCH"] as const).map(pos => (
                  <Field key={pos} label={pos === "BENCH" ? "Bench spots" : `${pos} starters`}>
                    <Input type="number" min={pos === "GK" ? 1 : 0} max={10}
                      value={form.rosterConfig[pos]}
                      onChange={e => setForm(f => ({ ...f, rosterConfig: { ...f.rosterConfig, [pos]: parseInt(e.target.value) || 0 } }))}
                      className="bg-slate-800 border-slate-700 text-white" />
                  </Field>
                ))}
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-slate-300">
                Scoring uses the official <span className="text-white font-medium">FPL points system</span> — goals, assists, clean sheets, bonus points, etc.
              </div>
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
                  ]} />
              </Field>
              {form.waiverType === "FAAB" && (
                <Field label="FAAB budget per team (£)">
                  <Input type="number" min={100} value={form.faabBudget} onChange={e => set("faabBudget", e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white" />
                </Field>
              )}
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-slate-300">
                <strong className="text-white">Rolling waivers:</strong> Priority order rotates — teams who win a claim move to last place.
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
                </>
              )}
              <ReviewRow label="Scoring" value={form.scoringType} />
              <ReviewRow label="Max teams" value={`${form.maxTeams} teams`} />
              <ReviewRow label="Draft format" value={form.draftType} />
              <ReviewRow label="Pick time" value={`${form.draftPickTimeSeconds}s`} />
              <ReviewRow label="Roster" value={`${form.rosterConfig.GK}GK ${form.rosterConfig.DEF}DEF ${form.rosterConfig.MID}MID ${form.rosterConfig.FWD}FWD + ${form.rosterConfig.BENCH} bench`} />
              <ReviewRow label="Waivers" value={form.waiverType} />
              {parseInt(form.botCount) > 0 && (
                <ReviewRow label="Bots" value={`${form.botCount} auto-pick bot${parseInt(form.botCount) > 1 ? "s" : ""} 🤖`} />
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => setStep(s => s - 1)}>
                Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button className="bg-emerald-500 hover:bg-emerald-400 text-white font-semibold ml-auto"
                onClick={() => setStep(s => s + 1)}
                disabled={step === 0 && (!form.name.trim() || !form.teamName.trim())}>
                Continue →
              </Button>
            ) : (
              <Button className="bg-emerald-500 hover:bg-emerald-400 text-white font-semibold ml-auto"
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
      <Label className="text-slate-300 text-sm font-medium">{label}</Label>
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
      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-700">
        {options.map(opt => {
          const [val, label] = Array.isArray(opt) ? opt : [opt, opt]
          return <SelectItem key={val} value={val} className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700">{label}</SelectItem>
        })}
      </SelectContent>
    </Select>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-slate-800">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium">{value}</span>
    </div>
  )
}
