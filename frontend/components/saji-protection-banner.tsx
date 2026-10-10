"use client"

import { useEffect, useState } from "react"
import { ShieldCheck } from "lucide-react"
import { getEffectivePlatformPreferences } from "@/backend/actions/admin-settings"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

/**
 * Gap 3's other half of the off-platform-leakage fix — ties a concrete
 * benefit to paying in-app, alongside the chat contact-info masking (see
 * lib/contact-info-filter.ts). This is trust messaging tied to an admin-
 * configurable coverage figure, not a real insurance-claims integration —
 * there's no underwriting partner wired up, so it never promises a claims
 * flow, just states the policy the way the cancellation policy text does
 * elsewhere in this same booking flow. Scoped to jobs (the scenario Gap 3
 * describes — a customer and provider meeting repeatedly and going to
 * cash), not product orders.
 */
export function SajiProtectionBanner({ className }: { className?: string }) {
  const { t, formatMoney } = useLocalization()
  const [coverageLimit, setCoverageLimit] = useState<number | null>(null)

  useEffect(() => {
    getEffectivePlatformPreferences().then((prefs) => setCoverageLimit(prefs.protectionCoverageLimit))
  }, [])

  if (coverageLimit == null) return null

  return (
    <div className={`flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 p-3 ${className ?? ""}`}>
      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-emerald-800 dark:text-emerald-400 leading-relaxed">
        {t("common.sajiProtectionBanner", { amount: formatMoney(coverageLimit) })}
      </p>
    </div>
  )
}
