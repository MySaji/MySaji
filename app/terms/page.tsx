import { pageMetadata } from "@/frontend/lib/seo"
import { getPublicLegalContent, getPublicSiteSettings } from "@/backend/actions/admin-settings"
import { LegalDocument } from "@/frontend/components/legal-document"
import { LEGAL_UPDATED, termsOfService } from "@/frontend/lib/legal-documents"

export const metadata = pageMetadata("/terms", "Terms of service", "MySaji account, marketplace, payment, communication and Saji Till responsibilities, including complaints and consumer rights.")

export default async function TermsPage() {
  const [{ termsContent, updatedAt }, contact] = await Promise.all([getPublicLegalContent(), getPublicSiteSettings()])
  const custom = termsContent.trim().length > 0
  const updated = custom && updatedAt
    ? updatedAt.toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric", timeZone: "Africa/Nairobi" })
    : LEGAL_UPDATED
  return <LegalDocument kind="terms" content={custom ? termsContent : termsOfService} updated={updated} contact={contact} />
}
