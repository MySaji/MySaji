import { NextResponse } from "next/server"
import { handleB2CResultCallback } from "@/lib/actions/secretary-payments"

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const withdrawalId = searchParams.get("wid")
  const token = searchParams.get("token")
  const payload = await req.json().catch(() => null)

  if (withdrawalId && token) {
    await handleB2CResultCallback(withdrawalId, token, payload).catch(() => {})
  }

  // Safaricom just needs a 200 acknowledging receipt of the callback.
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" })
}
