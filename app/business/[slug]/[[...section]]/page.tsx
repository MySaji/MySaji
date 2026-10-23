import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { cache } from "react"
import { loadBusinessWebsite } from "@/backend/services/pos-public-website"
import { isBusinessHost, WEBSITE_PAGES, websiteUrl, type WebsitePage } from "@/backend/domain/pos-website"
import { PublicWebsite } from "@/frontend/components/business-website/public-website"

export const dynamic = "force-dynamic"
type Props = { params: Promise<{ slug: string; section?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
const load = cache(loadBusinessWebsite)
const labels: Record<WebsitePage, string> = { home: "Home", about: "Our story", products: "Products", services: "What we do", contact: "Visit & contact" }
async function resolve(props: Props) {
  const { slug, section = [] } = await props.params
  const tenant = isBusinessHost((await headers()).get("host") ?? "")
  const preview = !tenant && (await props.searchParams).preview === "1"
  const page = (section[0] || "home") as WebsitePage
  if (section.length > 1 || !WEBSITE_PAGES.includes(page)) notFound()
  const site = await load(slug, preview)
  if (!site || (page === "products" && !site.products.length) || (page === "services" && !site.content.services.length)) notFound()
  return { site, page, tenant, preview }
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { site, page, preview, tenant } = await resolve(props)
  const title = page === "home" ? `${site.content.name} | ${site.content.category || "Business website"}` : `${labels[page]} | ${site.content.name}`
  const url = `${websiteUrl(site.subdomain)}${page === "home" ? "" : `/${page}`}`
  return { title: { absolute: title }, description: site.content.introduction, applicationName: site.content.name, manifest: null,
    alternates: { canonical: url }, robots: { index: tenant && !preview, follow: !preview },
    icons: { icon: `${tenant ? "" : `/business/${site.subdomain}`}/brand-icon${preview ? "?preview=1" : ""}` },
    openGraph: { title, description: site.content.introduction, siteName: site.content.name, url, type: "website", images: [] },
    twitter: { card: "summary", title, description: site.content.introduction, images: [] } }
}
export default async function BusinessWebsite(props: Props) {
  const { site, page, tenant, preview } = await resolve(props)
  const root = websiteUrl(site.subdomain)
  const schema = page === "home" ? { "@context": "https://schema.org", "@type": "WebSite", name: site.content.name, url: root } : {
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: root },
      { "@type": "ListItem", position: 2, name: labels[page], item: `${root}/${page}` },
    ] }
  return <>{!preview && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />}<PublicWebsite site={site} page={page} base={tenant ? "" : `/business/${site.subdomain}`} preview={preview} /></>
}
