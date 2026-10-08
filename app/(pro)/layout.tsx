"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import ProviderSidebar from "@/components/provider-sidebar"
import ProviderTopbar from "@/components/provider-topbar"
import FloatingChatButton from "@/components/floating-chat-button"
import { LocationBootstrap } from "@/components/geo/location-bootstrap"
import { AccountSuspendedScreen } from "@/components/account-status/account-suspended-screen"
import { DisputeBanner } from "@/components/account-status/dispute-banner"
import { ShopRegistrationBanner } from "@/components/account-status/shop-registration-banner"
import { getMyAccountStatus, type MyOpenDispute } from "@/lib/actions/account-status"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed"

/**
 * The single Saji Pro shell, shared by the service half (/provider/*) and the
 * merchant half (/shopkeeper/*).
 *
 * Both used to be separate portals with their own layout, sidebar, topbar and
 * bottom nav, so an account that both offered services and ran a shop had to
 * switch between two products. They now live in one route group with this one
 * chrome. The group is parenthesised, so it contributes nothing to the URL —
 * every existing /provider/... and /shopkeeper/... link, bookmark and
 * notification deep-link still resolves exactly as before.
 */
export default function SajiProLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { t } = useLocalization()
  const { isAuthenticated, isLoading, user, logout } = useAuthContext()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [openDisputes, setOpenDisputes] = useState<MyOpenDispute[]>([])
  const { isCollapsed, toggle: toggleCollapsed } = useSidebarCollapsed()

  const pathname = usePathname()

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) { router.push("/auth/login"); return }
    // A provider who just switched to another role via the account switcher
    // (see components/account-menu.tsx) still has this layout mounted for a
    // moment while that control's own effect navigates them on to the
    // destination portal — bouncing to login here instead would race that
    // navigation and win, since this effect and that one both react to the
    // same session update. Tolerating all 3 switchable roles (not just
    // shopkeeper) covers every direction that switch can go. Every other
    // role/logged-out case still gets sent to login as before.
    if (user?.role !== "provider" && user?.role !== "shopkeeper" && user?.role !== "customer") {
      router.push("/auth/login")
    }
  }, [isAuthenticated, isLoading, user, router])

  useEffect(() => {
    if (!isAuthenticated || (user?.role !== "provider" && user?.role !== "shopkeeper")) return
    getMyAccountStatus().then((status) => setOpenDisputes(status.openDisputes))
  }, [isAuthenticated, user])

  // Messages live under whichever half of the portal the user is currently
  // in, so a suspended account keeps its route to support either way.
  const messagesBasePath = pathname?.startsWith("/shopkeeper") ? "/shopkeeper/messages" : "/provider/messages"

  const isSuspended = (user?.role === "provider" || user?.role === "shopkeeper") && user?.isActive === false
  if (!isLoading && isSuspended && !pathname?.startsWith(messagesBasePath)) {
    return <AccountSuspendedScreen messagesBasePath={messagesBasePath} onLogout={logout} />
  }

  // Deliberately keyed on `user` rather than `isLoading`/`isAuthenticated`:
  // next-auth's `update()` (used by refreshSession() inside
  // components/account-menu.tsx's role switcher) flips its shared `status`
  // to "loading" for the duration of that request, which would otherwise
  // trip this guard and unmount {children} — losing that page's local state
  // — even though the already-cached `user` data hasn't gone anywhere.
  // `user` itself is only ever null before the first session resolves or
  // once truly logged out, so this keeps the exact same visible behavior for
  // those cases while no longer flickering to the spinner on every in-place
  // session refresh. Tolerating all 3 switchable roles (not just shopkeeper)
  // avoids a race against the switcher's own hard-navigation effect,
  // whichever role it's headed to.
  if (!user || (user.role !== "provider" && user.role !== "shopkeeper" && user.role !== "customer")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Upgrades this session's city-level IP position to a real GPS fix in
          the background. Renders nothing and blocks nothing — the feed has
          already been served from the IP origin by the time it runs. */}
      <LocationBootstrap />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-xs focus:font-medium focus:text-white"
      >
        {t("customer.layout.skipToContent")}
      </a>

      {/* Sidebar */}
      <ProviderSidebar
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      {/* Floating Chat Button */}
      <FloatingChatButton />

      {/* Main Content */}
      <div className={isCollapsed ? "lg:pl-20" : "lg:pl-64"}>
        <ProviderTopbar onMenuClick={() => setMobileNavOpen(true)} />
        {/* pb-36 / lg:pb-24 reserve the floating chat button's footprint as
            well as the bottom nav's; see app/customer/layout.tsx.

            The min-height subtracts the topbar rather than being a plain
            min-h-screen: <main> starts below that 64px bar, so demanding a
            full viewport here made every page 64px taller than the screen and
            left the whole portal scrollable by that much — visible on any
            page built to fill the viewport exactly, such as Messages. */}
        <main id="main-content" className="min-h-[calc(100dvh-4rem)] pb-36 lg:pb-24">
          {/* Progressive KYC deliberately adds nothing to this screen. The
              home screen is built to a fixed design (see the rebuild in
              c269f4d) in which the status card sits directly below the
              topbar, so a verification banner here would push every element
              below it out of place. Nothing is lost: the restricted actions
              refuse themselves server-side (lib/verification-gate.ts) and
              open the wizard at the moment they are attempted, which is what
              "progressive" means here — the ask arrives with the action, not
              as a permanent fixture above unrelated work. */}
          {/* Merchant half: renders nothing unless this account has a shop
              that still needs registering, which is what lets the shared
              shell mount it for every Saji Pro page. */}
          <div className="px-4 pt-4 lg:px-6 empty:hidden">
            <ShopRegistrationBanner />
          </div>
          {openDisputes.length > 0 && (
            <div className="px-4 lg:px-6 pt-4">
              <DisputeBanner disputes={openDisputes} messagesBasePath={messagesBasePath} />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}
