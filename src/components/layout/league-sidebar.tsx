"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { League, Team } from "@/generated/prisma/client"

interface LeagueSidebarProps {
  league: League & { _count: { teams: number } }
  myTeam: Team | null
}

export function LeagueSidebar({ league, myTeam }: LeagueSidebarProps) {
  const pathname = usePathname()
  const base = `/league/${league.id}`

  const links = [
    { href: base, label: "Overview", icon: "🏠" },
    { href: `${base}/draft`, label: "Draft Room", icon: "🎯" },
    { href: `${base}/roster`, label: "My Roster", icon: "👕" },
    { href: `${base}/players`, label: "Players", icon: "⚽" },
    { href: `${base}/standings`, label: "Standings", icon: "📊" },
  ]

  return (
    <aside className="w-52 shrink-0">
      {/* League info */}
      <div className="mb-4 p-3 rounded-xl bg-slate-900 border border-slate-800">
        <h2 className="font-bold text-white text-sm leading-tight truncate">{league.name}</h2>
        {myTeam && <p className="text-emerald-400 text-xs mt-0.5 truncate">{myTeam.name}</p>}
        <p className="text-slate-500 text-xs mt-1">{league._count.teams}/{league.maxTeams} teams</p>
      </div>

      {/* Nav */}
      <nav className="space-y-1">
        {links.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== base && pathname.startsWith(href))
          return (
            <Link key={href} href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-emerald-600/20 text-emerald-400 font-medium"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              )}>
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Invite code */}
      <div className="mt-4 p-3 rounded-xl bg-slate-900 border border-slate-800">
        <p className="text-slate-500 text-xs mb-1">Invite code</p>
        <p className="text-slate-300 text-xs font-mono break-all">{league.inviteCode}</p>
      </div>
    </aside>
  )
}
