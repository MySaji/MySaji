import "server-only"
import { createElement } from "react"
import { ImageResponse } from "next/og"
import { createHash } from "node:crypto"
import { db } from "@/backend/db"
import { parseProductPhoto } from "@/backend/domain/pos-product-photo"

export function validInstallLogo(value: unknown): value is string {
  if (typeof value !== "string") return false
  const image = parseProductPhoto(value)
  if (image?.mimeType !== "image/png") return false
  const bytes = Buffer.from(image.data, "base64")
  return bytes.length >= 33 && bytes.toString("ascii", 12, 16) === "IHDR" && bytes.readUInt32BE(16) === 512 && bytes.readUInt32BE(20) === 512
}

export function renderInstallLogo(logo: string, size: number) {
  return new ImageResponse(createElement("div", { style: { display: "flex", width: size, height: size, background: "white", alignItems: "center", justifyContent: "center" } },
    createElement("img", { src: logo, width: size, height: size, style: { objectFit: "contain" }, alt: "" })), { width: size, height: size, headers: { "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" } })
}

export async function publicTillBrand(slug: string) {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null
  const shop = await db.shopkeeperProfile.findFirst({ where: { tillSlug: slug, posEnabled: true }, select: { shopName: true, tillSlug: true, posConfig: true } })
  if (!shop?.tillSlug) return null
  const config = shop.posConfig as Record<string, unknown> | null
  const logo = validInstallLogo(config?.installLogo) ? config.installLogo : null
  return { name: shop.shopName, slug: shop.tillSlug, logo, revision: logo ? createHash("sha256").update(logo).digest("hex").slice(0, 16) : "default",
    color: typeof config?.primaryColor === "string" && /^#[a-f0-9]{6}$/i.test(config.primaryColor) ? config.primaryColor : "#2563eb" }
}

export function brandedManifest(brand: NonNullable<Awaited<ReturnType<typeof publicTillBrand>>>) {
  const root = `/pos/brand/${brand.slug}`
  return { id: `/pos/open?shop=${brand.slug}`, name: `${brand.name} · Saji Till`, short_name: brand.name.slice(0, 30), description: `Saji Till for ${brand.name}. Sign in with your own authorised account.`,
    start_url: `/pos/open?shop=${brand.slug}`, scope: "/pos/", display: "standalone", background_color: "#ffffff", theme_color: brand.color,
    icons: [192, 512].map(size => ({ src: brand.logo ? `${root}/icon/${size}?v=${brand.revision}` : `/pos/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
    shortcuts: [{ name: "Open Till", url: `/pos/open?shop=${brand.slug}` }] }
}
