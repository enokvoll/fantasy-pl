// Lightweight liveness probe for the platform health check (Fly).
// Intentionally does not touch the database — it only confirms the process is up.
export const dynamic = "force-dynamic"

export function GET() {
  return Response.json({ ok: true })
}
