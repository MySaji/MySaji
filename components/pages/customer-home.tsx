"use client"

import { useEffect, useState, type ComponentType } from "react"
import useSWR from "swr"
import { useAuthContext } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Star, Sparkles, ArrowRight,
  Truck, Package,
  ChevronRight, MapPin, Clock,
  CheckCircle2, AlertCircle, Zap, ShieldCheck, Calendar, History, Flame, Briefcase,
  Wallet, Lock, Headphones, Plus, ArrowLeftRight, Gift, Grid3X3, BadgeCheck, Store, Building2, ClipboardList,
} from "lucide-react"
import { CATEGORY_STYLE, DEFAULT_CATEGORY_STYLE } from "@/lib/customer/category-style"
import Image from "next/image"
import Link from "next/link"
import {
  getServiceCategories, getRecommendedShops, getRecommendedServices, getNearbyMixedFeed,
  type HomeServiceCategory, type HomeFeaturedShop, type RecommendedServices, type MixedFeedItem,
} from "@/lib/actions/home"
import { getCustomerJobs, getActiveEscrowJobs, type CustomerJob, type ActiveEscrowJob } from "@/lib/actions/jobs"
import { getProducts, getProductCategories, type ProductCard, type ProductCategoryOption } from "@/lib/actions/products"
import { getAddresses } from "@/lib/actions/addresses"
import { getRecentOrders, type CustomerOrder } from "@/lib/actions/orders"
import { getRecentlyViewed, type RecentlyViewedItem } from "@/lib/actions/recently-viewed"
import { getActiveProviderStories } from "@/lib/actions/provider-stories"
import { getWalletSummary } from "@/lib/actions/wallet"
import { getMyCustomerRequests, type MyRequestItem } from "@/lib/actions/requests"
import { ProviderStoryRing } from "@/components/provider-story-ring"
import { HomeHeroSection } from "@/components/customer/home-hero-section"
import { HomeSearchBar } from "@/components/customer/home-search-bar"
import { HomeQuickActions } from "@/components/customer/home-quick-actions"
import { HomeCategoryRow } from "@/components/customer/home-category-row"
import { MixedFeedSection } from "@/components/customer/home-mixed-feed"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { TranslationKey } from "@/lib/i18n"

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string


function useJobStatusStyle(t: Translate): Record<string, { label: string; className: string; icon: ComponentType<{ className?: string }> }> {
  return {
    PENDING: { label: t("customer.orders.statusPending"), className: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400", icon: Clock },
    PENDING_PAYMENT: { label: t("customer.jobs.awaitingPayment"), className: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400", icon: AlertCircle },
    ACCEPTED: { label: t("customer.jobs.statusScheduled"), className: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400", icon: Calendar },
    IN_PROGRESS: { label: t("customer.home.statusInProgress"), className: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400", icon: Clock },
    COMPLETED: { label: t("customer.jobs.statusCompleted"), className: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 },
    CANCELLED: { label: t("customer.orders.statusCancelled"), className: "bg-muted text-muted-foreground", icon: AlertCircle },
    DISPUTED: { label: t("customer.home.statusDisputed"), className: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400", icon: AlertCircle },
  }
}

// Server Action calls ride a plain fetch() with no built-in timeout. If the
// underlying connection to the DB pooler is reset mid-request without the
// browser ever observing a close event, that fetch can hang forever — SWR
// on its own wouldn't notice, so every fetcher below is wrapped in this
// before being handed to useSWR.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

const HOME_DATA_TIMEOUT_MS = 25000

function greetingForHour(hour: number, t: Translate): string {
  if (hour < 12) return t("customer.home.goodMorning")
  if (hour < 17) return t("customer.home.goodAfternoon")
  return t("customer.home.goodEvening")
}

// --- Sub-components ---

function SectionHeader({ title, href, icon: Icon }: { title: string; href?: string; icon?: ComponentType<{ className?: string }> }) {
  const { t } = useLocalization()
  return (
    <div className="flex items-center justify-between mb-3 sm:mb-4">
      <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
        {Icon && (
          <span className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-primary" />
          </span>
        )}
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-sm text-primary font-medium flex items-center gap-0.5 hover:gap-1.5 transition-all flex-shrink-0">
          {t("customer.home.seeAll")} <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  )
}

// Top-level shortcuts, not category browsing (that's Solve a Problem's
// job, right below this) — Emergency, Near Me, Orders, and Wallet are the
// four things a returning customer most often wants one tap away.
// Emergency previously had its own big red banner section; that content
// (the "priority booking" messaging + CTA) is folded into this tile
// instead of living as a second, separate emergency-themed block.
function QuickActionsSection({ walletBalance }: { walletBalance: number }) {
  const { t, formatMoney } = useLocalization()
  const actions: { key: string; icon: ComponentType<{ className?: string }>; href: string; label: string; sub?: string; accent?: boolean }[] = [
    { key: "emergency", icon: Zap, href: "/customer/services", label: t("customer.home.quickActionEmergency"), accent: true },
    { key: "nearMe", icon: MapPin, href: "/customer/find-specialists", label: t("customer.home.quickActionNearMe") },
    { key: "orders", icon: Package, href: "/customer/orders", label: t("customer.home.quickActionOrders") },
    { key: "wallet", icon: Wallet, href: "/customer/wallet", label: t("customer.home.quickActionWallet"), sub: formatMoney(walletBalance) },
  ]
  return (
    <div>
      <SectionHeader title={t("customer.home.quickActionsTitle")} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {actions.map((action) => (
          <Link key={action.key} href={action.href}>
            <Card className={`p-4 border hover:shadow-md transition-shadow rounded-2xl h-full flex flex-col items-center text-center gap-2 ${action.accent ? "border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10" : "border-border"}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${action.accent ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-primary/10 text-primary"}`}>
                <action.icon className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-foreground leading-tight">{action.label}</p>
              {action.sub && <p className="text-xs text-muted-foreground">{action.sub}</p>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

function TrustBadgesSection() {
  const { t } = useLocalization()
  const badges = [
    { icon: Lock, title: t("customer.home.trustEscrowTitle"), desc: t("customer.home.trustEscrowDesc") },
    { icon: ShieldCheck, title: t("customer.home.trustVerifiedTitle"), desc: t("customer.home.trustVerifiedDesc") },
    { icon: Headphones, title: t("customer.home.trustSupportTitle"), desc: t("customer.home.trustSupportDesc") },
    { icon: BadgeCheck, title: t("customer.home.trustWarrantyTitle"), desc: t("customer.home.trustWarrantyDesc") },
  ]
  return (
    <div>
      <SectionHeader title={t("customer.home.trustSectionTitle")} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {badges.map((badge) => (
          <div key={badge.title} className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <badge.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{badge.title}</p>
              <p className="text-xs text-muted-foreground">{badge.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function useOrderStatusStyle(t: Translate): Record<string, { label: string; className: string }> {
  return {
    PENDING: { label: t("customer.orders.statusPending"), className: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" },
    PROCESSING: { label: t("customer.orders.statusProcessing"), className: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" },
    SHIPPED: { label: t("customer.orders.statusShipped"), className: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400" },
    DELIVERED: { label: t("customer.orders.statusDelivered"), className: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" },
    CANCELLED: { label: t("customer.orders.statusCancelled"), className: "bg-muted text-muted-foreground" },
    REFUNDED: { label: t("customer.orders.statusRefunded"), className: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" },
  }
}

function ContinueBookingSection({ jobs, orders }: { jobs: CustomerJob[]; orders: CustomerOrder[] }) {
  const { t } = useLocalization()
  const JOB_STATUS_STYLE = useJobStatusStyle(t)
  const ORDER_STATUS_STYLE = useOrderStatusStyle(t)
  const recentJobs = jobs.slice(0, 2)
  const recentOrder = orders[0]
  if (recentJobs.length === 0 && !recentOrder) return null

  return (
    <div>
      <SectionHeader title={t("customer.home.continueWhereLeftOff")} href="/customer/jobs" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {recentJobs.map((job) => {
          const status = JOB_STATUS_STYLE[job.status] ?? JOB_STATUS_STYLE.PENDING
          const StatusIcon = status.icon
          return (
            <Link key={job.id} href="/customer/jobs">
              <Card className="p-3.5 border border-border hover:shadow-md transition-shadow rounded-2xl h-full">
                <div className="flex items-center gap-3">
                  <div className="relative w-11 h-11 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-background bg-muted">
                    <Image src={job.providerAvatar || "/placeholder.svg"} alt={job.providerName} fill className="object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{job.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{job.providerName}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
                <div className={`mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${status.className}`}>
                  <StatusIcon className="w-3 h-3" />
                  {status.label}
                </div>
              </Card>
            </Link>
          )
        })}
        {recentOrder && (
          <Link href="/customer/orders">
            <Card className="p-3.5 border border-border hover:shadow-md transition-shadow rounded-2xl h-full">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{recentOrder.itemSummary}</p>
                  <p className="text-xs text-muted-foreground truncate">{recentOrder.shopName}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
              <div className={`mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${ORDER_STATUS_STYLE[recentOrder.status]?.className ?? ORDER_STATUS_STYLE.PENDING.className}`}>
                <Truck className="w-3 h-3" />
                {ORDER_STATUS_STYLE[recentOrder.status]?.label ?? ORDER_STATUS_STYLE.PENDING.label}
              </div>
            </Card>
          </Link>
        )}
      </div>
    </div>
  )
}

function RecommendedSection({ recommended }: { recommended: RecommendedServices }) {
  const { t, formatMoney } = useLocalization()
  if (!recommended || recommended.services.length === 0) return null

  return (
    <div>
      <SectionHeader title={t("customer.home.moreCategoryName", { category: recommended.categoryName })} href="/customer/services" icon={Sparkles} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {recommended.services.map((service) => (
          <Card key={service.serviceId} className="p-3.5 border border-border hover:shadow-md transition-shadow rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-background bg-muted">
                <Image src={service.providerAvatar || "/placeholder.svg"} alt={service.providerName} fill className="object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{service.providerName}</p>
                <p className="text-xs text-muted-foreground truncate">{service.title}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                {service.rating.toFixed(1)}
              </div>
              <p className="text-sm font-bold text-primary">{formatMoney(service.price)}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}


function FeaturedShopCard({ shop }: { shop: HomeFeaturedShop }) {
  const { t } = useLocalization()
  return (
    <Link href={`/customer/shops/${shop.id}`}>
      <Card className="overflow-hidden border border-border hover:shadow-md transition-shadow rounded-2xl h-full">
        <div className="relative h-28 lg:h-32">
          <Image src={shop.image || "/placeholder.svg"} alt={shop.name} fill className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          {shop.isOpen ? (
            <Badge className="absolute top-2 left-2 bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 border-0">
              {t("customer.shops.openNow")}
            </Badge>
          ) : shop.hoursLabel ? (
            <Badge className="absolute top-2 left-2 bg-black/60 hover:bg-black/60 text-white text-[10px] px-1.5 py-0.5 border-0">
              {t("customer.shops.closed")}
            </Badge>
          ) : null}
          {shop.hasSale && (
            <Badge className="absolute top-2 right-2 bg-amber-500 hover:bg-amber-500 text-white text-[10px] px-1.5 py-0.5 border-0 flex items-center gap-0.5">
              <Package className="w-3 h-3" /> {t("customer.shops.sale")}
            </Badge>
          )}
        </div>
        <div className="p-3">
          <h4 className="font-semibold text-foreground text-sm truncate">{shop.name}</h4>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="flex items-center">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-3 h-3 ${i < Math.floor(shop.rating) ? "fill-amber-400 text-amber-400" : i < shop.rating ? "fill-amber-400/50 text-amber-400" : "text-muted"}`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{shop.reviews}</span>
          </div>
          {shop.hoursLabel && (
            <p className="text-[10px] text-muted-foreground mt-1 truncate">{shop.hoursLabel}</p>
          )}
        </div>
      </Card>
    </Link>
  )
}

function FeaturedShopsSection({ shops }: { shops: HomeFeaturedShop[] }) {
  const { t } = useLocalization()
  if (shops.length === 0) return null

  return (
    <div>
      <SectionHeader title={t("customer.home.recommendedShops")} href="/customer/shops" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {shops.map((shop) => (
          <FeaturedShopCard key={shop.id} shop={shop} />
        ))}
      </div>
    </div>
  )
}

/** Real urgency from the actual clock (time left today), not an invented
 * stock/sold count — recalculated every minute, which is plenty precise
 * for a "ends tonight" style chip. */
function useCountdownToMidnight(): string {
  const computeRemaining = () => {
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0)
    const diffMs = midnight.getTime() - now.getTime()
    const hours = Math.floor(diffMs / 3_600_000)
    const minutes = Math.floor((diffMs % 3_600_000) / 60_000)
    return `${hours}h ${minutes}m`
  }
  const [remaining, setRemaining] = useState(computeRemaining)
  useEffect(() => {
    const interval = setInterval(() => setRemaining(computeRemaining()), 60_000)
    return () => clearInterval(interval)
  }, [])
  return remaining
}

function DealsSection({ products }: { products: ProductCard[] }) {
  const { t, formatMoney } = useLocalization()
  const countdown = useCountdownToMidnight()
  const deals = products.filter((p) => p.discountPercent != null).slice(0, 6)
  if (deals.length === 0) return null

  return (
    <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-br from-red-500/10 via-orange-500/5 to-transparent p-4 sm:p-6 border border-red-500/10">
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <h2 className="min-w-0 flex-wrap text-lg sm:text-xl font-extrabold text-foreground flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center flex-shrink-0">
            <Flame className="w-4.5 h-4.5 text-white" />
          </span>
          {t("customer.home.flashDeals")}
          <span className="whitespace-nowrap text-xs font-bold text-white bg-red-500 px-2.5 py-1 rounded-full">
            {t("customer.home.dealsEndIn", { time: countdown })}
          </span>
        </h2>
        <Link href="/customer/products" className="text-sm text-primary font-medium flex items-center gap-0.5 flex-shrink-0">
          {t("customer.home.seeAll")} <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {deals.map((product) => (
          <Link key={product.id} href={`/customer/products/${product.id}`}>
            <Card className="overflow-hidden border border-border ring-1 ring-red-500/20 hover:shadow-md transition-shadow rounded-2xl h-full">
              <div className="relative aspect-square bg-muted/30">
                <Image src={product.image || "/placeholder.svg"} alt={product.name} fill className="object-cover" />
                <Badge className="absolute left-1.5 top-1.5 bg-red-500 hover:bg-red-500 text-white text-xs px-1.5 py-0.5 border-0 font-bold">
                  -{product.discountPercent}%
                </Badge>
              </div>
              <div className="p-2.5 sm:p-3">
                <p className="truncate text-xs sm:text-sm font-semibold text-foreground">{product.name}</p>
                <p className="text-primary text-sm sm:text-base font-bold mt-0.5">{formatMoney(product.discountPrice ?? product.price)}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Distinct from DealsSection — powered by the real `Product.isFeatured`
 * flag (shopkeeper/admin-curated) rather than discount price, so it's a
 * genuinely different real signal, not the same deals re-sorted. */
function FeaturedProductsSection({ products }: { products: ProductCard[] }) {
  const { t, formatMoney } = useLocalization()
  if (products.length === 0) return null

  return (
    <div>
      <SectionHeader title={t("customer.home.topPicksForYou")} href="/customer/products" icon={Sparkles} />
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 lg:grid-cols-6">
        {products.map((product) => (
          <Link key={product.id} href={`/customer/products/${product.id}`} className="flex-shrink-0 w-32 sm:w-auto">
            <Card className="overflow-hidden border border-border ring-1 ring-accent-warm/25 hover:shadow-md transition-shadow rounded-2xl h-full">
              <div className="relative aspect-square bg-muted/30">
                <Image src={product.image || "/placeholder.svg"} alt={product.name} fill className="object-cover" />
                <Badge className="absolute left-1.5 top-1.5 bg-amber-500 hover:bg-amber-500 text-white text-[10px] px-1.5 py-0.5 border-0">
                  {t("customer.home.featuredBadge")}
                </Badge>
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-semibold text-foreground">{product.name}</p>
                <p className="text-primary text-sm font-bold mt-0.5">{formatMoney(product.discountPrice ?? product.price)}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

function RecentlyViewedSection({ items }: { items: RecentlyViewedItem[] }) {
  const { t } = useLocalization()
  if (items.length === 0) return null

  return (
    <div>
      <SectionHeader title={t("customer.home.recentlyViewed")} icon={History} />
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide sm:mx-0 sm:px-0 sm:grid sm:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => (
          <Link key={item.id} href={item.href} className="flex-shrink-0 w-32 sm:w-auto">
            <Card className="overflow-hidden border border-border hover:shadow-md transition-shadow rounded-2xl h-full">
              <div className="relative aspect-square bg-muted/30">
                <Image src={item.image || "/placeholder.svg"} alt={item.title} fill className="object-cover" />
                <span className="absolute left-1.5 top-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-medium">
                  {item.targetType === "PRODUCT" ? t("customer.home.productLabel") : t("customer.serviceDetail.serviceLabel")}
                </span>
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-semibold text-foreground">{item.title}</p>
                {item.subtitle && <p className="truncate text-[11px] text-muted-foreground">{item.subtitle}</p>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Flat circular row (no tier tabs) — matches the reference mockup's single
 * "Popular Services" row exactly, real categories via getServiceCategories(),
 * plus a trailing "More" tile linking to the full services page. */
function PopularServicesRow({ categories }: { categories: HomeServiceCategory[] }) {
  const { t } = useLocalization()
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide sm:mx-0 sm:px-0 sm:flex-wrap">
      {categories.map((category) => {
        const style = CATEGORY_STYLE[category.slug] ?? DEFAULT_CATEGORY_STYLE
        return (
          <Link key={category.id} href={`/customer/services?category=${category.slug}`} className="flex flex-col items-center gap-2 flex-shrink-0 w-16 group">
            <div className={`w-14 h-14 rounded-full ${style.color} flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform`}>
              <style.icon className="w-6 h-6" />
            </div>
            <p className="text-[11px] font-medium text-foreground text-center leading-tight truncate w-full">{category.name}</p>
          </Link>
        )
      })}
      <Link href="/customer/services" className="flex flex-col items-center gap-2 flex-shrink-0 w-16 group">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
          <Grid3X3 className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-[11px] font-medium text-foreground text-center leading-tight">{t("customer.home.moreLabel")}</p>
      </Link>
    </div>
  )
}

function PopularServicesSkeleton() {
  return (
    <div className="flex gap-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0 w-16">
          <Skeleton className="w-14 h-14 rounded-full" />
          <Skeleton className="h-2.5 w-10 rounded" />
        </div>
      ))}
    </div>
  )
}

function ShopsSectionSkeleton() {
  return (
    <div>
      <Skeleton className="h-5 w-36 mb-4 rounded-lg" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 lg:h-32 rounded-2xl" />)}
      </div>
    </div>
  )
}

/** Wallet balance + the real held-in-escrow total, plus shortcuts to the
 * three real features behind "Add Money" / "Transactions" / "Rewards"
 * (wallet top-up modal, wallet transaction history, and the real referrals
 * program — this app has no separate loyalty-points system).
 *
 * escrowBalance here is NOT read from Wallet.escrowBalance — that column
 * exists in the schema but nothing in this codebase ever writes to it, so
 * it would always read 0. The real, working pattern (already used by the
 * provider wallet page) is to compute escrow live by summing active jobs'
 * held payments — same number the Active Escrow card below derives from
 * getActiveEscrowJobs(), passed in here so the two stay consistent. */
function WalletCard({ balance, escrowBalance }: { balance: number; escrowBalance: number }) {
  const { t, formatMoney } = useLocalization()
  return (
    <Card className="p-4 border border-border rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <Wallet className="w-4 h-4 text-primary" /> {t("customer.wallet.totalBalance")}
        </h3>
        <Link href="/customer/wallet" className="text-xs text-primary font-medium">{t("customer.home.seeAll")}</Link>
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">{t("customer.home.walletBalanceLabel")}</p>
        <p className="text-xl font-bold text-foreground">{formatMoney(balance)}</p>
      </div>
      <div className="mt-2.5 pt-2.5 border-t border-border">
        <p className="text-[11px] text-muted-foreground">{t("customer.home.escrowBalanceLabel")}</p>
        <p className="text-base font-semibold text-foreground">{formatMoney(escrowBalance)}</p>
      </div>
      <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-1.5">
        <Link href="/customer/wallet" className="flex flex-col items-center gap-1 py-1.5 rounded-xl hover:bg-muted transition-colors">
          <Plus className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-medium text-foreground">{t("customer.home.addMoneyLabel")}</span>
        </Link>
        <Link href="/customer/wallet" className="flex flex-col items-center gap-1 py-1.5 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeftRight className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-medium text-foreground">{t("customer.home.transactionsLabel")}</span>
        </Link>
        <Link href="/customer/referrals" className="flex flex-col items-center gap-1 py-1.5 rounded-xl hover:bg-muted transition-colors">
          <Gift className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-medium text-foreground">{t("customer.home.rewardsLabel")}</span>
        </Link>
      </div>
    </Card>
  )
}

/** Real held-funds jobs (see getActiveEscrowJobs) — deliberately no progress
 * percentage, since this schema has no milestone/percentage field on Job to
 * honestly derive one from. Renders nothing when there's no active escrow,
 * same empty-state convention as ContinueBookingSection. */
function ActiveEscrowCard({ jobs }: { jobs: ActiveEscrowJob[] }) {
  const { t, formatMoney } = useLocalization()
  const JOB_STATUS_STYLE = useJobStatusStyle(t)
  if (jobs.length === 0) return null

  return (
    <Card className="p-4 border border-border rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground">{t("customer.home.activeEscrowTitle")}</h3>
        <Link href="/customer/jobs" className="text-xs text-primary font-medium">{t("customer.home.seeAll")}</Link>
      </div>
      <div className="space-y-3">
        {jobs.slice(0, 3).map((job) => {
          const status = JOB_STATUS_STYLE[job.status]
          return (
            <Link key={job.jobId} href="/customer/jobs" className="flex items-center gap-2.5">
              <div className="relative w-9 h-9 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-border bg-muted">
                <Image src={job.providerAvatar || "/placeholder.svg"} alt={job.providerName} fill className="object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{job.categoryName ?? job.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{job.providerName}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-bold text-foreground">{formatMoney(job.amount)}</p>
                <p className={`text-[10px] font-medium ${status.className.split(" ").filter((c) => c.includes("text-")).join(" ")}`}>{status.label}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}

// Shows the customer's own recent open requests when they have any; when
// they don't, shows static example prompts for inspiration (deliberately
// not other customers' real request text — keeps this section
// privacy-safe by default rather than surfacing someone else's post on a
// stranger's home feed).
const EXAMPLE_REQUEST_PROMPTS = [
  "Need CCTV Installation?",
  "Need Painter Tomorrow?",
  "Need 100 Chairs?",
]

function RequestBoardSection({ requests }: { requests: MyRequestItem[] }) {
  const { t, formatMoney } = useLocalization()
  const openRequests = requests.filter((r) => r.status === "OPEN").slice(0, 3)

  return (
    <div>
      <SectionHeader title={t("customer.home.requestBoardTitle")} href="/customer/requests" icon={ClipboardList} />
      {openRequests.length > 0 ? (
        <div className="space-y-2">
          {openRequests.map((r) => (
            <Link key={r.id} href="/customer/requests">
              <Card className="p-3.5 border border-border hover:shadow-md transition-shadow rounded-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{t("customer.home.requestBoardResponseCount", { count: r.responseCount })}</p>
                  </div>
                  {(r.budgetMin != null || r.budgetMax != null) && (
                    <p className="text-xs font-medium text-muted-foreground flex-shrink-0">
                      {r.budgetMin != null ? formatMoney(r.budgetMin) : "?"}–{r.budgetMax != null ? formatMoney(r.budgetMax) : "?"}
                    </p>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {EXAMPLE_REQUEST_PROMPTS.map((prompt) => (
            <Link key={prompt} href="/customer/requests" className="flex-shrink-0">
              <Card className="px-4 py-2.5 border border-dashed border-border hover:border-primary/40 transition-colors rounded-full">
                <p className="text-xs font-medium text-muted-foreground whitespace-nowrap">{prompt}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Link href="/customer/requests">
        <Button variant="outline" size="sm" className="mt-3 rounded-xl gap-1.5 bg-transparent">
          <Plus className="w-3.5 h-3.5" /> {t("customer.home.postRequestButton")}
        </Button>
      </Link>
    </div>
  )
}

// --- Main Component ---

export function CustomerHome() {
  const { t } = useLocalization()
  const { user } = useAuthContext()
  const [greeting] = useState(() => greetingForHour(new Date().getHours(), t))

  // Each real data source gets its own SWR key instead of one big
  // Promise.allSettled gate — three real wins: (1) dedup, if any other
  // mounted component asks for the same key within the same tick, only one
  // request fires; (2) stale-while-revalidate, navigating back to Home shows
  // the last-known data from cache instantly while a fresh fetch happens
  // quietly behind it, instead of a blank skeleton every time; (3) each
  // section can render as soon as its own data resolves, rather than every
  // section waiting on whichever of the real queries is slowest.
  const { data: categories, isLoading: categoriesLoading } = useSWR(
    "categories", () => withTimeout(getServiceCategories(), HOME_DATA_TIMEOUT_MS),
  )
  const { data: featuredShops, isLoading: shopsLoading } = useSWR(
    "recommended-shops", () => withTimeout(getRecommendedShops(), HOME_DATA_TIMEOUT_MS),
  )
  const { data: recentJobs } = useSWR(
    "customer-jobs", () => withTimeout(getCustomerJobs(), HOME_DATA_TIMEOUT_MS),
  )
  const { data: dealProducts } = useSWR(
    "deal-products", () => withTimeout(getProducts({ onlyDiscounted: true, take: 6 }), HOME_DATA_TIMEOUT_MS),
  )
  const { data: featuredProducts } = useSWR(
    "featured-products", () => withTimeout(getProducts({ onlyFeatured: true, take: 6 }), HOME_DATA_TIMEOUT_MS),
  )
  const { data: addresses } = useSWR(
    "addresses", () => withTimeout(getAddresses(), HOME_DATA_TIMEOUT_MS),
  )
  const { data: recentOrders } = useSWR(
    "recent-orders", () => withTimeout(getRecentOrders(), HOME_DATA_TIMEOUT_MS),
  )
  const { data: recommended } = useSWR(
    "recommended-services", () => withTimeout(getRecommendedServices(), HOME_DATA_TIMEOUT_MS),
  )
  const { data: recentlyViewed } = useSWR(
    "recently-viewed", () => withTimeout(getRecentlyViewed(), HOME_DATA_TIMEOUT_MS),
  )
  const { data: providerStoryGroups } = useSWR(
    "provider-stories", () => withTimeout(getActiveProviderStories(), HOME_DATA_TIMEOUT_MS),
    { refreshInterval: 60_000 },
  )
  const { data: wallet } = useSWR(
    "wallet-summary", () => withTimeout(getWalletSummary(), HOME_DATA_TIMEOUT_MS),
  )
  const { data: activeEscrowJobs } = useSWR(
    "active-escrow-jobs", () => withTimeout(getActiveEscrowJobs(), HOME_DATA_TIMEOUT_MS),
  )
  const { data: myRequests } = useSWR(
    "my-requests", () => withTimeout(getMyCustomerRequests(), HOME_DATA_TIMEOUT_MS),
  )
  const { data: productCategories } = useSWR(
    "product-categories", () => withTimeout(getProductCategories(), HOME_DATA_TIMEOUT_MS),
  )
  const { data: mixedFeedNearby } = useSWR(
    "mixed-feed-nearby", () => withTimeout(getNearbyMixedFeed(9, 0), HOME_DATA_TIMEOUT_MS),
  )
  // Second real slice (not the same rows re-labeled) — see getNearbyMixedFeed's
  // skip param. Not deep ML personalization, same honest "top-rated preview"
  // scope this page uses throughout.
  const { data: mixedFeedRecommended } = useSWR(
    "mixed-feed-recommended", () => withTimeout(getNearbyMixedFeed(9, 9), HOME_DATA_TIMEOUT_MS),
  )

  const preferredAddress = addresses?.find((a) => a.isDefault) ?? addresses?.[0]
  const location = preferredAddress ? preferredAddress.address : null

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-5 sm:py-6 lg:py-8 space-y-6 sm:space-y-8">
        {/* Greeting */}
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground text-balance">
            {greeting}, {user?.name?.split(" ")[0] || t("customer.home.thereFallback")}
          </h1>
        </div>

        {/* Search — with voice input */}
        <HomeSearchBar />

        {/* Quick Actions (Order Quickly / Solve a Problem / Flash Deals / Rent Equipment) */}
        <HomeQuickActions />

        {/* ---------------------------------------------------------------
            Hero + urgency — a marketplace home page leads with these two,
            not buries them: a real banner (always visible, not just when an
            admin campaign happens to be running) immediately followed by
            time-sensitive deals, before any generic browse content. */}

        {/* Promo banner */}
        <HomeHeroSection categories={categories ?? []} location={location} compact />

        {/* Category shortcuts */}
        <HomeCategoryRow productCategories={productCategories ?? []} />

        {/* Flash Deals */}
        <div id="flash-deals">
          <DealsSection products={dealProducts ?? []} />
        </div>

        {/* ---------------------------------------------------------------
            Personal / actionable — what THIS customer is already doing. */}

        {/* Continue Where You Left Off */}
        <ContinueBookingSection jobs={recentJobs ?? []} orders={recentOrders ?? []} />

        {/* ---------------------------------------------------------------
            Discover — core browse content. */}

        {/* Open shops near you */}
        <MixedFeedSection title="Open shops near you" seeAllHref="/customer/shops" items={mixedFeedNearby ?? []} />

        {/* Recommended for you */}
        <MixedFeedSection title="Recommended for you" seeAllHref="/customer/shops" items={mixedFeedRecommended ?? []} />

        {/* Quick Actions (Emergency, Near Me, Orders, Wallet) */}
        <QuickActionsSection walletBalance={wallet?.balance ?? 0} />

        {/* Solve a Problem */}
        <div>
          <SectionHeader title={t("customer.home.solveAProblem")} href="/customer/services" />
          {categoriesLoading ? <PopularServicesSkeleton /> : <PopularServicesRow categories={categories ?? []} />}
        </div>

        {/* Recommended For You */}
        <RecommendedSection recommended={recommended ?? null} />

        {/* ---------------------------------------------------------------
            Trust & social proof — reassurance content sits after the
            customer has seen real listings, not before. */}

        {/* Trust & Security */}
        <TrustBadgesSection />

        {/* Work in Action */}
        {(providerStoryGroups ?? []).length > 0 && (
          <div>
            <SectionHeader title={t("customer.home.workInActionTitle")} />
            <ProviderStoryRing groups={providerStoryGroups ?? []} />
          </div>
        )}

        {/* ---------------------------------------------------------------
            Secondary discovery — lower-intent browsing. */}

        {/* Shop Local */}
        {shopsLoading ? <ShopsSectionSkeleton /> : <FeaturedShopsSection shops={featuredShops ?? []} />}

        {/* Request Board */}
        <RequestBoardSection requests={myRequests ?? []} />

        {/* Featured Products */}
        <FeaturedProductsSection products={featuredProducts ?? []} />

        {/* Recently Viewed */}
        <RecentlyViewedSection items={recentlyViewed ?? []} />

        {/* ---------------------------------------------------------------
            Account — wallet detail, then the growth CTA as a closing,
            footer-style banner. */}

        {/* My Wallet */}
        <div>
          <SectionHeader title={t("customer.home.myWalletTitle")} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <WalletCard balance={wallet?.balance ?? 0} escrowBalance={(activeEscrowJobs ?? []).reduce((sum, j) => sum + j.amount, 0)} />
            <ActiveEscrowCard jobs={activeEscrowJobs ?? []} />
          </div>
        </div>

        {/* Grow with SAJI */}
        <Card className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20 p-5 lg:p-8 rounded-2xl sm:rounded-3xl">
          <h3 className="text-lg lg:text-xl font-bold text-foreground mb-1">{t("customer.home.growWithSaji")}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t("customer.home.growWithSajiDesc")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Link href="/auth/signup?role=provider" className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-background/60 hover:bg-background transition-colors">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-sm font-semibold text-foreground">{t("customer.home.growBecomeExpert")}</span>
            </Link>
            <Link href="/auth/signup?role=shopkeeper" className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-background/60 hover:bg-background transition-colors">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <Store className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-sm font-semibold text-foreground">{t("customer.home.growOpenShop")}</span>
            </Link>
            <Link href="/auth/signup?role=distributor" className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-background/60 hover:bg-background transition-colors">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-sm font-semibold text-foreground">{t("customer.home.growRegisterBusiness")}</span>
            </Link>
          </div>
          <Link href="/auth/signup" className="relative inline-block w-full sm:w-auto overflow-hidden rounded-md animate-shimmer">
            <Button className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white">
              {t("customer.home.getStartedButton")} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  )
}
