"use client"

import { useEffect, useState } from "react"
import { Gift, Copy, Share2, Users, DollarSign, Check, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getReferralSummary, type ReferralSummary } from "@/lib/actions/referrals"
import { formatRelativeTime } from "@/lib/format"
import { useLocalization } from "@/lib/hooks/useLocalization"

const REFERRAL_REWARD_KES = 500

export default function ReferralsPage() {
  const { t, formatMoney } = useLocalization()
  const [copied, setCopied] = useState(false)
  const [summary, setSummary] = useState<ReferralSummary>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [origin, setOrigin] = useState("")

  useEffect(() => {
    getReferralSummary().then(setSummary).finally(() => setIsLoading(false))
    setOrigin(window.location.origin)
  }, [])

  if (isLoading || !summary) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const referralLink = `${origin}/auth/signup?role=provider&ref=${summary.code}`

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(referralLink) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title: t("provider.referrals.shareTitle"), text: t("provider.referrals.shareText", { amount: formatMoney(REFERRAL_REWARD_KES) }), url: referralLink })
      else handleCopy()
    } catch { handleCopy() }
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">{t("provider.referrals.title")}</h1>
        <p className="text-xs text-muted-foreground mt-1">{t("provider.referrals.subtitle", { amount: formatMoney(REFERRAL_REWARD_KES) })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 border border-border rounded-xl text-center min-w-0">
          <Users className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-base sm:text-lg font-bold text-foreground truncate">{summary.invited}</p>
          <p className="text-[10px] text-muted-foreground truncate">{t("provider.referrals.statReferrals")}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center min-w-0">
          <Check className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
          <p className="text-base sm:text-lg font-bold text-foreground truncate">{summary.completed}</p>
          <p className="text-[10px] text-muted-foreground truncate">{t("provider.referrals.statActive")}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center min-w-0">
          <DollarSign className="w-4 h-4 text-amber-500 mx-auto mb-1" />
          <p className="text-base sm:text-lg font-bold text-foreground truncate">{formatMoney(summary.totalEarned)}</p>
          <p className="text-[10px] text-muted-foreground truncate">{t("provider.referrals.statEarned")}</p>
        </Card>
      </div>

      {/* Referral Code */}
      <Card className="p-5 border border-border rounded-xl text-center space-y-3">
        <Gift className="w-10 h-10 text-primary mx-auto" />
        <h2 className="font-bold text-foreground text-base">{t("provider.referrals.yourCodeTitle")}</h2>
        <div className="bg-muted rounded-xl p-3 flex items-center justify-center gap-3">
          <span className="text-base font-mono font-bold text-foreground tracking-wider">{summary.code}</span>
          <button onClick={handleCopy} aria-label={t("customer.referrals.copyCode")} className="p-2 rounded-lg hover:bg-card transition-colors">
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCopy} variant="outline" className="flex-1 rounded-xl"><Copy className="w-4 h-4 mr-1" />{copied ? t("provider.referrals.copied") : t("provider.referrals.copyLink")}</Button>
          <Button onClick={handleShare} className="flex-1 rounded-xl"><Share2 className="w-4 h-4 mr-1" />{t("provider.referrals.share")}</Button>
        </div>
      </Card>

      {/* How it works */}
      <Card className="p-4 border border-border rounded-xl">
        <h3 className="font-semibold text-foreground mb-3">{t("provider.referrals.howItWorksTitle")}</h3>
        <div className="space-y-3">
          {[
            { step: "1", title: t("provider.referrals.step1Title"), desc: t("provider.referrals.step1Desc") },
            { step: "2", title: t("provider.referrals.step2Title"), desc: t("provider.referrals.step2Desc") },
            { step: "3", title: t("provider.referrals.step3Title"), desc: t("provider.referrals.step3Desc", { amount: formatMoney(REFERRAL_REWARD_KES) }) },
          ].map(s => (
            <div key={s.step} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[11px] font-bold flex-shrink-0">{s.step}</div>
              <div>
                <p className="text-xs font-medium text-foreground">{s.title}</p>
                <p className="text-[11px] text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Referral History */}
      <Card className="p-4 border border-border rounded-xl">
        <h3 className="font-semibold text-foreground mb-3">{t("provider.referrals.yourReferralsTitle")}</h3>
        {summary.history.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground">{t("provider.referrals.emptyText")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {summary.history.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{r.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatRelativeTime(r.date)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${r.status === "REWARDED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>{r.status === "REWARDED" ? t("provider.referrals.statusActive") : t("provider.referrals.statusPending")}</span>
                  {r.status === "REWARDED" && <p className="text-[11px] font-medium text-emerald-600 mt-0.5">{t("provider.referrals.rewardPrefix", { amount: formatMoney(r.rewardAmount) })}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
