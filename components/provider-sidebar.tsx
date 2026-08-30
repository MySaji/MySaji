"use client"

import { useEffect, useRef, useState } from "react"
import { Home, Briefcase, MessageCircle, Wallet, User, ChevronDown, ImageIcon, Calendar, Wrench, BarChart3, FileText, Users, Store, Gift, Award, ClipboardList, X, MoreHorizontal, Megaphone, LayoutDashboard, Building2, TrendingUp, Navigation, Crown, Rocket, Package, Handshake, Radar } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Logo } from "@/components/logo"
import { AccountMenu } from "@/components/account-menu"
import { getProviderJobStats } from "@/lib/actions/provider-jobs"
import { getUnreadMessageCount } from "@/lib/actions/messages"
import { useProviderWorkspace } from "@/lib/hooks/useProviderWorkspace"

type ProviderSidebarProps = {
  isOpen: boolean
  onClose: () => void
}

export default function ProviderSidebar({ isOpen, onClose }: ProviderSidebarProps) {
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null)
  const [pendingJobs, setPendingJobs] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

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

  // Adaptive UI Workspaces: three genuinely different item sets, not just
  // a reordering of one universal list — each workspace's first N items
  // (primaryCount) are what the mobile bottom bar shows; everything else
  // is still reachable via "More" / the full desktop sidebar, just not
  // front-and-center for that account type.
  type MenuItem = { icon: typeof Home; label: string; href: string; exact?: boolean; badge?: number; isNew?: boolean; group: string | null; hasSubmenu?: boolean }

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
      { icon: Megaphone, label: "Requests", href: "/provider/requests", group: null },
      { icon: Wrench, label: "Services", href: "/provider/services", group: null },
      { icon: Rocket, label: "Offers", href: "/provider/offers", group: null },
      { icon: Package, label: "Rentals", href: "/provider/rentals", group: null },
      { icon: Users, label: "Customers", href: "/provider/clients", group: "business" },
      { icon: ImageIcon, label: "Showcase", href: "/provider/content", group: "business" },
      { icon: MessageCircle, label: "Messages", href: "/provider/messages", badge: unreadMessages || undefined, group: "business" },
      { icon: Wallet, label: "My Wallet", href: "/provider/wallet", group: "business" },
      { icon: ClipboardList, label: "Quotes", href: "/provider/quotes", group: "business" },
      { icon: Handshake, label: "Service Requests", href: "/provider/service-requests", group: "business" },
      { icon: Radar, label: "Opportunities", href: "/provider/opportunities", group: "business" },
      { icon: FileText, label: "Invoices", href: "/provider/invoices", group: "business" },
      { icon: Handshake, label: "Procurement", href: "/provider/business/procurement", group: "business" },
      { icon: BarChart3, label: "Analytics", href: "/provider/analytics", group: "insights" },
      { icon: Gift, label: "Referrals", href: "/provider/referrals", group: "insights" },
      { icon: Crown, label: "Saji Pro", href: "/provider/pro", group: "insights" },
      { icon: User, label: "Profile", href: "/provider/profile", hasSubmenu: true, group: null },
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
    menuItems = [
      { icon: Briefcase, label: "Today's Jobs", href: "/provider/jobs", exact: true, badge: pendingJobs || undefined, group: null },
      { icon: Calendar, label: "My Calendar", href: "/provider/jobs?tab=calendar", group: null },
      { icon: Wrench, label: "Service Menu", href: "/provider/services", group: null },
      { icon: Rocket, label: "Offers", href: "/provider/offers", group: null },
      { icon: Package, label: "Rentals", href: "/provider/rentals", group: null },
      { icon: Wallet, label: "Earnings", href: "/provider/wallet", group: null },
      { icon: Home, label: "Home", href: "/provider", exact: true, group: null },
      { icon: LayoutDashboard, label: "Pro Dashboard", href: "/provider/pro/dashboard", group: null },
      // Team-building is a real Saji Pro perk, not a Business-only one — a
      // solo Pro provider can already convert to a Business account from
      // My Account (completeBusinessOnboarding), this just makes that path
      // directly discoverable from the nav instead of buried in settings.
      // Free-tier solo providers don't get this item at all.
      ...(isPro ? [{ icon: Users, label: "Team", href: "/provider/team", group: null }] : []),
      { icon: Megaphone, label: "Requests", href: "/provider/requests", group: null },
      { icon: ClipboardList, label: "Quotes", href: "/provider/quotes", group: null },
      { icon: Handshake, label: "Service Requests", href: "/provider/service-requests", group: null },
      { icon: Radar, label: "Opportunities", href: "/provider/opportunities", group: null },
      { icon: MessageCircle, label: "Messages", href: "/provider/messages", badge: unreadMessages || undefined, group: null },
      { icon: Store, label: "My Shop", href: "/provider/shop", group: "business" },
      { icon: ImageIcon, label: "My Content", href: "/provider/content", group: "business" },
      { icon: FileText, label: "Invoices", href: "/provider/invoices", group: "business" },
      { icon: BarChart3, label: "Analytics", href: "/provider/analytics", group: "insights" },
      { icon: Users, label: "Clients", href: "/provider/clients", group: "insights" },
      { icon: Gift, label: "Referrals", href: "/provider/referrals", group: "insights" },
      { icon: Crown, label: "Saji Pro", href: "/provider/pro", group: "insights" },
      { icon: User, label: "Profile", href: "/provider/profile", hasSubmenu: true, group: null },
    ]
  }

  const GROUP_LABEL: Record<string, string> = {
    business: "Business",
    insights: "Insights",
  }

  // Everything beyond the primary bottom-nav items — reachable via the
  // "More" tab as well as the full hamburger drawer above.
  const moreItems = menuItems.slice(primaryCount)

  const profileMenuItems = [
    { label: "Professional Profile", href: "/provider/profile/professional" },
    { label: "My Account", href: "/provider/profile/account" },
    { label: "Work Area & Skills", href: "/provider/profile/skills" },
    { label: "Verification", href: "/provider/profile/verification" },
    { label: "Certifications", href: "/provider/profile/certifications" },
    { label: "Driver Profile", href: "/provider/profile/driver" },
    { label: "Proof of Work", href: "/provider/profile/proof" },
    { label: "Payment Methods", href: "/provider/profile/payments" },
    { label: "Star Ratings", href: "/provider/profile/ratings" },
    { label: "Help & Support", href: "/provider/profile/help" },
    { label: "Settings", href: "/provider/profile/settings" },
  ]

  const isItemActive = (item: typeof menuItems[0]) => {
    if (item.exact) return pathname === item.href
    return pathname === item.href || pathname.startsWith(item.href + "/")
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed left-0 top-0 w-64 h-dvh bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-300 z-50 flex flex-col`}
      >
        {/* Sidebar Header */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <Logo size="md" showText />
            <p className="text-[11px] text-muted-foreground mt-1">Service Provider Portal</p>
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
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <AccountMenu alwaysShowLabel />
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item, i) => {
            const IconComponent = item.icon
            const active = isItemActive(item)
            const showGroupLabel = item.group && item.group !== menuItems[i - 1]?.group
            const groupLabel = showGroupLabel && (
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {GROUP_LABEL[item.group as string]}
              </p>
            )

            if (item.hasSubmenu) {
              return (
                <div key={item.href}>
                  {groupLabel}
                  <button
                    onClick={() => setExpandedMenu(expandedMenu === "profile" ? null : "profile")}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${
                      active
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <IconComponent className="w-5 h-5" />
                      <span className="font-medium text-xs">{item.label}</span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${expandedMenu === "profile" ? "rotate-180" : ""}`}
                    />
                  </button>

                  {expandedMenu === "profile" && (
                    <div className="mt-1 ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-1">
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
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${
                    active
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <IconComponent className="w-5 h-5" />
                    <span className="font-medium text-xs">{item.label}</span>
                    {item.isNew && (
                      <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-full px-1.5 py-0.5">
                        NEW
                      </span>
                    )}
                  </div>
                  {item.badge && (
                    <span className="bg-red-500 text-white text-[11px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
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
        <div className="flex justify-around py-2">
          {menuItems.slice(0, primaryCount).map((item) => {
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
