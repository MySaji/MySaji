"use client"

import useSWR from "swr"
import Link from "next/link"
import Image from "next/image"
import { Sparkles, Loader2, MapPin, RotateCcw, Heart, Eye, Store, TrendingUp } from "lucide-react"
import { getHomeSuggestions } from "@/backend/actions/suggestions"
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
  REORDER: RotateCcw,
  SAVED: Heart,
  VIEWED: Eye,
  FROM_SHOP_YOU_USE: Store,
  NEARBY_OPEN: MapPin,
  POPULAR_LOCAL: TrendingUp,
}

const TINT: Record<SuggestionKind, string> = {
  REORDER: "text-emerald-600 dark:text-emerald-400",
  SAVED: "text-rose-500 dark:text-rose-400",
  VIEWED: "text-sky-600 dark:text-sky-400",
  FROM_SHOP_YOU_USE: "text-violet-600 dark:text-violet-400",
  NEARBY_OPEN: "text-amber-600 dark:text-amber-400",
  POPULAR_LOCAL: "text-muted-foreground",
}

export function SuggestionsSection() {
  const { data, isLoading } = useSWR("home-suggestions", () => getHomeSuggestions({ limit: 10 }))

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
          {isLoading ? "Suggestions" : data?.personalised ? "Picked for you" : "Worth a look"}
        </h2>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[132px] w-[160px] flex-shrink-0 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
          {data!.items.map((s) => {
            const Icon = ICON[s.kind] ?? Sparkles
            return (
              <Link
                key={s.id}
                href={s.href}
                className="w-[160px] flex-shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
              >
                <div className="relative h-20 w-full bg-muted">
                  {s.image ? (
                    <Image src={s.image} alt="" fill sizes="160px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Icon className={"h-6 w-6 " + (TINT[s.kind] ?? "")} />
                    </div>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs font-semibold text-foreground">{s.title}</p>
                  {s.subtitle && (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{s.subtitle}</p>
                  )}
                  {/* Two lines, never one: cutting "you ordered this from X
                      before" down to "you ordered this from" explains
                      nothing and looks broken. */}
                  <p className={"mt-1 flex items-start gap-1 text-[10px] leading-snug " + (TINT[s.kind] ?? "text-muted-foreground")}>
                    <Icon className="mt-[1px] h-2.5 w-2.5 flex-shrink-0" />
                    <span className="line-clamp-2">{s.reason}</span>
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
