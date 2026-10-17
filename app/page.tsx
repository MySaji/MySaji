import { pageMetadata, siteUrl } from "@/frontend/lib/seo"

export const metadata = pageMetadata("/", "MySaji — Shop • Work • Rent • Learn • Grow", "Explore services, shops and business tools on MySaji. Learn about bookings, professional profiles, Saji Till and wholesale workflows in our guides.")

import { Footer } from "@/frontend/components/footer"
import { InformationHome } from "@/frontend/components/pages/information-home"

export default function Home() {
  return <div className="min-h-screen bg-background"><main><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "MySaji", url: siteUrl, slogan: "Shop • Work • Rent • Learn • Grow" }).replace(/</g, "\\u003c") }} /><InformationHome /></main><Footer /></div>
}
