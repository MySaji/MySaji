import { NextResponse } from "next/server"
import { runWeeklySubscriberDigest } from "@/lib/actions/subscriber-digest"

/** Triggered by Vercel Cron (see vercel.json) once a week — same
 * shared-secret pattern as /api/cron/email-digest. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })

  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await runWeeklySubscriberDigest()
  return NextResponse.json(result)
}
