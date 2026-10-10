"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import type { OfferCategoryOption } from "@/backend/actions/offers"
import { searchTermsFor } from "@/backend/domain/category-search-terms"

/**
 * Type-to-filter category picker.
 *
 * This replaced a plain <select>. That was fine when SAJI had a couple of dozen
 * trade categories; it stopped being fine when the taxonomy grew to ~90 to
 * cover developers, teachers, lawyers, doctors and the rest, at which point
 * finding your own profession meant scrolling a list nearly a hundred long.
 *
 * Matching is deliberately loose — it searches the category name AND its
 * parent, so a provider who types "design" finds Graphic Design and UI/UX
 * Design even though neither word starts with it, and someone who types "web"
 * finds Web Development under Technology. The parent is shown on every row
 * because "Graphic Design" alone does not tell you which branch you are in.
 */

/**
 * A query matches a synonym if the query is a substring of it ("plumb" finds
 * "plumber"), or if the synonym appears in the query as a whole word ("fundi
 * wa maji" finds "fundi").
 *
 * The whole-word half matters: a naive q.includes(term) lets two-letter
 * synonyms match anything containing those letters, which is how "teacher"
 * matched AC Repair via "ac", "programmer" matched Marketing via "pr", and
 * "mitumba" matched Web Development via "it".
 */
function matchesTerm(query: string, term: string): boolean {
  if (term.includes(query)) return true
  return matchesWholeWord(query, term)
}

function matchesWholeWord(query: string, term: string): boolean {
  const at = query.indexOf(term)
  if (at === -1) return false
  const before = at === 0 ? "" : query[at - 1]
  const after = query[at + term.length] ?? ""
  const isWordChar = (ch: string) => /[a-z0-9]/.test(ch)
  return !isWordChar(before) && !isWordChar(after)
}

type Props = {
  categories: OfferCategoryOption[]
  value: string
  onChange: (categoryId: string) => void
  placeholder?: string
}

export function CategoryPicker({ categories, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = useMemo(
    () => categories.find((c) => c.id === value) ?? null,
    [categories, value],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return categories
    return categories.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true
      if (c.parentName?.toLowerCase().includes(q)) return true
      // What people call themselves rarely matches what the category is
      // called: "programmer" vs Software Engineering, "lawyer" vs Legal
      // Services, "fundi wa maji" vs Plumbers. Without these, the search
      // returns nothing for exactly the words a provider would type first.
      return searchTermsFor(c.slug).some((term) => matchesTerm(q, term))
    })
  }, [categories, query])

  // Reset the highlight whenever the result set changes, so Enter never picks
  // a row the provider can no longer see.
  useEffect(() => setHighlight(0), [query, open])

  // Close on an outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [open])

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" })
  }, [highlight, open])

  const choose = (categoryId: string) => {
    onChange(categoryId)
    setQuery("")
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setHighlight((h) => {
        const next = e.key === "ArrowDown" ? h + 1 : h - 1
        if (next < 0) return results.length - 1
        if (next >= results.length) return 0
        return next
      })
      return
    }
    if (e.key === "Enter") {
      if (!open) return
      e.preventDefault()
      const pick = results[highlight]
      if (pick) choose(pick.id)
      return
    }
    if (e.key === "Escape") {
      setOpen(false)
      setQuery("")
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Closed state shows the choice; opening swaps in the search field, so
          the control is a button until the provider actually needs to search. */}
      {!open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()) }}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 text-left text-sm"
        >
          <span className={selected ? "truncate text-foreground" : "truncate text-muted-foreground"}>
            {selected
              ? selected.parentName
                ? `${selected.parentName} › ${selected.name}`
                : selected.name
              : placeholder ?? "Search for your profession"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls="category-picker-list"
            aria-autocomplete="list"
            aria-label={placeholder ?? "Search for your profession"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder ?? "Search for your profession"}
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); inputRef.current?.focus() }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {open && (
        <ul
          ref={listRef}
          id="category-picker-list"
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-background py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing matches &ldquo;{query}&rdquo;. Try a broader word, or ask
              an admin to add your profession.
            </li>
          ) : (
            results.map((c, i) => {
              const isSelected = c.id === value
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-index={i}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(c.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      i === highlight ? "bg-muted" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{c.name}</span>
                      {c.parentName && (
                        <span className="block truncate text-xs text-muted-foreground">{c.parentName}</span>
                      )}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}

export default CategoryPicker
