"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import NextImage from "next/image"
import {
  Loader2, MapPin, BadgeCheck, ChevronRight, FilePlus, CalendarPlus, Camera, FolderKanban,
  Wrench, Briefcase, Users, FileText, ClipboardList, ShoppingBag, Package, Tag, Warehouse, Truck,
  ImageIcon, Star, BarChart3, Megaphone, Wallet, ShieldCheck, TrendingUp, Calendar,
  MessageCircle, ShieldAlert,
} from "lucide-react"
import { getBusinessOverview, type BusinessOverview, getBusinessShopStatus, setupBusinessShop, type BusinessShopStatus } from "@/lib/actions/provider-business"
import { getProviderWalletSummary, type ProviderWalletSummary } from "@/lib/actions/provider-wallet"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

function greetingKey(): "provider.business.hub.greetingMorning" | "provider.business.hub.greetingAfternoon" | "provider.business.hub.greetingEvening" {
  const hour = new Date().getHours()
  if (hour < 12) return "provider.business.hub.greetingMorning"
  if (hour < 18) return "provider.business.hub.greetingAfternoon"
  return "provider.business.hub.greetingEvening"
}

type TileColor = "green" | "purple" | "orange" | "blue"

const TILE_COLOR: Record<TileColor, { bg: string; text: string }> = {
  green: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-400" },
  purple: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400" },
  orange: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400" },
  blue: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400" },
}

type Tile = { icon: typeof Wrench; label: string; href: string; color: TileColor; badge?: string; badgeWarn?: boolean; disabled?: boolean; onClick?: () => void }

function TileGrid({ tiles, cols = 3 }: { tiles: Tile[]; cols?: 2 | 3 }) {
  return (
    <div className={`grid grid-cols-1 gap-3 ${cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
      {tiles.map((tile) => {
        const Icon = tile.icon
        const color = TILE_COLOR[tile.color]
        const content = (
          <div className={`flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors ${tile.disabled ? "opacity-60" : "hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm"}`}>
            <div className={`shrink-0 w-9 h-9 rounded-lg ${color.bg} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${color.text}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{tile.label}</p>
              {tile.badge && <p className={`text-[11px] truncate ${tile.badgeWarn ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>{tile.badge}</p>}
            </div>
            {!tile.disabled && <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
          </div>
        )
        if (tile.onClick) {
          return <button key={tile.label} type="button" onClick={tile.onClick} className="text-left w-full">{content}</button>
        }
        return tile.disabled ? (
          <div key={tile.label}>{content}</div>
        ) : (
          <Link key={tile.label} href={tile.href}>{content}</Link>
        )
      })}
    </div>
  )
}

// A section (OPERATE/SELL/GROW) is one bordered card, header inside it,
// with its tile grid inside the same card — matching the mockup's
// "everything inside one outlined container per section" treatment,
// rather than a bare heading floating above a loose grid.
function SectionCard({ title, subtitle, tiles, cols }: { title: string; subtitle: string; tiles: Tile[]; cols?: 2 | 3 }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
      <div className="mb-3">
        <h2 className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{title}</h2>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      <TileGrid tiles={tiles} cols={cols} />
    </div>
  )
}

export default function BusinessDashboardHubPage() {
  const { t, tn, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [overview, setOverview] = useState<BusinessOverview>({ isBusinessOwner: false })
  const [wallet, setWallet] = useState<ProviderWalletSummary>(null)
  const [shopStatus, setShopStatus] = useState<BusinessShopStatus>({ isBusinessOwner: false })
  const [showSetupShop, setShowSetupShop] = useState(false)
  const [shopNameInput, setShopNameInput] = useState("")
  const [isSettingUpShop, setIsSettingUpShop] = useState(false)
  const [setupShopError, setSetupShopError] = useState("")

  const loadShopStatus = () => getBusinessShopStatus().then(setShopStatus)

  useEffect(() => {
    Promise.all([getBusinessOverview(), getProviderWalletSummary(), getBusinessShopStatus()])
      .then(([o, w, s]) => { setOverview(o); setWallet(w); setShopStatus(s) })
      .finally(() => setIsLoading(false))
  }, [])

  const handleSetupShop = async () => {
    setIsSettingUpShop(true)
    setSetupShopError("")
    const result = await setupBusinessShop({ shopName: shopNameInput })
    if (!result.success) {
      setSetupShopError(result.error)
      setIsSettingUpShop(false)
      return
    }
    setShowSetupShop(false)
    setShopNameInput("")
    setIsSettingUpShop(false)
    await loadShopStatus()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!overview.isBusinessOwner) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700 text-center text-gray-500 dark:text-gray-400">
          {t("provider.business.staff.notBusinessAccount")}
        </div>
      </div>
    )
  }

  const firstName = overview.ownerName.split(" ")[0]
  const hasShop = shopStatus.isBusinessOwner && shopStatus.hasShop
  const shop = hasShop ? shopStatus : null

  // Every retail tile funnels through here: real link + real badge once a
  // shop is linked, otherwise it opens the "set up your shop" modal
  // instead of navigating — never a dead link, never fabricated numbers.
  const retailTile = (icon: Tile["icon"], labelKey: string, color: TileColor, href: string, badge?: string, badgeWarn?: boolean): Tile =>
    hasShop
      ? { icon, label: t(labelKey as Parameters<typeof t>[0]), href, color, badge, badgeWarn }
      : { icon, label: t(labelKey as Parameters<typeof t>[0]), href: "#", color, badge: t("provider.business.hub.setUpShop"), onClick: () => setShowSetupShop(true) }

  const operateTiles: Tile[] = [
    { icon: Wrench, label: t("provider.business.hub.services"), href: "/provider/services", color: "green" },
    { icon: Calendar, label: t("provider.business.hub.bookings"), href: "/provider/jobs", color: "purple", badge: tn("provider.business.hub.bookingsBadge", overview.bookingsTotal) },
    { icon: Briefcase, label: t("provider.business.hub.projects"), href: "#", color: "orange", disabled: true, badge: t("provider.business.hub.comingSoon") },
    retailTile(Package, "provider.business.hub.orders", "green", "/shopkeeper/orders", shop ? tn("provider.business.hub.pendingOrdersBadge", shop.pendingOrderCount) : undefined),
    retailTile(Tag, "provider.business.hub.products", "green", "/shopkeeper/products", shop ? tn("provider.business.hub.productsBadge", shop.productCount) : undefined),
    retailTile(Warehouse, "provider.business.hub.inventory", "purple", "/shopkeeper/products", shop && shop.lowStockCount > 0 ? tn("provider.business.hub.lowStockBadge", shop.lowStockCount) : shop ? t("provider.business.hub.stockOk") : undefined, shop ? shop.lowStockCount > 0 : false),
    retailTile(Truck, "provider.business.hub.deliveries", "blue", "/shopkeeper/orders"),
    { icon: Users, label: t("provider.business.hub.team"), href: "/provider/business/staff", color: "green", badge: tn("provider.business.hub.teamBadge", overview.memberCount) },
    { icon: FileText, label: t("provider.business.hub.documents"), href: "/provider/business/documents", color: "orange" },
  ]

  const sellTiles: Tile[] = [
    { icon: Users, label: t("provider.business.hub.customers"), href: "/provider/clients", color: "green" },
    retailTile(Megaphone, "provider.business.hub.promotions", "purple", "/shopkeeper/promotions", shop ? tn("provider.business.hub.activeCampaignsBadge", shop.activePromotionCount) : undefined),
    retailTile(Warehouse, "provider.business.hub.wholesale", "green", "/shopkeeper/wholesale-orders"),
    { icon: FileText, label: t("provider.business.hub.invoices"), href: "/provider/invoices", color: "blue", badge: overview.unpaidInvoices > 0 ? tn("provider.business.hub.unpaidBadge", overview.unpaidInvoices) : undefined, badgeWarn: overview.unpaidInvoices > 0 },
  ]

  const growTiles: Tile[] = [
    { icon: ImageIcon, label: t("provider.business.hub.showcase"), href: "/provider/content", color: "orange" },
    { icon: Star, label: t("provider.business.hub.reviews"), href: "/provider/profile/ratings", color: "green", badge: overview.reviewCount > 0 ? `${overview.rating.toFixed(1)} ★ (${overview.reviewCount})` : undefined },
    { icon: BarChart3, label: t("provider.business.hub.insights"), href: "/provider/analytics", color: "purple" },
    { icon: Megaphone, label: t("provider.business.hub.leads"), href: "/provider/requests", color: "blue" },
  ]

  const revenueStats = [
    { icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", label: t("provider.business.hub.totalRevenue"), value: formatMoney(overview.revenueThisMonth), sub: `${overview.revenueGrowthPct >= 0 ? "+" : ""}${overview.revenueGrowthPct}% ${t("provider.business.hub.thisMonth")}`, subColor: overview.revenueGrowthPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
    { icon: Briefcase, color: "text-purple-600 dark:text-purple-400", label: t("provider.business.hub.bookingsToday"), value: String(overview.bookingsToday), sub: tn("provider.business.hub.newToday", overview.bookingsToday), subColor: "text-gray-500 dark:text-gray-400" },
    { icon: Calendar, color: "text-blue-600 dark:text-blue-400", label: t("provider.business.hub.activeJobs"), value: String(overview.activeJobs), sub: "", subColor: "" },
    { icon: Briefcase, color: "text-amber-600 dark:text-amber-400", label: t("provider.business.hub.dueThisWeek"), value: String(overview.dueThisWeek), sub: "", subColor: "" },
  ]

  return (
    <div className="pb-8 space-y-6">
      {/* Greeting + business identity */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <p className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">{t(greetingKey())}, {firstName} 👋</p>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{t("provider.business.hub.title")}</h1>
          {overview.verified && (
            <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full">
              <BadgeCheck className="w-3.5 h-3.5" /> {t("provider.business.hub.verifiedBadge")}
            </span>
          )}
        </div>
        <Link href="/provider/profile/account" className="flex items-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 pr-4 hover:shadow-sm transition-shadow shrink-0">
          {overview.logoUrl ? (
            <NextImage src={overview.logoUrl} alt={overview.businessName} width={44} height={44} className="w-11 h-11 rounded-lg object-cover" />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold">
              {overview.businessName.charAt(0)}
            </div>
          )}
          <div className="text-right">
            <p className="font-semibold text-gray-900 dark:text-white text-xs leading-tight">{overview.businessName}</p>
            {overview.location && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 justify-end mt-0.5">
                <MapPin className="w-3 h-3" /> {overview.location}
              </p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </Link>
      </div>

      {/* Revenue / activity strip */}
      <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {revenueStats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="min-w-0">
              <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                {stat.label} <Icon className={`w-3 h-3 ${stat.color}`} />
              </p>
              <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mt-0.5 truncate">{stat.value}</p>
              {stat.sub && <p className={`text-[11px] mt-0.5 ${stat.subColor}`}>{stat.sub}</p>}
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">{t("provider.business.hub.quickActions")}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
          {[
            { icon: FilePlus, label: t("provider.business.hub.newQuote"), href: "/provider/quotes", color: "bg-emerald-600" },
            hasShop
              ? { icon: ShoppingBag, label: t("provider.business.hub.addProduct"), href: "/shopkeeper/products", color: "bg-emerald-600" }
              : { icon: ShoppingBag, label: t("provider.business.hub.addProduct"), href: "#", color: "bg-emerald-600", onClick: () => setShowSetupShop(true) },
            { icon: CalendarPlus, label: t("provider.business.hub.bookJob"), href: "/provider/jobs", color: "bg-purple-600" },
            { icon: FolderKanban, label: t("provider.business.hub.createProject"), href: "#", disabled: true, color: "bg-amber-600" },
            { icon: Camera, label: t("provider.business.hub.addShowcase"), href: "/provider/content", color: "bg-blue-600" },
          ].map((action: { icon: typeof Wrench; label: string; href: string; color: string; disabled?: boolean; onClick?: () => void }) => {
            const Icon = action.icon
            const inner = (
              <div className={`flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center ${action.disabled ? "opacity-50" : "hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm transition-shadow"}`}>
                <div className={`w-9 h-9 rounded-lg ${action.color} flex items-center justify-center`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-gray-700 dark:text-gray-300 leading-tight">{action.label}</span>
              </div>
            )
            if (action.onClick) return <button key={action.label} type="button" onClick={action.onClick} className="w-full">{inner}</button>
            return action.disabled ? <div key={action.label}>{inner}</div> : <Link key={action.label} href={action.href}>{inner}</Link>
          })}
        </div>
      </div>

      {/* OPERATE */}
      <SectionCard title={t("provider.business.hub.operate")} subtitle={t("provider.business.hub.operateSubtitle")} tiles={operateTiles} />

      {/* SELL + GROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title={t("provider.business.hub.sell")} subtitle={t("provider.business.hub.sellSubtitle")} tiles={sellTiles} cols={2} />
        <SectionCard title={t("provider.business.hub.grow")} subtitle={t("provider.business.hub.growSubtitle")} tiles={growTiles} cols={2} />
      </div>

      {/* FINANCE */}
      <div>
        <div className="mb-3">
          <h2 className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{t("provider.business.hub.finance")}</h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("provider.business.hub.financeSubtitle")}</p>
        </div>
        <div className="bg-emerald-950 rounded-2xl p-4 sm:p-5 text-white">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-amber-800/60 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-amber-200" />
              </div>
              <div>
                <p className="text-[11px] text-emerald-200/70">{t("provider.business.hub.walletBalance")}</p>
                <p className="text-base sm:text-lg font-bold">{formatMoney(wallet?.balance ?? 0)}</p>
                <Link href="/provider/wallet" className="inline-block mt-1.5 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-full transition-colors">
                  {t("provider.business.hub.viewWallet")}
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-5 sm:gap-6 flex-wrap">
              <div>
                <p className="text-[11px] text-emerald-200/70">{t("provider.business.hub.pendingPayouts")}</p>
                <p className="text-xs font-semibold">{formatMoney(wallet?.pending ?? 0)}</p>
              </div>
              <div>
                <p className="text-[11px] text-emerald-200/70">{t("provider.business.hub.onHoldEscrow")}</p>
                <p className="text-xs font-semibold">{formatMoney(wallet?.escrow ?? 0)}</p>
              </div>
              <div>
                <p className="text-[11px] text-emerald-200/70">{t("provider.business.hub.availableToWithdraw")}</p>
                <p className="text-xs font-semibold">{formatMoney(wallet?.available ?? 0)}</p>
              </div>
              <Link href="/provider/wallet" className="hidden sm:block">
                <ChevronRight className="w-5 h-5 text-emerald-200/60" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Saji Protection — one row, matching the mockup: main block + 3
          items side by side, not stacked into a separate row beneath. */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 overflow-x-auto">
        <div className="flex items-center gap-2.5 shrink-0 pr-3 sm:pr-4 border-r border-gray-100 dark:border-gray-700">
          <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white text-xs whitespace-nowrap">{t("provider.business.hub.protectionTitle")}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{t("provider.business.hub.protectionSubtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ShieldCheck className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t("provider.business.hub.escrowProtection")}</p>
            <p className="text-[10px] text-gray-400 whitespace-nowrap">{t("provider.business.hub.escrowProtectionSub")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <MessageCircle className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t("provider.business.hub.disputeSupport")}</p>
            <p className="text-[10px] text-gray-400 whitespace-nowrap">{t("provider.business.hub.disputeSupportSub")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 opacity-60">
          <ShieldAlert className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t("provider.business.hub.businessInsurance")}</p>
            <p className="text-[10px] text-gray-400 whitespace-nowrap">{t("provider.business.hub.comingSoon")}</p>
          </div>
        </div>
      </div>

      {/* Set up shop — the one-time link between this Business account and
          a real ShopkeeperProfile, unlocking the retail tiles above. */}
      <Dialog open={showSetupShop} onOpenChange={setShowSetupShop}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("provider.business.hub.setupShopTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-600 dark:text-gray-400">{t("provider.business.hub.setupShopDesc")}</p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{t("provider.business.hub.shopNameLabel")}</label>
            <Input
              value={shopNameInput}
              onChange={(e) => setShopNameInput(e.target.value)}
              placeholder={overview.businessName}
              disabled={isSettingUpShop}
            />
          </div>
          {setupShopError && <p className="text-xs text-red-600 dark:text-red-400">{setupShopError}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowSetupShop(false)} disabled={isSettingUpShop}>
              {t("common.cancel")}
            </Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleSetupShop} disabled={isSettingUpShop || !shopNameInput.trim()}>
              {isSettingUpShop ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.business.hub.setupShopButton")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
