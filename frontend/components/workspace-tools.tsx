"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowUpRight, BookOpen, Copy, Search, Wallet } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"
import { WorkspaceFlow } from "@/frontend/components/workspace-flow"
import { Input } from "@/frontend/components/ui/input"
import { useAuthContext } from "@/frontend/lib/auth-context"

export function WorkspaceTools({ name }: { name: string }) {
  const pathname = usePathname()
  const { user } = useAuthContext()
  const accountRoot = user?.role === "shopkeeper" ? "/shopkeeper" : "/" + pathname.split("/")[1]
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [links, setLinks] = useState<{ href: string; label: string }[]>([])
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  useEffect(() => { setOpen(false); setCopied(false); setCopyError(false) }, [pathname])
  const show = () => {
    const prefix = pathname.startsWith("/provider") || pathname.startsWith("/shopkeeper") ? ["/provider", "/shopkeeper"] : ["/" + pathname.split("/")[1]]
    const available = new Map<string, string>()
    if (["/customer", "/provider", "/shopkeeper", "/admin", "/sub-admin", "/secretary", "/agent", "/distributor"].includes(accountRoot)) {
      if (accountRoot !== "/admin") available.set(`${accountRoot}/wallet`, "My wallet")
      available.set(`${accountRoot}/messages`, "Messages")
      available.set(`${accountRoot}/notifications`, "Notifications")
    }
    // Use the rendered role navigation; unavailable modules are not invented here.
    document.querySelectorAll<HTMLElement>('[data-workspace] aside a[href], [data-workspace] header a[href], [data-workspace] nav a[href]').forEach(node => {
      const href = node.getAttribute("href") || ""
      const label = node.getAttribute("aria-label") || node.getAttribute("title") || node.innerText.trim().replace(/\s+/g, " ")
      if (label && prefix.some(base => href === base || href.startsWith(base + "/"))) available.set(href, label)
    })
    setLinks([...available].map(([href, label]) => ({ href, label })))
    setQuery(""); setOpen(true)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); show() } }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
  // Keep the finder mounted without reducing the conversation composer space.
  const isConversation = pathname.endsWith("/messages")
  return <>
    {!isConversation && <nav aria-label="Workspace tools" className="workspace-tools"><span>{name}</span><WorkspaceFlow /><button onClick={show}><Search size={14} />Find a page <kbd>Ctrl K</kbd></button><button onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setCopyError(false) } catch { setCopyError(true) } }}><Copy size={14} />{copied ? "Link copied" : "Copy page link"}</button>{accountRoot !== "/admin" && <Link href={`${accountRoot}/wallet`}><Wallet size={14} />My wallet</Link>}<Link href="/knowledge" target="_blank" rel="noopener noreferrer"><BookOpen size={14} />Guides</Link>{copyError && <span role="status">Copy the address from your browser’s address bar.</span>}</nav>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Find a page in {name}</DialogTitle><DialogDescription>Search the pages available in your workspace navigation.</DialogDescription><Input aria-label="Search workspace pages" placeholder="Try orders, messages or reports" value={query} onChange={event => setQuery(event.target.value)} /><div className="max-h-[55dvh] space-y-1 overflow-y-auto">{links.filter(link => link.label.toLowerCase().includes(query.toLowerCase())).map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">{link.label}<ArrowUpRight size={15} /></Link>)}{!links.some(link => link.label.toLowerCase().includes(query.toLowerCase())) && <p className="p-4 text-sm text-muted-foreground">No matching page. Try another name.</p>}</div></DialogContent></Dialog>
  </>
}
