"use client"

import React from "react"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { useCartCount } from "@/lib/hooks/useCartCount"
import { useNotificationBell } from "@/lib/hooks/useNotificationBell"
import { formatRelativeTime } from "@/lib/format"
import {
  Home, Store, Briefcase, Users, MessageCircle, UserSearch, Settings,
  Bell, User, Menu, X, LogOut, ChevronRight, Wallet, Heart, MapPin,
  HelpCircle, Gift, ShoppingCart, Package, MoreHorizontal, Award, ClipboardList, FileText, RefreshCw
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import FloatingChatButton from "@/components/floating-chat-button"
import { AccountMenu } from "@/components/account-menu"
import { AccountSuspendedScreen } from "@/components/account-status/account-suspended-screen"
import { DisputeBanner } from "@/components/account-status/dispute-banner"
import { getMyAccountStatus, type MyOpenDispute } from "@/lib/actions/account-status"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLocalization()
  const { user, logout } = useAuthContext()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const cartCount = useCartCount()
  const [openDisputes, setOpenDisputes] = useState<MyOpenDispute[]>([])

  const navItems = [
    { icon: Home, label: t("nav.home"), href: "/customer/home" },
    { icon: Store, label: t("customer.layout.navMarketplace"), href: "/customer/services" },
    { icon: Briefcase, label: t("nav.myJobs"), href: "/customer/jobs" },
    { icon: Users, label: t("customer.layout.navCommunity"), href: "/customer/community" },
    { icon: MessageCircle, label: t("customer.layout.navChat"), href: "/customer/messages" },
  ]

  const sidebarItems = [
    ...navItems.map((item) => ({ ...item, group: null as string | null })),
    { icon: Package, label: t("customer.orders.title"), href: "/customer/orders", group: "shopping" },
    { icon: ClipboardList, label: t("customer.home.requestBoardTitle"), href: "/customer/requests", group: "shopping" },
    { icon: FileText, label: "My Quotes", href: "/customer/service-requests", group: "shopping" },
    { icon: RefreshCw, label: "Recurring Maintenance", href: "/customer/recurring-maintenance", group: "shopping" },
    { icon: Home, label: "Household", href: "/customer/household", group: "account" },
    { icon: UserSearch, label: t("customer.layout.navFindSpecialists"), href: "/customer/find-specialists", group: "shopping" },
    { icon: Heart, label: t("customer.layout.navFavorites"), href: "/customer/favorites", group: "shopping" },
    { icon: MapPin, label: t("customer.savedAddresses.title"), href: "/customer/saved-addresses", group: "shopping" },
    { icon: Wallet, label: t("nav.wallet"), href: "/customer/wallet", group: "account" },
    { icon: Gift, label: t("customer.referrals.heroTitle"), href: "/customer/referrals", group: "account" },
    { icon: Award, label: t("customer.rewards.heroTitle"), href: "/customer/rewards", group: "account" },
    { icon: HelpCircle, label: t("customer.help.title"), href: "/customer/help", group: "account" },
    { icon: Settings, label: t("settings.title"), href: "/customer/settings", group: "account" },
  ]

  const SIDEBAR_GROUP_LABEL: Record<string, string> = {
    shopping: t("customer.layout.groupShopping"),
    account: t("customer.layout.groupAccount"),
  }

  // Everything in sidebarItems beyond the 5 primary navItems — the mobile
  // bottom nav only has room for those 5 plus this "More" tab, so the rest
  // (already grouped for the hamburger drawer above) are reachable from
  // here too instead of only via the drawer.
  const moreItems = sidebarItems.slice(navItems.length)

  const { notifications, unreadCount, markRead, markAllRead } = useNotificationBell(4)

  useEffect(() => {
    if (!user) return
    getMyAccountStatus().then((status) => setOpenDisputes(status.openDisputes))
  }, [user])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleNotificationClick = (notification: Parameters<typeof markRead>[0]) => {
    markRead(notification)
    setShowNotifications(false)
    router.push(`/customer/notifications/${notification.id}`)
  }
  const handleMarkAllRead = () => markAllRead()

  const isSuspended = user?.isActive === false
  if (isSuspended && !pathname?.startsWith("/customer/messages")) {
    return <AccountSuspendedScreen messagesBasePath="/customer/messages" onLogout={logout} />
  }

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-xs focus:font-medium focus:text-primary-foreground"
      >
        {t("customer.layout.skipToContent")}
      </a>
      <FloatingChatButton />
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-border bg-card">
        {/* Logo */}
        <div className="flex items-center h-16 px-6 border-b border-border">
          <Link href="/customer/home" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-base">S</span>
            </div>
            <span className="font-bold text-lg text-foreground">SAJI</span>
          </Link>
        </div>

        {/* User Profile Quick View */}
        <div className="p-4 border-b border-border">
          <Link href="/customer/profile" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
              {user?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- base64 data URLs (locally-uploaded avatars) aren't supported by next/image
                <img src={user.avatar} alt="" width={40} height={40} className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-xs text-foreground truncate">{user?.name || t("customer.layout.guestUser")}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user?.email || "guest@example.com"}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {sidebarItems.map((item, i) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            const showGroupLabel = item.group && item.group !== sidebarItems[i - 1]?.group
            return (
              <div key={item.href}>
                {showGroupLabel && (
                  <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {SIDEBAR_GROUP_LABEL[item.group as string]}
                  </p>
                )}
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </div>
            )
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-border">
          <Button 
            variant="ghost" 
            onClick={logout}
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="w-5 h-5" />
            {t("auth.logout")}
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="lg:pl-64">
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border">
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
            {/* Mobile Menu Button */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("customer.layout.openMenu")}>
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">{t("customer.layout.openMenu")}</SheetTitle>
                <div className="flex items-center h-16 px-6 border-b border-border">
                  <Link href="/customer/home" className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                      <span className="text-primary-foreground font-bold text-base">S</span>
                    </div>
                    <span className="font-bold text-lg text-foreground">SAJI</span>
                  </Link>
                </div>
                <div className="p-4 border-b border-border">
                  <Link href="/customer/profile" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                      {user?.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element -- base64 data URLs (locally-uploaded avatars) aren't supported by next/image
                        <img src={user.avatar} alt="" width={40} height={40} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-xs text-foreground truncate">{user?.name || "Guest User"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user?.email || "guest@example.com"}</p>
                    </div>
                  </Link>
                </div>
                <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
                  {sidebarItems.map((item, i) => {
                    const isActive = pathname === item.href
                    const showGroupLabel = item.group && item.group !== sidebarItems[i - 1]?.group
                    return (
                      <div key={item.href}>
                        {showGroupLabel && (
                          <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                            {SIDEBAR_GROUP_LABEL[item.group as string]}
                          </p>
                        )}
                        <Link
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition-all ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <item.icon className="w-5 h-5" />
                          {item.label}
                        </Link>
                      </div>
                    )
                  })}
                </nav>
                <div className="p-4 border-t border-border">
                  <Button 
                    variant="ghost" 
                    onClick={logout}
                    className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
                  >
                    <LogOut className="w-5 h-5" />
                    {t("auth.logout")}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Page Title - Desktop Only */}
            <div className="hidden lg:block">
              <h1 className="text-base font-semibold text-foreground">
                {sidebarItems.find(item => pathname === item.href || pathname.startsWith(item.href + "/"))?.label
                  || (pathname.includes("/notifications") ? t("customer.layout.notifications") : t("customer.layout.dashboard"))}
              </h1>
            </div>

            {/* Mobile Logo */}
            <Link href="/customer/home" className="lg:hidden flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-base">S</span>
              </div>
              <span className="font-bold text-base text-foreground">SAJI</span>
            </Link>

            {/* Right Side Actions */}
            <div className="flex items-center gap-2">
              <Link href="/customer/cart" className="relative">
                <Button variant="ghost" size="icon" className="relative" aria-label={t("customer.layout.cart")}>
                  <ShoppingCart className="w-5 h-5" />
                  {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-[11px] rounded-full flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </Button>
              </Link>
              {/* Notifications */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative"
                  aria-label={t("customer.layout.notifications")}
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[11px] rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowNotifications(false)} 
                    />
                    <div className="absolute right-0 top-12 w-80 bg-card rounded-xl shadow-xl border border-border z-50 overflow-hidden">
                      <div className="p-4 border-b border-border flex items-center justify-between">
                        <h3 className="font-semibold text-foreground">{t("customer.layout.notifications")}</h3>
                        <Button variant="ghost" size="sm" className="text-[11px] text-primary" onClick={handleMarkAllRead}>
                          {t("customer.layout.markAllRead")}
                        </Button>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="p-6 text-center text-xs text-muted-foreground">{t("customer.layout.noNotifications")}</p>
                        ) : notifications.map((notification) => (
                          <div
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`p-4 border-b border-border last:border-0 hover:bg-muted transition-colors cursor-pointer ${
                              !notification.isRead ? "bg-primary/5" : ""
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {!notification.isRead && (
                                <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                              )}
                              <div className={!notification.isRead ? "" : "ml-5"}>
                                <p className="font-medium text-xs text-foreground">{notification.title}</p>
                                <p className="text-[11px] text-muted-foreground mt-1">{notification.message}</p>
                                <p className="text-[11px] text-muted-foreground mt-1">{formatRelativeTime(notification.createdAt)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Link 
                        href="/customer/notifications"
                        className="block p-3 text-center text-xs text-primary font-medium hover:bg-muted transition-colors"
                        onClick={() => setShowNotifications(false)}
                      >
                        {t("customer.layout.viewAllNotifications")}
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

        {/* Page Content */}
        {/* pb-36 reserves the floating chat button's real footprint, not just
            the bottom nav's. The button is fixed at bottom-20 and is 56px tall,
            so it covers 80-136px up from the bottom of the viewport; the old
            pb-20 cleared the 65px nav and nothing else. At the very bottom of a
            page, where there is nothing left to scroll, it therefore sat on top
            of whatever ended the page: on the two-column card grid that was the
            last card's action button, with about a third of it unreachable. On
            lg the button moves to bottom-6 at 64px tall, hence lg:pb-24. */}
        <main id="main-content" className="pb-36 lg:pb-24">
          {openDisputes.length > 0 && (
            <div className="px-4 lg:px-6 pt-4">
              <DisputeBanner disputes={openDisputes} messagesBasePath="/customer/messages" />
            </div>
          )}
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40">
          <div className="flex items-center justify-around h-16 px-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                  <span className="text-[10px] mt-1 font-medium">{item.label}</span>
                </Link>
              )
            })}
            <div ref={moreMenuRef} className="relative flex-1">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={`w-full flex flex-col items-center justify-center py-2 transition-colors ${
                  showMoreMenu || moreItems.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <MoreHorizontal className="w-5 h-5" />
                <span className="text-[10px] mt-1 font-medium">{t("customer.layout.moreLabel")}</span>
              </button>

              {showMoreMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-56 max-h-[70vh] overflow-y-auto bg-card rounded-xl shadow-2xl border border-border py-1.5 z-50">
                  {moreItems.map((item, i) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                    const showGroupLabel = item.group && item.group !== moreItems[i - 1]?.group
                    return (
                      <div key={item.href}>
                        {showGroupLabel && (
                          <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                            {SIDEBAR_GROUP_LABEL[item.group as string]}
                          </p>
                        )}
                        <Link
                          href={item.href}
                          onClick={() => setShowMoreMenu(false)}
                          className={`flex items-center gap-3 px-4 py-2.5 text-xs transition-colors ${
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.label}
                        </Link>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </nav>
      </div>
    </div>
  )
}
