import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { compare } from "bcryptjs"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = PrismaAdapter(prisma as any)

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers: [
    Google,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = z.object({
          email: z.string().email(),
          password: z.string().min(8),
        }).safeParse(credentials)

        if (!parsed.success) return null

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const user = await (prisma.user.findUnique as any)({
          where: { email: parsed.data.email },
          select: { id: true, email: true, name: true, image: true, passwordHash: true },
        })

        if (!user?.passwordHash) return null

        const valid = await compare(parsed.data.password, user.passwordHash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name, image: user.image }
      },
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
})
