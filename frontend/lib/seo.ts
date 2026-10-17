import type { Metadata } from "next"
import { GUIDES } from "@/backend/domain/knowledge"

export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://mysaji.com").origin
export const publicPaths = ["/", "/knowledge", "/privacy", "/terms", "/pos", ...GUIDES.map(g => `/knowledge/${g.slug}`)]
export function pageMetadata(path: string, title: string, description: string): Metadata {
  const url = `${siteUrl}${path}`
  return { title, description, alternates: { canonical: url }, robots: { index: true, follow: true },
    openGraph: { type: "website", siteName: "MySaji", title, description, url,
      images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "MySaji" }] },
    twitter: { card: "summary", title, description, images: ["/icon-512.png"] } }
}
