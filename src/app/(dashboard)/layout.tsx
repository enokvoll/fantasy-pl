import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { TopNav } from "@/components/layout/top-nav"
import { QueryProvider } from "@/components/query-provider"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  return (
    <QueryProvider>
      <div className="min-h-screen bg-background text-foreground">
        <TopNav user={session.user} />
        <main className="max-w-7xl mx-auto px-4 py-6">
          {children}
        </main>
      </div>
    </QueryProvider>
  )
}
