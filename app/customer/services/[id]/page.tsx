"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { getServiceCategoryDetail, type ServiceCategoryDetail, type ServiceProviderCard } from "@/backend/actions/services"
import { recordView } from "@/backend/actions/recently-viewed"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Badge } from "@/frontend/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs"
import { Star, Clock, ArrowLeft, Phone, MessageCircle, Sparkles, ShieldCheck, MapPin, CalendarDays, CheckCircle2, Loader2 } from "lucide-react"
import Image from "next/image"

export default function ServiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { t, tn, formatMoney } = useLocalization()
  const STATUS_STYLE: Record<ServiceProviderCard["status"], { label: string; badge: string }> = {
    available: { label: t("customer.services.statusAvailable"), badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    busy: { label: t("customer.services.statusBusy"), badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
    booked: { label: t("customer.services.statusBookedToday"), badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  }
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [detail, setDetail] = useState<ServiceCategoryDetail>(null)
  const [isLoading, setIsLoading] = useState(true)

  const categoryId = params.id as string

  useEffect(() => {
    setIsLoading(true)
    getServiceCategoryDetail(categoryId)
      .then((result) => {
        setDetail(result)
        if (result) {
          recordView({
            targetType: "SERVICE",
            targetId: categoryId,
            title: result.title,
            subtitle: t("customer.serviceDetail.serviceLabel"),
            image: result.image,
            href: `/customer/services/${categoryId}`,
          })
        }
      })
      .finally(() => setIsLoading(false))
  }, [categoryId])

  const handleProviderAction = (providerId: string, action: "message" | "call") => {
    router.push(`/customer/messages?provider=${providerId}&action=${action}`)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-base font-semibold text-foreground">{t("customer.booking.serviceNotFound")}</p>
        <p className="text-xs text-muted-foreground">{t("customer.booking.serviceNoLongerAvailable")}</p>
        <Button onClick={() => router.push("/customer/services")}>{t("home.browseServices")}</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-primary to-primary/90 px-4 py-4 text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-white/20">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{detail.title}</h1>
            <p className="text-xs text-primary-foreground/80">{t("customer.serviceDetail.verifiedProvidersNearYou")}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-32">
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="relative h-48 w-full bg-muted md:h-64">
            <Image src={detail.image || "/placeholder.svg"} alt={detail.title} fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-2">
              <Badge className="bg-white/90 text-foreground">{t("customer.serviceDetail.nairobiAvailability")}</Badge>
              {detail.providers.length > 0 && (
                <Badge className="bg-emerald-500/90 text-white">{t("customer.serviceDetail.responseIn", { time: detail.providers[0].responseTime })}</Badge>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                {t("customer.serviceDetail.premiumService")}
              </div>
              <h2 className="text-xl font-bold text-foreground">{detail.title}</h2>
              <p className="mt-2 max-w-2xl text-xs leading-6 text-muted-foreground">{detail.description}</p>
            </div>
            {detail.providers.length > 0 && (
              <div className="rounded-2xl border border-border bg-muted/40 p-3 text-xs">
                <p className="text-muted-foreground">{t("customer.serviceDetail.typicalPrice")}</p>
                <p className="font-semibold text-foreground">
                  {formatMoney(Math.min(...detail.providers.map((p) => p.price)))} - {formatMoney(Math.max(...detail.providers.map((p) => p.price)))}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/40 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground"><ShieldCheck className="h-4 w-4 text-emerald-500" /> {t("customer.serviceDetail.verifiedProviders")}</div>
              <p className="text-xs text-muted-foreground">{t("customer.serviceDetail.verifiedProvidersHint")}</p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground"><Clock className="h-4 w-4 text-primary" /> {t("customer.serviceDetail.fastResponse")}</div>
              <p className="text-xs text-muted-foreground">{t("customer.serviceDetail.fastResponseHint")}</p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground"><MapPin className="h-4 w-4 text-primary" /> {t("customer.serviceDetail.localAvailability")}</div>
              <p className="text-xs text-muted-foreground">{t("customer.serviceDetail.localAvailabilityHint")}</p>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="providers" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="providers">{t("customer.serviceDetail.tabProviders")}</TabsTrigger>
            <TabsTrigger value="details">{t("customer.serviceDetail.tabServiceDetails")}</TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="space-y-3">
            {detail.providers.length === 0 && (
              <Card className="p-8 text-center text-xs text-muted-foreground">{t("customer.serviceDetail.noProviders")}</Card>
            )}
            {detail.providers.map((provider) => (
              <Card
                key={provider.serviceId}
                className={`cursor-pointer border-2 p-4 transition-all ${
                  selectedProvider === provider.serviceId
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:border-primary/30"
                }`}
                onClick={() => setSelectedProvider(provider.serviceId)}
              >
                <div className="flex flex-col gap-4 md:flex-row">
                  <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                    <Image src={provider.avatar || "/placeholder.svg"} alt={provider.name} fill className="object-cover" />
                  </div>

                  <div className="flex-1">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="flex items-center gap-2 font-bold text-foreground">
                          {provider.name}
                          {provider.verified && (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">{t("customer.favorites.verified")}</span>
                          )}
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${STATUS_STYLE[provider.status].badge}`}>
                            {STATUS_STYLE[provider.status].label}
                          </span>
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">{provider.bio}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-lg font-bold text-primary">{formatMoney(provider.price)}</p>
                        <p className="text-[11px] text-muted-foreground">{t("customer.serviceDetail.perService")}</p>
                      </div>
                    </div>

                    <div className="mb-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-semibold">{provider.rating}</span>
                        <span className="text-muted-foreground">({provider.reviewCount})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{provider.responseTime}</span>
                      </div>
                      <div className="text-muted-foreground">{tn("customer.favorites.jobsCount", provider.completedJobs)}</div>
                    </div>

                    {selectedProvider === provider.serviceId && (
                      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
                        <Button
                          className="flex-1 bg-primary hover:bg-primary/90"
                          onClick={(event) => {
                            event.stopPropagation()
                            router.push(`/customer/booking?service=${provider.serviceId}`)
                          }}
                        >
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {t("customer.serviceDetail.bookNow")}
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 bg-transparent"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedProvider(provider.serviceId)
                            handleProviderAction(provider.providerId, "message")
                          }}
                        >
                          <MessageCircle className="mr-1 h-4 w-4" />
                          {t("customer.serviceDetail.message")}
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 bg-transparent"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedProvider(provider.serviceId)
                            handleProviderAction(provider.providerId, "call")
                          }}
                        >
                          <Phone className="mr-1 h-4 w-4" />
                          {t("customer.serviceDetail.call")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="details" className="rounded-2xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("customer.serviceDetail.detail1")}</div>
              <div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("customer.serviceDetail.detail2")}</div>
              <div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("customer.serviceDetail.detail3")}</div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground">{t("customer.serviceDetail.selectedProvider")}</p>
            <p className="text-xs font-semibold text-foreground">{selectedProvider ? detail.providers.find((provider) => provider.serviceId === selectedProvider)?.name || t("customer.serviceDetail.chooseProvider") : t("customer.serviceDetail.chooseProvider")}</p>
          </div>
          <Button
            className="rounded-full px-4"
            onClick={() => {
              if (!selectedProvider) return
              router.push(`/customer/booking?service=${selectedProvider}`)
            }}
            disabled={!selectedProvider}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            {t("customer.serviceDetail.bookNowLower")}
          </Button>
        </div>
      </div>
    </div>
  )
}
