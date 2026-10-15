import { NextResponse } from "next/server"
import { runWeeklyEmailDigest } from "@/backend/services/email-digest-core"

/** Triggered by Vercel Cron (see vercel.json) once a week. Vercel attaches
 * `Authorization: Bearer <CRON_SECRET>` automatically when CRON_SECRET is
 * set as an env var on the project — this route just has to check it
 * matches, same shared-secret pattern as any other unauthenticated-by-user
 * server-to-server endpoint. Not reachable/useful in local `next dev`
 * unless you set the header yourself; Vercel Cron only fires on deployed
 * environments. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })

  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await runWeeklyEmailDigest()
  return NextResponse.json(result)
}
