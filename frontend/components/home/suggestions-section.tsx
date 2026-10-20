"use client"

import { useState } from "react"
import { useAuthContext } from "@/frontend/lib/auth-context"
import useSWR from "swr"
import Link from "next/link"
import Image from "next/image"
import {
  Blocks, CalendarClock, Eye, Heart, Loader2, MapPin, PackageCheck, RotateCcw, Sparkles, Store, TrendingUp,
} from "lucide-react"
import { getHomeSuggestions, getExploreSuggestions } from "@/backend/actions/suggestions"
import type { SuggestionKind } from "@/backend/services/suggestions"

/**
 * Suggestions, each saying why it is there.
 *
 * The reason line is the point of this component, not decoration. A feed
 * that cannot explain itself is read as advertising and scrolled past; one
 * that says "you ordered this from Mama Njeri before" is read as a shortcut.
 * So the reason is never truncated away and never optional.
 */

const ICON: Record<SuggestionKind, typeof RotateCcw> = {
  DUE_AGAIN: CalendarClock,
  GOES_WITH: Blocks,
  BACK_IN_STOCK: PackageCheck,
  REORDER: RotateCcw,
  SAVED: Heart,
  VIEWED: Eye,
  FROM_SHOP_YOU_USE: Store,
  NEARBY_OPEN: MapPin,
  POPULAR_LOCAL: TrendingUp,
}

const TINT: Record<SuggestionKind, string> = {
  DUE_AGAIN: "text-emerald-700 dark:text-emerald-300",
  GOES_WITH: "text-indigo-600 dark:text-indigo-400",
  BACK_IN_STOCK: "text-teal-600 dark:text-teal-400",
  REORDER: "text-emerald-600 dark:text-emerald-400",
  SAVED: "text-rose-500 dark:text-rose-400",
  VIEWED: "text-sky-600 dark:text-sky-400",
  FROM_SHOP_YOU_USE: "text-violet-600 dark:text-violet-400",
  NEARBY_OPEN: "text-amber-600 dark:text-amber-400",
  POPULAR_LOCAL: "text-muted-foreground",
}

/**
 * `surface` decides which engine call is made, and nothing else.
 *
 * Home asks for everything; Explore asks for the discovery half, because
 * somebody who went looking for something new did not come to be shown the
 * cooking oil they buy every month. Both render identically: one component,
 * so a fix to a card is a fix on both pages.
 */
export function SuggestionsSection({ surface = "home" }: { surface?: "home" | "explore" }) {
  const { user } = useAuthContext()
  const [filter, setFilter] = useState("all")
  const { data, isLoading, mutate } = useSWR(
    user?.id ? [surface + "-suggestions", user.id] : null,
    () => (surface === "explore"
      ? getExploreSuggestions({ limit: 24 })
      : getHomeSuggestions({ limit: 24 })),
  )
  const items = (data?.items ?? []).filter(item => filter === "all" || (filter === "familiar" ? ["DUE_AGAIN", "REORDER", "SAVED", "VIEWED", "FROM_SHOP_YOU_USE", "BACK_IN_STOCK"].includes(item.kind) : ["NEARBY_OPEN", "POPULAR_LOCAL", "GOES_WITH"].includes(item.kind)))

  // Signed out, or nothing to go on. The page's ordinary browse sections
  // already cover that case, so this simply does not appear.
  if (!isLoading && (!data || data.items.length === 0)) return null

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        {/* Neutral until the answer is known. Rendering "Worth a look" while
            loading and swapping it to "Picked for you" a moment later is a
            flicker that also tells the customer two different things about
            the same row. */}
        <h2 className="text-base font-bold text-foreground">
          {isLoading
            ? "Suggestions"
            : surface === "explore"
              ? (data?.personalised ? "Worth exploring" : "Popular right now")
              : (data?.personalised ? "Picked for you" : "Worth a look")}
        </h2>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">{[["all", "For you"], ["familiar", "Your recent interests"], ["nearby", "Local discoveries"]].map(([key, label]) => <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key} className={`rounded-lg border px-3 py-2 text-xs font-medium ${filter === key ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>{label}</button>)}<button onClick={() => void mutate()} className="ml-auto px-3 py-2 text-xs font-semibold text-primary">Refresh suggestions</button></div>
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[132px] w-[160px] flex-shrink-0 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((s) => {
            const Icon = ICON[s.kind] ?? Sparkles
            return (
              <Link
                key={s.id}
                href={s.href}
                className="min-w-0 overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
              >
                <div className="relative h-32 sm:h-40 w-full bg-muted">
                  {s.image ? (
                    <Image src={s.image} alt="" fill sizes="160px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Icon className={"h-6 w-6 " + (TINT[s.kind] ?? "")} />
                    </div>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-sm font-semibold text-foreground">{s.title}</p>
                  {s.subtitle && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{s.subtitle}</p>
                  )}
                  {/* Two lines, never one: cutting "you ordered this from X
                      before" down to "you ordered this from" explains
                      nothing and looks broken. */}
                  <p className={"mt-1 flex items-start gap-1 text-[11px] leading-snug " + (TINT[s.kind] ?? "text-muted-foreground")}>
                    <Icon className="mt-[1px] h-2.5 w-2.5 flex-shrink-0" />
                    <span className="line-clamp-2">{s.reason}</span>
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
      {!isLoading && !items.length && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No suggestions in this group yet. Try For you or explore the catalogue.</p>}
    </section>
  )
}
