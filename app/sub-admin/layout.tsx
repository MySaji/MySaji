"use client"

import { WorkspaceTools } from "@/frontend/components/workspace-tools"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { LoadingScreen } from "@/frontend/components/loading-screen"
import Link from "next/link"
import {
  LayoutDashboard,
  Users,
  User,
  LogOut,
  Menu,
  X,
  Shield,
  Bell,
  Search,
  CheckCircle,
  FileText,
  MessageCircle,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Settings,
  Users2,
  TrendingUp,
  Mail,
  Store,
  Layers,
  Bot,
  AlertTriangle,
  Flag,
} from "lucide-react"
import { useNotificationBell } from "@/frontend/lib/hooks/useNotificationBell"
import { getSubAdminAccount, type SubAdminAccountData } from "@/backend/actions/sub-admin-account"
import { formatRelativeTime } from "@/backend/domain/format"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useSidebarCollapsed } from "@/frontend/lib/hooks/useSidebarCollapsed"

export default function SubAdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, logout } = useAuthContext()
  const { t } = useLocalization()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { isCollapsed, toggle: toggleCollapsed } = useSidebarCollapsed()
  const [notifOpen, setNotifOpen] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const [account, setAccount] = useState<SubAdminAccountData>(null)
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationBell(
    10, mounted && isAuthenticated && user?.role === "sub-admin",
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && isAuthenticated && user?.role === "sub-admin") {
      getSubAdminAccount().then(setAccount)
    }
  }, [mounted, isAuthenticated, user])

  useEffect(() => {
    if (mounted && !isLoading && (!isAuthenticated || user?.role !== "sub-admin")) {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router, mounted])

  const handleNotificationClick = async (n: Parameters<typeof markRead>[0]) => {
    await markRead(n)
    setNotifOpen(false)
    router.push(`/sub-admin/notifications/${n.id}`)
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
  if (!isAuthenticated || user?.role !== "sub-admin") return null

  const menuItems = [
    { icon: LayoutDashboard, label: t("subAdmin.layout.navDashboard"), href: "/sub-admin", group: null },
    { icon: Users, label: t("subAdmin.layout.navUsers"), href: "/sub-admin/users", group: "operations" },
    { icon: CheckCircle, label: t("subAdmin.layout.navVerifications"), href: "/sub-admin/verifications", group: "operations" },
    { icon: AlertTriangle, label: t("subAdmin.layout.navDisputes"), href: "/sub-admin/disputes", group: "operations" },
    { icon: Flag, label: t("subAdmin.layout.navModeration"), href: "/sub-admin/moderation", group: "operations" },
    { icon: Store, label: t("subAdmin.layout.navShopUpgrades"), href: "/sub-admin/shop-upgrades", group: "operations" },
    { icon: Layers, label: t("subAdmin.layout.navProBusiness"), href: "/sub-admin/pro-business", group: "operations" },
    { icon: Bot, label: t("subAdmin.layout.navChatbot"), href: "/sub-admin/chatbot", group: "operations" },
    { icon: MessageCircle, label: t("nav.messages"), href: "/sub-admin/messages", group: "team" },
    { icon: Users, label: t("subAdmin.layout.navAgents"), href: "/sub-admin/agents", group: "team" },
    { icon: Users2, label: t("subAdmin.layout.navTeamManagement"), href: "/sub-admin/team", group: "team" },
    { icon: TrendingUp, label: t("subAdmin.layout.navPerformance"), href: "/sub-admin/performance", group: "insights" },
    { icon: FileText, label: t("subAdmin.layout.navReports"), href: "/sub-admin/reports", group: "insights" },
    { icon: BarChart3, label: t("subAdmin.layout.navAnalytics"), href: "/sub-admin/analytics", group: "insights" },
    { icon: Mail, label: t("subAdmin.layout.navSubscribers"), href: "/sub-admin/subscribers", group: "insights" },
    { icon: User, label: t("settings.profile"), href: "/sub-admin/profile", group: "account" },
    { icon: Settings, label: t("nav.settings"), href: "/sub-admin/settings", group: "account" },
  ]

  const GROUP_LABEL: Record<string, string> = {
    operations: t("subAdmin.layout.groupOperations"),
    team: t("subAdmin.layout.groupTeam"),
    insights: t("subAdmin.layout.groupInsights"),
    account: t("subAdmin.layout.groupAccount"),
  }

  const isActive = (href: string) =>
    href === "/sub-admin" ? pathname === "/sub-admin" : pathname.startsWith(href)

  const bottomNavItems = menuItems.slice(0, 4)
  const moreItems = menuItems.slice(4)

  return (
    <div data-workspace="sub-admin" className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar -- desktop */}
      <aside
        className={`fixed top-0 left-0 h-dvh ${isCollapsed ? "lg:w-20" : "lg:w-64"} w-64 bg-gradient-to-b from-blue-700 to-blue-800 text-white transform transition-[transform,width] z-40 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:relative flex flex-col`}
      >
        <button
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? t("common.sidebar.expand") : t("common.sidebar.collapse")}
          title={isCollapsed ? t("common.sidebar.expand") : t("common.sidebar.collapse")}
          className="hidden lg:flex absolute -right-3 top-20 z-10 w-6 h-6 items-center justify-center rounded-full border border-blue-600 bg-blue-700 text-white shadow-md hover:bg-blue-600 transition-colors"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        <div className={`p-5 border-b border-blue-600 flex items-center gap-3 ${isCollapsed ? "lg:justify-center" : ""}`}>
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className={`flex-1 min-w-0 ${isCollapsed ? "lg:hidden" : ""}`}>
            <h1 className="text-base font-bold leading-tight">{t("subAdmin.layout.title")}</h1>
            <p className="text-[10px] text-blue-200">{t("subAdmin.layout.subtitle")}</p>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label={t("subAdmin.layout.closeMenu")}
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
                  className={`flex items-center gap-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${isCollapsed ? "lg:justify-center px-2" : "px-3"} ${
                    isActive(item.href)
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-blue-100 hover:bg-blue-600/50"
                  }`}
                >
                  <item.icon size={18} className="flex-shrink-0" />
                  <span className={isCollapsed ? "lg:hidden" : ""}>{item.label}</span>
                </Link>
              </div>
            )
          })}
        </nav>

        <div className="p-3 border-t border-blue-600">
          <button
            onClick={() => {
              logout()
              setMenuOpen(false)
            }}
            title={isCollapsed ? t("auth.logout") : undefined}
            className={`w-full flex items-center gap-3 py-2.5 rounded-lg text-xs font-medium text-blue-100 hover:bg-blue-600/50 transition-colors ${isCollapsed ? "lg:justify-center px-2" : "px-3"}`}
          >
            <LogOut size={18} className="flex-shrink-0" />
            <span className={isCollapsed ? "lg:hidden" : ""}>{t("auth.logout")}</span>
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex flex-col flex-1 overflow-hidden w-full">
        {/* Top Header */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden text-gray-600 dark:text-gray-300"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div className="hidden sm:flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 flex-1 max-w-xs">
              <Search size={16} className="text-gray-400" />
              <input
                placeholder={t("subAdmin.layout.searchPlaceholder")}
                className="bg-transparent text-xs outline-none w-full text-gray-700 dark:text-gray-200"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Bell size={20} className="text-gray-600 dark:text-gray-300" />
                {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
              </button>
              {notifOpen && (
                <div className="fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50">
                  <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="font-semibold text-xs text-gray-900 dark:text-white">
                      {t("settings.notifications")}
                    </h3>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead} className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 px-2 py-0.5 rounded-full font-medium hover:bg-red-200 dark:hover:bg-red-900/50">
                        {t("subAdmin.layout.markAllReadCount", { count: unreadCount })}
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                    {notifications.length === 0 ? (
                      <div className="px-3 py-6 text-center text-[11px] text-gray-500 dark:text-gray-400">{t("subAdmin.layout.noNotifications")}</div>
                    ) : notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${!n.isRead ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
                      >
                        <p className="text-[11px] text-gray-900 dark:text-white font-medium">{n.title}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{formatRelativeTime(n.createdAt)}</p>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setNotifOpen(false); router.push("/sub-admin/notifications") }}
                    className="block w-full px-3 py-2.5 text-center text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700"
                  >
                    {t("subAdmin.layout.viewAllNotifications")}
                  </button>
                </div>
              )}
            </div>
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold cursor-pointer hover:shadow-lg transition-shadow"
              >
                {(account?.name ?? "SA").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">{account?.name ?? t("subAdmin.layout.title")}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{account?.email ?? ""}</p>
                  </div>

                  <Link
                    href="/sub-admin/profile"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <User size={18} />
                    <span>{t("settings.profile")}</span>
                  </Link>

                  <Link
                    href="/sub-admin/settings"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <Settings size={18} />
                    <span>{t("nav.settings")}</span>
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

        <main className="flex-1 overflow-auto pb-20 lg:pb-0">
          <WorkspaceTools name="Operations team" />
          <div className="container mx-auto p-4 lg:p-6">{children}</div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-around px-1 py-2 z-30">
          {bottomNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium ${
                isActive(item.href) ? "text-blue-600" : "text-gray-500"
              }`}
            >
              <item.icon size={20} />
              {item.label}
            </Link>
          ))}
          <div className="relative">
            <button
              onClick={() => setShowMore(!showMore)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium ${
                showMore ? "text-blue-600" : "text-gray-500"
              }`}
            >
              <ChevronDown size={20} className={`transition-transform ${showMore ? "rotate-180" : ""}`} />
              {t("subAdmin.layout.moreLabel")}
            </button>
            {showMore && (
              <div className="absolute bottom-14 right-0 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 z-50">
                {moreItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <item.icon size={16} />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>
      </div>

      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </div>
  )
}
