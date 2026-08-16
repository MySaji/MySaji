"use client"

import { useEffect, useState } from "react"
import { Store, ShoppingBag, Truck, Shield, Loader2, Clock, CheckCircle2, PartyPopper, ArrowRightLeft } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { getSupportTickets, createSupportTicket, type SupportTicketItem } from "@/lib/actions/support"
import { switchToShopkeeperAccount } from "@/lib/actions/shop-upgrade-requests"
import { useAuthContext } from "@/lib/auth-context"
import { useLocalization } from "@/lib/hooks/useLocalization"

const UPGRADE_SUBJECT = "Shop Owner Upgrade Request"
const POLL_INTERVAL_MS = 5000

export default function ShopPage() {
  const { t } = useLocalization()
  const { user, refreshSession } = useAuthContext()
  const [isLoading, setIsLoading] = useState(true)
  const [existingRequest, setExistingRequest] = useState<SupportTicketItem | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [isSwitching, setIsSwitching] = useState(false)
  const [switchError, setSwitchError] = useState("")
  const [switchStarted, setSwitchStarted] = useState(false)
  const [switchDestination, setSwitchDestination] = useState("/shopkeeper/register")
  const [shopDetails, setShopDetails] = useState({ name: "", description: "", category: "Hardware", location: "", phone: "", permitNumber: "", kraPin: "" })

  const refresh = () => getSupportTickets().then((tickets) => {
    setExistingRequest(tickets.find((t) => t.subject === UPGRADE_SUBJECT) ?? null)
  })

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  // Keep polling while pending so the "approved, ready to switch" screen
  // appears without a manual refresh — but the actual account switch is
  // never automatic: it only happens when the provider clicks the button
  // below, on their own schedule. Logging in with provider credentials
  // keeps landing them in the Provider portal until they choose to switch.
  useEffect(() => {
    if (!existingRequest) return
    const isResolved = existingRequest.status === "RESOLVED" || existingRequest.status === "CLOSED"
    if (isResolved) return
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [existingRequest])

  const handleSwitchToShopkeeper = async () => {
    setIsSwitching(true)
    setSwitchError("")
    try {
      const result = await switchToShopkeeperAccount()
      setIsSwitching(false)
      if (!result.success) { setSwitchError(result.error); return }
      // First time, the shop still needs to be registered; every switch
      // after that, the shop already exists — go straight to its dashboard.
      setSwitchDestination(result.isFirstTime ? "/shopkeeper/register" : "/shopkeeper")
      setSwitchStarted(true)
      await refreshSession()
    } catch {
      setIsSwitching(false)
      setSwitchError("Something went wrong switching your account. Please try again.")
    }
  }

  // Navigating right after refreshSession()'s promise resolves is NOT
  // actually safe — its promise can resolve before the session's own React
  // state (and the cookie the *next* page's guard reads) has caught up,
  // which can intermittently send the user through a stale-role bounce
  // chain instead of landing on /shopkeeper/register. Driving the
  // navigation off the real, observed `user.role` instead of off
  // promise-timing is what actually guarantees the destination page's own
  // guard sees "shopkeeper".
  useEffect(() => {
    if (switchStarted && user?.role === "shopkeeper") {
      window.location.href = switchDestination
    }
  }, [switchStarted, user?.role, switchDestination])

  const handleSubmitRequest = async () => {
    setIsSubmitting(true)
    setSubmitError("")
    const message = [
      `Shop name: ${shopDetails.name}`,
      `Category: ${shopDetails.category}`,
      `Description: ${shopDetails.description || "-"}`,
      `Location: ${shopDetails.location}`,
      `Phone: ${shopDetails.phone || "-"}`,
      `Business permit no.: ${shopDetails.permitNumber || "-"}`,
      `KRA PIN: ${shopDetails.kraPin || "-"}`,
    ].join("\n")

    try {
      const result = await createSupportTicket({ category: "shop_upgrade", subject: UPGRADE_SUBJECT, message })
      if (!result.success) { setSubmitError(result.error); return }
      setShowRegister(false)
      await refresh()
    } catch {
      setSubmitError("Something went wrong submitting your request. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Request already filed - show status instead of the form
  if (existingRequest) {
    if (switchStarted) {
      return (
        <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
          <Card className="border border-border rounded-2xl p-6 sm:p-8 text-center space-y-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <PartyPopper className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">{t("provider.shop.switchingAccountsTitle")}</h1>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t("provider.shop.switchingAccountsDesc")}
              </p>
            </div>
            <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
          </Card>
        </div>
      )
    }

    const isResolved = existingRequest.status === "RESOLVED"
    const isRejected = existingRequest.status === "CLOSED"

    if (isResolved) {
      return (
        <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
          <Card className="border border-border rounded-2xl p-6 sm:p-8 text-center space-y-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">{t("provider.shop.approvedTitle")}</h1>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t("provider.shop.approvedDesc")}
              </p>
            </div>
            {switchError && <p className="text-sm text-red-600">{switchError}</p>}
            <Button onClick={handleSwitchToShopkeeper} disabled={isSwitching} size="lg" className="rounded-xl font-semibold gap-2">
              {isSwitching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
              {t("provider.shop.switchButton")}
            </Button>
          </Card>
        </div>
      )
    }

    return (
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
        <Card className="border border-border rounded-2xl p-6 sm:p-8 text-center space-y-5">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${isRejected ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
            {isRejected ? <CheckCircle2 className="h-8 w-8" /> : <Clock className="h-8 w-8" />}
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">{isRejected ? t("provider.shop.reviewedTitle") : t("provider.shop.pendingReviewTitle")}</h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {isRejected
                ? t("provider.shop.rejectedDesc")
                : t("provider.shop.pendingDesc")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{t("provider.shop.ticketStatusLabel")} <span className="font-medium capitalize">{existingRequest.status.toLowerCase().replace("_", " ")}</span></p>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      <div className="text-center pt-8">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 mx-auto mb-4 flex items-center justify-center">
          <Store className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">{t("provider.shop.upgradeTitle")}</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {t("provider.shop.upgradeDesc")}
        </p>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: ShoppingBag, title: t("provider.shop.benefit1Title"), desc: t("provider.shop.benefit1Desc") },
          { icon: Truck, title: t("provider.shop.benefit2Title"), desc: t("provider.shop.benefit2Desc") },
          { icon: Shield, title: t("provider.shop.benefit3Title"), desc: t("provider.shop.benefit3Desc") },
        ].map((b, i) => (
          <Card key={i} className="p-4 border border-border rounded-xl text-center">
            <b.icon className="w-8 h-8 text-primary mx-auto mb-2" />
            <h3 className="font-semibold text-foreground text-sm mb-1">{b.title}</h3>
            <p className="text-[11px] text-muted-foreground">{b.desc}</p>
          </Card>
        ))}
      </div>

      <Button onClick={() => setShowRegister(true)} className="w-full py-5 text-base font-bold rounded-xl">
        <Store className="w-5 h-5 mr-2" />{t("provider.shop.requestUpgradeButton")}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">{t("provider.shop.trustFooter")}</p>

      {/* Registration Dialog */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="max-w-md rounded-xl max-h-[85vh] overflow-y-auto" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">{t("provider.shop.dialogTitle")}</h2>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.shop.shopNameLabel")}</label>
              <Input value={shopDetails.name} onChange={(e) => setShopDetails((p) => ({ ...p, name: e.target.value }))} placeholder={t("provider.shop.shopNamePlaceholder")} className="rounded-lg bg-card border-border" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.shop.descriptionLabel")}</label>
              <Textarea value={shopDetails.description} onChange={(e) => setShopDetails((p) => ({ ...p, description: e.target.value }))} placeholder={t("provider.shop.descriptionPlaceholder")} className="rounded-lg bg-card border-border min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t("provider.shop.categoryLabel")}</label>
                <select value={shopDetails.category} onChange={(e) => setShopDetails((p) => ({ ...p, category: e.target.value }))} className="w-full h-9 rounded-lg bg-card border border-border text-sm text-foreground px-2">
                  <option>{t("provider.shop.categoryHardware")}</option><option>{t("provider.shop.categoryElectronics")}</option><option>{t("provider.shop.categoryGroceries")}</option><option>{t("provider.shop.categoryFreshProduce")}</option><option>{t("provider.shop.categoryBuildingMaterials")}</option><option>{t("provider.shop.categoryGeneralStore")}</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t("provider.shop.phoneNumberLabel")}</label>
                <Input value={shopDetails.phone} onChange={(e) => setShopDetails((p) => ({ ...p, phone: e.target.value }))} placeholder="+254..." className="rounded-lg bg-card border-border" />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.shop.shopLocationLabel")}</label>
              <Input value={shopDetails.location} onChange={(e) => setShopDetails((p) => ({ ...p, location: e.target.value }))} placeholder={t("provider.shop.shopLocationPlaceholder")} className="rounded-lg bg-card border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t("provider.shop.permitNumberLabel")}</label>
                <Input value={shopDetails.permitNumber} onChange={(e) => setShopDetails((p) => ({ ...p, permitNumber: e.target.value }))} placeholder={t("provider.shop.optionalPlaceholder")} className="rounded-lg bg-card border-border" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t("provider.shop.kraPinLabel")}</label>
                <Input value={shopDetails.kraPin} onChange={(e) => setShopDetails((p) => ({ ...p, kraPin: e.target.value }))} placeholder={t("provider.shop.optionalPlaceholder")} className="rounded-lg bg-card border-border" />
              </div>
            </div>
            {submitError && <p className="text-sm text-red-600">{submitError}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowRegister(false)} className="flex-1 rounded-xl" disabled={isSubmitting}>{t("common.cancel")}</Button>
              <Button onClick={handleSubmitRequest} disabled={!shopDetails.name.trim() || !shopDetails.location.trim() || isSubmitting} className="flex-1 rounded-xl">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.shop.submitRequestButton")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
