import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex flex-col">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black text-white tracking-tight">
            Fantasy<span className="text-emerald-400">PL</span>
          </span>
          <Badge variant="secondary" className="text-xs">Beta</Badge>
        </div>
        <div className="flex gap-3">
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "text-slate-300 hover:text-white")}>
            Sign in
          </Link>
          <Link href="/register" className={cn(buttonVariants(), "bg-emerald-500 hover:bg-emerald-400 text-white")}>
            Get started
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-24 text-center">
        <div className="max-w-3xl">
          <h1 className="text-5xl md:text-7xl font-black text-white leading-tight mb-6">
            Fantasy Football,{" "}
            <span className="text-emerald-400">Done Right</span>
          </h1>
          <p className="text-lg text-slate-300 mb-10 max-w-xl mx-auto">
            Draft-based Premier League fantasy with exclusive player ownership.
            Snake drafts, live auction rooms, keeper leagues, dynasty formats.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-8")}>
              Create a league
            </Link>
            <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-white/20 text-white hover:bg-white/10")}>
              Sign in
            </Link>
          </div>
          <div className="mt-16 flex flex-wrap gap-3 justify-center">
            {["Snake Draft","Live Auction","Slow Draft","FAAB Waivers","Trade Analyzer","Keeper Leagues","Dynasty Format","H2H Scoring","FPL Points System"].map(f => (
              <span key={f} className="px-3 py-1 rounded-full bg-white/10 text-slate-300 text-sm border border-white/10">{f}</span>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
