"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Store, Package, ClipboardList, Loader2, Crown, ArrowRight, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getMyProviderShopStatus, setupProviderShop, type ProviderShopStatus } from "@/lib/actions/provider-shop"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ProviderShopPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [status, setStatus] = useState<ProviderShopStatus | null>(null)
  const [shopName, setShopName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [needsPro, setNeedsPro] = useState(false)

  useEffect(() => {
    getMyProviderShopStatus().then(setStatus).finally(() => setIsLoading(false))
  }, [])

  const handleCreateShop = async () => {
    setIsSubmitting(true)
    setError("")
    setNeedsPro(false)
    const result = await setupProviderShop({ shopName })
    setIsSubmitting(false)
    if (!result.success) {
      setError(result.error)
      if (result.requiresPro) setNeedsPro(true)
      return
    }
    setStatus({ hasShop: true, shopName })
  }

  if (isLoading || !status) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Shop already set up — a simple hub into the real, fully-working product
  // and order management pages (the same ones Shopkeeper accounts use; this
  // provider's ShopkeeperProfile is a real linked row, not a stub).
  if (status.hasShop) {
    return (
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
        <div className="text-center pt-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 mx-auto mb-3 flex items-center justify-center">
            <Store className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{status.shopName}</h1>
          <p className="text-xs text-muted-foreground mt-1">{t("provider.shop.hubSubtitle")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/shopkeeper/products">
            <Card className="p-6 border border-border rounded-2xl hover:border-primary hover:shadow-md transition-all h-full">
              <Package className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-semibold text-foreground text-sm mb-1">{t("provider.shop.manageProductsTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("provider.shop.manageProductsDesc")}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                {t("provider.shop.openLabel")} <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Card>
          </Link>
          <Link href="/shopkeeper/orders">
            <Card className="p-6 border border-border rounded-2xl hover:border-primary hover:shadow-md transition-all h-full">
              <ClipboardList className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-semibold text-foreground text-sm mb-1">{t("provider.shop.manageOrdersTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("provider.shop.manageOrdersDesc")}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                {t("provider.shop.openLabel")} <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Card>
          </Link>
        </div>
      </div>
    )
  }

  // Not Pro yet — pitch the perk instead of a form that will just fail.
  if (needsPro) {
    return (
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
        <Card className="border border-border rounded-2xl p-6 sm:p-8 text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Crown className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">{t("provider.shop.proRequiredTitle")}</h1>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{t("provider.shop.proRequiredDesc")}</p>
          </div>
          <Link href="/provider/pro">
            <Button size="lg" className="rounded-xl font-semibold gap-2">
              <Crown className="w-4 h-4" />
              {t("provider.shop.upgradeToProButton")}
            </Button>
          </Link>
        </Card>
      </div>
    )
  }

  // No shop yet, status unknown whether they're Pro — show the pitch +
  // setup form; setupProviderShop itself is the real Pro gate, so a non-Pro
  // provider who tries anyway lands on the screen above instead of silently
  // failing.
  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      <div className="text-center pt-8">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 mx-auto mb-4 flex items-center justify-center">
          <Store className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">{t("provider.shop.setupTitle")}</h1>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">{t("provider.shop.setupDesc")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Package, title: t("provider.shop.benefitProductsTitle"), desc: t("provider.shop.benefitProductsDesc") },
          { icon: ClipboardList, title: t("provider.shop.benefitOrdersTitle"), desc: t("provider.shop.benefitOrdersDesc") },
          { icon: CheckCircle2, title: t("provider.shop.benefitNoNewAccountTitle"), desc: t("provider.shop.benefitNoNewAccountDesc") },
        ].map((b, i) => (
          <Card key={i} className="p-4 border border-border rounded-xl text-center">
            <b.icon className="w-8 h-8 text-primary mx-auto mb-2" />
            <h3 className="font-semibold text-foreground text-xs mb-1">{b.title}</h3>
            <p className="text-[10px] text-muted-foreground">{b.desc}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 border border-border rounded-2xl space-y-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("provider.shop.shopNameLabel")}</label>
          <Input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder={t("provider.shop.shopNamePlaceholder")}
            className="rounded-lg bg-card border-border"
            disabled={isSubmitting}
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button
          onClick={handleCreateShop}
          disabled={shopName.trim().length < 2 || isSubmitting}
          className="w-full py-5 text-sm font-bold rounded-xl"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Store className="w-5 h-5 mr-2" />}
          {t("provider.shop.createShopButton")}
        </Button>
      </Card>
    </div>
  )
}
