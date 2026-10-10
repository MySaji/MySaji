import { NextResponse } from "next/server"
import { handlePaypalCallback } from "@/backend/actions/payments"

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null)
  await handlePaypalCallback(payload)
  return NextResponse.json({ ok: true })
}
