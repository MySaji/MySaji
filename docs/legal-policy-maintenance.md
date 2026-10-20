# MySaji policy maintenance

The public `/privacy` and `/terms` pages use the detailed defaults in `frontend/lib/legal-documents.ts`. Administrator-saved legal text continues to override the corresponding default. No production legal setting is changed by this update. The customer privacy route redirects to the same policy.

In the admin editor use blank lines between paragraphs and headings, `## ` for headings, and `- ` for bullet lists. This produces matching contents links, printable pages and downloadable text. HTML is rendered as text rather than executed. Contact details come from existing platform settings; no unverified email or office address is invented.

## Coverage

Privacy covers platform/merchant responsibilities, data categories, lawful grounds, payments, loyalty, employee access, stored messages and media, WebRTC calls, AI processing, service providers, browser storage, push alerts, marketing, retention criteria, international transfers, rights requests, children and policy changes.

Terms cover eligibility, marketplace roles, orders, fees, subscriptions when offered, payment states, wallets, merchant Paybills, escrow only where offered, consumer remedies, merchant duties, Till operations, employee permissions, loyalty, communications, AI output, intellectual property, prohibited use, suspension appeals, reliability and governing law.

## Confirm before final legal adoption

This is a product-specific draft, not a legal opinion or compliance certification. The operator and legal adviser should confirm:

- The contracting legal entity, registered address and applicable ODPC responsibilities. Configure real monitored support details in platform settings.
- Production processors, processing locations, transfer safeguards, AI-provider retention/training arrangements and merchant data-processing agreements.
- A documented retention/deletion schedule by record type and backup cycle. The policy uses criteria instead of invented periods or immediate-erasure promises.
- Lawful grounds and consent implementation for optional tracking, marketing and AI processing, and procedures for rights requests within applicable deadlines.
- Financial-service arrangements, customer-money handling, withdrawal/refund rules, plan renewal conditions and required disclosures. No banking, tax certification or universal escrow guarantee is made.
- Material-change notices and any required acceptance tracking. This change does not add versioned legal acceptance or email existing users.

If an administrator has published custom legal content, review and update it through the authorised editor to adopt the new wording. Do not silently overwrite a published agreement in the database.

## References reviewed

- [ODPC: data subject rights](https://www.odpc.go.ke/rights-of-a-data-subject/)
- [ODPC: data-protection laws](https://www.odpc.go.ke/data-protection-laws-kenya/)
- [Kenya Consumer Protection Act](https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/ConsumerProtectionActNo46of2012.PDF)

These sources inform the Kenyan rights and consumer provisions; feature descriptions reflect the repository. Recheck current law when publishing substantive revisions.
