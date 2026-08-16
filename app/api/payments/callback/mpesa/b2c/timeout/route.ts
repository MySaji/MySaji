import { NextResponse } from "next/server"
import { handleB2CTimeoutCallback } from "@/lib/actions/secretary-payments"

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const withdrawalId = searchParams.get("wid")
  const token = searchParams.get("token")

  if (withdrawalId && token) {
    await handleB2CTimeoutCallback(withdrawalId, token).catch(() => {})
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" })
}
