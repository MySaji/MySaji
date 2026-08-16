import Link from "next/link"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import { getPublicLegalContent, getPublicSiteSettings } from "@/lib/actions/admin-settings"
import { renderLegalContent } from "@/components/legal-content"

export default async function TermsPage() {
  const [{ termsContent, updatedAt }, contact] = await Promise.all([
    getPublicLegalContent(),
    getPublicSiteSettings(),
  ])
  const isCustom = termsContent.trim().length > 0
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
          <h1 className="text-3xl font-bold">Terms of Service</h1>
          <p className="text-primary-foreground/80 mt-2">Last updated: {lastUpdated}</p>
        </div>

        {!isCustom && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-x border-amber-200 dark:border-amber-900/40 px-6 py-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              <strong>Draft — pending legal review.</strong> This is a template Terms of Service covering the platform's
              actual features and policies. It has not been reviewed by a lawyer and should not be treated as final
              before launch.
            </p>
          </div>
        )}

        <div className="bg-card border border-border rounded-b-2xl px-6 py-8 space-y-8">
          {isCustom ? (
            renderLegalContent(termsContent)
          ) : (
            <>
              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">1. Acceptance of Terms</h2>
                <p className="text-muted-foreground leading-relaxed">
                  By creating an account or using SAJI ("the Platform," "we," "us"), you agree to be bound by these Terms
                  of Service and our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
                  If you do not agree, do not use the Platform.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">2. What SAJI Is</h2>
                <p className="text-muted-foreground leading-relaxed">
                  SAJI is a marketplace that connects customers with independent service providers (electricians,
                  plumbers, cleaners, and similar trades) and shopkeepers selling related products. SAJI is not the
                  provider of the underlying services or products — providers and shopkeepers are independent third
                  parties, not SAJI employees or agents.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">3. Accounts &amp; Eligibility</h2>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>You must be at least 18 years old to create an account.</li>
                  <li>You must provide accurate registration information and keep it up to date.</li>
                  <li>You are responsible for all activity under your account and for keeping your password secure.</li>
                  <li>Service providers and shopkeepers may be required to complete identity/business verification (KYC) before their listings become active.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">4. Bookings &amp; Payment</h2>
                <p className="text-muted-foreground leading-relaxed mb-3">
                  When you book a service, full payment is collected upfront through one of the Platform's supported
                  payment methods (mobile money, card, PayPal, bank transfer, or your SAJI wallet balance) before the
                  booking is confirmed with the provider. Product orders from shopkeepers are paid the same way at
                  checkout.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Prices, service fees, and any applicable platform commission are shown before you confirm payment.
                  Emergency/priority bookings carry an additional surcharge, shown before checkout.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">5. Cancellations &amp; Refunds</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Cancellation and refund eligibility depends on the job's status at the time of cancellation and is
                  handled case-by-case through the dispute process described below. Completed jobs paid in full are
                  generally non-refundable except where the service was not delivered as agreed.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">6. Provider &amp; Shopkeeper Obligations</h2>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Perform booked services with reasonable skill and care, and as described in the listing.</li>
                  <li>Keep product listings, pricing, and stock levels accurate.</li>
                  <li>Hold any licenses or permits required by law for the trade being offered.</li>
                  <li>Not solicit customers to pay or transact outside the Platform to avoid fees.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">7. Customer Obligations</h2>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Provide accurate booking details (location, access, scope of work).</li>
                  <li>Treat providers and their staff respectfully and provide a safe environment to work in.</li>
                  <li>Pay for services and products through the Platform's supported payment methods only.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">8. Reviews &amp; Community Content</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Reviews must reflect a genuine transaction on the Platform. Community posts and comments must not
                  contain harassment, hate speech, fraud, or content that violates the law. Content that violates these
                  rules can be reported and may be removed by our moderation team.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">9. Prohibited Conduct</h2>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Creating fraudulent accounts, reviews, or listings.</li>
                  <li>Attempting to circumvent the Platform's payment system.</li>
                  <li>Harassing, threatening, or discriminating against other users.</li>
                  <li>Using the Platform for any unlawful purpose.</li>
                  <li>Attempting to interfere with or disrupt the Platform's security or normal operation.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">10. Disputes</h2>
                <p className="text-muted-foreground leading-relaxed">
                  If something goes wrong with a booking or order, you can report it through the Platform. Reported
                  issues are reviewed by our dispute-resolution team, who may request evidence from both sides and can
                  issue a refund, partial refund, or other resolution at their discretion based on the evidence provided.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">11. Fees</h2>
                <p className="text-muted-foreground leading-relaxed">
                  SAJI may charge providers and shopkeepers a commission on completed transactions, and may charge
                  customers a service fee shown at checkout. Current fee amounts are shown in-app before you confirm a
                  transaction and may change with notice.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">12. Account Suspension &amp; Termination</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may suspend or terminate an account that violates these Terms, receives repeated verified
                  complaints, or is used fraudulently. You may close your account at any time from Settings.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">13. Limitation of Liability</h2>
                <p className="text-muted-foreground leading-relaxed">
                  SAJI facilitates the connection between customers, providers, and shopkeepers but is not a party to the
                  service or sale agreement between them. To the maximum extent permitted by law, SAJI is not liable for
                  the quality, safety, or legality of services or products offered by providers and shopkeepers on the
                  Platform, except to the extent required by applicable consumer protection law.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">14. Changes to These Terms</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may update these Terms from time to time. We'll post the updated Terms with a new "Last updated"
                  date; continued use of the Platform after a change constitutes acceptance of the revised Terms.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">15. Governing Law</h2>
                <p className="text-muted-foreground leading-relaxed">
                  These Terms are governed by the laws of Kenya, without regard to conflict-of-law principles.
                </p>
              </section>
            </>
          )}

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4">{isCustom ? "Contact Us" : "16. Contact Us"}</h2>
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
