"use client"

import Link from "next/link"
import { signOut } from "next-auth/react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/theme-toggle"
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
    <header className="border-b border-border bg-card/70 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/home" className="font-heading text-xl font-bold tracking-tight text-foreground">
          Fantasy<span className="text-primary">PL</span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger className="outline-none">
              <Avatar className="h-8 w-8 bg-primary cursor-pointer">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground">
              <div className="px-2 py-1.5 text-sm">
                <p className="font-medium text-foreground">{user.name}</p>
                <p className="text-muted-foreground text-xs">{user.email}</p>
              </div>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem className="cursor-pointer hover:bg-muted">
                <Link href="/home" className="w-full">My leagues</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                className="text-danger cursor-pointer hover:bg-muted"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
