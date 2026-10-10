"use client"

import { useEffect, useState } from "react"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Gift, Copy, CheckCircle, Users, Wallet, ArrowRight, Share2, MessageCircle, Clock, Loader2 } from "lucide-react"
import Image from "next/image"
import { getReferralSummary, type ReferralSummary } from "@/backend/actions/referrals"
import { formatRelativeTime } from "@/backend/domain/format"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

const REWARD_AMOUNT = 500
const FRIEND_DISCOUNT = 300

export function CustomerReferralsPage() {
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const inviteLink = `${origin}/auth/signup?ref=${summary.code}`

  const copyCode = () => {
    navigator.clipboard.writeText(summary.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareMessage = t("customer.referrals.shareMessage", { amount: formatMoney(FRIEND_DISCOUNT), code: summary.code, link: inviteLink })

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 lg:py-8">
        {/* Hero Card */}
        <Card className="p-6 mb-6 border-0 shadow-lg bg-gradient-to-br from-primary via-primary/95 to-blue-700 text-primary-foreground rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
              <Gift className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold mb-2">{t("customer.referrals.heroTitle")}</h1>
            <p className="text-primary-foreground/80 text-xs mb-5">
              {t("customer.referrals.heroPre")} <strong>{formatMoney(REWARD_AMOUNT)}</strong> {t("customer.referrals.heroMid")} <strong>{formatMoney(FRIEND_DISCOUNT)} {t("customer.referrals.offSuffix")}</strong> {t("customer.referrals.heroPost")}
            </p>

            {/* Referral Code */}
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4">
              <p className="text-[11px] text-primary-foreground/70 mb-2 uppercase tracking-wider font-medium">{t("customer.referrals.yourCode")}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/20 rounded-lg px-4 py-3 font-mono text-base font-bold tracking-wider">{summary.code}</div>
                <Button onClick={copyCode} aria-label={t("customer.referrals.copyCode")} className="bg-white text-primary hover:bg-white/90 h-12 px-4 rounded-lg">
                  {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-4 border-0 shadow-sm text-center min-w-0">
            <Users className="w-5 h-5 text-primary mx-auto mb-1.5" />
            <p className="text-base sm:text-lg font-bold text-foreground truncate">{summary.invited}</p>
            <p className="text-[10px] text-muted-foreground truncate">{t("customer.referrals.invited")}</p>
          </Card>
          <Card className="p-4 border-0 shadow-sm text-center min-w-0">
            <CheckCircle className="w-5 h-5 text-emerald-600 mx-auto mb-1.5" />
            <p className="text-base sm:text-lg font-bold text-foreground truncate">{summary.completed}</p>
            <p className="text-[10px] text-muted-foreground truncate">{t("customer.referrals.completed")}</p>
          </Card>
          <Card className="p-4 border-0 shadow-sm text-center min-w-0">
            <Wallet className="w-5 h-5 text-amber-600 mx-auto mb-1.5" />
            <p className="text-base sm:text-lg font-bold text-foreground truncate">{formatMoney(summary.totalEarned)}</p>
            <p className="text-[10px] text-muted-foreground truncate">{t("customer.referrals.earned")}</p>
          </Card>
        </div>

        {/* Share Options */}
        <Card className="p-5 border-0 shadow-sm mb-6">
          <h3 className="font-semibold text-foreground mb-3">{t("customer.referrals.shareWithFriends")}</h3>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="rounded-xl bg-transparent gap-2 h-11" onClick={() => { if (typeof navigator.share !== 'undefined') { navigator.share({ text: shareMessage }) } }}>
              <Share2 className="w-4 h-4" />{t("customer.referrals.shareLinkButton")}
            </Button>
            <Button variant="outline" className="rounded-xl bg-transparent gap-2 h-11" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`)}>
              <MessageCircle className="w-4 h-4" />{t("customer.referrals.whatsapp")}
            </Button>
          </div>
        </Card>

        {/* How it works */}
        <Card className="p-5 border-0 shadow-sm mb-6">
          <h3 className="font-semibold text-foreground mb-4">{t("customer.referrals.howItWorks")}</h3>
          <div className="space-y-4">
            {[
              { step: "1", title: t("customer.referrals.step1Title"), desc: t("customer.referrals.step1Desc") },
              { step: "2", title: t("customer.referrals.step2Title"), desc: t("customer.referrals.step2Desc") },
              { step: "3", title: t("customer.referrals.step3Title"), desc: t("customer.referrals.step3Desc", { amount: formatMoney(FRIEND_DISCOUNT) }) },
              { step: "4", title: t("customer.referrals.step4Title"), desc: t("customer.referrals.step4Desc", { amount: formatMoney(REWARD_AMOUNT) }) },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">{item.step}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                </div>
                {i < 3 && <ArrowRight className="w-4 h-4 text-muted-foreground/30 mt-2 flex-shrink-0 hidden sm:block" />}
              </div>
            ))}
          </div>
        </Card>

        {/* Referral History */}
        <div>
          <h3 className="font-semibold text-foreground mb-3">{t("customer.referrals.referralHistory")}</h3>
          {summary.history.length === 0 ? (
            <Card className="p-8 text-center border-0 shadow-sm">
              <p className="text-xs text-muted-foreground">{t("customer.referrals.noHistory")}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {summary.history.map(ref => (
                <Card key={ref.id} className="p-3 border-0 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden">
                      <Image src={ref.avatar || "/placeholder.svg"} alt={ref.name} fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs text-foreground">{ref.name}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelativeTime(ref.date)}</p>
                    </div>
                    <div className="text-right">
                      {ref.status === "REWARDED" ? (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">+{formatMoney(ref.rewardAmount)}</span>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">{t("customer.referrals.pending")}</span>
                      )}
                    </div>
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
