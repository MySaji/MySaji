"use client"

import React from "react"

import { useState, useRef, useEffect } from "react"
import {
  Store, Package, ShoppingCart, MessageCircle, Wallet, User, Settings, LogOut,
  X, Menu, BarChart3, Bell, Users, Star, Tag, Search, MoreHorizontal,
  Lock, Clock, AlertTriangle, Truck, ImageIcon, UserCog, Megaphone, ChevronLeft, ChevronRight
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed"
import { LoadingScreen } from "@/components/loading-screen"
import FloatingChatButton from "@/components/floating-chat-button"
import { AccountMenu } from "@/components/account-menu"
import { useNotificationBell } from "@/lib/hooks/useNotificationBell"
import { getShopkeeperActiveOrderCount } from "@/lib/actions/shopkeeper-orders"
import { getUnreadMessageCount } from "@/lib/actions/messages"
import { getMyShopAccount } from "@/lib/actions/shopkeeper-account"
import { formatRelativeTime } from "@/lib/format"
import { AccountSuspendedScreen } from "@/components/account-status/account-suspended-screen"

const NOTIF_ICON: Record<string, typeof ShoppingCart> = {
  JOB: ShoppingCart,
  MESSAGE: MessageCircle,
  PAYMENT: Wallet,
  REVIEW: Star,
  SYSTEM: Bell,
  PROMO: Tag,
  ANNOUNCEMENT: Bell,
}

const NOTIF_COLOR: Record<string, string> = {
  JOB: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  MESSAGE: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400",
  PAYMENT: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
  REVIEW: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
  SYSTEM: "bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400",
  PROMO: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
  ANNOUNCEMENT: "bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400",
}

// Reachable regardless of shop-registration status: Dashboard (to see status),
// Profile/Settings (account-level, not shop-management), and the registration
// wizard itself (otherwise a locked shopkeeper could never complete it).
function isExemptPath(path: string): boolean {
  return (
    path === "/shopkeeper" ||
    path.startsWith("/shopkeeper/profile") ||
    path.startsWith("/shopkeeper/settings") ||
    path.startsWith("/shopkeeper/register") ||
    path.startsWith("/shopkeeper/notifications") ||
    path.startsWith("/shopkeeper/messages") ||
    path.startsWith("/shopkeeper/distributors") ||
    path.startsWith("/shopkeeper/wholesale-orders")
  )
}

export default function ShopkeeperLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isCollapsed, toggle: toggleCollapsed } = useSidebarCollapsed()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLocalization()
  const { isAuthenticated, isLoading, user, logout } = useAuthContext()

  const [orderBadge, setOrderBadge] = useState(0)
  const [messageBadge, setMessageBadge] = useState(0)
  const [hasSubmittedRegistration, setHasSubmittedRegistration] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationBell(
    10, mounted && isAuthenticated && user?.role === "shopkeeper",
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || isLoading) return
    if (!isAuthenticated) { router.push("/"); return }
    // A shopkeeper who just switched to another role via the account
    // switcher (see components/account-menu.tsx) still has this layout
    // mounted for a moment while that control's own effect navigates them on
    // to the destination portal — bouncing away here instead would race
    // that navigation and win, since both effects react to the same session
    // update. Tolerating all 3 switchable roles (not just provider) covers
    // every direction that switch can go. Every other role/logged-out case
    // still gets sent home as before.
    if (user?.role !== "shopkeeper" && user?.role !== "provider" && user?.role !== "customer") {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router, mounted])

  const isShopLocked = user?.role === "shopkeeper" && user?.kycStatus !== "approved"

  // Sidebar links are disabled for non-exempt pages, but a locked shopkeeper
  // could still reach them by typing the URL directly — redirect those back
  // to the Dashboard so the gate isn't just cosmetic.
  useEffect(() => {
    if (!mounted || isLoading || !isAuthenticated || user?.role !== "shopkeeper") return
    if (isShopLocked && pathname && !isExemptPath(pathname)) {
      router.replace("/shopkeeper")
    }
  }, [mounted, isLoading, isAuthenticated, user, isShopLocked, pathname, router])

  useEffect(() => {
    if (!mounted || !isAuthenticated || user?.role !== "shopkeeper") return
    getShopkeeperActiveOrderCount().then(setOrderBadge)
    getUnreadMessageCount().then(setMessageBadge)
    getMyShopAccount().then((account) => {
      if (account) {
        setHasSubmittedRegistration(account.hasSubmittedRegistration)
        setRejectionReason(account.rejectionReason)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isAuthenticated, user])

  const isActive = (path: string) => pathname === path || (path !== "/shopkeeper" && pathname.startsWith(path + "/"))
  const isExactActive = (path: string) => pathname === path

  const menuItems = [
    { icon: Store, label: t("shopkeeper.layout.navDashboard"), href: "/shopkeeper", group: null as string | null },
    { icon: Package, label: t("shopkeeper.layout.navProducts"), href: "/shopkeeper/products", group: null },
    { icon: ShoppingCart, label: t("shopkeeper.layout.navOrders"), href: "/shopkeeper/orders", badge: orderBadge, group: null },
    { icon: Megaphone, label: t("shopkeeper.layout.navRequests"), href: "/shopkeeper/requests", group: null },
    { icon: UserCog, label: t("shopkeeper.layout.navCustomers"), href: "/shopkeeper/customers", group: null },
    { icon: MessageCircle, label: t("shopkeeper.layout.navMessages"), href: "/shopkeeper/messages", badge: messageBadge, group: "communication" },
    { icon: Truck, label: t("shopkeeper.layout.navDistributors"), href: "/shopkeeper/distributors", group: "wholesale" },
    { icon: Package, label: t("shopkeeper.layout.navWholesaleOrders"), href: "/shopkeeper/wholesale-orders", group: "wholesale" },
    { icon: ImageIcon, label: t("shopkeeper.layout.navShowcase"), href: "/shopkeeper/showcase", group: "marketing" },
    { icon: Users, label: t("shopkeeper.layout.navEndorsements"), href: "/shopkeeper/endorsements", group: "marketing" },
    { icon: Tag, label: t("shopkeeper.layout.navPromotions"), href: "/shopkeeper/promotions", group: "marketing" },
    { icon: Star, label: t("shopkeeper.layout.navReviews"), href: "/shopkeeper/reviews", group: "marketing" },
    { icon: Wallet, label: t("shopkeeper.layout.navEarnings"), href: "/shopkeeper/earnings", group: "finance" },
    { icon: BarChart3, label: t("shopkeeper.layout.navAnalytics"), href: "/shopkeeper/analytics", group: "finance" },
    { icon: User, label: t("shopkeeper.layout.navProfile"), href: "/shopkeeper/profile", group: null },
  ]

  const GROUP_LABEL: Record<string, string> = {
    communication: t("shopkeeper.layout.groupCommunication"),
    wholesale: t("shopkeeper.layout.groupWholesale"),
    marketing: t("shopkeeper.layout.groupMarketing"),
    finance: t("shopkeeper.layout.groupFinance"),
  }

  // Bottom nav: first 4 + More
  const bottomNavItems = menuItems.slice(0, 4)
  const moreNavItems = menuItems.slice(4)

  const handleLogout = () => {
    logout()
    router.push("/")
  }

  const handleNotificationClick = async (notification: Parameters<typeof markRead>[0]) => {
    await markRead(notification)
    setNotificationsOpen(false)
    router.push(`/shopkeeper/notifications/${notification.id}`)
  }

  const handleMarkAllRead = () => markAllRead()

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Deliberately keyed on `user` rather than `isLoading`/`isAuthenticated`
  // for the role check — see the identical fix and rationale in
  // app/provider/layout.tsx: next-auth's `update()` (used by refreshSession()
  // inside components/account-menu.tsx's role switcher) flips its shared
  // `status` to "loading" for the duration of that request, which would
  // otherwise unmount everything here and lose local state, even though the
  // already-cached `user` data hasn't gone anywhere. Tolerating all 3
  // switchable roles here (not just provider) avoids a race against the
  // switcher's own hard-navigation effect, whichever role it's headed to.
  if (!mounted) return <LoadingScreen />
  if (!user) return isLoading ? <LoadingScreen /> : null
  if (user.role !== "shopkeeper" && user.role !== "provider" && user.role !== "customer") return null

  const isSuspended = user?.isActive === false
  if (isSuspended && !pathname?.startsWith("/shopkeeper/messages")) {
    return <AccountSuspendedScreen messagesBasePath="/shopkeeper/messages" onLogout={handleLogout} />
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-amber-600 focus:px-4 focus:py-2 focus:text-xs focus:font-medium focus:text-white"
      >
        {t("customer.layout.skipToContent")}
      </a>
      <FloatingChatButton />
      {/* Mobile Sidebar Toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-lg"
        aria-label={t("shopkeeper.layout.toggleMenu")}
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed lg:sticky left-0 top-0 ${isCollapsed ? "lg:w-20" : "lg:w-64"} w-64 h-dvh bg-gradient-to-b from-amber-600 to-orange-700 dark:from-amber-800 dark:to-orange-900 text-white transition-[transform,width] duration-300 z-40 flex flex-col overflow-hidden`}
      >
        <button
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? t("common.sidebar.expand") : t("common.sidebar.collapse")}
          title={isCollapsed ? t("common.sidebar.expand") : t("common.sidebar.collapse")}
          className="hidden lg:flex absolute -right-3 top-20 z-10 w-6 h-6 items-center justify-center rounded-full border border-amber-500/40 bg-amber-600 dark:bg-amber-800 text-white shadow-md hover:bg-amber-500 transition-colors"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        {/* Brand Header */}
        <div className={`p-5 border-b border-amber-500/40 mt-14 lg:mt-0 flex-shrink-0 ${isCollapsed ? "lg:px-2" : ""}`}>
          <div className={`flex items-center gap-3 ${isCollapsed ? "lg:justify-center" : ""}`}>
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className={isCollapsed ? "lg:hidden" : ""}>
              <h2 className="text-base font-bold leading-tight">{t("shopkeeper.layout.brandName")}</h2>
              <p className="text-[11px] text-amber-200">{t("shopkeeper.layout.portalName")}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">
          <div className="space-y-1">
            {menuItems.map((item, i) => {
              const IconComponent = item.icon
              const active = item.href === "/shopkeeper" ? isExactActive(item.href) : isActive(item.href)
              const locked = isShopLocked && !isExemptPath(item.href)
              const showGroupLabel = item.group && item.group !== menuItems[i - 1]?.group
              const groupLabel = showGroupLabel && (
                <p className={`px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200/70 ${isCollapsed ? "lg:hidden" : ""}`}>
                  {GROUP_LABEL[item.group as string]}
                </p>
              )
              if (locked) {
                return (
                  <div key={item.href}>
                    {groupLabel}
                    <div
                      title={t("shopkeeper.layout.lockedTooltip")}
                      aria-disabled="true"
                      className={`flex items-center gap-3 py-2.5 rounded-lg text-xs font-medium opacity-40 cursor-not-allowed select-none ${isCollapsed ? "lg:justify-center px-2" : "px-3"}`}
                    >
                      <IconComponent className="w-[18px] h-[18px] flex-shrink-0" />
                      <span className={`flex-1 ${isCollapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                      <Lock className={`w-3.5 h-3.5 flex-shrink-0 ${isCollapsed ? "lg:hidden" : ""}`} />
                    </div>
                  </div>
                )
              }
              return (
                <div key={item.href}>
                  {groupLabel}
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    title={isCollapsed ? item.label : undefined}
                    className={`relative flex items-center gap-3 py-2.5 rounded-lg transition-all text-xs font-medium ${isCollapsed ? "lg:justify-center px-2" : "px-3"} ${
                      active
                        ? "bg-white/20 shadow-lg"
                        : "hover:bg-white/10"
                    }`}
                  >
                    <IconComponent className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={`flex-1 ${isCollapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                    {item.badge && (
                      <span className={`bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0 ${isCollapsed ? "lg:absolute lg:top-1 lg:right-1 lg:w-4 lg:h-4" : "w-5 h-5"}`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </div>
              )
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-amber-500/40 flex-shrink-0 space-y-1.5">
          <Link href="/shopkeeper/settings" onClick={() => setSidebarOpen(false)}>
            <button title={isCollapsed ? t("settings.title") : undefined} className={`w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium py-2.5 rounded-lg text-xs transition-colors ${isCollapsed ? "lg:gap-0" : ""}`}>
              <Settings size={16} className="flex-shrink-0" />
              <span className={isCollapsed ? "lg:hidden" : ""}>{t("settings.title")}</span>
            </button>
          </Link>
          <button
            onClick={handleLogout}
            title={isCollapsed ? t("auth.logout") : undefined}
            className={`w-full bg-red-500/80 hover:bg-red-500 text-white font-medium py-2.5 rounded-lg text-xs flex items-center justify-center gap-2 transition-colors ${isCollapsed ? "lg:gap-0" : ""}`}
          >
            <LogOut size={16} className="flex-shrink-0" />
            <span className={isCollapsed ? "lg:hidden" : ""}>{t("auth.logout")}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left: Page title area (spacer for mobile hamburger) */}
            <div className="flex items-center gap-3">
              <div className="w-9 lg:hidden" /> {/* Spacer for hamburger */}
              <div className="hidden sm:flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1.5 w-64">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t("shopkeeper.layout.searchPlaceholder")}
                  className="bg-transparent text-xs outline-none flex-1 text-gray-700 dark:text-gray-200 placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <div ref={notifRef} className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label={t("shopkeeper.layout.notificationsTitle")}
                >
                  <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown */}
                {notificationsOpen && (
                  <div className="fixed left-4 right-4 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{t("shopkeeper.layout.notificationsTitle")}</h3>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllRead} className="text-[11px] text-amber-600 hover:text-amber-700 font-medium">
                          {t("shopkeeper.layout.markAllRead")}
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-gray-500 dark:text-gray-400">{t("shopkeeper.layout.noNotifications")}</div>
                      ) : (
                        notifications.map((notif) => {
                          const Icon = NOTIF_ICON[notif.type] ?? Bell
                          return (
                            <button
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`w-full p-3 flex gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-0 ${
                                !notif.isRead ? "bg-amber-50/50 dark:bg-amber-900/10" : ""
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${NOTIF_COLOR[notif.type] ?? NOTIF_COLOR.SYSTEM}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className={`text-xs ${!notif.isRead ? "font-semibold text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-300"}`}>
                                    {notif.title}
                                  </p>
                                  {!notif.isRead && (
                                    <span className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0 mt-1.5" />
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{notif.message}</p>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{formatRelativeTime(notif.createdAt)}</p>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                    <button
                      onClick={() => { setNotificationsOpen(false); router.push("/shopkeeper/notifications") }}
                      className="block w-full p-3 text-center text-xs text-amber-600 dark:text-amber-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-t border-gray-100 dark:border-gray-700/50"
                    >
                      {t("shopkeeper.layout.viewAllNotifications")}
                    </button>
                  </div>
                )}
              </div>

              {/* Account / role switcher */}
              <AccountMenu />
            </div>
          </div>
        </header>

        {/* Page Content */}
        {/* pb-36 / lg:pb-24 reserve the floating chat button's footprint as
            well as the bottom nav's; see app/customer/layout.tsx. */}
        <main id="main-content" className="flex-1 pb-36 lg:pb-24">
          {isShopLocked && !pathname?.startsWith("/shopkeeper/register") && (
            <div className="m-4 lg:m-6 mb-0">
              {user?.kycStatus === "rejected" ? (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 p-4">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-red-800 dark:text-red-300">{t("shopkeeper.layout.registrationRejectedTitle")}</p>
                    <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5">
                      {t("shopkeeper.layout.registrationRejectedMessage", { reason: rejectionReason ?? t("shopkeeper.layout.registrationRejectedDefaultReason") })}
                    </p>
                  </div>
                  <Link
                    href="/shopkeeper/register"
                    className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {t("shopkeeper.layout.resubmit")}
                  </Link>
                </div>
              ) : hasSubmittedRegistration ? (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20 p-4">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t("shopkeeper.layout.registrationUnderReviewTitle")}</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      {t("shopkeeper.layout.registrationUnderReviewHint")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20 p-4">
                  <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t("shopkeeper.layout.registrationIncompleteTitle")}</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      {t("shopkeeper.layout.registrationIncompleteHint")}
                    </p>
                  </div>
                  <Link
                    href="/shopkeeper/register"
                    className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {t("shopkeeper.layout.getStarted")}
                  </Link>
                </div>
              )}
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <div className="flex justify-around items-center h-16 px-1">
          {bottomNavItems.map((item) => {
            const IconComponent = item.icon
            const active = item.href === "/shopkeeper" ? isExactActive(item.href) : isActive(item.href)
            const locked = isShopLocked && !isExemptPath(item.href)
            if (locked) {
              return (
                <div
                  key={item.href}
                  title={t("shopkeeper.layout.lockedTooltip")}
                  aria-disabled="true"
                  className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg min-w-0 text-gray-300 dark:text-gray-600 cursor-not-allowed select-none"
                >
                  <div className="relative">
                    <IconComponent className="w-5 h-5" />
                    <Lock className="absolute -top-1.5 -right-2 w-3 h-3" />
                  </div>
                  <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                </div>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 ${
                  active
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <div className="relative">
                  <IconComponent className="w-5 h-5" />
                  {item.badge && (
                    <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              </Link>
            )
          })}

          {/* More Menu */}
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
                moreMenuOpen || moreNavItems.some(item => item.href === "/shopkeeper" ? isExactActive(item.href) : isActive(item.href))
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight">{t("shopkeeper.layout.moreLabel")}</span>
            </button>

            {/* More Menu Popup */}
            {moreMenuOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-1.5">
                  {moreNavItems.map((item) => {
                    const IconComponent = item.icon
                    const active = item.href === "/shopkeeper" ? isExactActive(item.href) : isActive(item.href)
                    const locked = isShopLocked && !isExemptPath(item.href)
                    if (locked) {
                      return (
                        <div
                          key={item.href}
                          title={t("shopkeeper.layout.lockedTooltip")}
                          aria-disabled="true"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-gray-400 dark:text-gray-600 cursor-not-allowed select-none"
                        >
                          <IconComponent className="w-4 h-4 flex-shrink-0" />
                          <span className="flex-1">{item.label}</span>
                          <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                        </div>
                      )
                    }
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-xs ${
                          active
                            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-semibold"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                      >
                        <IconComponent className="w-4 h-4 flex-shrink-0" />
                        <span>{item.label}</span>
                        {item.badge && (
                          <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </div>
  )
}
