"use client"
import Link from "next/link"
import { trackKnowledgeSearch } from "@/frontend/lib/analytics"
import { useEffect, useRef, useState } from "react"
import { ArrowUpRight, Search } from "lucide-react"
import { GUIDES } from "@/backend/domain/knowledge"

export function KnowledgeSearch({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("All topics")
  const categories = ["All topics", ...new Set(GUIDES.map(g => g.category))]
  const matches = GUIDES.filter(g => (category === "All topics" || g.category === category) && `${g.title} ${g.summary} ${g.audience} ${g.sections.map(s => s.body).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
  const previousSearch = useRef("")
  useEffect(() => {
    const term = query.trim()
    if (!term) { previousSearch.current = ""; return }
    if (term === previousSearch.current) return
    const timer = setTimeout(() => { previousSearch.current = term; trackKnowledgeSearch(matches.length) }, 800)
    return () => clearTimeout(timer)
  }, [query, matches.length])
  return <div data-clarity-mask="true">
    <label htmlFor={compact ? "home-guide-search" : "guide-search"} className="mb-3 block text-sm font-medium">What would you like to know?</label>
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-slate-900 shadow-sm"><Search className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" /><input id={compact ? "home-guide-search" : "guide-search"} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Try payments, verification, offline sales…" className="w-full bg-transparent text-base outline-none" /></div>
    {!compact && <div className="my-6 flex flex-wrap gap-2" aria-label="Filter guides">{categories.map(c => <button key={c} onClick={() => setCategory(c)} aria-pressed={c === category} className={`rounded-full border px-4 py-2 text-sm transition ${c === category ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-400"}`}>{c}</button>)}</div>}
    <p className="mt-5 text-sm text-slate-500" role="status">{query || !compact ? `${matches.length} guides found` : "Popular guides to get you started"}</p>
    <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"}`}>{(compact && !query ? matches.slice(0, 4) : matches).map(g => <Link key={g.slug} href={`/knowledge/${g.slug}`} className="group rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 transition hover:border-blue-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-blue-600">{g.category}</span><ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600" /></div><h3 className="mt-3 font-semibold">{g.title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{g.summary}</p></Link>)}</div>
    {!matches.length && <div className="mt-5 rounded-xl bg-slate-100 p-6 text-slate-600">No matching guides. Try a shorter search or choose another topic. <Link href="/knowledge/support" className="font-medium text-blue-700 underline">Get help</Link></div>}
  </div>
}
