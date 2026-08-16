"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import ProviderSidebar from "@/components/provider-sidebar"
import ProviderTopbar from "@/components/provider-topbar"
import FloatingChatButton from "@/components/floating-chat-button"
import { AccountMenu } from "@/components/account-menu"
import { Button } from "@/components/ui/button"
import { ShieldCheck } from "lucide-react"
import { AccountSuspendedScreen } from "@/components/account-status/account-suspended-screen"
import { DisputeBanner } from "@/components/account-status/dispute-banner"
import { getMyAccountStatus, type MyOpenDispute } from "@/lib/actions/account-status"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { t } = useLocalization()
  const { isAuthenticated, isLoading, user, logout } = useAuthContext()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [openDisputes, setOpenDisputes] = useState<MyOpenDispute[]>([])

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
    if (!isAuthenticated || user?.role !== "provider") return
    getMyAccountStatus().then((status) => setOpenDisputes(status.openDisputes))
  }, [isAuthenticated, user])

  const isSuspended = user?.role === "provider" && user?.isActive === false
  if (!isLoading && isSuspended && !pathname?.startsWith("/provider/messages")) {
    return <AccountSuspendedScreen messagesBasePath="/provider/messages" onLogout={logout} />
  }

  const isProviderPending = user?.role === "provider" && user?.kycStatus !== "approved"

  if (!isLoading && isProviderPending && !pathname?.startsWith("/provider/profile/verification")) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
        {/* Pending KYC otherwise has no way back except signing out entirely
            — but this account may already hold (or want to add) a Customer/
            Shopkeeper profile, so the switcher needs to stay reachable here
            too, not just once verification is approved. */}
        <div className="fixed top-4 right-4 z-10">
          <AccountMenu />
        </div>
        <div className="max-w-3xl w-full rounded-[32px] border border-slate-200 bg-white p-10 shadow-2xl dark:border-gray-800 dark:bg-gray-950">
          <div className="flex flex-col gap-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">{t("provider.layout.verificationRequiredTitle")}</h1>
            <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">
              {t("provider.layout.verificationRequiredBody")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("provider.layout.currentStatus")}</p>
                <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{user?.kycStatus === "rejected" ? t("provider.layout.statusRejected") : t("provider.layout.statusPendingReview")}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("provider.layout.nextStep")}</p>
                <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{t("provider.layout.nextStepSubmitDocs")}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button onClick={() => router.push("/provider/profile/verification")} className="rounded-2xl px-6 py-3">{t("provider.layout.completeVerification")}</Button>
              <Button variant="outline" onClick={() => router.push("/auth/login")} className="rounded-2xl px-6 py-3">{t("auth.logout")}</Button>
            </div>
          </div>
        </div>
      </div>
    )
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        {t("customer.layout.skipToContent")}
      </a>

      {/* Sidebar */}
      <ProviderSidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      {/* Floating Chat Button */}
      <FloatingChatButton />

      {/* Main Content */}
      <div className="lg:pl-64">
        <ProviderTopbar onMenuClick={() => setMobileNavOpen(true)} />
        <main id="main-content" className="min-h-screen pb-20 lg:pb-6">
          {openDisputes.length > 0 && (
            <div className="px-4 lg:px-6 pt-4">
              <DisputeBanner disputes={openDisputes} messagesBasePath="/provider/messages" />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}
