import { NextResponse } from "next/server"
import { handleStripeWebhook } from "@/backend/services/payment-gateways"

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature") || ""
  const payload = await req.text()
  const result = await handleStripeWebhook(payload, sig)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
