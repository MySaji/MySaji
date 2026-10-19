import type { Metadata } from "next"
import { GUIDES } from "@/backend/domain/knowledge"
import { OFFERING_SLUGS } from "@/backend/domain/public-site"

// Canonicals describe the production site even in local and review builds.
export const siteUrl = "https://mysaji.com"
export const publicPaths = ["/", ...OFFERING_SLUGS.map(slug => `/${slug}`), "/knowledge", "/privacy", "/terms", "/pos", ...GUIDES.map(g => `/knowledge/${g.slug}`)]
export function pageMetadata(path: string, title: string, description: string): Metadata {
  const url = `${siteUrl}${path}`
  const pageTitle = title.includes("MySaji") ? title : `${title} | MySaji`
  return { title: { absolute: pageTitle }, description, alternates: { canonical: url }, robots: { index: true, follow: true },
    openGraph: { type: "website", siteName: "MySaji", title: pageTitle, description, url, locale: "en_KE",
      images: [{ url: `${siteUrl}/icon-512.png`, width: 512, height: 512, alt: "MySaji" }] },
    twitter: { card: "summary", title: pageTitle, description, images: [`${siteUrl}/icon-512.png`] } }
}

export function serializeJsonLd(value: unknown) { return JSON.stringify(value).replace(/</g, "\\u003c") }
export const websiteStructuredData = { "@context": "https://schema.org", "@type": "WebSite", "@id": `${siteUrl}/#website`, name: "MySaji", alternateName: "SAJI", url: `${siteUrl}/`, slogan: "Shop · Work · Rent · Learn · Grow" }

export function breadcrumbStructuredData(items: { label: string; href: string }[]) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.label, item: `${siteUrl}${item.href}` })) }
}
