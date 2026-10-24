import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ArrowRight, ArrowUpRight, Check } from "lucide-react"
import { OFFERING_LINKS, OFFERING_SLUGS } from "@/backend/domain/public-site"
import { publicOfferingBySlug } from "@/backend/domain/public-offerings"
import { guideBySlug } from "@/backend/domain/knowledge"
import { pageMetadata } from "@/frontend/lib/seo"
import { PublicHeader } from "@/frontend/components/public-header"
import { PublicBreadcrumbs } from "@/frontend/components/public-breadcrumbs"
import { Footer } from "@/frontend/components/footer"

type Props = { params: Promise<{ offering: string }> }
export const dynamicParams = false
export function generateStaticParams() { return OFFERING_SLUGS.map(offering => ({ offering })) }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const offering = publicOfferingBySlug((await params).offering)
  return offering ? pageMetadata(`/${offering.slug}`, offering.title, offering.description) : { title: "Page not found", robots: { index: false, follow: false } }
}

export default async function OfferingPage({ params }: Props) {
  const offering = publicOfferingBySlug((await params).offering)
  if (!offering) notFound()
  const guides = offering.guides.flatMap(slug => { const guide = guideBySlug(slug); return guide ? [guide] : [] })
  const related = OFFERING_LINKS.filter(link => offering.related.includes(link.href.slice(1)) || link.href === "/pos")
  return <div className="min-h-screen bg-white text-slate-900">
    <PublicHeader />
    <main>
      <section className="border-b border-slate-200 bg-slate-50"><div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <PublicBreadcrumbs items={[{ label: "MySaji home", href: "/" }, { label: offering.label, href: `/${offering.slug}` }]} />
        <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div><p className="text-xs font-semibold tracking-widest text-blue-800">{offering.eyebrow}</p><h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{offering.heading}</h1><p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">{offering.intro}</p><div className="mt-7 flex flex-wrap items-center gap-5"><Link href={offering.action.href} className="inline-flex min-h-12 items-center gap-3 rounded-lg bg-blue-800 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-900">{offering.action.label}<ArrowRight size={17} aria-hidden="true" /></Link><a href="#how-it-works" className="text-sm font-semibold text-blue-800 underline underline-offset-4">How it works</a></div></div>
          <aside className="rounded-xl border border-slate-200 border-t-4 border-t-orange-500 bg-white p-6"><h2 className="text-base font-semibold">Start with the right details</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">{["Check the scope and current availability.", "Review prices and payment conditions.", "Use your account to keep the transaction record."].map(item => <li key={item} className="flex items-start gap-2"><Check size={16} className="mt-1 shrink-0 text-blue-800" aria-hidden="true" />{item}</li>)}</ul><Link href="/knowledge/getting-started" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-blue-800">New to MySaji? Read the guide<ArrowUpRight size={15} aria-hidden="true" /></Link></aside>
        </div>
      </div></section>
      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16" aria-labelledby="offering-features"><p className="text-xs font-semibold uppercase tracking-widest text-blue-800">What you can do</p><h2 id="offering-features" className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">A closer look at {offering.label === "Grow" ? "the business workflows" : offering.label}</h2><div className="mt-8 grid gap-5 md:grid-cols-2">{offering.features.map((feature, index) => <article key={feature.title} className="rounded-xl border border-slate-200 p-5 sm:p-7"><span className="text-xs font-semibold text-orange-700">0{index + 1}</span><h3 className="mt-3 text-lg font-semibold">{feature.title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{feature.body}</p></article>)}</div></section>
      <section id="how-it-works" className="border-y border-slate-200 bg-slate-50"><div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_2fr]"><div><h2 className="text-2xl font-semibold tracking-tight">How to get started</h2><p className="mt-3 text-sm leading-7 text-slate-600">Review the workflow first. Live availability, eligibility and transaction details are confirmed in the relevant account.</p></div><ol className="grid gap-5 sm:grid-cols-2">{offering.steps.map((step,index) => <li key={step} className="flex items-start gap-3 text-sm leading-7 text-slate-700"><span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-800 text-xs font-semibold text-white">{index+1}</span><span>{step}</span></li>)}</ol></div></section>
      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8" aria-labelledby="offering-questions"><h2 id="offering-questions" className="text-2xl font-semibold tracking-tight">Questions before you start</h2><div className="mt-6 max-w-3xl divide-y divide-slate-200">{offering.questions.map(question => <details key={question.question} className="py-5"><summary className="cursor-pointer text-base font-semibold leading-7">{question.question}</summary><p className="mt-3 text-sm leading-7 text-slate-600">{question.answer}</p></details>)}</div></section>
      <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-8" aria-labelledby="offering-guides"><h2 id="offering-guides" className="text-2xl font-semibold tracking-tight">Practical guides for your next step</h2><div className="mt-6 grid gap-4 md:grid-cols-3">{guides.map(guide => <Link key={guide.slug} href={`/knowledge/${guide.slug}`} className="rounded-xl border border-slate-200 p-5 hover:border-blue-500"><h3 className="font-semibold text-blue-800">{guide.title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{guide.summary}</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-800">Read the guide<ArrowUpRight size={15} aria-hidden="true" /></span></Link>)}</div></section>
      <nav aria-label="Related MySaji offerings" className="mx-auto flex max-w-6xl flex-wrap gap-3 border-t border-slate-200 px-5 py-8 sm:px-8">{related.map(link => <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-blue-800">{link.label}<ArrowRight size={15} aria-hidden="true" /></Link>)}</nav>
    </main>
    <Footer />
  </div>
}
