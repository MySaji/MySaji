import { NextResponse } from "next/server"
import { handleAirtelCallback } from "@/backend/services/payment-gateways"

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null)
  await handleAirtelCallback(payload)
  return NextResponse.json({ ok: true })
}
