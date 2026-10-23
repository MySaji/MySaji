import { loadBusinessWebsite } from "@/backend/services/pos-public-website"
import { websiteUrl } from "@/backend/domain/pos-website"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const site = await loadBusinessWebsite((await params).slug)
  if (!site) return new Response("Not found", { status: 404 })
  const paths = ["", "/about", "/contact", ...(site.products.length ? ["/products"] : []), ...(site.content.services.length ? ["/services"] : [])]
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${websiteUrl(site.subdomain)}${path}</loc></url>`).join("")}</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "no-store" } })
}
