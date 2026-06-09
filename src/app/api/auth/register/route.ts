import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { hash } from "bcryptjs"

const schema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 })

  const { name, email, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return Response.json({ error: "Email already in use" }, { status: 409 })

  const passwordHash = await hash(password, 12)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.user.create as any)({
    data: { name, email, passwordHash },
  })

  return Response.json({ ok: true }, { status: 201 })
}
