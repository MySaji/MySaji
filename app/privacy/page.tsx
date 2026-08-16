import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getPublicLegalContent, getPublicSiteSettings } from "@/lib/actions/admin-settings"
import { renderLegalContent } from "@/components/legal-content"

export default async function PrivacyPage() {
  const [{ privacyContent, updatedAt }, contact] = await Promise.all([
    getPublicLegalContent(),
    getPublicSiteSettings(),
  ])
  const isCustom = privacyContent.trim().length > 0
  const lastUpdated = isCustom && updatedAt
    ? updatedAt.toLocaleDateString(undefined, { year: "numeric", month: "long" })
    : "July 2026"

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-t-2xl px-6 py-8">
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-primary-foreground/80 mt-2">Last updated: {lastUpdated}</p>
        </div>

        <div className="bg-card border border-border rounded-b-2xl px-6 py-8 space-y-8">
          {isCustom ? (
            renderLegalContent(privacyContent)
          ) : (
            <>
              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">1. Introduction</h2>
                <p className="text-muted-foreground leading-relaxed">
                  SAJI ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we
                  collect, use, disclose, and safeguard your information when you use our marketplace platform.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">2. Information We Collect</h2>
                <div className="space-y-4 text-muted-foreground">
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Personal Information</h3>
                    <p>
                      We collect information you provide directly, including your name, email address, phone number,
                      location, and payment information.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Usage Information</h3>
                    <p>
                      We automatically collect information about how you interact with our platform, including IP address,
                      browser type, and pages visited.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Payment Information</h3>
                    <p>
                      Payment details are processed securely through our payment partners. We do not store full card
                      numbers.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">3. How We Use Your Information</h2>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>To provide and maintain our services</li>
                  <li>To process transactions and send related information</li>
                  <li>To send you promotional communications (with your consent)</li>
                  <li>To improve and personalize your experience</li>
                  <li>To detect and prevent fraud and security issues</li>
                  <li>To comply with legal obligations</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">4. Data Security</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We implement appropriate technical and organizational measures to protect your personal information
                  against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission
                  over the Internet is completely secure.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">5. Sharing Your Information</h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  We do not sell your personal information. We may share information with:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Service providers who assist us in operating our platform</li>
                  <li>Payment processors to process your transactions</li>
                  <li>Law enforcement when required by law</li>
                  <li>Other users when necessary to provide our services</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">6. Your Rights</h2>
                <p className="text-muted-foreground leading-relaxed">
                  You have the right to access, update, or delete your personal information. You can manage your preferences
                  in your account settings. To exercise these rights, please contact us using the details below.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">7. Cookies</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We use cookies and similar tracking technologies to enhance your experience. You can control cookie
                  settings through your browser preferences.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">8. Third-Party Links</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Our platform may contain links to third-party websites. We are not responsible for their privacy
                  practices. Please review their policies before providing any information.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">9. Children's Privacy</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Our services are not intended for children under 18. We do not knowingly collect information from
                  children. If we discover we have collected information from a child, we will delete it promptly.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">10. Changes to This Policy</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may update this Privacy Policy periodically. We will notify you of significant changes by posting the
                  updated policy with a new "Last updated" date.
                </p>
              </section>
            </>
          )}

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4">{isCustom ? "Contact Us" : "11. Contact Us"}</h2>
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-foreground font-semibold mb-2">SAJI Support Team</p>
              <p className="text-muted-foreground">Email: {contact.supportEmail}</p>
              <p className="text-muted-foreground">Address: {contact.address}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
