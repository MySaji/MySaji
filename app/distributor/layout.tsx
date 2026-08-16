"use client"

import React from "react"

import { useState, useRef, useEffect } from "react"
import {
  Building2, Package, ShoppingCart, MessageCircle, User, Settings, LogOut,
  X, Menu, BarChart3, Bell, Warehouse, Search, ChevronDown, MoreHorizontal,
  Lock, Clock, AlertTriangle, Wallet, Handshake,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { LoadingScreen } from "@/components/loading-screen"
import FloatingChatButton from "@/components/floating-chat-button"
import { useNotificationBell } from "@/lib/hooks/useNotificationBell"
import { getUnreadMessageCount } from "@/lib/actions/messages"
import { getMyDistributorAccount } from "@/lib/actions/distributor-account"
import { formatRelativeTime } from "@/lib/format"
import { AccountSuspendedScreen } from "@/components/account-status/account-suspended-screen"

const NOTIF_ICON: Record<string, typeof ShoppingCart> = {
  JOB: ShoppingCart,
  MESSAGE: MessageCircle,
  PAYMENT: Package,
  REVIEW: Bell,
  SYSTEM: Bell,
  PROMO: Bell,
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

// Reachable regardless of company-registration status: Dashboard (to see
// status), Profile/Settings (account-level, not distribution-management),
// and the registration wizard itself.
function isExemptPath(path: string): boolean {
  return (
    path === "/distributor" ||
    path.startsWith("/distributor/profile") ||
    path.startsWith("/distributor/settings") ||
    path.startsWith("/distributor/register") ||
    path.startsWith("/distributor/notifications") ||
    path.startsWith("/distributor/messages")
  )
}

export default function DistributorLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, isLoading, user, logout } = useAuthContext()
  const { t } = useLocalization()

  const [messageBadge, setMessageBadge] = useState(0)
  const [companyName, setCompanyName] = useState("SAJI Distributor")
  const [isVerified, setIsVerified] = useState(false)
  const [hasSubmittedRegistration, setHasSubmittedRegistration] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationBell(
    10, mounted && isAuthenticated && user?.role === "distributor",
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || isLoading) return
    if (!isAuthenticated) { router.push("/"); return }
    if (user?.role !== "distributor") {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router, mounted])

  const isCompanyLocked = user?.role === "distributor" && user?.kycStatus !== "approved"

  // Sidebar links are disabled for non-exempt pages, but a locked distributor
  // could still reach them by typing the URL directly — redirect those back
  // to the Dashboard so the gate isn't just cosmetic.
  useEffect(() => {
    if (!mounted || isLoading || !isAuthenticated || user?.role !== "distributor") return
    if (isCompanyLocked && pathname && !isExemptPath(pathname)) {
      router.replace("/distributor")
    }
  }, [mounted, isLoading, isAuthenticated, user, isCompanyLocked, pathname, router])

  useEffect(() => {
    if (!mounted || !isAuthenticated || user?.role !== "distributor") return
    getUnreadMessageCount().then(setMessageBadge)
    getMyDistributorAccount().then((account) => {
      if (account) {
        setCompanyName(account.companyName)
        setIsVerified(account.isVerified)
        setHasSubmittedRegistration(account.hasSubmittedRegistration)
        setRejectionReason(account.rejectionReason)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isAuthenticated, user])

  const isActive = (path: string) => pathname === path || (path !== "/distributor" && pathname.startsWith(path + "/"))
  const isExactActive = (path: string) => pathname === path

  const menuItems = [
    { icon: Building2, label: t("distributor.nav.dashboard"), href: "/distributor" },
    { icon: Warehouse, label: t("distributor.nav.locations"), href: "/distributor/locations" },
    { icon: Package, label: t("distributor.nav.products"), href: "/distributor/products" },
    { icon: ShoppingCart, label: t("distributor.nav.orders"), href: "/distributor/orders" },
    { icon: Handshake, label: "Procurement Requests", href: "/distributor/procurement" },
    { icon: Wallet, label: t("distributor.nav.wallet"), href: "/distributor/wallet" },
    { icon: BarChart3, label: t("distributor.nav.analytics"), href: "/distributor/analytics" },
    { icon: MessageCircle, label: t("nav.messages"), href: "/distributor/messages", badge: messageBadge },
    { icon: User, label: t("distributor.nav.profile"), href: "/distributor/profile" },
  ]

  const bottomNavItems = menuItems.slice(0, 4)
  const moreNavItems = menuItems.slice(4)

  const handleLogout = () => {
    logout()
    router.push("/")
  }

  const handleNotificationClick = async (notification: Parameters<typeof markRead>[0]) => {
    await markRead(notification)
    setNotificationsOpen(false)
    router.push(`/distributor/notifications/${notification.id}`)
  }

  const handleMarkAllRead = () => markAllRead()

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

  if (!mounted) return <LoadingScreen />
  if (!user) return isLoading ? <LoadingScreen /> : null
  if (user.role !== "distributor") return null

  const isSuspended = user?.isActive === false
  if (isSuspended && !pathname?.startsWith("/distributor/messages")) {
    return <AccountSuspendedScreen messagesBasePath="/distributor/messages" onLogout={handleLogout} />
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <FloatingChatButton />
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors shadow-lg"
        aria-label={t("distributor.layout.toggleMenu")}
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed lg:sticky left-0 top-0 w-64 h-dvh bg-gradient-to-b from-teal-700 to-cyan-900 dark:from-teal-900 dark:to-cyan-950 text-white transition-transform duration-300 z-40 flex flex-col overflow-hidden`}
      >
        <div className="p-5 border-b border-teal-500/40 mt-14 lg:mt-0 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">SAJI Wholesale</h2>
              <p className="text-xs text-teal-200">{t("distributor.layout.portalTagline")}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const IconComponent = item.icon
              const active = item.href === "/distributor" ? isExactActive(item.href) : isActive(item.href)
              const locked = isCompanyLocked && !isExemptPath(item.href)
              if (locked) {
                return (
                  <div
                    key={item.href}
                    title={t("distributor.layout.lockedTooltip")}
                    aria-disabled="true"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium opacity-40 cursor-not-allowed select-none"
                  >
                    <IconComponent className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                  </div>
                )
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                    active ? "bg-white/20 shadow-lg" : "hover:bg-white/10"
                  }`}
                >
                  <IconComponent className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && (
                    <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="p-3 border-t border-teal-500/40 flex-shrink-0 space-y-1.5">
          <Link href="/distributor/settings" onClick={() => setSidebarOpen(false)}>
            <button className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              <Settings size={16} />
              {t("settings.title")}
            </button>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full bg-red-500/80 hover:bg-red-500 text-white font-medium py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut size={16} />
            {t("auth.logout")}
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-9 lg:hidden" />
              <div className="hidden sm:flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1.5 w-64">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t("distributor.layout.searchPlaceholder")}
                  className="bg-transparent text-sm outline-none flex-1 text-gray-700 dark:text-gray-200 placeholder:text-gray-400"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div ref={notifRef} className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label={t("distributor.layout.notificationsAriaLabel")}
                >
                  <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{t("settings.notifications")}</h3>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllRead} className="text-xs text-teal-600 hover:text-teal-700 font-medium">
                          {t("distributor.layout.markAllRead")}
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{t("distributor.layout.noNotifications")}</div>
                      ) : (
                        notifications.map((notif) => {
                          const Icon = NOTIF_ICON[notif.type] ?? Bell
                          return (
                            <button
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`w-full p-3 flex gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-0 ${
                                !notif.isRead ? "bg-teal-50/50 dark:bg-teal-900/10" : ""
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${NOTIF_COLOR[notif.type] ?? NOTIF_COLOR.SYSTEM}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className={`text-sm ${!notif.isRead ? "font-semibold text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-300"}`}>
                                    {notif.title}
                                  </p>
                                  {!notif.isRead && (
                                    <span className="w-2 h-2 bg-teal-500 rounded-full flex-shrink-0 mt-1.5" />
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{notif.message}</p>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{formatRelativeTime(notif.createdAt)}</p>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                    <button
                      onClick={() => { setNotificationsOpen(false); router.push("/distributor/notifications") }}
                      className="block w-full p-3 text-center text-sm text-teal-600 dark:text-teal-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-t border-gray-100 dark:border-gray-700/50"
                    >
                      {t("distributor.layout.viewAllNotifications")}
                    </button>
                  </div>
                )}
              </div>

              <Link href="/distributor/profile" className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center text-white text-sm font-bold">
                  {companyName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">{companyName}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{isVerified ? t("distributor.common.verifiedDistributor") : t("distributor.layout.companyOwner")}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 hidden md:block" />
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 pb-20 lg:pb-0">
          {isCompanyLocked && !pathname?.startsWith("/distributor/register") && (
            <div className="m-4 lg:m-6 mb-0">
              {user?.kycStatus === "rejected" ? (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 p-4">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-800 dark:text-red-300">{t("distributor.layout.rejectedTitle")}</p>
                    <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                      {rejectionReason ?? t("distributor.layout.rejectedFallbackReason")} {t("distributor.layout.rejectedReviewPrompt")}
                    </p>
                  </div>
                  <Link
                    href="/distributor/register"
                    className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {t("distributor.layout.resubmit")}
                  </Link>
                </div>
              ) : hasSubmittedRegistration ? (
                <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 dark:border-teal-900/50 dark:bg-teal-900/20 p-4">
                  <Clock className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-teal-800 dark:text-teal-300">{t("distributor.layout.underReviewTitle")}</p>
                    <p className="text-xs text-teal-700 dark:text-teal-400 mt-0.5">
                      {t("distributor.layout.underReviewBody")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 dark:border-teal-900/50 dark:bg-teal-900/20 p-4">
                  <Lock className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-teal-800 dark:text-teal-300">{t("distributor.layout.completeRegistrationTitle")}</p>
                    <p className="text-xs text-teal-700 dark:text-teal-400 mt-0.5">
                      {t("distributor.layout.completeRegistrationBody")}
                    </p>
                  </div>
                  <Link
                    href="/distributor/register"
                    className="flex-shrink-0 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {t("distributor.layout.getStarted")}
                  </Link>
                </div>
              )}
            </div>
          )}
          {children}
        </main>
      </div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <div className="flex justify-around items-center h-16 px-1">
          {bottomNavItems.map((item) => {
            const IconComponent = item.icon
            const active = item.href === "/distributor" ? isExactActive(item.href) : isActive(item.href)
            const locked = isCompanyLocked && !isExemptPath(item.href)
            if (locked) {
              return (
                <div
                  key={item.href}
                  title={t("distributor.layout.lockedTooltip")}
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
                  active ? "text-teal-600 dark:text-teal-400" : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <div className="relative">
                  <IconComponent className="w-5 h-5" />
                  {!!item.badge && (
                    <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              </Link>
            )
          })}

          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
                moreMenuOpen || moreNavItems.some(item => item.href === "/distributor" ? isExactActive(item.href) : isActive(item.href))
                  ? "text-teal-600 dark:text-teal-400"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight">{t("distributor.layout.more")}</span>
            </button>

            {moreMenuOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-1.5">
                  {moreNavItems.map((item) => {
                    const IconComponent = item.icon
                    const active = item.href === "/distributor" ? isExactActive(item.href) : isActive(item.href)
                    const locked = isCompanyLocked && !isExemptPath(item.href)
                    if (locked) {
                      return (
                        <div
                          key={item.href}
                          title={t("distributor.layout.lockedTooltip")}
                          aria-disabled="true"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 dark:text-gray-600 cursor-not-allowed select-none"
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
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                          active
                            ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 font-semibold"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                      >
                        <IconComponent className="w-4 h-4 flex-shrink-0" />
                        <span>{item.label}</span>
                        {!!item.badge && (
                          <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                  <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
                    <Link
                      href="/distributor/settings"
                      onClick={() => setMoreMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Settings className="w-4 h-4 flex-shrink-0" />
                      <span>{t("settings.title")}</span>
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </div>
  )
}
