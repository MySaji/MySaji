"use client"

import { WorkspaceTools } from "@/frontend/components/workspace-tools"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { LoadingScreen } from "@/frontend/components/loading-screen"
import {
  LayoutDashboard, CreditCard, User, LogOut, Menu, X, FileText,
  BarChart3, MessageCircle, RefreshCcw, FileSpreadsheet, Bell, Search,
  ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useNotificationBell } from "@/frontend/lib/hooks/useNotificationBell"
import { formatRelativeTime } from "@/backend/domain/format"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useSidebarCollapsed } from "@/frontend/lib/hooks/useSidebarCollapsed"

export default function SecretaryLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, logout } = useAuthContext()
  const { t } = useLocalization()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { isCollapsed, toggle: toggleCollapsed } = useSidebarCollapsed()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationBell(
    10, mounted && isAuthenticated && user?.role === "secretary",
  )

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (mounted && !isLoading && (!isAuthenticated || user?.role !== "secretary")) {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router, mounted])

  const handleNotificationClick = async (n: Parameters<typeof markRead>[0]) => {
    await markRead(n)
    setShowNotifications(false)
    router.push(`/secretary/notifications/${n.id}`)
  }

  const handleMarkAllRead = () => markAllRead()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleLogout = () => {
    logout()
    setShowProfileMenu(false)
  }

  if (isLoading || !mounted) return <LoadingScreen />
  if (!isAuthenticated || user?.role !== "secretary") return null

  const menuItems = [
    { icon: LayoutDashboard, label: t("secretary.layout.navDashboard"), href: "/secretary", group: null },
    { icon: CreditCard, label: t("secretary.layout.navPayments"), href: "/secretary/payments", group: "finance" },
    { icon: FileText, label: t("secretary.layout.navInvoicing"), href: "/secretary/invoicing", group: "finance" },
    { icon: RefreshCcw, label: t("secretary.layout.navReconciliation"), href: "/secretary/reconciliation", group: "finance" },
    { icon: FileSpreadsheet, label: t("secretary.layout.navRevenueReports"), href: "/secretary/tax-reports", group: "finance" },
    { icon: BarChart3, label: t("secretary.layout.navAnalytics"), href: "/secretary/analytics", group: "finance" },
    { icon: MessageCircle, label: t("nav.messages"), href: "/secretary/messages", group: "communication" },
    { icon: User, label: t("settings.profile"), href: "/secretary/profile", group: "account" },
  ]

  const GROUP_LABEL: Record<string, string> = {
    finance: t("secretary.layout.groupFinance"),
    communication: t("secretary.layout.groupCommunication"),
    account: t("secretary.layout.groupAccount"),
  }

  const isActive = (href: string) => {
    if (href === "/secretary") return pathname === "/secretary"
    return pathname.startsWith(href)
  }

  const bottomNavItems = menuItems.slice(0, 4)
  const moreItems = menuItems.slice(4)

  return (
    <div data-workspace="secretary" className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Desktop Sidebar */}
      <aside className={`fixed top-0 left-0 h-dvh ${isCollapsed ? "lg:w-20" : "lg:w-64"} w-64 bg-gradient-to-b from-blue-600 to-blue-700 text-white transform transition-[transform,width] z-40 ${menuOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:relative flex flex-col`}>
        <button
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? t("common.sidebar.expand") : t("common.sidebar.collapse")}
          title={isCollapsed ? t("common.sidebar.expand") : t("common.sidebar.collapse")}
          className="hidden lg:flex absolute -right-3 top-20 z-10 w-6 h-6 items-center justify-center rounded-full border border-blue-500/40 bg-blue-600 text-white shadow-md hover:bg-blue-500 transition-colors"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        <div className={`p-5 border-b border-blue-500/40 flex items-center gap-3 ${isCollapsed ? "lg:justify-center" : ""}`}>
          {isCollapsed && (
            <div className="hidden lg:flex w-9 h-9 rounded-lg bg-white/20 items-center justify-center flex-shrink-0">
              <LayoutDashboard className="w-5 h-5" />
            </div>
          )}
          <div className={`flex-1 min-w-0 ${isCollapsed ? "lg:hidden" : ""}`}>
            <h1 className="text-base font-bold tracking-tight">{t("secretary.layout.portalName")}</h1>
            <p className="text-blue-200 text-[11px] mt-0.5 truncate">{user?.name || t("secretary.layout.fallbackName")}</p>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label={t("secretary.layout.closeMenu")}
            className="lg:hidden p-1.5 -mr-1 rounded-lg hover:bg-white/10 text-white/80 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item, i) => {
            const showGroupLabel = item.group && item.group !== menuItems[i - 1]?.group
            return (
              <div key={item.href}>
                {showGroupLabel && (
                  <p className={`px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-200/70 ${isCollapsed ? "lg:hidden" : ""}`}>
                    {GROUP_LABEL[item.group as string]}
                  </p>
                )}
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  title={isCollapsed ? item.label : undefined}
                  className={`flex items-center gap-3 py-2.5 rounded-lg text-xs transition-colors ${isCollapsed ? "lg:justify-center px-2" : "px-3"} ${isActive(item.href) ? "bg-white text-blue-600 font-semibold shadow-sm" : "hover:bg-blue-500/50 text-blue-50"}`}
                >
                  <item.icon size={18} className="flex-shrink-0" />
                  <span className={isCollapsed ? "lg:hidden" : ""}>{item.label}</span>
                </Link>
              </div>
            )
          })}
        </nav>
        <div className="p-3 border-t border-blue-500/40">
          <button onClick={() => { logout(); setMenuOpen(false) }} title={isCollapsed ? t("auth.logout") : undefined} className={`w-full flex items-center gap-3 py-2.5 rounded-lg hover:bg-blue-500/50 transition-colors text-blue-100 text-xs ${isCollapsed ? "lg:justify-center px-2" : "px-3"}`}>
            <LogOut size={18} className="flex-shrink-0" />
            <span className={isCollapsed ? "lg:hidden" : ""}>{t("auth.logout")}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden w-full">
        {/* Top Header Bar */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden text-gray-600 dark:text-gray-300">
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div className="hidden sm:flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 w-64">
              <Search size={16} className="text-gray-400" />
              <input type="text" placeholder={t("secretary.layout.searchPlaceholder")} className="bg-transparent text-xs outline-none flex-1 text-gray-700 dark:text-gray-200 placeholder:text-gray-400" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
                <Bell size={20} />
                {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
              </button>
              {showNotifications && (
                <div className="fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                  <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-900 dark:text-white">{t("settings.notifications")}</h3>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead} className="text-[11px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full hover:bg-red-200 dark:hover:bg-red-900/50">
                        {t("secretary.layout.markAllReadCount", { count: unreadCount })}
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                    {notifications.length === 0 ? (
                      <div className="px-3 py-6 text-center text-[11px] text-gray-500 dark:text-gray-400">{t("secretary.layout.noNotifications")}</div>
                    ) : notifications.map(n => (
                      <button
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${!n.isRead ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
                      >
                        <p className="text-xs text-gray-800 dark:text-gray-200 leading-snug">{n.title}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{formatRelativeTime(n.createdAt)}</p>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setShowNotifications(false); router.push("/secretary/notifications") }}
                    className="block w-full px-3 py-2.5 text-center text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700"
                  >
                    {t("secretary.layout.viewAllNotifications")}
                  </button>
                </div>
              )}
            </div>

            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold cursor-pointer hover:shadow-lg transition-shadow"
              >
                {(user?.name || "S")[0]}
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">{user?.name ?? t("secretary.layout.portalName")}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{user?.email ?? ""}</p>
                  </div>

                  <Link
                    href="/secretary/profile"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <User size={18} />
                    <span>{t("settings.profile")}</span>
                  </Link>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-4 py-3 w-full hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 transition-colors"
                    >
                      <LogOut size={18} />
                      <span>{t("auth.logout")}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto pb-20 lg:pb-0">
          <WorkspaceTools name="Finance workspace" />
          <div className="container mx-auto p-4 lg:p-6">{children}</div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40 flex items-center justify-around px-1 py-1.5 safe-bottom">
        {bottomNavItems.map((item) => (
          <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg min-w-0 flex-1 ${isActive(item.href) ? "text-blue-600 dark:text-blue-400" : "text-gray-400"}`}>
            <item.icon size={20} />
            <span className="text-[10px] font-medium truncate">{item.label}</span>
          </Link>
        ))}
        {/* More menu */}
        <div className="relative flex flex-col items-center gap-0.5 px-2 py-1.5 flex-1">
          <button onClick={() => setShowMore(!showMore)} className={`flex flex-col items-center gap-0.5 ${moreItems.some(i => isActive(i.href)) ? "text-blue-600 dark:text-blue-400" : "text-gray-400"}`}>
            <MoreHorizontal size={20} />
            <span className="text-[10px] font-medium">More</span>
          </button>
          {showMore && (
            <div className="absolute bottom-full mb-2 right-0 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
              {moreItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setShowMore(false)} className={`flex items-center gap-3 px-4 py-3 text-xs transition-colors ${isActive(item.href) ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                  <item.icon size={18} />
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Overlays */}
      {menuOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMenuOpen(false)} />}
      {(showNotifications || showMore) && <div className="fixed inset-0 z-40 lg:z-auto" onClick={() => { setShowNotifications(false); setShowMore(false) }} />}
    </div>
  )
}
