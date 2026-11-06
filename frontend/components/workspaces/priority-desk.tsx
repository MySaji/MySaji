"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowUpRight, ListFilter } from "lucide-react"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { safeWorkspaceHref, workspaceScope } from "@/backend/domain/workspace-personalization"

type Priority = {
  id: string
  title: string
  count: number | null | undefined
  href: string
  description: string
  allowed?: boolean
}
export function PriorityDesk({ items }: { items: Priority[] }) {
  const [showAll, setShowAll] = useState(false)
  const { user } = useAuthContext()
  const scope = workspaceScope(usePathname(), user?.role)
  const permitted = items.filter(
    (item) => item.allowed !== false && scope && safeWorkspaceHref(item.href, scope)
  )
  const visible = permitted.filter((item) => showAll || item.count == null || item.count > 0)
  if (!permitted.length) return null
  return (
    <section className="professional-surface my-5 p-5" aria-label="Work priorities">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Your next steps</p>
          <h2 className="mt-1 text-lg font-semibold">Work priorities</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Figures from your loaded overview. Open a queue to review its latest records.
          </p>
        </div>
        <button
          type="button"
          aria-pressed={showAll}
          onClick={() => setShowAll(!showAll)}
          className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"
        >
          <ListFilter size={16} />
          {showAll ? "Needs attention" : "Show all queues"}
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="group rounded-xl border bg-background p-4 transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <ArrowUpRight size={18} className="shrink-0 text-primary" />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{item.count ?? "--"}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
            <span className="mt-4 block text-sm font-semibold text-primary">Review records</span>
          </Link>
        ))}
      </div>
      {!visible.length && (
        <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No outstanding items in these loaded queues. Choose Show all queues to review them.
        </p>
      )}
    </section>
  )
}
