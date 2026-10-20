import { z } from "zod"

export const WEBSITE_DOMAIN = "mysaji.com"
export const WEBSITE_PAGES = ["home", "about", "products", "services", "contact"] as const
export type WebsitePage = typeof WEBSITE_PAGES[number]
const RESERVED = new Set(["www", "mysaji", "saji", "pos", "till", "admin", "api", "auth", "app", "account", "accounts", "mail", "smtp", "imap", "pop", "webmail", "cpanel", "ftp", "ns1", "ns2", "cdn", "static", "assets", "support", "help", "docs", "status", "dev", "test", "staging", "preview", "billing", "payments"])

export function businessSubdomain(name: string) {
  let slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 42)
  if (slug.length < 3) slug = `${slug}business`
  if (RESERVED.has(slug)) slug += "shop"
  return slug
}
export function validBusinessSubdomain(slug: string) { return /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug) && !RESERVED.has(slug) }
export function tenantFromHost(host: string): string | null {
  const hostname = host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
  const suffix = hostname.endsWith(`.${WEBSITE_DOMAIN}`) ? `.${WEBSITE_DOMAIN}` : hostname.endsWith(".localhost") ? ".localhost" : null
  if (!suffix) return null
  const label = hostname.slice(0, -suffix.length)
  return validBusinessSubdomain(label) ? label : null
}
export function isBusinessHost(host: string) {
  const value = host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
  return value !== `www.${WEBSITE_DOMAIN}` && (value.endsWith(`.${WEBSITE_DOMAIN}`) || value.endsWith(".localhost"))
}
export function websiteUrl(slug: string) { return `https://${slug}.${WEBSITE_DOMAIN}` }
const text = (max: number) => z.string().trim().max(max)
const publicUrl = z.union([z.literal(""), z.string().url().max(500).refine(v => { const url = new URL(v); return url.protocol === "https:" && !url.username && !url.password }, "Use an HTTPS website address")])
export const websiteContentSchema = z.object({
  name: text(100).min(2), category: text(80), headline: text(120).min(3), introduction: text(500), about: text(4000),
  accent: z.string().regex(/^#[a-f0-9]{6}$/i).default("#0647b5"),
  phone: text(30).refine(v => !v || /^\+?[0-9 ()-]{7,30}$/.test(v), "Check the public phone number"),
  email: z.union([z.literal(""), z.string().email().max(160)]), whatsapp: text(20).refine(v => !v || /^\+?[0-9]{9,15}$/.test(v), "Use an international WhatsApp number"),
  address: text(240), hours: text(400),
  services: z.array(z.object({ title: text(100).min(2), description: text(700).min(5) })).max(12),
  faqs: z.array(z.object({ question: text(160).min(3), answer: text(800).min(5) })).max(8),
  productIds: z.array(z.string().max(60)).max(24).transform(ids => [...new Set(ids)]),
  socialLinks: z.object({ facebook: publicUrl, instagram: publicUrl, website: publicUrl }),
})
export type WebsiteContent = z.infer<typeof websiteContentSchema>
export const websiteCopySchema = websiteContentSchema.pick({ headline: true, introduction: true, about: true, services: true, faqs: true })

export function starterWebsite(name: string, category = "Local business"): WebsiteContent {
  return { name, category, headline: `Welcome to ${name}`, introduction: "Explore our business and get in touch to discuss what you need.", about: "", accent: "#0647b5", phone: "", email: "", whatsapp: "", address: "", hours: "", services: [], faqs: [], productIds: [], socialLinks: { facebook: "", instagram: "", website: "" } }
}
export function publicationIssue(content: WebsiteContent) {
  if (content.about.length < 60) return "Add at least 60 characters about the business before publishing."
  if (content.introduction.length < 30) return "Add a useful introduction before publishing."
  if (!content.phone && !content.email && !content.address && !content.whatsapp) return "Add at least one public contact method or business address."
  return null
}

/** Tenant websites have only these public routes; private portals and APIs never rewrite. */
export function websiteRoute(pathname: string) {
  if (pathname === "/") return ""
  if (["/about", "/products", "/services", "/contact", "/robots.txt", "/sitemap.xml", "/brand-icon"].includes(pathname)) return pathname
  return null
}
