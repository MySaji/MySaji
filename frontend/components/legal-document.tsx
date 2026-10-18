import Link from "next/link"
import { ArrowLeft, ArrowUpRight, FileText, Mail, MapPin, ShieldCheck } from "lucide-react"
import { legalHeadings, renderLegalContent } from "@/frontend/components/legal-content"
import { LegalDocumentActions } from "@/frontend/components/legal-document-actions"
import styles from "./legal-document.module.css"

type LegalDocumentProps = {
  kind: "privacy" | "terms"
  content: string
  updated: string
  contact: { supportEmail: string; supportPhone: string; address: string }
}

export function LegalDocument({ kind, content, updated, contact }: LegalDocumentProps) {
  const privacy = kind === "privacy"
  const title = privacy ? "Privacy Policy" : "Terms of Service"
  const headings = legalHeadings(content)
  const Icon = privacy ? ShieldCheck : FileText
  const contactText = ["MySaji Support", contact.supportEmail, contact.supportPhone, contact.address].filter(Boolean).join("\n")
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.supportEmail) ? contact.supportEmail : null
  return <div className={`${styles.document} min-h-screen bg-slate-50 text-foreground dark:bg-background`}>
    <header className="border-b border-border bg-card px-5 py-4 print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium hover:underline"><ArrowLeft size={16} aria-hidden="true" />Back to MySaji</Link>
        <nav aria-label="Legal pages" className="flex gap-1 text-sm">
          <Link href="/privacy" aria-current={privacy ? "page" : undefined} className={`rounded-lg px-3 py-3 ${privacy ? "bg-blue-50 font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200" : "hover:bg-muted"}`}>Privacy</Link>
          <Link href="/terms" aria-current={!privacy ? "page" : undefined} className={`rounded-lg px-3 py-3 ${!privacy ? "bg-blue-50 font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200" : "hover:bg-muted"}`}>Terms</Link>
        </nav>
      </div>
    </header>
    <main id="legal-top" className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-14">
      <div className="mb-9 max-w-3xl">
        <span className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-800 dark:text-blue-300"><Icon size={18} aria-hidden="true" />MySaji · Trust & transparency</span>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{privacy ? "Understand what information we handle, why we need it and the choices you have across MySaji." : "Understand how MySaji works, what to expect from a transaction and the responsibilities we share."}</p>
        <p className="mb-5 mt-4 text-sm text-muted-foreground">Last updated: {updated} · Applies to customers, Saji Pro, Saji Till and authorised teams</p>
        <LegalDocumentActions title={title} updated={updated} text={`${content}\n\nContact\n${contactText}`} />
      </div>
      <div className="grid items-start gap-7 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
        <aside className="rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6 print:hidden">
          <details open>
            <summary className="cursor-pointer text-sm font-semibold">On this page</summary>
            <nav aria-label={`${title} contents`} className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-2 lg:max-h-[65vh]">
              {headings.map(heading => <a key={heading.id} href={`#${heading.id}`} className="block rounded-md px-2 py-2 text-sm leading-5 text-muted-foreground hover:bg-muted hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-700">{heading.title}</a>)}
              <a href="#legal-contact" className="block rounded-md px-2 py-2 text-sm text-blue-800 dark:text-blue-300">Contact & further reading</a>
            </nav>
          </details>
        </aside>
        <article aria-label={title} className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-9">
          <div className="mb-6 border-l-4 border-orange-500 bg-orange-50 px-4 py-4 text-sm leading-6 text-slate-800 dark:bg-orange-950/30 dark:text-orange-100">
            <p className="font-semibold">{privacy ? "Your information, your choices" : "Before you confirm a transaction"}</p>
            <p className="mt-1">{privacy ? "You can manage available preferences in your account and contact us to exercise your privacy rights. Browser permissions and account preferences are separate controls." : "Review the supplier, scope, price, payment status and cancellation conditions. These terms do not limit rights that applicable law protects."}</p>
          </div>
          <div className="space-y-5 text-base leading-7">{renderLegalContent(content)}</div>
          <section id="legal-contact" className="mt-10 scroll-mt-6 border-t border-border pt-8">
            <h2 className="text-xl font-semibold tracking-tight">Contact & further reading</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">For {privacy ? "privacy requests, data corrections or security concerns" : "transaction complaints, account appeals or questions about these terms"}, use the published support details below or the support options in your signed-in portal. Include a relevant reference, never a password or payment PIN.</p>
            <div className="my-5 space-y-3 rounded-xl bg-muted/50 p-5 text-sm">
              <p className="font-semibold">MySaji Support</p>
              {email && <a href={`mailto:${email}?subject=${encodeURIComponent(privacy ? "Privacy request" : "Terms of Service enquiry")}`} className="flex items-center gap-2 text-blue-800 underline underline-offset-4 dark:text-blue-300"><Mail size={16} aria-hidden="true" />{email}</a>}
              {contact.supportPhone && <p>Phone: {contact.supportPhone}</p>}
              {contact.address && <p className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{contact.address}</p>}
              {!email && !contact.supportPhone && <p className="text-muted-foreground">Use Help & support in your account to contact the MySaji team.</p>}
            </div>
            <div className="flex flex-col items-start gap-3 text-sm text-blue-800 dark:text-blue-300">
              <Link href={privacy ? "/terms" : "/privacy"} className="underline underline-offset-4">Read the {privacy ? "Terms of Service" : "Privacy Policy"}</Link>
              <a href="https://www.odpc.go.ke/rights-of-a-data-subject/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">Kenya ODPC: your data rights<ArrowUpRight size={14} aria-hidden="true" /></a>
              <a href="https://www.odpc.go.ke/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">Office of the Data Protection Commissioner<ArrowUpRight size={14} aria-hidden="true" /></a>
              {!privacy && <a href="https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/ConsumerProtectionActNo46of2012.PDF" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">Kenya Consumer Protection Act (PDF)<ArrowUpRight size={14} aria-hidden="true" /></a>}
              <a href="#legal-top" className="mt-3 print:hidden">Back to top ↑</a>
            </div>
          </section>
        </article>
      </div>
    </main>
  </div>
}
