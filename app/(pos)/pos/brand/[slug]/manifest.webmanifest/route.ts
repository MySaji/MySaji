import { publicTillBrand, brandedManifest } from "@/backend/services/pos-install-brand"

export const dynamic = "force-dynamic"
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const brand = await publicTillBrand((await params).slug)
  if (!brand) return new Response("Till not found", { status: 404 })
  return Response.json(brandedManifest(brand), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=0, must-revalidate", "X-Robots-Tag": "noindex" } })
}
