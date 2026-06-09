import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { SessionProvider } from "@/components/session-provider"

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Fantasy PL",
  description: "Draft-based Fantasy Premier League platform",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-background text-foreground antialiased">
        <SessionProvider>
          {children}
        </SessionProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
