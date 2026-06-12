import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

export default function LandingPage() {
  return (
    <main className="relative min-h-screen bg-background flex flex-col overflow-hidden">
      {/* Ambient indigo glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(60rem 40rem at 70% -10%, color-mix(in oklch, var(--primary) 28%, transparent), transparent 60%), radial-gradient(50rem 30rem at 10% 110%, color-mix(in oklch, var(--accent2) 22%, transparent), transparent 60%)",
        }}
      />

      <nav className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Fantasy<span className="text-primary">PL</span>
          </span>
          <Badge variant="secondary" className="text-xs">Beta</Badge>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }))}>
            Sign in
          </Link>
          <Link href="/register" className={cn(buttonVariants())}>
            Get started
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-24 text-center">
        <div className="max-w-3xl">
          <h1 className="font-heading text-5xl md:text-7xl font-bold tracking-tight text-foreground leading-[1.05] mb-6">
            Fantasy Football,{" "}
            <span className="bg-gradient-to-r from-primary to-accent2 bg-clip-text text-transparent">Done Right</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
            Draft-based Premier League fantasy with exclusive player ownership.
            Snake drafts, live auction rooms, keeper leagues, dynasty formats.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "px-8 font-semibold")}>
              Create a league
            </Link>
            <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              Sign in
            </Link>
          </div>
          <div className="mt-16 flex flex-wrap gap-2 justify-center">
            {["Snake Draft","Live Auction","Slow Draft","FAAB Waivers","Trade Analyzer","Keeper Leagues","Dynasty Format","H2H Scoring","FPL Points System"].map(f => (
              <span key={f} className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm border border-border">{f}</span>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
