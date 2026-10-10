import { NextResponse } from "next/server"
import { db } from "@/backend/db"

/** Point any uptime monitor (UptimeRobot, Better Uptime, Pingdom, a cron
 * job, ...) at this URL. Confirms the app server is up AND can actually
 * reach the database — a server that responds but can't query Postgres is
 * still down in every way a real user would experience. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({ status: "ok", database: "ok", timestamp: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json(
      { status: "error", database: "unreachable", timestamp: new Date().toISOString() },
      { status: 503 },
    )
  }
}
