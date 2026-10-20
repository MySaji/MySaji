"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRight, Compass, Pin, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/frontend/components/ui/dialog"
import { useAuthContext } from "@/frontend/lib/auth-context"

type PageLink = { href: string; label: string }
// Suggestions are intersected with the user's rendered navigation before display.
const CUSTOMER_FLOW = ["/customer/services", "/customer/service-requests", "/customer/jobs", "/customer/orders", "/customer/messages", "/customer/help"]
const PRO_FLOW = ["/provider/requests", "/provider/quotes", "/provider/jobs", "/provider/messages", "/shopkeeper/orders", "/provider/clients", "/provider/availability"]

export function WorkspaceFlow() {
  const pathname = usePathname()
  const { user } = useAuthContext()
  const [open, setOpen] = useState(false)
  const [pages, setPages] = useState<PageLink[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const customer = pathname.startsWith("/customer")
  const pro = pathname.startsWith("/provider") || pathname.startsWith("/shopkeeper")
  const portal = customer ? "customer" : pro ? "pro" : pathname.split("/")[1]
  const enabled = ["customer", "pro", "admin", "sub-admin", "secretary", "agent", "distributor"].includes(portal)
  const storageKey = `saji:workspace-shortcuts:${user?.id}:${portal}`
  useEffect(() => { setOpen(false) }, [pathname])
  if (!enabled) return null
  const launch = () => {
    const links = new Map<string, PageLink>()
    document.querySelectorAll<HTMLElement>('[data-workspace] aside a[href], [data-workspace] nav a[href], [data-workspace] header a[href]').forEach(node => {
      const href = node.getAttribute("href") || ""
      const label = node.getAttribute("aria-label") || node.getAttribute("title") || node.innerText.trim().replace(/\s+/g, " ")
      const roots = pro ? ["/provider", "/shopkeeper"] : [`/${portal}`]
      if (label && roots.some(root => href === root || href.startsWith(root + "/"))) links.set(href, { href, label })
    })
    setPages([...links.values()])
    setQuery("")
    try { const stored: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]"); setSaved(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string" && links.has(item)).slice(0, 6) : []) } catch { setSaved([]) }
    setOpen(true)
  }
  const toggle = (href: string) => {
    const next = saved.includes(href) ? saved.filter(item => item !== href) : [...saved, href].slice(0, 6)
    setSaved(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Shortcuts still work during this visit. */ }
  }
  return <><button onClick={launch}><Compass size={14} />My workflow</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogTitle>{customer ? "From discovery to done" : "Keep your work moving"}</DialogTitle><DialogDescription>{customer ? "Find help, follow your requests, and keep conversations close." : "Keep your review queues, assigned work and conversations together."} Pin up to six pages for your next visit on this browser.</DialogDescription>
    {saved.length > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold">Your shortcuts</h3><div className="flex flex-wrap gap-2">{saved.map(href => <div key={href} className="flex items-center rounded-lg border bg-muted/40"><Link href={href} className="px-3 py-3 text-sm">{pages.find(page => page.href === href)?.label}</Link><button onClick={() => toggle(href)} aria-label={`Unpin ${pages.find(page => page.href === href)?.label}`} className="p-3"><X size={14} /></button></div>)}</div></section>}
    <label className="text-sm font-semibold">Filter workspace pages<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your available pages" className="mt-2 h-11 w-full rounded-lg border bg-background px-3 text-base font-normal" /></label>
    <section className="space-y-2"><h3 className="text-sm font-semibold">Connected pages</h3>{[...pages].filter(page => page.label.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => { const flow = customer ? CUSTOMER_FLOW : PRO_FLOW; const rank = (href: string) => flow.includes(href) ? flow.indexOf(href) : 99; return rank(a.href) - rank(b.href) }).map(page => <div key={page.href} className={`flex items-center gap-2 rounded-xl border px-3 ${pathname === page.href ? "border-blue-300 bg-blue-50 text-blue-950" : "border-border"}`}><Link href={page.href} aria-current={pathname === page.href ? "page" : undefined} className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 py-3 text-sm">{page.label}<ArrowRight size={15} className="shrink-0" /></Link><button type="button" aria-pressed={saved.includes(page.href)} aria-label={`${saved.includes(page.href) ? "Unpin" : "Pin"} ${page.label}`} disabled={!saved.includes(page.href) && saved.length >= 6} onClick={() => toggle(page.href)} className="rounded-lg p-3 text-blue-700 disabled:opacity-30"><Pin size={16} fill={saved.includes(page.href) ? "currentColor" : "none"} /></button></div>)}{!pages.some(page => page.label.toLowerCase().includes(query.trim().toLowerCase())) && <p className="text-sm text-muted-foreground">No matching page. Clear your search or open your workspace navigation.</p>}</section>
  </DialogContent></Dialog></>
}
