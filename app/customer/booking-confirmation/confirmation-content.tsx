"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { getJobById, type JobDetail } from "@/lib/actions/jobs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Check, Clock, MapPin, DollarSign, MessageCircle, Phone, Loader2 } from "lucide-react"

export default function BookingConfirmationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, tn, formatMoney } = useLocalization()

  const jobId = searchParams.get("jobId")
  const [job, setJob] = useState<JobDetail>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!jobId) {
      setIsLoading(false)
      return
    }
    getJobById(jobId)
      .then(setJob)
      .finally(() => setIsLoading(false))
  }, [jobId])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-lg font-semibold text-foreground">{t("customer.bookingConfirmation.notFound")}</p>
        <Button onClick={() => router.push("/customer/home")}>{t("customer.bookingConfirmation.backToHome")}</Button>
      </div>
    )
  }

  const scheduled = new Date(job.scheduledDate)

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full py-6 space-y-6">
        {/* Success Card */}
        <Card className="p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-green-600" />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">{t("customer.bookingConfirmation.title")}</h1>
            <p className="text-muted-foreground">{t("customer.bookingConfirmation.subtitle")}</p>
          </div>

          {/* Booking Details */}
          <Card className="bg-muted p-6 space-y-4 border-0">
            <div className="text-left">
              <p className="text-sm text-muted-foreground mb-1">{t("customer.bookingConfirmation.bookingReference")}</p>
              <p className="text-2xl font-bold text-foreground">{job.id}</p>
            </div>

            <hr className="border-border" />

            <div className="space-y-3 text-left">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("customer.bookingConfirmation.dateTime")}</p>
                  <p className="font-semibold text-foreground">
                    {scheduled.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} {t("customer.bookingConfirmation.at")}{" "}
                    {scheduled.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("customer.bookingConfirmation.location")}</p>
                  <p className="font-semibold text-foreground">{job.location}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("customer.bookingConfirmation.estimatedCost")}</p>
                  <p className="font-semibold text-foreground text-lg">{formatMoney(job.price)}</p>
                </div>
              </div>
            </div>

            <hr className="border-border" />

            <div className="text-left">
              <p className="text-sm text-muted-foreground mb-2">{t("customer.bookingConfirmation.providerInformation")}</p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                  <span className="font-bold text-primary">{job.providerName.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-semibold text-foreground">{job.providerName}</p>
                  <p className="text-xs text-muted-foreground">⭐ {job.providerRating} ({tn("customer.shop.reviewsCount", job.providerReviewCount)})</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Status Indicator */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-700 font-medium">
              ✓ {t("customer.bookingConfirmation.providerNotified")}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={() => router.push("/customer/home")}>
                {t("customer.bookingConfirmation.backToHome")}
              </Button>
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => router.push("/customer/jobs")}>
                {t("customer.bookingConfirmation.viewMyJobs")}
              </Button>
            </div>

            <div className="flex gap-2 text-sm">
              <Button variant="ghost" size="sm" className="flex-1 flex items-center justify-center gap-2">
                <Phone className="w-4 h-4" />
                {t("customer.bookingConfirmation.callProvider")}
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 flex items-center justify-center gap-2">
                <MessageCircle className="w-4 h-4" />
                {t("customer.bookingConfirmation.messageProvider")}
              </Button>
            </div>
          </div>

          {/* Service Instructions */}
          <Card className="p-4 border-l-4 border-l-primary bg-blue-50">
            <h3 className="font-semibold text-foreground mb-2">{t("customer.bookingConfirmation.whatsNext")}</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>✓ {t("customer.bookingConfirmation.next1")}</li>
              <li>✓ {t("customer.bookingConfirmation.next2")}</li>
              <li>✓ {t("customer.bookingConfirmation.next3")}</li>
              <li>✓ {t("customer.bookingConfirmation.next4")}</li>
            </ul>
          </Card>
        </Card>
      </div>
    </div>
  )
}
