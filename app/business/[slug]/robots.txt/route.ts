import { loadBusinessWebsite } from "@/backend/services/pos-public-website"
import { websiteUrl } from "@/backend/domain/pos-website"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const site = await loadBusinessWebsite((await params).slug)
  if (!site) return new Response("User-agent: *\nDisallow: /", { status: 404 })
  return new Response(`User-agent: *\nAllow: /\nDisallow: /business/\nSitemap: ${websiteUrl(site.subdomain)}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } })
}
