import type { MetadataRoute } from "next"
import { siteUrl } from "@/frontend/lib/seo"
export default function robots(): MetadataRoute.Robots {
  // Private pages remain crawlable so engines can see their noindex directive.
  // Authentication, rather than robots.txt, protects account data.
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/"] }, sitemap: `${siteUrl}/sitemap.xml` }
}
