"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Menu, Bell, Wallet, MessageCircle, X } from "lucide-react"
import { SajiProLogo } from "@/components/saji-pro-badge"
import { LocationSelector } from "@/components/location-selector"
import { AccountMenu } from "@/components/account-menu"
import { useNotificationBell } from "@/lib/hooks/useNotificationBell"
import { formatRelativeTime } from "@/lib/format"
import { getProviderWalletSummary } from "@/lib/actions/provider-wallet"
import { getUnreadMessageCount } from "@/lib/actions/messages"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { useProviderWorkspace } from "@/lib/hooks/useProviderWorkspace"
import { ProviderOnlineToggle } from "@/components/provider-online-toggle"

// Same set of routes ProviderSidebar's menuItems covers — kept as a
// separate, label-only map here since the topbar only needs the title text,
// not the icons/badges the sidebar renders. Covers both halves of Saji Pro:
// without the /shopkeeper entries every merchant page fell through to the
// "Dashboard" default once the two portals merged under one topbar.
const TITLE_BY_PREFIX: [string, string][] = [
  ["/shopkeeper/products", "Shop Products"],
  ["/shopkeeper/orders", "Shop Orders"],
  ["/shopkeeper/customers", "Shop Customers"],
  ["/shopkeeper/promotions", "Promotions"],
  ["/shopkeeper/earnings", "Shop Earnings"],
  ["/shopkeeper/reviews", "Shop Reviews"],
  ["/shopkeeper/analytics", "Shop Analytics"],
  ["/shopkeeper/distributors", "Distributors"],
  ["/shopkeeper/wholesale-orders", "Wholesale Orders"],
  ["/shopkeeper/showcase", "Showcase"],
  ["/shopkeeper/endorsements", "Endorsements"],
  ["/shopkeeper/register", "Shop Registration"],
  ["/shopkeeper/requests", "Requests"],
  ["/shopkeeper/messages", "Messages"],
  ["/shopkeeper/notifications", "Notifications"],
  ["/shopkeeper/settings", "Settings"],
  ["/shopkeeper/profile", "Shop Profile"],
  ["/provider/jobs", "Jobs"],
  ["/provider/services", "Services"],
  ["/provider/availability", "Availability"],
  ["/provider/quotes", "Quotes"],
  ["/provider/shop", "My Shop"],
  ["/provider/portfolio", "My Work"],
  ["/provider/content", "My Content"],
  ["/provider/messages", "Messages"],
  ["/provider/wallet", "Wallet"],
  ["/provider/invoices", "Invoices"],
  ["/provider/analytics", "Analytics"],
  ["/provider/clients", "Clients"],
  ["/provider/referrals", "Referrals"],
  ["/provider/notifications", "Notifications"],
  ["/provider/profile", "Profile"],
]

function pageTitleFor(pathname: string): string {
  if (pathname === "/provider" || pathname === "/shopkeeper") return "Home"
  const match = TITLE_BY_PREFIX.find(([prefix]) => pathname.startsWith(prefix))
  return match ? match[1] : "Dashboard"
}

export default function ProviderTopbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { t, formatMoney } = useLocalization()
  const pathname = usePathname()
  const router = useRouter()
  const [showNotifications, setShowNotifications] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [unreadMessages, setUnreadMessages] = useState(0)

  const { notifications, unreadCount, markRead, markAllRead, remove } = useNotificationBell(5)
  const { type: workspaceType } = useProviderWorkspace()

  useEffect(() => {
    getProviderWalletSummary().then((summary) => setWalletBalance(summary?.available ?? null))
    getUnreadMessageCount().then(setUnreadMessages)
  }, [pathname])

  const handleNotificationClick = async (notification: Parameters<typeof markRead>[0]) => {
    await markRead(notification)
    setShowNotifications(false)
    router.push(`/provider/notifications/${notification.id}`)
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6 gap-3">
        {/* Mobile menu trigger */}
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="lg:hidden p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
        >
          <Menu className="w-6 h-6 text-gray-700 dark:text-gray-200" />
        </button>

        {/* Mobile logo */}
        <Link href="/provider" className="lg:hidden flex-shrink-0">
          <SajiProLogo size="sm" showText />
        </Link>

        {/* Desktop page title */}
        <div className="hidden lg:block">
          <h1 className="text-base font-semibold text-gray-900 dark:text-white">{pageTitleFor(pathname ?? "")}</h1>
        </div>

        {/* Where this account is working from, beside the wordmark as in the
            design. min-w-0 so its label truncates instead of widening the
            header on a narrow phone. */}
        <div className="min-w-0 flex-1">
          <LocationSelector manageHref="/provider/profile/account" />
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Online/Offline — Solo Pro and Field Technician only; a Business
              Manager's context is dispatch, not personally taking jobs. */}
          {workspaceType !== "business_owner" && (
            <div className="hidden sm:block">
              <ProviderOnlineToggle variant="compact" />
            </div>
          )}

          {/* Wallet quick view */}
          <Link
            href="/provider/wallet"
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
          >
            <Wallet className="w-4 h-4" />
            <span className="text-xs font-semibold">
              {walletBalance === null ? "—" : formatMoney(walletBalance)}
            </span>
          </Link>

          {/* Messages */}
          <Link href="/provider/messages" className="relative">
            <button aria-label="Messages" className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
              <MessageCircle className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              {unreadMessages > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadMessages > 9 ? "9+" : unreadMessages}
                </span>
              )}
            </button>
          </Link>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="Notifications"
              className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <div className="fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{t("provider.layout.notificationsTitle")}</h3>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        {t("provider.layout.markAllRead")}
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                    {notifications.length === 0 ? (
                      <p className="p-6 text-center text-xs text-gray-500 dark:text-gray-400">{t("provider.layout.noNotifications")}</p>
                    ) : notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${!notif.isRead ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium text-xs truncate ${!notif.isRead ? "text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-300"}`}>
                              {notif.title}
                            </p>
                            <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{notif.message}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{formatRelativeTime(notif.createdAt)}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); remove(notif.id) }}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                            aria-label="Dismiss"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link
                    href="/provider/notifications"
                    onClick={() => setShowNotifications(false)}
                    className="block p-3 text-center text-xs text-blue-600 dark:text-blue-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    {t("provider.layout.viewAllNotifications")}
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Account / role switcher */}
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}
