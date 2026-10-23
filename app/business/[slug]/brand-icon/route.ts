import { headers } from "next/headers"
import { loadBusinessWebsite } from "@/backend/services/pos-public-website"
import { isBusinessHost } from "@/backend/domain/pos-website"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const preview = !isBusinessHost((await headers()).get("host") ?? "") && new URL(request.url).searchParams.get("preview") === "1"
  const site = await loadBusinessWebsite((await params).slug, preview)
  if (!site) return new Response("Not found", { status: 404 })
  if (!site.logo) return Response.redirect("https://mysaji.com/pos/icon-512.png")
  return new Response(Buffer.from(site.logo.split(",")[1], "base64"), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } })
}
