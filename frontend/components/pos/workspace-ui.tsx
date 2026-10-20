import type { ComponentProps, ReactNode } from "react"
import { Layers3 } from "lucide-react"
import { Card as BaseCard } from "@/frontend/components/ui/card"
import { cn } from "@/frontend/lib/utils"

/** POS cards use explicit spacing inside each workflow rather than a large implicit flex gap. */
export function PosCard({ className, ...props }: ComponentProps<typeof BaseCard>) {
  return <BaseCard className={cn("gap-0 rounded-2xl border-border bg-background py-0 shadow-sm", className)} {...props} />
}

export function WorkspaceHeading({ title, eyebrow = "Business workspace" }: { title: ReactNode; eyebrow?: string }) {
  return <header className="flex min-w-0 items-center gap-3 py-1">
    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-900 dark:bg-blue-950"><Layers3 className="h-5 w-5" /></span>
    <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">{eyebrow}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1></div>
  </header>
}

export function WorkspaceHero({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white md:p-8">
    <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full border-[48px] border-white/[0.03]" />
    <div className="relative flex flex-wrap items-start justify-between gap-5"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-300">Saji Till workspace</p><h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">{description}</p></div>{children}</div>
  </section>
}
