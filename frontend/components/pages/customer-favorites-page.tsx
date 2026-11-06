"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Heart, Search, Star, ShieldCheck, Store, Users, X, ArrowUpRight, Loader2 } from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  getWishlistedProviders,
  getWishlistedShops,
  setWishlistSaved,
  type WishlistedProvider,
  type WishlistedShop,
} from "@/backend/actions/wishlist"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export function CustomerFavoritesPage() {
  const { formatMoney } = useLocalization()
  const [providers, setProviders] = useState<WishlistedProvider[]>([]),
    [shops, setShops] = useState<WishlistedShop[]>([])
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("")
  const [query, setQuery] = useState(""),
    [view, setView] = useState("all"),
    [sort, setSort] = useState("saved")
  const [lastRemoved, setLastRemoved] = useState<{
    id: string
    name: string
    kind: "PROVIDER" | "SHOP"
  } | null>(null)
  const [busy, setBusy] = useState(false),
    lock = useRef(false)
  const load = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([getWishlistedProviders(), getWishlistedShops()])
    if (results[0].status === "fulfilled") setProviders(results[0].value)
    if (results[1].status === "fulfilled") setShops(results[1].value)
    setError(
      results.some((result) => result.status === "rejected")
        ? "Some saved items could not load. Retry before assuming your list is empty."
        : ""
    )
    setLoading(false)
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  const update = async (item: { id: string; name: string; kind: "PROVIDER" | "SHOP" }, saved: boolean) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError("")
    try {
      const result = await setWishlistSaved({ targetType: item.kind, targetId: item.id, saved })
      if (!result.success) {
        setError(result.error)
        return
      }
      if (saved) {
        setLastRemoved(null)
        await load()
      } else {
        setLastRemoved(item)
        if (item.kind === "PROVIDER") setProviders((current) => current.filter((p) => p.id !== item.id))
        else setShops((current) => current.filter((p) => p.id !== item.id))
      }
    } catch {
      setError("Your saved list could not be updated. Refresh and retry.")
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const matches = (name: string, detail: string | null) =>
    `${name} ${detail ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())
  const ordered = <T extends { name: string; rating: number }>(items: T[]) =>
    [...items].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "rating" ? b.rating - a.rating : 0
    )
  const visibleProviders = view === "shops" ? [] : ordered(providers.filter((p) => matches(p.name, p.bio))),
    visibleShops = view === "providers" ? [] : ordered(shops.filter((p) => matches(p.name, p.category)))
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
      <header className="customer-surface flex flex-wrap items-start justify-between gap-5 border-t-4 border-t-primary">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Your personal shortlist
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Keep the good finds close</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
            Return to specialists you trust and shops you want to explore. Saving an item does not make a
            booking or place an order.
          </p>
        </div>
        <Heart className="text-orange-500" size={30} />
      </header>
      <div className="grid grid-cols-2 gap-3">
        <div className="customer-surface">
          <Users size={19} className="text-primary" />
          <strong className="mt-3 block text-2xl">{loading ? "..." : providers.length}</strong>
          <p className="mt-1 text-sm text-muted-foreground">Saved specialists</p>
        </div>
        <div className="customer-surface">
          <Store size={19} className="text-primary" />
          <strong className="mt-3 block text-2xl">{loading ? "..." : shops.length}</strong>
          <p className="mt-1 text-sm text-muted-foreground">Saved shops</p>
        </div>
      </div>
      <section aria-label="Filter saved items" className="customer-surface space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "Everything" },
            { id: "providers", label: "Specialists" },
            { id: "shops", label: "Shops" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={view === tab.id}
              onClick={() => setView(tab.id)}
              className={`min-h-11 rounded-xl border px-4 text-sm font-medium ${view === tab.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative">
            <Search size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
            <Input
              aria-label="Search saved items"
              placeholder="Search names, shops or specialities"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
          </label>
          <select
            aria-label="Sort saved items"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="min-h-11 rounded-xl border bg-background px-3 text-sm"
          >
            <option value="saved">Recently saved</option>
            <option value="name">Name A-Z</option>
            <option value="rating">Highest rated</option>
          </select>
        </div>
      </section>
      {error && (
        <div role="alert" className="customer-surface border-red-200 text-sm text-red-800">
          <p>{error}</p>
          <Button variant="outline" className="mt-3" disabled={loading} onClick={() => void load()}>
            Retry saved items
          </Button>
        </div>
      )}
      {lastRemoved && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm"
        >
          <span>{lastRemoved.name} removed from saved items.</span>
          <Button variant="outline" disabled={busy} onClick={() => void update(lastRemoved, true)}>
            Undo removal
          </Button>
        </div>
      )}
      {loading && (
        <p role="status" className="inline-flex items-center gap-2 py-3 text-sm">
          <Loader2 className="animate-spin" size={17} />
          Loading your saved items...
        </p>
      )}
      <div className="customer-page-grid">
        {visibleProviders.map((provider) => (
          <article key={provider.id} className="customer-surface flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-muted">
                {provider.avatar ? (
                  <Image src={provider.avatar} alt="" fill className="object-cover" />
                ) : (
                  <Users className="m-4 text-primary" size={22} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-base font-semibold">{provider.name}</h2>
                {provider.verified && (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                    <ShieldCheck size={14} />
                    Verified
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label={`Remove ${provider.name} from saved`}
                disabled={busy}
                onClick={() => void update({ ...provider, kind: "PROVIDER" }, false)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border hover:text-red-600"
              >
                <X size={17} />
              </button>
            </div>
            <p className="line-clamp-3 text-sm leading-7 text-muted-foreground">
              {provider.bio || "View this specialist's profile, experience and services."}
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Star size={14} />
                {provider.reviewCount
                  ? `${provider.rating.toFixed(1)} (${provider.reviewCount} reviews)`
                  : "No reviews yet"}
              </span>
              <span>{provider.completedJobs} completed jobs</span>
            </div>
            <p className="mt-auto text-sm font-semibold">
              {provider.hourlyRate === null
                ? "Ask for a quote"
                : `${formatMoney(provider.hourlyRate)} / hour`}
            </p>
            <Link
              href={`/customer/find-specialists?provider=${encodeURIComponent(provider.id)}`}
              className="inline-flex min-h-11 items-center justify-between rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              View specialist
              <ArrowUpRight size={16} />
            </Link>
          </article>
        ))}
        {visibleShops.map((shop) => (
          <article key={shop.id} className="customer-surface flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-muted">
                {shop.image ? (
                  <Image src={shop.image} alt="" fill className="object-cover" />
                ) : (
                  <Store size={22} className="m-4 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-base font-semibold">{shop.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{shop.category || "Marketplace shop"}</p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${shop.name} from saved`}
                disabled={busy}
                onClick={() => void update({ ...shop, kind: "SHOP" }, false)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border hover:text-red-600"
              >
                <X size={17} />
              </button>
            </div>
            {shop.isVerified && (
              <span className="inline-flex items-center gap-1 text-xs text-primary">
                <ShieldCheck size={14} />
                Verified shop
              </span>
            )}
            <p className="text-sm text-muted-foreground">
              {shop.reviewCount
                ? `${shop.rating.toFixed(1)} / ${shop.reviewCount} reviews`
                : "No reviews yet"}
            </p>
            <Link
              href={`/customer/shops/${encodeURIComponent(shop.id)}`}
              className="mt-auto inline-flex min-h-11 items-center justify-between rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Visit shop
              <ArrowUpRight size={16} />
            </Link>
          </article>
        ))}
      </div>
      {!loading && !error && !visibleProviders.length && !visibleShops.length && (
        <div className="customer-surface space-y-3 py-10 text-center">
          <Heart size={28} className="mx-auto text-primary" />
          <h2 className="text-xl font-semibold">
            {query ? "No matches in your shortlist" : "Your next good find starts here"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {query
              ? "Try another name or clear your search."
              : "Use the save button on a specialist or shop to keep it here."}
          </p>
          <Link
            href="/customer/services"
            className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-medium text-primary"
          >
            Explore MySaji
          </Link>
        </div>
      )}
    </div>
  )
}
