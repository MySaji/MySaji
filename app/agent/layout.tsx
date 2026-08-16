"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { LoadingScreen } from "@/components/loading-screen"
import { submitKycDocument } from "@/lib/actions/kyc"
import { useLocalization } from "@/lib/hooks/useLocalization"
import Link from "next/link"
import {
  LayoutDashboard,
  AlertTriangle,
  User,
  LogOut,
  Menu,
  X,
  Shield,
  Bell,
  Search,
  BarChart3,
  DollarSign,
  Wallet,
  MessageCircle,
  Trophy,
  ChevronDown,
  Settings,
  ShieldCheck,
  Store,
  Bot,
} from "lucide-react"
import { useNotificationBell } from "@/lib/hooks/useNotificationBell"
import { formatRelativeTime } from "@/lib/format"

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, logout } = useAuthContext()
  const { t } = useLocalization()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationBell(
    10, mounted && isAuthenticated && user?.role === "agent",
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !isLoading && (!isAuthenticated || user?.role !== "agent")) {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router, mounted])

  const handleNotificationClick = async (n: Parameters<typeof markRead>[0]) => {
    await markRead(n)
    setNotifOpen(false)
    router.push(`/agent/notifications/${n.id}`)
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
  if (!isAuthenticated || user?.role !== "agent") return null

  if (user && user.role === "agent" && user.kycStatus !== "approved") {
    return <AgentVerificationPending onLogout={logout} />
  }

  const menuItems = [
    { icon: LayoutDashboard, label: t("agent.nav.dashboard"), href: "/agent", group: null },
    { icon: AlertTriangle, label: t("agent.nav.disputes"), href: "/agent/disputes", group: "operations" },
    { icon: ShieldCheck, label: t("agent.nav.shopVerifications"), href: "/agent/shop-verifications", group: "operations" },
    { icon: Store, label: t("agent.nav.shopUpgrades"), href: "/agent/shop-upgrades", group: "operations" },
    { icon: Bot, label: t("agent.nav.chatbot"), href: "/agent/chatbot", group: "operations" },
    { icon: MessageCircle, label: t("nav.messages"), href: "/agent/messages", group: "operations" },
    { icon: DollarSign, label: t("agent.nav.commissions"), href: "/agent/commissions", group: "earnings" },
    { icon: Wallet, label: t("agent.nav.withdrawals"), href: "/agent/withdrawals", group: "earnings" },
    { icon: BarChart3, label: t("agent.nav.stats"), href: "/agent/stats", group: "insights" },
    { icon: Trophy, label: t("agent.nav.leaderboard"), href: "/agent/leaderboard", group: "insights" },
    { icon: BarChart3, label: t("agent.nav.analytics"), href: "/agent/analytics", group: "insights" },
    { icon: User, label: t("settings.profile"), href: "/agent/profile", group: "account" },
  ]

  const GROUP_LABEL: Record<string, string> = {
    operations: t("agent.layout.groupOperations"),
    earnings: t("agent.layout.groupEarnings"),
    insights: t("agent.layout.groupInsights"),
    account: t("agent.layout.groupAccount"),
  }

  const isActive = (href: string) =>
    href === "/agent" ? pathname === "/agent" : pathname.startsWith(href)

  const bottomNav = menuItems.slice(0, 4)
  const moreItems = menuItems.slice(4)

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <aside
        className={`fixed top-0 left-0 h-dvh w-64 bg-gradient-to-b from-indigo-700 to-indigo-800 text-white transform transition-transform z-40 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:relative flex flex-col`}
      >
        <div className="p-5 border-b border-indigo-600 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight">{t("agent.layout.title")}</h1>
            <p className="text-[10px] text-indigo-200">{t("agent.layout.subtitle")}</p>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label={t("agent.layout.closeMenu")}
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
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-200/70">
                    {GROUP_LABEL[item.group as string]}
                  </p>
                )}
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "bg-white text-indigo-700 shadow-sm"
                      : "text-indigo-100 hover:bg-indigo-600/50"
                  }`}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              </div>
            )
          })}
        </nav>
        <div className="p-3 border-t border-indigo-600">
          <button
            onClick={() => {
              logout()
              setMenuOpen(false)
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-indigo-100 hover:bg-indigo-600/50"
          >
            <LogOut size={18} />
            {t("auth.logout")}
          </button>
        </div>
      </aside>

      <div className="flex flex-col flex-1 overflow-hidden w-full">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden text-gray-600 dark:text-gray-300"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div className="hidden sm:flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 max-w-xs">
              <Search size={16} className="text-gray-400" />
              <input
                placeholder={t("agent.common.searchPlaceholder")}
                className="bg-transparent text-sm outline-none w-full text-gray-700 dark:text-gray-200"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Bell size={20} className="text-gray-600 dark:text-gray-300" />
                {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-12 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50">
                  <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                      {t("agent.layout.notifications")}
                    </h3>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead} className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 px-2 py-0.5 rounded-full font-medium hover:bg-red-200 dark:hover:bg-red-900/50">
                        {t("agent.layout.markAllReadCount", { count: unreadCount })}
                      </button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                    {notifications.length === 0 ? (
                      <div className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">{t("agent.layout.noNotifications")}</div>
                    ) : notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${!n.isRead ? "bg-indigo-50/50 dark:bg-indigo-900/10" : ""}`}
                      >
                        <p className="text-xs text-gray-900 dark:text-white">{n.title}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{formatRelativeTime(n.createdAt)}</p>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setNotifOpen(false); router.push("/agent/notifications") }}
                    className="block w-full px-3 py-2.5 text-center text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700"
                  >
                    {t("agent.layout.viewAllNotifications")}
                  </button>
                </div>
              )}
            </div>
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:shadow-lg transition-shadow"
              >
                {(user?.name || "Agent").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">{user?.name ?? t("agent.layout.title")}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{user?.email ?? ""}</p>
                  </div>

                  <Link
                    href="/agent/profile"
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

        <main className="flex-1 overflow-auto pb-20 lg:pb-0">
          <div className="container mx-auto p-4 lg:p-6">{children}</div>
        </main>

        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-around px-1 py-2 z-30">
          {bottomNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium ${
                isActive(item.href) ? "text-indigo-600" : "text-gray-500"
              }`}
            >
              <item.icon size={20} />
              {item.label}
            </Link>
          ))}
          <div className="relative">
            <button
              onClick={() => setShowMore(!showMore)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium ${
                showMore ? "text-indigo-600" : "text-gray-500"
              }`}
            >
              <ChevronDown
                size={20}
                className={`transition-transform ${showMore ? "rotate-180" : ""}`}
              />
              {t("agent.layout.more")}
            </button>
            {showMore && (
              <div className="absolute bottom-14 right-0 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 z-50">
                {moreItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
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

function AgentVerificationPending({ onLogout }: { onLogout: () => void }) {
  const { t } = useLocalization()
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus("uploading")
    setErrorMsg("")
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const result = await submitKycDocument({ fileName: file.name, fileDataUrl: String(reader.result) })
        if (!result.success) {
          setStatus("error")
          setErrorMsg(result.error)
          return
        }
        setStatus("done")
      } catch {
        setStatus("error")
        setErrorMsg(t("agent.layout.connectionError"))
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-xl w-full bg-white dark:bg-gray-800 border border-border rounded-xl p-6 text-center">
        <h2 className="text-lg font-bold text-foreground">{t("agent.layout.verificationPendingTitle")}</h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t("agent.layout.verificationPendingBody")}
        </p>
        <div className="mt-4">
          {status === "done" ? (
            <p className="text-sm text-emerald-600 font-medium">{t("agent.layout.verificationUploaded")}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("agent.layout.verificationUploadHint")}</p>
              <input
                type="file"
                accept="image/*,application/pdf"
                disabled={status === "uploading"}
                onChange={handleFileChange}
                className="mt-3 mx-auto"
              />
              {status === "uploading" && <p className="text-xs text-muted-foreground mt-2">{t("agent.layout.uploading")}</p>}
              {status === "error" && <p className="text-xs text-red-600 mt-2">{errorMsg}</p>}
            </>
          )}
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={onLogout} className="px-4 py-2 rounded-lg bg-muted text-foreground">
            {t("auth.logout")}
          </button>
        </div>
      </div>
    </div>
  )
}
