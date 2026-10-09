"use client"

import { useEffect, useRef, useState } from "react"
import { Home, Briefcase, MessageCircle, Wallet, User, ChevronDown, ChevronLeft, ChevronRight, ImageIcon, Calendar, Wrench, BarChart3, FileText, Users, Store, Gift, Award, ClipboardList, X, MoreHorizontal, Megaphone, LayoutDashboard, Building2, TrendingUp, Navigation, Crown, Rocket, Package, Handshake, Radar, Plus, Camera, Clock, Layers, Receipt, Star, Truck, ShoppingCart, Settings} from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Logo } from "@/components/logo"
import { SajiProLogo } from "@/components/saji-pro-badge"
import { AccountMenu } from "@/components/account-menu"
import { getProviderJobStats } from "@/lib/actions/provider-jobs"
import { getUnreadMessageCount } from "@/lib/actions/messages"
import { useProviderWorkspace } from "@/lib/hooks/useProviderWorkspace"
import { useProCapabilities } from "@/lib/hooks/useProCapabilities"
import { PRO_BUSINESS_TYPE_META, type ProModule } from "@/lib/pro-modules"
import { useLocalization } from "@/lib/hooks/useLocalization"

type ProviderSidebarProps = {
  isOpen: boolean
  onClose: () => void
  isCollapsed: boolean
  onToggleCollapsed: () => void
}

export default function ProviderSidebar({ isOpen, onClose, isCollapsed, onToggleCollapsed }: ProviderSidebarProps) {
  const { t } = useLocalization()
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null)
  const [pendingJobs, setPendingJobs] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    getProviderJobStats().then((stats) => setPendingJobs(stats.pendingCount))
    getUnreadMessageCount().then(setUnreadMessages)
  }, [pathname])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/")

  const { type: workspaceType, isPro } = useProviderWorkspace()

  // Which pages this account sees is decided by what it actually does — the
  // Saji Pro business types it holds (Offer Services / Sell Products / Rent
  // Out Items / Freelance / Teach & Tutor / Consulting), crossed with the
  // admin's module matrix. See lib/pro-modules.ts.
  //
  // This replaces both of the things it used to be: the hand-written "solo"
  // menu, and the `hasShop` block that appended the merchant pages. An
  // account with a shop still gets the shop group, because a ShopkeeperProfile
  // implies PRODUCTS server-side (getMyProCapabilities) — so nothing
  // disappears from an existing account's nav.
  const { modules, workSlot, data: capabilities } = useProCapabilities()

  type MenuItem = { icon: typeof Home; label: string; href: string; exact?: boolean; badge?: number; isNew?: boolean; group: string | null; hasSubmenu?: boolean }

  // The registry names its icons as strings so it can stay a plain module —
  // this is where those names become components.
  const MODULE_ICON: Record<string, typeof Home> = {
    Home, Briefcase, Calendar, Wrench, Package, Rocket, Clock, Megaphone,
    ClipboardList, Handshake, Radar, MessageCircle, Wallet, Store, Users,
    Camera, ImageIcon, FileText, BarChart3, Gift, Crown, Layers, User, Receipt,
    Star, Truck, ShoppingCart, Settings, LayoutDashboard,
  }

  const moduleToItem = (mod: ProModule): MenuItem => ({
    icon: MODULE_ICON[mod.icon] ?? Home,
    label: mod.label,
    href: mod.href,
    exact: mod.exact,
    group: mod.group,
    // Live counts are this component's business, not the registry's.
    badge:
      mod.key === "messages" ? unreadMessages || undefined
      : mod.key === "jobs" ? pendingJobs || undefined
      : undefined,
    hasSubmenu: mod.key === "profile",
  })

  // Adaptive UI Workspaces, unchanged in intent: three genuinely different
  // item sets. What changed is that the solo and business-owner lists are no
  // longer hand-written — their body comes from the account's own modules, so
  // a tutor and a hardware shop get different navs out of the same code.
  // Field technicians are staff inside someone else's business and hold no
  // business types of their own, so their short fixed list stays fixed.
  let menuItems: MenuItem[]
  let primaryCount: number

  if (workspaceType === "business_owner") {
    primaryCount = 4
    menuItems = [
      { icon: LayoutDashboard, label: "Dashboard", href: "/provider/business/dashboard", exact: true, group: null },
      { icon: Navigation, label: "Dispatch", href: "/provider/business/dispatch", group: null },
      { icon: Users, label: "Team Directory", href: "/provider/business/staff", group: null },
      { icon: Building2, label: "Branch Outlets", href: "/provider/business/branches", group: null },
      { icon: TrendingUp, label: "Company Revenue", href: "/provider/business/revenue", group: null },
      // A business owner's own dashboard replaces Home, so that one module is
      // dropped; everything else it does comes from its business types.
      ...modules.filter((m) => m.key !== "home").map(moduleToItem),
      { icon: Handshake, label: "Procurement", href: "/provider/business/procurement", group: "business" },
    ]
  } else if (workspaceType === "field_technician") {
    primaryCount = 3
    menuItems = [
      { icon: Briefcase, label: "Assigned Jobs", href: "/provider/field", exact: true, badge: pendingJobs || undefined, group: null },
      { icon: MessageCircle, label: "Messages", href: "/provider/messages", badge: unreadMessages || undefined, group: null },
      { icon: User, label: "Profile", href: "/provider/profile", hasSubmenu: true, group: null },
      { icon: Wallet, label: "Earnings", href: "/provider/wallet", group: null },
      { icon: Calendar, label: "Availability", href: "/provider/availability", group: null },
      { icon: Megaphone, label: "Requests", href: "/provider/requests", group: null },
    ]
  } else {
    primaryCount = 4
    menuItems = modules.map(moduleToItem)
    // Team-building is a real Saji Pro perk, not a Business-only one — a solo
    // Pro provider can already convert to a Business account from My Account
    // (completeBusinessOnboarding), this just makes that path directly
    // discoverable. Free-tier solo providers don't get this item at all.
    // Slotted next to Earnings so it stays in the ungrouped run rather than
    // landing inside a labelled group.
    if (isPro) {
      const walletAt = menuItems.findIndex((i) => i.href === "/provider/wallet")
      const teamItem: MenuItem = { icon: Users, label: "Team", href: "/provider/team", group: null }
      if (walletAt >= 0) menuItems.splice(walletAt + 1, 0, teamItem)
      else menuItems.push(teamItem)
    }
  }

  // "Plumbing & Shop" reads better than a six-item list, so past two types
  // this counts the rest rather than wrapping onto three lines.
  const activeTypes = capabilities?.active ?? []
  const workspaceSubtitle =
    activeTypes.length === 0
      ? "Services & Shop"
      : activeTypes.length <= 2
        ? activeTypes.map((t2) => PRO_BUSINESS_TYPE_META[t2].workLabel).join(" & ")
        : `${PRO_BUSINESS_TYPE_META[activeTypes[0]].workLabel} +${activeTypes.length - 1} more`

  const GROUP_LABEL: Record<string, string> = {
    shop: "My Shop",
    // Deliberately separate from "My Shop": the till is a counter, not a
    // storefront, and a POS-only account has no storefront at all.
    till: "My Till",
    business: "Business",
    insights: "Insights",
  }

  // Everything beyond the primary bottom-nav items — reachable via the
  // "More" tab as well as the full hamburger drawer above.
  //
  // Saji Pro's own bar is defined outright rather than derived from the menu
  // list above, because the design puts Create in the raised slot and Home
  // beside it — the opposite of the derived shape, where menuItems[0] (Home)
  // is what gets raised. It applies to the solo workspace only: that is the
  // experience the design describes, and a Business Manager's or Field
  // Technician's bar answers to a different job.
  //
  // The fourth slot is labelled by what this account actually does — "Jobs"
  // for a service provider, "Orders" for a shop, and Rentals / Sessions /
  // Projects / Engagements for the rest — and points at the matching page,
  // instead of saying the same thing to everyone and always meaning
  // /provider/jobs.
  //
  // No "More" tab here: the five slots are the design, and everything else is
  // still one tap away through the topbar's menu button, which opens this
  // same sidebar as a drawer.
  const sajiProBottomNav: MenuItem[] | null =
    workspaceType === "solo"
      ? [
          { icon: Home, label: "Home", href: "/provider", exact: true, group: null },
          { icon: Rocket, label: "Offers", href: "/provider/offers", group: null },
          { icon: Plus, label: "Create", href: "/provider/offers/new", group: null },
          {
            icon: workSlot.href.startsWith("/shopkeeper") ? ClipboardList : Briefcase,
            label: workSlot.label,
            href: workSlot.href,
            badge: pendingJobs || undefined,
            group: null,
          },
          { icon: MessageCircle, label: "Inbox", href: "/provider/messages", badge: unreadMessages || undefined, group: null },
        ]
      : null

  const moreItems = sajiProBottomNav
    ? menuItems.filter((item) => !sajiProBottomNav.some((slot) => slot.href === item.href))
    : menuItems.slice(primaryCount)

  const profileMenuItems = [
    { label: "Professional Profile", href: "/provider/profile/professional" },
    { label: "My Account", href: "/provider/profile/account" },
    { label: "Work Area & Skills", href: "/provider/profile/skills" },
    { label: "Verification", href: "/provider/profile/verification" },
    { label: "Certifications", href: "/provider/profile/certifications" },
    { label: "Driver Profile", href: "/provider/profile/driver" },
    { label: "My Work", href: "/provider/portfolio" },
    { label: "Payment Methods", href: "/provider/profile/payments" },
    { label: "Star Ratings", href: "/provider/profile/ratings" },
    { label: "Help & Support", href: "/provider/profile/help" },
    { label: "Settings", href: "/provider/profile/settings" },
  ]

  const isItemActive = (item: typeof menuItems[0]) => {
    const [itemPath, itemQuery] = item.href.split("?")
    const pathMatches = item.exact ? pathname === itemPath : pathname === itemPath || pathname.startsWith(itemPath + "/")
    if (!pathMatches) return false
    // Today's Jobs and My Calendar both point at /provider/jobs, disambiguated
    // only by ?tab= — without this, whichever one matched pathname first
    // stayed visually "active" even while looking at the other's tab.
    const itemTab = itemQuery ? new URLSearchParams(itemQuery).get("tab") : null
    const currentTab = searchParams.get("tab")
    return itemTab ? currentTab === itemTab : !currentTab
  }

  // Mobile bottom nav: the first primary item (Home / Dashboard / Assigned
  // Jobs, depending on workspace — always menuItems[0] now) gets raised
  // into a centered, elevated circular button instead of sitting in the
  // linear row like every other tab, the same "home icon front and center"
  // pattern most consumer apps use. The rest of the primary items split
  // evenly on either side of it.
  const [mobileHomeItem, ...mobileOtherPrimary] = sajiProBottomNav
    ? // Create sits in the middle of the five, so it is the raised one and the
      // other four split evenly around it.
      [sajiProBottomNav[2], sajiProBottomNav[0], sajiProBottomNav[1], sajiProBottomNav[3], sajiProBottomNav[4]]
    : menuItems.slice(0, primaryCount)
  const mobileHalf = Math.ceil(mobileOtherPrimary.length / 2)
  const mobileLeftItems = mobileOtherPrimary.slice(0, mobileHalf)
  const mobileRightItems = mobileOtherPrimary.slice(mobileHalf)
  const MobileHomeIcon = mobileHomeItem?.icon
  const mobileHomeActive = mobileHomeItem ? isItemActive(mobileHomeItem) : false

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed left-0 top-0 ${isCollapsed ? "lg:w-20" : "lg:w-64"} w-64 h-dvh bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-[transform,width] duration-300 z-50 flex flex-col`}
      >
        <button
          onClick={onToggleCollapsed}
          aria-label={isCollapsed ? t("common.sidebar.expand") : t("common.sidebar.collapse")}
          title={isCollapsed ? t("common.sidebar.expand") : t("common.sidebar.collapse")}
          className="hidden lg:flex absolute -right-3 top-20 z-10 w-6 h-6 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        {/* Sidebar Header */}
        <div className={`p-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between ${isCollapsed ? "lg:justify-center" : ""}`}>
          <div className={isCollapsed ? "lg:hidden" : ""}>
            <SajiProLogo size="md" showText />
            {/* One portal for every kind of Saji Pro, so instead of naming one
                trade this names what this particular account does. Falls back
                to the generic line until the business types have loaded. */}
            <p className="text-[11px] text-muted-foreground mt-1 truncate">{workspaceSubtitle}</p>
          </div>
          <div className={`hidden ${isCollapsed ? "lg:block" : ""}`}>
            <Logo size="md" showText={false} />
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="lg:hidden p-1.5 -mt-1 -mr-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Info / Account Switcher */}
        <div className={`p-3 border-b border-gray-200 dark:border-gray-700 ${isCollapsed ? "lg:hidden" : ""}`}>
          <AccountMenu alwaysShowLabel />
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item, i) => {
            const IconComponent = item.icon
            const active = isItemActive(item)
            const showGroupLabel = item.group && item.group !== menuItems[i - 1]?.group
            const groupLabel = showGroupLabel && (
              <p className={`px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 ${isCollapsed ? "lg:hidden" : ""}`}>
                {GROUP_LABEL[item.group as string]}
              </p>
            )

            if (item.hasSubmenu) {
              return (
                <div key={item.href}>
                  {groupLabel}
                  <button
                    onClick={() => setExpandedMenu(expandedMenu === "profile" ? null : "profile")}
                    title={isCollapsed ? item.label : undefined}
                    className={`w-full flex items-center justify-between py-2.5 rounded-lg transition-all ${isCollapsed ? "lg:justify-center px-2" : "px-3"} ${
                      active
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <IconComponent className="w-5 h-5 flex-shrink-0" />
                      <span className={`font-medium text-xs ${isCollapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${isCollapsed ? "lg:hidden" : ""} ${expandedMenu === "profile" ? "rotate-180" : ""}`}
                    />
                  </button>

                  {expandedMenu === "profile" && (
                    <div className={`mt-1 ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-1 ${isCollapsed ? "lg:hidden" : ""}`}>
                      {profileMenuItems.map((subitem) => (
                        <Link
                          key={subitem.href}
                          href={subitem.href}
                          onClick={() => onClose()}
                          className={`flex items-center justify-between text-xs py-2 px-3 rounded-lg transition-colors ${
                            pathname === subitem.href
                              ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                          }`}
                        >
                          {subitem.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div key={item.href}>
                {groupLabel}
                <Link
                  href={item.href}
                  onClick={() => onClose()}
                  title={isCollapsed ? item.label : undefined}
                  className={`flex items-center justify-between py-2.5 rounded-lg transition-all ${isCollapsed ? "lg:justify-center lg:relative px-2" : "px-3"} ${
                    active
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <IconComponent className="w-5 h-5 flex-shrink-0" />
                    <span className={`font-medium text-xs ${isCollapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                    {item.isNew && (
                      <span className={`bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${isCollapsed ? "lg:hidden" : ""}`}>
                        NEW
                      </span>
                    )}
                  </div>
                  {item.badge && (
                    <span className={`bg-red-500 text-white text-[11px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 ${isCollapsed ? "lg:absolute lg:top-1 lg:right-1 lg:w-4 lg:h-4 lg:min-w-0 lg:text-[9px] lg:px-0" : ""}`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              </div>
            )
          })}
        </nav>

      </aside>

      {/* Mobile Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => onClose()} />
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40 safe-area-inset-bottom">
        <div className="flex items-end justify-around py-2">
          {mobileLeftItems.map((item) => {
            const IconComponent = item.icon
            const active = isItemActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors ${
                  active
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <div className="relative">
                  <IconComponent className="w-6 h-6" />
                  {item.badge && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}

          {/* Home — centered and raised above the rest of the bar */}
          {mobileHomeItem && MobileHomeIcon && (
            <Link href={mobileHomeItem.href} className="relative -mt-6 flex flex-col items-center gap-0.5 px-2">
              <div
                className={`relative flex items-center justify-center w-14 h-14 rounded-full shadow-lg ring-4 ring-white dark:ring-gray-800 transition-colors ${
                  mobileHomeActive ? "bg-blue-700" : "bg-blue-600"
                } text-white`}
              >
                <MobileHomeIcon className="w-6 h-6" />
                {mobileHomeItem.badge && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 ring-2 ring-white dark:ring-gray-800">
                    {mobileHomeItem.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-medium ${mobileHomeActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}>
                {mobileHomeItem.label}
              </span>
            </Link>
          )}

          {mobileRightItems.map((item) => {
            const IconComponent = item.icon
            const active = isItemActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors ${
                  active
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <div className="relative">
                  <IconComponent className="w-6 h-6" />
                  {item.badge && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}

          {/* "More" stays on every workspace, Saji Pro included. The five
              designed slots cannot reach Offers, Rentals, Earnings, Team,
              Quotes, the Business group or the Insights group, and the
              topbar's menu button is not where people look for them — this
              is. */}
          <div ref={moreMenuRef} className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors ${
                showMoreMenu || moreItems.some((item) => isItemActive(item))
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <MoreHorizontal className="w-6 h-6" />
              <span className="text-[10px] font-medium">More</span>
            </button>

            {showMoreMenu && (
              <div className="absolute bottom-full right-0 mb-2 w-56 max-h-[70vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1.5 z-50">
                {moreItems.map((item, i) => {
                  const IconComponent = item.icon
                  const active = isItemActive(item)
                  const showGroupLabel = item.group && item.group !== moreItems[i - 1]?.group
                  return (
                    <div key={item.href}>
                      {showGroupLabel && (
                        <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                          {GROUP_LABEL[item.group as string]}
                        </p>
                      )}
                      <Link
                        href={item.href}
                        onClick={() => setShowMoreMenu(false)}
                        className={`flex items-center gap-3 px-4 py-2.5 text-xs transition-colors ${
                          active
                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                        <span className="flex-1">{item.label}</span>
                        {item.isNew && (
                          <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-full px-1.5 py-0.5">
                            NEW
                          </span>
                        )}
                        {item.badge && (
                          <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  )
}
