import type { Metadata } from "next"
import { KnowledgeSearch } from "@/frontend/components/knowledge-search"
export const metadata: Metadata = { title: "SAJI Knowledge Base | Guides, payments & business help", description: "Practical guides to booking services, running a shop, using Saji Till, payments, verification, and getting help." }
export default function KnowledgePage() {
  return <main className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">The SAJI handbook</p><h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">A little clarity.<br />A lot more confidence.</h1><p className="mb-10 mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">Find practical answers for your next booking, your business, and everything in between. Browse by topic or search the guides.</p><KnowledgeSearch /><div className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">Guides describe supported workflows. Availability, pricing, and eligibility are confirmed in your account at the time you use a feature.</div></main>
}
