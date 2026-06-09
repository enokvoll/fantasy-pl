"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)

    const result = await signIn("credentials", {
      email: fd.get("email"),
      password: fd.get("password"),
      redirect: false,
    })

    setLoading(false)
    if (result?.error) {
      toast.error("Invalid email or password")
    } else {
      router.push("/home")
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-black text-white">
            Fantasy<span className="text-emerald-400">PL</span>
          </Link>
        </div>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Sign in</CardTitle>
            <CardDescription className="text-slate-400">Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <Input id="email" name="email" type="email" placeholder="you@example.com" required
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">Password</Label>
                <Input id="password" name="password" type="password" placeholder="••••••••" required
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500" />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold">
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <p className="text-center text-slate-400 text-sm mt-4">
              No account?{" "}
              <Link href="/register" className="text-emerald-400 hover:underline">Create one</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
