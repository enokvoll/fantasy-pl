import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { TopNav } from "@/components/layout/top-nav"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <TopNav user={session.user} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
