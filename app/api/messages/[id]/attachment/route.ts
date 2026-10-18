import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const headers = new Headers({ "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" })
  if (!session?.user?.id) return new Response("Sign in to view this attachment.", { status: 401, headers })
  const { id } = await params
  const message = await db.message.findUnique({ where: { id }, select: { attachmentUrl: true, type: true, content: true, conversation: { select: { participantAId: true, participantBId: true } } } })
  if (!message || ![message.conversation.participantAId, message.conversation.participantBId].includes(session.user.id)) return new Response("Attachment not found.", { status: 404, headers })
  const value = message.attachmentUrl
  if (!value) return new Response("Attachment not available.", { status: 404, headers })
  if (value.startsWith("https://")) { headers.set("Location", value); return new Response(null, { status: 307, headers }) }
  const match = /^data:([^;,]+)(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/]*={0,2})$/.exec(value)
  if (!match || value.length > 14 * 1024 * 1024) return new Response("Unsupported attachment.", { status: 415, headers })
  const mime = match[1].toLowerCase()
  const safeInline = (message.type === "IMAGE" && /^image\/(jpeg|png|webp|gif|avif)$/.test(mime)) || (message.type === "VOICE" && /^audio\/(webm|mp4|mpeg|ogg|wav|x-m4a)$/.test(mime))
  headers.set("Content-Type", safeInline ? mime : "application/octet-stream")
  if (!safeInline) {
    const filename = (message.content || "attachment").replace(/[\x00-\x1f"\\/]/g, "_").slice(0, 120)
    headers.set("Content-Disposition", `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, "%27")}`)
  }
  const data = Buffer.from(match[2], "base64")
  headers.set("Accept-Ranges", "bytes")
  const range = request.headers.get("Range")
  if (range) {
    const parts = /^bytes=(\d*)-(\d*)$/.exec(range)
    const start = parts && parts[1] ? Number(parts[1]) : parts?.[2] ? Math.max(0, data.length - Number(parts[2])) : -1
    const end = parts?.[1] && parts[2] ? Math.min(data.length - 1, Number(parts[2])) : data.length - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= data.length) { headers.set("Content-Range", `bytes */${data.length}`); return new Response(null, { status: 416, headers }) }
    headers.set("Content-Range", `bytes ${start}-${end}/${data.length}`); headers.set("Content-Length", String(end - start + 1))
    return new Response(data.subarray(start, end + 1), { status: 206, headers })
  }
  headers.set("Content-Length", String(data.length))
  return new Response(data, { headers })
}
