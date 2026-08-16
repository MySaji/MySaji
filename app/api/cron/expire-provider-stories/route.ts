import { NextResponse } from "next/server"
import { deleteExpiredProviderStories } from "@/lib/actions/provider-stories"

/** Triggered by Vercel Cron (see vercel.json) once a day. Same shared-secret
 * pattern as the other cron routes — see email-digest's route for the full
 * explanation of why this only fires on deployed environments. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })

  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await deleteExpiredProviderStories()
  return NextResponse.json(result)
}
