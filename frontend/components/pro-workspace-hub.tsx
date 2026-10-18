"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Search, LayoutGrid } from "lucide-react"
import { useProCapabilities } from "@/frontend/lib/hooks/useProCapabilities"
import { Input } from "@/frontend/components/ui/input"

export function ProWorkspaceHub() {
  const { modules, isLoading } = useProCapabilities()
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState(false)
  const visible = modules.filter(module => module.group !== "till" && `${module.label} ${module.description}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="rounded-2xl border border-border bg-card p-4 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><LayoutGrid className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Your business tools</h2></div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">The modules enabled for this account. Find a tool and get straight to work.</p></div><Input aria-label="Find business tools" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your tools" className="sm:max-w-64" /></div>{isLoading ? <p className="py-5 text-sm text-muted-foreground">Loading your workspace…</p> : <><div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{(expanded || query ? visible : visible.slice(0,6)).map(module=><Link href={module.href} key={module.key} className="group rounded-xl border border-border p-4 hover:border-primary/40 hover:bg-primary/5"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{module.label}</h3><ArrowUpRight className="h-4 w-4 text-primary" /></div><p className="mt-2 text-xs leading-6 text-muted-foreground">{module.description}</p></Link>)}</div>{!visible.length && <p className="py-5 text-sm text-muted-foreground">No enabled tools match this search.</p>}{visible.length>6 && !query && <button onClick={()=>setExpanded(!expanded)} className="mt-4 rounded-lg border border-border px-4 py-2 text-xs font-semibold text-primary">{expanded?"Show fewer tools":`View all ${visible.length} tools`}</button>}</>}</section>
}
