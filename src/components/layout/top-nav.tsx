"use client"

import Link from "next/link"
import { signOut } from "next-auth/react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"

interface TopNavProps {
  user: { name?: string | null; email?: string | null }
}

export function TopNav({ user }: TopNavProps) {
  const initials = user.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "?"

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/home" className="text-xl font-black text-white">
          Fantasy<span className="text-emerald-400">PL</span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger className="outline-none">
            <Avatar className="h-8 w-8 bg-emerald-600 cursor-pointer">
              <AvatarFallback className="bg-emerald-600 text-white text-xs font-bold">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200">
            <div className="px-2 py-1.5 text-sm">
              <p className="font-medium text-white">{user.name}</p>
              <p className="text-slate-400 text-xs">{user.email}</p>
            </div>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem className="cursor-pointer hover:bg-slate-700">
              <Link href="/home" className="w-full">My leagues</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem
              className="text-red-400 hover:text-red-300 cursor-pointer hover:bg-slate-700"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
