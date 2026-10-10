"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AlertTriangle, Clock, Lock } from "lucide-react"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { getMyShopAccount } from "@/backend/actions/shopkeeper-account"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

/**
 * "Your shop still needs registering" — lifted out of the old shopkeeper
 * layout so it survives the merge into the single Saji Pro shell.
 *
 * It reads the shop profile's own `isVerified` rather than the account-wide
 * kycStatus: those were the same field until progressive KYC, but kycStatus
 * now means "the verdict on submitted identity documents", which says nothing
 * about whether this particular shop has been registered. `shopVerified`
 * starts null so a registered shop never sees the banner flash before the
 * answer arrives.
 *
 * Renders nothing for an account with no shop at all, which is what lets the
 * shared shell mount it unconditionally.
 */
export function ShopRegistrationBanner() {
  const { t } = useLocalization()
  const { isAuthenticated } = useAuthContext()
  const pathname = usePathname()

  const [shopVerified, setShopVerified] = useState<boolean | null>(null)
  const [hasSubmittedRegistration, setHasSubmittedRegistration] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    getMyShopAccount()
      .then((account) => {
        if (!account || cancelled) return
        setShopVerified(account.isVerified)
        setHasSubmittedRegistration(account.hasSubmittedRegistration)
        setRejectionReason(account.rejectionReason)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  // Hidden on the registration page itself — telling someone to register
  // while they are filling the registration form is noise.
  if (shopVerified !== false || pathname?.startsWith("/shopkeeper/register")) return null

  if (rejectionReason) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-red-800 dark:text-red-300">{t("shopkeeper.layout.registrationRejectedTitle")}</p>
          <p className="mt-0.5 text-[11px] text-red-700 dark:text-red-400">
            {t("shopkeeper.layout.registrationRejectedMessage", { reason: rejectionReason })}
          </p>
        </div>
        <Link
          href="/shopkeeper/register"
          className="flex-shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-red-700"
        >
          {t("shopkeeper.layout.resubmit")}
        </Link>
      </div>
    )
  }

  if (hasSubmittedRegistration) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
        <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t("shopkeeper.layout.registrationUnderReviewTitle")}</p>
          <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">{t("shopkeeper.layout.registrationUnderReviewHint")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
      <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t("shopkeeper.layout.registrationIncompleteTitle")}</p>
        <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">{t("shopkeeper.layout.registrationIncompleteHint")}</p>
      </div>
      <Link
        href="/shopkeeper/register"
        className="flex-shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-amber-700"
      >
        {t("shopkeeper.layout.getStarted")}
      </Link>
    </div>
  )
}
