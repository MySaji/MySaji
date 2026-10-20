import { publicTillBrand, renderInstallLogo } from "@/backend/services/pos-install-brand"

export const dynamic = "force-dynamic"
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; size: string }> }) {
  const { slug, size } = await params
  if (!["192", "512"].includes(size)) return new Response("Invalid icon size", { status: 404 })
  const brand = await publicTillBrand(slug)
  if (!brand) return new Response("Till not found", { status: 404 })
  if (brand.logo) {
    try {
      const image = renderInstallLogo(brand.logo, Number(size))
      const png = await image.arrayBuffer()
      return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" } })
    } catch { /* A damaged legacy image must not prevent installation. */ }
  }
  return Response.redirect(new URL(`/pos/icon-${size}.png`, request.url))
}
