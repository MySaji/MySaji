"use client"

import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { Bell, Search, MessageSquare, Sun, Moon, LogOut, Settings, X, CheckCircle, AlertCircle, User } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { useRouter } from "next/navigation"
import { useNotificationBell } from "@/frontend/lib/hooks/useNotificationBell"
import { getConversations, getUnreadMessageCount, type ConversationSummary } from "@/backend/actions/messages"
import { getAdminAccount, type AdminAccountData } from "@/backend/actions/admin-account"
import { formatRelativeTime } from "@/backend/domain/format"

export function AdminHeader() {
  const { t, currency, setCurrency, theme, setTheme } = useLocalization()
  const { logout } = useAuthContext()
  const router = useRouter()
  const [isDark, setIsDark] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showMessages, setShowMessages] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [account, setAccount] = useState<AdminAccountData>(null)
  const { notifications, unreadCount: unreadNotifications, markRead, markAllRead } = useNotificationBell(10)

  useEffect(() => {
    getConversations().then(setConversations)
    getUnreadMessageCount().then(setUnreadMessages)
    getAdminAccount().then(setAccount)
  }, [])

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark")
    setIsDark(isDarkMode)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false)
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
      if (messagesRef.current && !messagesRef.current.contains(event.target as Node)) {
        setShowMessages(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark"
    setTheme(newTheme)
    setIsDark(newTheme === "dark")
  }

  const handleLogout = () => {
    // logout() (see lib/auth-context.tsx) already navigates to "/" itself,
    // but only after signOut() finishes clearing the session cookie. Pushing
    // here too raced ahead of that: "/" is a server component that redirects
    // an already-authenticated admin straight back into /admin, so this
    // extra push (landing while the cookie was still valid) was bouncing
    // straight back in before the real sign-out redirect caught up.
    logout()
    setShowProfileMenu(false)
  }

  const handleNotificationClick = async (notification: Parameters<typeof markRead>[0]) => {
    await markRead(notification)
    setShowNotifications(false)
    router.push(`/admin/notifications/${notification.id}`)
  }

  const handleMarkAllRead = () => markAllRead()

  const notifIcon = (type: string) => {
    switch (type) {
      case "SYSTEM": return <AlertCircle size={18} className="text-gray-600" />
      case "PAYMENT": return <CheckCircle size={18} className="text-emerald-600" />
      case "ANNOUNCEMENT": return <Bell size={18} className="text-blue-600" />
      default: return <Bell size={18} className="text-blue-600" />
    }
  }

  const notifColor = (type: string) => {
    switch (type) {
      case "SYSTEM": return "bg-gray-100 dark:bg-gray-700"
      case "PAYMENT": return "bg-emerald-100 dark:bg-emerald-900/30"
      default: return "bg-blue-100 dark:bg-blue-900/30"
    }
  }

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-8 py-4 sticky top-0 z-40">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder={t("admin.header.searchPlaceholder")}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 lg:gap-4">
          {/* Notifications */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => {
                setShowNotifications(!showNotifications)
                setShowMessages(false)
              }}
              className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Bell size={20} className="text-gray-600 dark:text-gray-300" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center">{unreadNotifications}</span>
              )}
            </button>

            {showNotifications && (
              <div className="fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-y-auto">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{t("settings.notifications")}</h3>
                  {unreadNotifications > 0 && (
                    <button onClick={handleMarkAllRead} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline">{t("admin.header.markAllRead")}</button>
                  )}
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-500 dark:text-gray-400">{t("admin.header.noNotifications")}</div>
                  ) : notifications.map((notif) => (
                    <button key={notif.id} onClick={() => handleNotificationClick(notif)} className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${!notif.isRead ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                      <div className="flex gap-3">
                        <div className={`p-2 rounded-lg flex-shrink-0 ${notifColor(notif.type)}`}>
                          {notifIcon(notif.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-gray-900 dark:text-white text-xs">{notif.title}</p>
                            {!notif.isRead && <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />}
                          </div>
                          <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">{notif.message}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">{formatRelativeTime(notif.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center sticky bottom-0 bg-white dark:bg-gray-800">
                  <button
                    onClick={() => { setShowNotifications(false); router.push("/admin/notifications") }}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    {t("admin.header.viewAllNotifications")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="relative" ref={messagesRef}>
            <button
              onClick={() => {
                setShowMessages(!showMessages)
                setShowNotifications(false)
              }}
              className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <MessageSquare size={20} className="text-gray-600 dark:text-gray-300" />
              {unreadMessages > 0 && (
                <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center">{unreadMessages}</span>
              )}
            </button>

            {showMessages && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-y-auto">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{t("nav.messages")}</h3>
                  <button onClick={() => setShowMessages(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <X size={18} />
                  </button>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {conversations.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-500 dark:text-gray-400">{t("admin.header.noConversationsYet")}</div>
                  ) : conversations.slice(0, 5).map((conv) => (
                    <button key={conv.id} onClick={() => router.push("/admin/messages")} className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <div className="flex gap-3 items-start">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0 text-xs">
                          {conv.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-gray-900 dark:text-white text-xs">{conv.name}</p>
                            {conv.unreadCount > 0 && <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />}
                          </div>
                          <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 truncate">{conv.lastMessage}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">{conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : ""}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
                  <button onClick={() => router.push("/admin/messages")} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">{t("admin.header.openMessages")}</button>
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <button onClick={toggleTheme} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors hidden sm:block">
            {isDark ? (
              <Sun size={20} className="text-gray-600 dark:text-gray-300" />
            ) : (
              <Moon size={20} className="text-gray-600 dark:text-gray-300" />
            )}
          </button>

          {/* Currency Selector */}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none text-xs hidden md:block"
          >
            <option value="KES">KES</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>

          {/* Profile Menu */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold cursor-pointer hover:shadow-lg transition-shadow"
            >
              {(account?.name ?? "A").charAt(0).toUpperCase()}
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <p className="font-semibold text-gray-900 dark:text-white">{account?.name ?? t("nav.admin")}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{account?.email ?? ""}</p>
                </div>

                <Link
                  href="/admin/profile"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <User size={18} />
                  <span>{t("admin.header.adminProfile")}</span>
                </Link>

                <Link
                  href="/admin/settings"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <Settings size={18} />
                  <span>{t("settings.title")}</span>
                </Link>

                <div className="border-t border-gray-200 dark:border-gray-700 py-2">
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
      </div>
    </header>
  )
}
