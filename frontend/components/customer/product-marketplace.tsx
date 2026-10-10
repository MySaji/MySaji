"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/frontend/components/ui/select"
import { Slider } from "@/frontend/components/ui/slider"
import { Skeleton } from "@/frontend/components/ui/skeleton"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/frontend/components/ui/sheet"
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis,
} from "@/frontend/components/ui/pagination"
import { Search, Star, Heart, Plus, Grid3X3, List, ChevronRight, SlidersHorizontal } from "lucide-react"
import {
  getMarketplaceProducts, getProductCategories, getProductShops, getProductPriceBounds,
  type ProductCard, type ProductCategoryOption, type ProductShopOption, type MarketplaceSort,
} from "@/backend/actions/products"
import { addToCart } from "@/backend/actions/cart"
import { revalidateCartCount } from "@/frontend/lib/hooks/useCartCount"
import { getWishlistIds, toggleWishlist } from "@/backend/actions/wishlist"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { CATEGORY_STYLE, DEFAULT_CATEGORY_STYLE } from "@/frontend/lib/customer/category-style"

const RATING_TIERS = [4, 3, 0] as const

/** Small window of page numbers around the current page, with an ellipsis
 * for anything further out — matches the "1 2 3 4 5 … 20" reference style
 * without ever rendering more real page links than the real catalog has. */
function buildPageWindow(current: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages = new Set([1, 2, totalPages - 1, totalPages, current - 1, current, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const result: (number | "ellipsis")[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push("ellipsis")
    result.push(p)
  })
  return result
}

export function ProductMarketplace({ categorySlug }: { categorySlug?: string } = {}) {
  const { t, tn, formatMoney } = useLocalization()
  const searchParams = useSearchParams()

  const [categories, setCategories] = useState<ProductCategoryOption[]>([])
  const [shops, setShops] = useState<ProductShopOption[]>([])
  const [priceBounds, setPriceBounds] = useState<{ min: number; max: number }>({ min: 0, max: 100_000 })
  const [wishlistIds, setWishlistIds] = useState<string[]>([])

  // Seeds the category filter from ?category=<slug> (e.g. a home-page
  // category tile) — only read once on mount, not kept in sync afterward,
  // same one-way-seed convention the services browse page's ?category= uses.
  const [selectedCategory, setSelectedCategory] = useState(() => categorySlug ?? searchParams.get("category") ?? "all")

  // When this block is embedded in a page that has its own category browser
  // (the marketplace), that browser is the source of truth and this one
  // follows it — otherwise picking a category up there left the full product
  // catalogue down here unfiltered.
  //
  // Only when the slug actually exists as a PRODUCT category, though. The
  // marketplace's browser lists SERVICE categories (getServiceCategories),
  // and those slugs match nothing here — applying one blindly emptied the
  // whole catalogue, which reads as "no products" rather than "that filter
  // doesn't apply to products".
  useEffect(() => {
    if (categorySlug === undefined) return
    if (categorySlug === "all") { setSelectedCategory("all"); return }
    if (categories.length === 0) return
    setSelectedCategory(categories.some((c) => c.slug === categorySlug) ? categorySlug : "all")
  }, [categorySlug, categories])
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([])
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null)
  const [minRating, setMinRating] = useState(0)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<MarketplaceSort>("popularity")
  const [perPage, setPerPage] = useState(24)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const [products, setProducts] = useState<ProductCard[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isFilterDataLoaded, setIsFilterDataLoaded] = useState(false)

  // Filter chrome (categories/shops/real price bounds/wishlist) loads once.
  useEffect(() => {
    Promise.all([getProductCategories(), getProductShops(), getProductPriceBounds(), getWishlistIds("PRODUCT")])
      .then(([cats, shopList, bounds, wishlist]) => {
        setCategories(cats)
        setShops(shopList)
        setPriceBounds(bounds)
        setPriceRange([bounds.min, bounds.max])
        setWishlistIds(wishlist)
      })
      .finally(() => setIsFilterDataLoaded(true))
  }, [])

  // Product results refetch whenever any filter/sort/page control changes.
  useEffect(() => {
    if (!priceRange) return
    setIsLoading(true)
    getMarketplaceProducts({
      category: selectedCategory,
      shopIds: selectedShopIds.length > 0 ? selectedShopIds : undefined,
      search: search.trim() || undefined,
      priceMin: priceRange[0],
      priceMax: priceRange[1],
      minRating: minRating > 0 ? minRating : undefined,
      sortBy,
      page,
      perPage,
    })
      .then(({ products: p, totalCount: c }) => {
        setProducts(p)
        setTotalCount(c)
      })
      .finally(() => setIsLoading(false))
  }, [selectedCategory, selectedShopIds, priceRange, minRating, search, sortBy, page, perPage])

  // Any filter change resets back to page 1 — otherwise a narrower result
  // set could leave the view stuck on a now-nonexistent page.
  useEffect(() => { setPage(1) }, [selectedCategory, selectedShopIds, priceRange, minRating, search, sortBy, perPage])

  const toggleShop = (id: string) => {
    setSelectedShopIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  const clearFilters = () => {
    setPriceRange([priceBounds.min, priceBounds.max])
    setSelectedShopIds([])
    setMinRating(0)
  }

  const handleAddToCart = async (product: ProductCard) => {
    const result = await addToCart({ productId: product.id, quantity: 1 })
    if (result.success) void revalidateCartCount()
  }

  const handleToggleWishlist = async (productId: string) => {
    const wasWishlisted = wishlistIds.includes(productId)
    setWishlistIds((prev) => (wasWishlisted ? prev.filter((id) => id !== productId) : [...prev, productId]))
    const result = await toggleWishlist({ targetType: "PRODUCT", targetId: productId })
    if (!result.success) {
      setWishlistIds((prev) => (wasWishlisted ? [...prev, productId] : prev.filter((id) => id !== productId)))
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / perPage))
  const pageWindow = buildPageWindow(page, totalPages)
  const activeFilterCount =
    (selectedShopIds.length > 0 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (priceRange && (priceRange[0] > priceBounds.min || priceRange[1] < priceBounds.max) ? 1 : 0)

  // Shared between the persistent desktop sidebar Card and the mobile Sheet
  // — same real filter controls, just two different places to show them.
  const filterBody = (
    <>
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-muted-foreground mb-3">{t("customer.marketplace.priceRangeLabel")}</p>
        {priceRange && (
          <>
            <Slider
              min={priceBounds.min}
              max={priceBounds.max}
              step={Math.max(1, Math.round((priceBounds.max - priceBounds.min) / 100))}
              value={priceRange}
              onValueChange={(v) => setPriceRange([v[0], v[1]])}
            />
            <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
              <span>{formatMoney(priceRange[0])}</span>
              <span>{formatMoney(priceRange[1])}</span>
            </div>
          </>
        )}
      </div>

      {shops.length > 0 && (
        <div className="mb-5">
          <p className="text-[11px] font-semibold text-muted-foreground mb-3">{t("customer.marketplace.shopsLabel")}</p>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {shops.map((shop) => (
              <label key={shop.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={selectedShopIds.includes(shop.id)} onChange={() => toggleShop(shop.id)} className="rounded border-border accent-primary" />
                <span className="text-foreground truncate flex-1">{shop.name}</span>
                <span className="text-[11px] text-muted-foreground">({shop.productCount})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground mb-3">{t("customer.marketplace.ratingLabel")}</p>
        <div className="space-y-2">
          {RATING_TIERS.map((tier) => (
            <label key={tier} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="radio" name="rating-tier" checked={minRating === tier} onChange={() => setMinRating(tier)} className="accent-primary" />
              {tier > 0 ? (
                <span className="flex items-center gap-1 text-foreground">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> {t("customer.marketplace.andAbove", { rating: tier })}
                </span>
              ) : (
                <span className="text-foreground">{t("customer.marketplace.anyRating")}</span>
              )}
            </label>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 lg:gap-6">
      {/* Desktop sidebar — mobile uses the category chip row + Filters sheet below instead */}
      <aside className="hidden lg:block space-y-5">
        <div>
          <h3 className="text-xs font-bold text-foreground mb-3">{t("customer.marketplace.categoriesTitle")}</h3>
          <div className="space-y-0.5">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-left transition-colors ${selectedCategory === "all" ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted"}`}
            >
              {t("customer.marketplace.allCategories")} <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>
            {categories.map((cat) => {
              const dotColor = (CATEGORY_STYLE[cat.slug] ?? DEFAULT_CATEGORY_STYLE).dot
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-colors ${selectedCategory === cat.slug ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted"}`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                  {cat.name}
                </button>
              )
            })}
          </div>
        </div>

        <Card className="p-4 border border-border rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-foreground">{t("customer.marketplace.filtersTitle")}</h3>
            <button onClick={clearFilters} className="text-[11px] text-primary font-medium">
              {t("customer.marketplace.clearAll")}
            </button>
          </div>
          {filterBody}
        </Card>
      </aside>

      {/* Main */}
      <div>
        {/* Mobile-only: horizontal category chip scroller */}
        <div className="lg:hidden -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${selectedCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {t("customer.marketplace.allCategories")}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.slug)}
              className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${selectedCategory === cat.slug ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("customer.marketplace.searchPlaceholder")} className="pl-9 rounded-xl" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowMobileFilters(true)}
              className="lg:hidden relative flex-1 sm:flex-none rounded-xl gap-1.5 bg-transparent"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {t("customer.marketplace.filtersTitle")}
              {activeFilterCount > 0 && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as MarketplaceSort)}>
              <SelectTrigger className="rounded-xl w-[130px] sm:w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="popularity">{t("customer.marketplace.sortPopularity")}</SelectItem>
                <SelectItem value="price-asc">{t("customer.marketplace.sortPriceLow")}</SelectItem>
                <SelectItem value="price-desc">{t("customer.marketplace.sortPriceHigh")}</SelectItem>
                <SelectItem value="rating">{t("customer.marketplace.sortRating")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(perPage)} onValueChange={(v) => setPerPage(Number(v))}>
              <SelectTrigger className="hidden sm:flex rounded-xl w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="12">{t("customer.marketplace.perPage", { count: 12 })}</SelectItem>
                <SelectItem value="24">{t("customer.marketplace.perPage", { count: 24 })}</SelectItem>
                <SelectItem value="48">{t("customer.marketplace.perPage", { count: 48 })}</SelectItem>
              </SelectContent>
            </Select>
            <div className="hidden sm:flex items-center gap-0.5 bg-muted rounded-xl p-1 flex-shrink-0">
              <button onClick={() => setViewMode("grid")} aria-label={t("common.gridView")} aria-pressed={viewMode === "grid"} className={`p-1.5 rounded-lg transition-all ${viewMode === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode("list")} aria-label={t("common.listView")} aria-pressed={viewMode === "list"} className={`p-1.5 rounded-lg transition-all ${viewMode === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {!isFilterDataLoaded || isLoading ? (
          <div className={viewMode === "grid" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 lg:gap-4" : "space-y-3"}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2"><Skeleton className="aspect-square w-full rounded-2xl" /><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3.5 w-1/2" /></div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <Card className="border-dashed p-10 text-center">
            <p className="text-base font-semibold text-foreground">{t("customer.marketplace.noMatch")}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t("customer.marketplace.noMatchHint")}</p>
          </Card>
        ) : (
          <div className={viewMode === "grid" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 lg:gap-4" : "space-y-3"}>
            {products.map((product) => {
              const isWishlisted = wishlistIds.includes(product.id)
              const displayPrice = product.discountPrice ?? product.price
              return (
                <Card key={product.id} className={`group overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg ${viewMode === "list" ? "flex flex-row" : ""}`}>
                  <div className={`relative bg-muted/30 ${viewMode === "list" ? "w-32 sm:w-40 flex-shrink-0" : "aspect-square"}`}>
                    <Link href={`/customer/products/${product.id}`}>
                      <Image src={product.image || "/placeholder.svg"} alt={product.name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" />
                    </Link>
                    {product.discountPercent != null && (
                      <span className="absolute left-2 top-2 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">-{product.discountPercent}%</span>
                    )}
                    <button
                      onClick={() => handleToggleWishlist(product.id)}
                      className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur hover:bg-white dark:bg-black/60 dark:hover:bg-black/80"
                      aria-label={isWishlisted ? t("customer.products.removeFromWishlist") : t("customer.products.addToWishlist")}
                    >
                      <Heart className={`h-3.5 w-3.5 ${isWishlisted ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
                    </button>
                  </div>
                  <div className="p-2.5 sm:p-4 flex-1 min-w-0">
                    <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{product.shop}</p>
                    <Link href={`/customer/products/${product.id}`}>
                      <h3 className="mt-0.5 line-clamp-2 text-[11px] font-semibold text-foreground sm:text-xs">{product.name}</h3>
                    </Link>
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span className="font-medium text-foreground">{product.rating.toFixed(1)}</span>
                      <span>({product.reviewCount})</span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <p className="text-xs font-bold text-primary sm:text-sm">{formatMoney(displayPrice)}</p>
                      {product.discountPrice != null && <p className="text-[10px] text-muted-foreground line-through">{formatMoney(product.price)}</p>}
                    </div>
                    <Button className="mt-3 w-full rounded-xl text-[11px] sm:text-xs" size="sm" onClick={() => handleAddToCart(product)} disabled={product.stock === 0}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {product.stock === 0 ? t("customer.products.outOfStock") : t("common.addToCart")}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {totalCount > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">{tn("customer.marketplace.resultCount", totalCount)}</p>
            {totalPages > 1 && (
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1) }} className={page === 1 ? "pointer-events-none opacity-40" : ""} />
                  </PaginationItem>
                  {pageWindow.map((p, i) =>
                    p === "ellipsis" ? (
                      <PaginationItem key={`e-${i}`}><PaginationEllipsis /></PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink href="#" isActive={p === page} onClick={(e) => { e.preventDefault(); setPage(p) }}>{p}</PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext href="#" onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1) }} className={page === totalPages ? "pointer-events-none opacity-40" : ""} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
      </div>

      {/* Mobile filters — same real controls as the desktop sidebar Card, in a bottom sheet */}
      <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>{t("customer.marketplace.filtersTitle")}</SheetTitle>
          </SheetHeader>
          <div className="px-4">{filterBody}</div>
          <SheetFooter className="flex-row gap-3">
            <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={clearFilters}>
              {t("customer.marketplace.clearAll")}
            </Button>
            <Button className="flex-1 rounded-xl" onClick={() => setShowMobileFilters(false)}>
              {t("customer.marketplace.applyFilters")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
