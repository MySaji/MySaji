"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Truck, RotateCcw, ShieldCheck, Lock, BadgePercent, Heart, Star, ChevronRight, Store as StoreIcon } from "lucide-react"
import { getActiveBanners, type PublicBanner } from "@/lib/actions/banners"
import { ProductMarketplace } from "@/components/customer/product-marketplace"
import { useLocalization } from "@/lib/hooks/useLocalization"

const TOP_TRUST_ITEMS = [
  { icon: Truck, key: "customer.marketplace.trustFastDelivery" as const },
  { icon: RotateCcw, key: "customer.marketplace.trustEasyReturns" as const },
  { icon: Lock, key: "customer.marketplace.trustSecurePayments" as const },
  { icon: ShieldCheck, key: "customer.marketplace.trustBuyerProtection" as const },
  { icon: BadgePercent, key: "customer.marketplace.trustBestPrices" as const },
]

const BOTTOM_TRUST_ITEMS = [
  { icon: Heart, key: "customer.marketplace.trustLovedByCustomers" as const },
  { icon: Star, key: "customer.marketplace.trustTopRatedShops" as const },
  { icon: ShieldCheck, key: "customer.marketplace.trustQualityProducts" as const },
  { icon: Lock, key: "customer.marketplace.trustSecureShopping" as const },
]

function BannerCard({ banner, priority }: { banner: PublicBanner; priority: boolean }) {
  const content = (
    <div className="relative aspect-[16/9] sm:aspect-[2.2/1] w-full overflow-hidden rounded-2xl bg-muted">
      <Image src={banner.imageUrl} alt={banner.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 600px" priority={priority} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="text-white font-bold text-sm sm:text-base text-balance">{banner.title}</h3>
        {banner.subtitle && <p className="text-white/85 text-[11px] mt-1 max-w-md text-balance">{banner.subtitle}</p>}
      </div>
    </div>
  )
  return banner.linkUrl ? <Link href={banner.linkUrl}>{content}</Link> : content
}

export default function CustomerProductsPage() {
  const { t } = useLocalization()
  const [banners, setBanners] = useState<PublicBanner[]>([])

  useEffect(() => {
    getActiveBanners("PRODUCTS_TOP").then((b) => setBanners(b.slice(0, 2)))
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/customer/home" className="hover:text-foreground">{t("customer.marketplace.breadcrumbHome")}</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">{t("customer.marketplace.breadcrumbCurrent")}</span>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{t("customer.marketplace.pageTitle")}</h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{t("customer.marketplace.pageSubtitle")}</p>
          </div>
          <Button asChild variant="outline" className="rounded-xl w-fit">
            <Link href="/auth/signup?role=shopkeeper">
              <StoreIcon className="mr-1.5 h-4 w-4" />
              {t("customer.marketplace.sellOnSaji")}
            </Link>
          </Button>
        </div>

        {banners.length > 0 && (
          <div className={`mb-6 grid gap-4 ${banners.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
            {banners.map((banner, i) => <BannerCard key={banner.id} banner={banner} priority={i === 0} />)}
          </div>
        )}

        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
          {TOP_TRUST_ITEMS.map(({ icon: Icon, key }) => (
            <div key={key} className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card p-3 text-center shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <p className="text-[11px] font-medium text-foreground">{t(key)}</p>
            </div>
          ))}
        </div>

        <ProductMarketplace />

        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {BOTTOM_TRUST_ITEMS.map(({ icon: Icon, key }) => (
            <div key={key} className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card p-3 text-center shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <p className="text-[11px] font-medium text-foreground">{t(key)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
