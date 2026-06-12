"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"

export default function JoinLeaguePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const inviteCode = (fd.get("inviteCode") as string).trim()
    const teamName = (fd.get("teamName") as string).trim()

    // Find league by invite code
    const searchRes = await fetch(`/api/leagues/find?inviteCode=${encodeURIComponent(inviteCode)}`)
    if (!searchRes.ok) {
      toast.error("Invalid invite code — league not found")
      setLoading(false)
      return
    }
    const { leagueId } = await searchRes.json()

    const res = await fetch(`/api/leagues/${leagueId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode, teamName }),
    })

    if (!res.ok) {
      const { error } = await res.json()
      toast.error(error ?? "Could not join league")
      setLoading(false)
      return
    }

    toast.success("Joined league!")
    router.push(`/league/${leagueId}`)
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-3xl font-bold text-foreground mb-6">Join a league</h1>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Enter invite code</CardTitle>
          <CardDescription className="text-muted-foreground">
            Ask your league commissioner for the invite code
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground">Invite code</Label>
              <Input name="inviteCode" placeholder="e.g. cm4x7g8h9..." required
                className="bg-muted border-border text-foreground font-mono" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Your team name</Label>
              <Input name="teamName" placeholder="e.g. The Special Ones" required
                className="bg-muted border-border text-foreground" />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
              {loading ? "Joining…" : "Join league"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
