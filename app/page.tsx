import { pageMetadata, serializeJsonLd, websiteStructuredData } from "@/frontend/lib/seo"
import { Footer } from "@/frontend/components/footer"
import { InformationHome } from "@/frontend/components/pages/information-home"

export const metadata = pageMetadata(
  "/",
  "MySaji — Services, shops & tools for everyday business",
  "Find services, manage orders and grow your business with MySaji. Explore Saji Pro, shop tools, wholesale workflows and Saji Till point of sale.",
)

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <main>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteStructuredData) }} />
        <InformationHome />
      </main>
      <Footer />
    </div>
  )
}
