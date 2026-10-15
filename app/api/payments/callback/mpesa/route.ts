import { NextResponse } from "next/server"
import { handleMpesaCallback } from "@/backend/services/payment-gateways"

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null)
  await handleMpesaCallback(payload)
  return NextResponse.json({ ok: true })
}
