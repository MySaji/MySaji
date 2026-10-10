import { NextResponse } from "next/server"
import { handleMpesaCallback } from "@/backend/actions/payments"

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null)
  await handleMpesaCallback(payload)
  return NextResponse.json({ ok: true })
}
