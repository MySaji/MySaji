import { pageMetadata } from "@/frontend/lib/seo"
import { getPublicLegalContent, getPublicSiteSettings } from "@/backend/actions/admin-settings"
import { LegalDocument } from "@/frontend/components/legal-document"
import { LEGAL_UPDATED, privacyPolicy } from "@/frontend/lib/legal-documents"

export const metadata = pageMetadata("/privacy", "Privacy policy", "How MySaji handles account, payment, messaging and business information, and how to exercise your privacy rights.")

export default async function PrivacyPage() {
  const [{ privacyContent, updatedAt }, contact] = await Promise.all([getPublicLegalContent(), getPublicSiteSettings()])
  const custom = privacyContent.trim().length > 0
  const updated = custom && updatedAt
    ? updatedAt.toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric", timeZone: "Africa/Nairobi" })
    : LEGAL_UPDATED
  return <LegalDocument kind="privacy" content={custom ? privacyContent : privacyPolicy} updated={updated} contact={contact} />
}
