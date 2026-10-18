import { receiveC2b } from "@/backend/services/pos-mpesa-callbacks"

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!/^[a-f0-9]{64}$/.test(token)) return Response.json({ ResultCode: 1 }, { status: 404 })
  try {
    const text = await request.text()
    if (text.length > 32000) return Response.json({ ResultCode: 1 }, { status: 413 })
    const ok = await receiveC2b(token, JSON.parse(text), new URL(request.url).searchParams.get("validation") === "1")
    return Response.json({ ResultCode: ok ? 0 : 1, ResultDesc: ok ? "Accepted" : "Rejected" }, { status: ok ? 200 : 400 })
  } catch { return Response.json({ ResultCode: 1, ResultDesc: "Retry notification" }, { status: 503 }) }
}
