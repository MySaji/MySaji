"use client"

import { useEffect, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs"
import { Gift, Award, Tag, Ban, Trash2, PauseCircle, Loader2 } from "lucide-react"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import {
  getReferralOverview, voidReferral,
  getEndorsements, deleteEndorsement,
  getPlatformPromotions, forcePausePromotion,
  type AdminReferralSummary, type AdminEndorsement, type AdminPromotion,
} from "@/backend/actions/admin-marketing"

export default function AdminMarketingPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [referrals, setReferrals] = useState<AdminReferralSummary | null>(null)
  const [endorsements, setEndorsements] = useState<AdminEndorsement[]>([])
  const [promotions, setPromotions] = useState<AdminPromotion[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => {
    const [r, e, p] = await Promise.all([getReferralOverview(), getEndorsements(), getPlatformPromotions()])
    setReferrals(r)
    setEndorsements(e)
    setPromotions(p)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleVoidReferral = async (id: string) => {
    if (!confirm(t("admin.marketing.voidConfirm"))) return
    setBusyId(id)
    const result = await voidReferral({ referralId: id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleDeleteEndorsement = async (id: string) => {
    if (!confirm(t("admin.marketing.deleteEndorsementConfirm"))) return
    setBusyId(id)
    const result = await deleteEndorsement({ endorsementId: id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handlePausePromotion = async (id: string) => {
    setBusyId(id)
    const result = await forcePausePromotion({ promotionId: id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "REWARDED": case "ACTIVE": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
      case "PENDING": case "SCHEDULED": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
      case "ACTIVATED": return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
      case "CANCELLED": case "PAUSED": case "EXPIRED": return "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
      default: return "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
    }
  }

  if (isLoading || !referrals) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("admin.marketing.title")}</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("admin.marketing.subtitle")}</p>
      </div>

      <Tabs defaultValue="referrals">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="referrals" className="gap-2"><Gift size={14} />{t("admin.marketing.tabReferrals")}</TabsTrigger>
          <TabsTrigger value="endorsements" className="gap-2"><Award size={14} />{t("admin.marketing.tabEndorsements")}</TabsTrigger>
          <TabsTrigger value="promotions" className="gap-2"><Tag size={14} />{t("admin.marketing.tabPromotions")}</TabsTrigger>
        </TabsList>

        <TabsContent value="referrals" className="space-y-4 mt-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: t("admin.marketing.statTotalReferrals"), value: referrals.totalReferrals },
              { label: t("admin.marketing.statRewarded"), value: referrals.rewardedCount },
              { label: t("admin.marketing.statPending"), value: referrals.pendingCount },
              { label: t("admin.marketing.statRewardsPaid"), value: formatMoney(referrals.totalRewardsPaid) },
            ].map((s, i) => (
              <Card key={i} className="p-4">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{s.value}</p>
              </Card>
            ))}
          </div>
          <div className="space-y-2">
            {referrals.recent.map((r) => (
              <Card key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-white">{r.referrerName} <span className="text-gray-400">→</span> {r.referredUserName}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{r.referralCode} · {new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor(r.status)}`}>{r.status}</span>
                  {r.status !== "REWARDED" && r.status !== "CANCELLED" && (
                    <Button size="sm" variant="outline" onClick={() => handleVoidReferral(r.id)} disabled={busyId === r.id} className="gap-1 text-[11px] text-red-600 border-red-200">
                      <Ban size={13} />{t("admin.marketing.voidButton")}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {referrals.recent.length === 0 && (
              <Card className="p-8 text-center"><p className="text-xs text-gray-500 dark:text-gray-400">{t("admin.marketing.noReferrals")}</p></Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="endorsements" className="space-y-2 mt-6">
          {endorsements.map((e) => (
            <Card key={e.id} className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-900 dark:text-white">{e.fromUserName} <span className="text-gray-400">→</span> {e.toName}</p>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{e.message}</p>
                <p className="text-[11px] text-gray-400 mt-1">{new Date(e.createdAt).toLocaleDateString()}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleDeleteEndorsement(e.id)} disabled={busyId === e.id} className="gap-1 text-[11px] text-red-600 border-red-200 flex-shrink-0">
                <Trash2 size={13} />{t("admin.marketing.deleteButton")}
              </Button>
            </Card>
          ))}
          {endorsements.length === 0 && (
            <Card className="p-8 text-center"><p className="text-xs text-gray-500 dark:text-gray-400">{t("admin.marketing.noEndorsements")}</p></Card>
          )}
        </TabsContent>

        <TabsContent value="promotions" className="space-y-2 mt-6">
          {promotions.map((p) => (
            <Card key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900 dark:text-white">{p.name} <span className="text-gray-400 font-mono text-[11px]">({p.code})</span></p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {p.shopName} · {p.type === "PERCENTAGE" ? `${p.value}%` : p.type === "FIXED" ? formatMoney(p.value) : "BOGO"} · {t("admin.marketing.usedCount", { count: p.usedCount, max: p.maxUses ?? "∞" })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor(p.status)}`}>{p.status}</span>
                {p.status !== "PAUSED" && p.status !== "EXPIRED" && (
                  <Button size="sm" variant="outline" onClick={() => handlePausePromotion(p.id)} disabled={busyId === p.id} className="gap-1 text-[11px] text-amber-600 border-amber-200">
                    <PauseCircle size={13} />{t("admin.marketing.pauseButton")}
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {promotions.length === 0 && (
            <Card className="p-8 text-center"><p className="text-xs text-gray-500 dark:text-gray-400">{t("admin.marketing.noPromotions")}</p></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
