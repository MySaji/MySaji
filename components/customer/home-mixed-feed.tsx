"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Star, Heart, ChevronRight, ShieldCheck, Building2, Briefcase, FileText, Eye } from "lucide-react"
import { getWishlistIds, toggleWishlist } from "@/lib/actions/wishlist"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { MixedFeedItem } from "@/lib/actions/home"

function MixedFeedCard({ item, isWishlisted, onToggleWishlist }: { item: MixedFeedItem; isWishlisted: boolean; onToggleWishlist: () => void }) {
  const { formatMoney } = useLocalization()

  if (item.kind === "shop") {
    return (
      <Card className="h-full w-[30%] flex-shrink-0 overflow-hidden rounded-xl border border-border shadow-sm transition-shadow hover:shadow-md sm:w-64 sm:rounded-2xl">
        <Link href={`/customer/shops/${item.id}`}>
          <div className="relative h-14 bg-muted sm:h-32">
            <Image src={item.image || "/placeholder.svg"} alt={item.name} fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <span className={`absolute left-1 top-1 rounded-full px-1 py-0.5 text-[7px] font-bold text-white sm:left-2 sm:top-2 sm:px-2 sm:py-0.5 sm:text-[10px] ${item.isOpen ? "bg-emerald-500" : "bg-black/60"}`}>
              {item.isOpen ? "OPEN" : "CLOSED"}
            </span>
            {item.hasSale && <span className="absolute right-1 top-1 rounded-full bg-amber-500 px-1 py-0.5 text-[7px] font-bold text-white sm:right-2 sm:top-2 sm:px-2 sm:text-[10px]">SALE</span>}
          </div>
          <div className="p-1.5 pb-0 sm:p-3">
            <h3 className="truncate text-[10px] font-semibold text-foreground sm:text-base">{item.name}</h3>
            <div className="mt-0.5 flex items-center gap-0.5 text-[9px] text-muted-foreground sm:mt-1 sm:gap-1 sm:text-xs">
              <Star className="h-2.5 w-2.5 flex-shrink-0 fill-amber-400 text-amber-400 sm:h-3.5 sm:w-3.5" /> <span className="truncate">{item.rating.toFixed(1)} ({item.reviews})</span>
            </div>
            {item.hoursLabel && <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block sm:mt-1">{item.hoursLabel}</p>}
          </div>
        </Link>
        <div className="grid grid-cols-1 gap-1 p-1.5 sm:grid-cols-2 sm:gap-2 sm:p-3">
          <Link href={`/customer/shops/${item.id}`}><Button size="sm" className="h-8 w-full rounded-md px-1 text-[10px] sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm">Shop Now</Button></Link>
          <Link href={`/customer/shops/${item.id}`} className="hidden sm:block"><Button size="sm" variant="outline" className="w-full rounded-lg bg-transparent">View Shop</Button></Link>
        </div>
      </Card>
    )
  }

  const isBusiness = item.kind === "business"

  const hireHref = `/customer/find-specialists?provider=${item.providerId}&action=book`
  const quoteHref = `/customer/service-requests/new?provider=${item.providerId}`
  const viewHref = `/customer/find-specialists?provider=${item.providerId}`

  return (
    <Card className="h-full w-[30%] flex-shrink-0 rounded-xl border border-border p-1.5 shadow-sm transition-shadow hover:shadow-md sm:w-64 sm:rounded-2xl sm:p-3.5">
      <div className="flex items-start justify-between gap-1 sm:gap-2">
        <div className="flex items-center gap-1.5 min-w-0 sm:gap-2.5">
          <div className="relative h-6 w-6 flex-shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-background sm:h-11 sm:w-11 sm:ring-2">
            {item.avatar ? <Image src={item.avatar} alt={item.name} fill className="object-cover" /> : (isBusiness ? <Building2 className="h-3 w-3 m-auto mt-1.5 text-muted-foreground sm:h-5 sm:w-5 sm:mt-3" /> : <Briefcase className="h-3 w-3 m-auto mt-1.5 text-muted-foreground sm:h-5 sm:w-5 sm:mt-3" />)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="truncate text-[9px] font-semibold text-foreground sm:text-sm">{item.name}</p>
              {item.verified && <ShieldCheck className="h-2.5 w-2.5 flex-shrink-0 text-emerald-500 sm:h-3.5 sm:w-3.5" />}
            </div>
            <p className="truncate text-[8px] text-muted-foreground sm:text-xs">{item.categoryName ?? (isBusiness ? "Business" : "Specialist")}</p>
          </div>
        </div>
        <button onClick={(e) => { e.preventDefault(); onToggleWishlist() }} aria-label="Save" className="hidden flex-shrink-0 rounded-full p-1 hover:bg-muted sm:block">
          <Heart className={`h-4 w-4 ${isWishlisted ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
        </button>
      </div>

      <div className="mt-1 flex items-center gap-0.5 text-[8px] text-muted-foreground sm:mt-2 sm:gap-1 sm:text-xs">
        <Star className="h-2.5 w-2.5 flex-shrink-0 fill-amber-400 text-amber-400 sm:h-3.5 sm:w-3.5" />
        <span className="font-semibold text-foreground">{item.rating.toFixed(1)}</span>
        <span className="hidden sm:inline">({item.reviewCount}) · {item.location}</span>
      </div>

      {item.specialties.length > 0 && (
        <div className="mt-2 hidden flex-wrap gap-1 sm:flex">
          {item.specialties.map((s) => (
            <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>
          ))}
        </div>
      )}

      {isBusiness ? (
        <div className="mt-3 hidden grid-cols-3 gap-1 text-center text-xs text-muted-foreground sm:grid">
          <div><p className="font-semibold text-foreground">{item.branchCount}</p>Branches</div>
          <div><p className="font-semibold text-foreground">{item.staffCount}</p>Staff</div>
          <div><p className="font-semibold text-foreground">{item.completedJobs}</p>Jobs done</div>
        </div>
      ) : (
        item.hourlyRate > 0 && <p className="mt-1 truncate text-[8px] text-muted-foreground sm:mt-3 sm:text-sm">From <span className="font-bold text-foreground">{formatMoney(item.hourlyRate)}</span></p>
      )}

      {/* Compact icon row on mobile so Hire / Quote / View still fit at ~30%
          card width; full labeled buttons return at sm+ where there's room. */}
      <div className="mt-1.5 grid grid-cols-3 gap-0.5 sm:hidden">
        <Link href={hireHref}><Button size="sm" className="h-8 w-full rounded-md px-0 text-[10px]">Hire</Button></Link>
        <Link href={quoteHref}><Button size="sm" variant="outline" className="h-8 w-full rounded-md px-0 text-[10px] bg-transparent">Quote</Button></Link>
        <Link href={viewHref}><Button size="sm" variant="ghost" className="h-8 w-full rounded-md px-0 text-[10px]">View</Button></Link>
      </div>

      <div className="mt-3 hidden grid-cols-2 gap-2 sm:grid">
        <Link href={hireHref}>
          <Button size="sm" className="w-full rounded-lg">Hire</Button>
        </Link>
        <Link href={quoteHref}>
          <Button size="sm" variant="outline" className="w-full rounded-lg gap-1 bg-transparent">
            <FileText className="h-3.5 w-3.5" /> Request Quote
          </Button>
        </Link>
      </div>
      <Link href={viewHref} className="hidden sm:block">
        <Button size="sm" variant="ghost" className="mt-2 w-full rounded-lg gap-1.5">
          <Eye className="h-3.5 w-3.5" /> {isBusiness ? "View Projects" : "View Work"}
        </Button>
      </Link>
    </Card>
  )
}

export function MixedFeedSection({ title, seeAllHref, items }: { title: string; seeAllHref: string; items: MixedFeedItem[] }) {
  const [wishlistIds, setWishlistIds] = useState<string[]>([])

  useEffect(() => {
    getWishlistIds("PROVIDER").then(setWishlistIds)
  }, [])

  const toggleFavorite = async (providerId: string) => {
    setWishlistIds((prev) => (prev.includes(providerId) ? prev.filter((id) => id !== providerId) : [...prev, providerId]))
    const result = await toggleWishlist({ targetType: "PROVIDER", targetId: providerId })
    if (!result.success) setWishlistIds((prev) => (prev.includes(providerId) ? prev.filter((id) => id !== providerId) : [...prev, providerId]))
  }

  if (items.length === 0) return null

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground sm:text-lg">{title}</h2>
        <Link href={seeAllHref} className="flex items-center gap-0.5 text-sm font-medium text-primary">
          See all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide sm:mx-0 sm:gap-4 sm:px-0">
        {items.map((item) => {
          const key = item.kind === "shop" ? `shop-${item.id}` : `${item.kind}-${item.providerId}`
          const providerId = item.kind !== "shop" ? item.providerId : null
          return (
            <MixedFeedCard
              key={key}
              item={item}
              isWishlisted={providerId ? wishlistIds.includes(providerId) : false}
              onToggleWishlist={() => providerId && toggleFavorite(providerId)}
            />
          )
        })}
      </div>
    </div>
  )
}
