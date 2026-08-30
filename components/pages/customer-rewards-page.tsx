"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Award, Star, TrendingUp, Loader2, Clock } from "lucide-react"
import { getLoyaltySummary, redeemLoyaltyPoints, type LoyaltySummary } from "@/lib/actions/loyalty"
import { formatRelativeTime } from "@/lib/format"
import { useLocalization } from "@/lib/hooks/useLocalization"

export function CustomerRewardsPage() {
  const { t, formatMoney } = useLocalization()
  const [summary, setSummary] = useState<LoyaltySummary>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [redeemError, setRedeemError] = useState("")
  const [redeemSuccess, setRedeemSuccess] = useState("")

  const refresh = () => getLoyaltySummary().then(setSummary)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  if (isLoading || !summary) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const canRedeem = summary.points >= summary.minRedeemable

  const handleRedeem = async () => {
    setIsRedeeming(true)
    setRedeemError("")
    setRedeemSuccess("")
    const result = await redeemLoyaltyPoints()
    setIsRedeeming(false)
    if (!result.success) { setRedeemError(result.error); return }
    setRedeemSuccess(t("customer.rewards.redeemSuccess", { amount: formatMoney(result.creditedAmount) }))
    await refresh()
  }

  const TYPE_LABEL: Record<string, string> = {
    EARN: t("customer.rewards.earned"),
    REDEEM: t("customer.rewards.redeemed"),
    ADJUST: t("customer.rewards.adjusted"),
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 lg:py-8">
        {/* Hero Card */}
        <Card className="p-6 mb-6 border-0 shadow-lg bg-gradient-to-br from-primary via-primary/95 to-blue-700 text-primary-foreground rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
              <Award className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold mb-2">{t("customer.rewards.heroTitle")}</h1>
            <p className="text-primary-foreground/80 text-xs mb-5">{t("customer.rewards.heroSubtitle")}</p>

            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4">
              <p className="text-[11px] text-primary-foreground/70 mb-1 uppercase tracking-wider font-medium">{t("customer.rewards.pointsBalance")}</p>
              <p className="text-2xl font-bold tracking-wide">{summary.points.toLocaleString()}</p>
              <p className="text-[11px] text-primary-foreground/70 mt-1">{t("customer.rewards.worthLabel", { amount: formatMoney(summary.points) })}</p>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Card className="p-4 border-0 shadow-sm text-center">
            <Star className="w-5 h-5 text-amber-500 mx-auto mb-1.5" />
            <p className="text-lg font-bold text-foreground">{summary.points.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{t("customer.rewards.currentPoints")}</p>
          </Card>
          <Card className="p-4 border-0 shadow-sm text-center">
            <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1.5" />
            <p className="text-lg font-bold text-foreground">{summary.lifetimePoints.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{t("customer.rewards.lifetimePoints")}</p>
          </Card>
        </div>

        {/* Redeem */}
        <Card className="p-5 border-0 shadow-sm mb-6">
          <h3 className="font-semibold text-foreground mb-1">{t("customer.rewards.redeemTitle")}</h3>
          <p className="text-[11px] text-muted-foreground mb-4">{t("customer.rewards.redeemDesc", { min: summary.minRedeemable })}</p>
          {redeemSuccess && <p className="text-xs text-emerald-600 mb-3">{redeemSuccess}</p>}
          {redeemError && <p className="text-xs text-red-600 mb-3">{redeemError}</p>}
          <Button className="w-full rounded-xl" onClick={handleRedeem} disabled={!canRedeem || isRedeeming}>
            {isRedeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.rewards.redeemButton", { amount: formatMoney(summary.points) })}
          </Button>
          {!canRedeem && (
            <p className="text-[11px] text-muted-foreground mt-2 text-center">{t("customer.rewards.notEnoughPoints", { min: summary.minRedeemable })}</p>
          )}
        </Card>

        {/* History */}
        <div>
          <h3 className="font-semibold text-foreground mb-3">{t("customer.rewards.historyTitle")}</h3>
          {summary.history.length === 0 ? (
            <Card className="p-8 text-center border-0 shadow-sm">
              <p className="text-xs text-muted-foreground">{t("customer.rewards.noHistory")}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {summary.history.map((item) => (
                <Card key={item.id} className="p-3 border-0 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs text-foreground">{TYPE_LABEL[item.type] ?? item.type}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelativeTime(item.createdAt)}</p>
                    </div>
                    <span className={`text-xs font-bold ${item.points >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                      {item.points >= 0 ? "+" : ""}{item.points.toLocaleString()}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
