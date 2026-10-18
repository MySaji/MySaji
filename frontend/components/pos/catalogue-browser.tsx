"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowUpDown, Check, Grid2X2, List, Loader2, Package, Plus, SearchX, Star } from "lucide-react"
import type { TillProduct } from "@/backend/actions/pos-sales"
import { filterCatalogue, type CatalogueFilter, type CatalogueSort } from "@/backend/domain/pos-workspace"

type Props = {
  products: TillProduct[]
  catalogue: readonly { categoryName?: string | null }[]
  cart: { product: TillProduct; quantity: string }[]
  onAdd: (product: TillProduct) => void
  searching: boolean
  scope: string | null
  query: string
  hasMore: boolean
  onLoadMore: () => void
}
const money = (value: number) => value.toLocaleString("en-KE", { maximumFractionDigits: 2 })

export function CatalogueBrowser({ products, catalogue, cart, onAdd, searching, scope, query, hasMore, onLoadMore }: Props) {
  const [category, setCategory] = useState<string | null>(null)
  const [filter, setFilter] = useState<CatalogueFilter>("all")
  const [sort, setSort] = useState<CatalogueSort>("default")
  const [compact, setCompact] = useState(false)
  const [layout, setLayout] = useState<"grid" | "list">("grid")
  const [favourites, setFavourites] = useState<{ scope: string | null; ids: string[] }>({ scope: null, ids: [] })
  const favouriteIds = favourites.scope === scope ? favourites.ids : []

  useEffect(() => {
    setCategory(null)
    setFilter("all")
    if (!scope) return
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(`till-favourites:${scope}`) || "[]")
      setFavourites({ scope, ids: Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string").slice(0, 500) : [] })
    } catch { setFavourites({ scope, ids: [] }) }
  }, [scope])

  const toggleFavourite = (id: string) => {
    const next = favouriteIds.includes(id) ? favouriteIds.filter(value => value !== id) : [...favouriteIds, id]
    setFavourites({ scope, ids: next })
    if (scope) try { localStorage.setItem(`till-favourites:${scope}`, JSON.stringify(next)) } catch { /* Available for this session. */ }
  }
  const categories = useMemo(() => [...new Set([...catalogue, ...products].map(product => product.categoryName || "Uncategorized"))].sort(), [catalogue, products])
  const visible = filterCatalogue(products, category, filter, sort, favouriteIds)
  const reset = () => { setCategory(null); setFilter("all"); setSort("default") }

  return <section aria-label="Product catalogue" className="mt-4">
    <div className="flex items-center gap-2 overflow-x-auto pb-3" aria-label="Product categories">
      <button onClick={() => setCategory(null)} aria-pressed={category === null} className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-semibold ${category === null ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>All categories</button>
      {categories.map(value => <button key={value} onClick={() => setCategory(value)} aria-pressed={category === value} className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-semibold ${category === value ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{value}</button>)}
    </div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1">
        {([ ["all", "All items"], ["favourites", "Favourites"], ["available", "Available"], ["unavailable", "Out of stock"], ["services", "Services"] ] as const).map(([key, label]) => <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key} className={`rounded-lg px-2.5 py-2 text-[11px] font-medium ${filter === key ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200" : "text-muted-foreground hover:bg-muted"}`}>{label}</button>)}
      </div>
      <div className="flex items-center gap-2">
        <span role="status" className="text-[11px] text-muted-foreground">{searching ? <Loader2 aria-label="Searching" className="h-4 w-4 animate-spin" /> : `${visible.length} items`}</span>
        <button aria-pressed={compact} onClick={() => setCompact(value => !value)} className="rounded-lg border border-border px-2 py-2 text-[11px]">{compact ? "Comfortable tiles" : "Compact tiles"}</button>
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <select aria-label="Sort catalogue" value={sort} onChange={event => setSort(event.target.value as CatalogueSort)} className="max-w-36 rounded-lg border border-border bg-background px-2 py-2 text-xs">
          <option value="default">Default order</option><option value="name">Name A–Z</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="stock">Lowest stock first</option>
        </select>
        <div className="flex rounded-lg border border-border bg-background p-0.5">
          {([ ["grid", Grid2X2], ["list", List] ] as const).map(([value, Icon]) => <button key={value} aria-label={`${value} view`} aria-pressed={layout === value} onClick={() => setLayout(value)} className={`rounded-md p-2 ${layout === value ? "bg-muted text-foreground" : "text-muted-foreground"}`}><Icon className="h-4 w-4" /></button>)}
        </div>
      </div>
    </div>
    {visible.length === 0 && !searching && <div className="rounded-2xl border border-dashed border-border bg-background p-10 text-center">
      <SearchX className="mx-auto h-9 w-9 text-muted-foreground/50" /><h3 className="mt-3 text-sm font-semibold">{products.length === 0 && !query ? "Build your catalogue" : "No matching items"}</h3>
      <p className="mt-2 text-xs text-muted-foreground">{products.length === 0 && !query ? "Add your products, services and prices to start selling." : "Try a different category, filter or search."}</p>
      {category !== null || filter !== "all" ? <button onClick={reset} className="mt-4 text-xs font-semibold text-primary">Reset filters</button> : <Link href="/pos/products" className="mt-4 inline-flex text-xs font-semibold text-primary">Open products</Link>}
    </div>}
    <div className={layout === "grid" ? (compact ? "grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" : "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5") : "space-y-2"}>
      {visible.map(product => {
        const quantity = cart.filter(line => line.product.id === product.id).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
        const favourite = favouriteIds.includes(product.id)
        const out = !product.isService && product.stock <= 0
        return <article key={product.id} className={`group relative overflow-hidden rounded-2xl border transition-colors ${quantity > 0 ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : "border-border bg-background hover:border-blue-300"}`}>
          <button onClick={() => onAdd(product)} aria-label={`Add ${product.name}`} className={`w-full text-left ${layout === "grid" ? (compact ? "flex min-h-32 flex-col p-3 pt-10" : "flex min-h-44 flex-col p-4 pt-12") : "flex min-h-24 items-center gap-3 p-3 pr-12"}`}>
            <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 ${layout === "grid" ? (compact ? "mb-2 h-9 w-9" : "mb-4 h-14 w-14") : "h-12 w-12"}`}>
              {product.image ? <img src={product.image} alt="" loading="lazy" className="h-full w-full object-cover" onError={event => { event.currentTarget.style.display = "none" }} /> : <Package className="h-6 w-6" />}
            </span>
            <span className="min-w-0 flex-1"><span className="block line-clamp-2 text-sm font-semibold leading-snug">{product.name}</span>
              <span className="mt-1 block text-[10px] text-muted-foreground">{product.categoryName || (product.isService ? "Service" : "General")} {product.variants.length > 0 && `· ${product.variants.length} options`}</span>
              <span className={`mt-2 block text-[10px] font-medium ${out ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>{product.isService ? "Service · no stock required" : out ? "Out of stock" : `${money(product.stock)} ${product.unit === "piece" ? "in stock" : product.unit + " available"}`}</span>
              {product.fitsWith.length > 0 && <span className="mt-1 block truncate text-[10px] text-muted-foreground">Fits: {product.fitsWith.join(", ")}</span>}
              {(product.tracksSerials || product.controlled || product.ageRestricted || product.madeToOrder) && <span className="mt-2 flex flex-wrap gap-1">{[product.tracksSerials && "Serial required", product.controlled && "Buyer details", product.ageRestricted && "Age check", product.madeToOrder && "Made to order"].filter(Boolean).map(label => <span key={String(label)} className="rounded bg-amber-50 px-1.5 py-1 text-[9px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">{label}</span>)}</span>}
            </span>
            <span className={`flex items-center justify-between gap-2 ${layout === "grid" ? "mt-4 w-full border-t border-border pt-3" : "shrink-0"}`}><span className="text-sm font-bold tabular-nums"><span className="mr-1 text-[10px] font-medium text-muted-foreground">KSh</span>{money(product.price)}{product.unit !== "piece" && <span className="text-[10px] font-normal text-muted-foreground">/{product.unit}</span>}</span><span className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950">{quantity > 0 ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</span></span>
          </button>
          <button onClick={() => toggleFavourite(product.id)} aria-label={`${favourite ? "Unpin" : "Pin"} ${product.name}`} aria-pressed={favourite} className={`absolute right-2 top-2 rounded-lg p-2 ${favourite ? "text-amber-500" : "text-slate-400 hover:text-amber-500"}`}><Star className={`h-4 w-4 ${favourite ? "fill-current" : ""}`} /></button>
          {quantity > 0 && layout === "grid" && <span className="absolute left-3 top-3 rounded-md bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white">{money(quantity)} in basket</span>}
        </article>
      })}
    </div>
    {hasMore && <button onClick={onLoadMore} disabled={searching} className="mt-4 w-full rounded-xl border border-border bg-background px-4 py-3 text-xs font-semibold hover:bg-muted disabled:opacity-50">{searching ? "Loading items…" : "Load more items"}</button>}
    <p className="mt-4 text-[10px] text-muted-foreground">Filters and sorting apply to loaded items{hasMore ? "; load more to browse further" : ""}. Star an item to keep it in Favourites on this device.</p>
  </section>
}
