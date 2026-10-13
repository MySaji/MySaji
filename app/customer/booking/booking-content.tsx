"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"
import { getServiceForBooking, type ServiceForBooking } from "@/backend/actions/services"
import { getOfferForBooking, createOfferBooking } from "@/backend/actions/offers"
import { createBooking, getJobById, type JobDetail } from "@/backend/actions/jobs"
import { addServiceToCart } from "@/backend/actions/cart"
import { revalidateCartCount } from "@/frontend/lib/hooks/useCartCount"
import { capturePaypalOrder } from "@/backend/actions/payments"
import { getEffectivePlatformPreferences } from "@/backend/actions/admin-settings"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Input } from "@/frontend/components/ui/input"
import { ArrowLeft, Calendar, Clock, MapPin, Check, Loader2 } from "lucide-react"
import PaymentMethods from "@/frontend/components/payment/payment-methods"
import { AddressAutocompleteInput, type PlaceResult } from "@/frontend/components/maps/address-autocomplete-input"
import { SajiProtectionBanner } from "@/frontend/components/saji-protection-banner"

export default function BookingContent() {
  const { handleGateFailure } = useGatedAction()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, formatMoney } = useLocalization()

  const serviceId = searchParams.get("service")
  const offerId = searchParams.get("offer")
  const isOffer = !serviceId && !!offerId

  const [service, setService] = useState<ServiceForBooking>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddingToCart, setIsAddingToCart] = useState(false)
  const [error, setError] = useState("")

  const [step, setStep] = useState(1)
  const [pendingJobId, setPendingJobId] = useState<string | null>(null)
  const [isCapturingPaypal, setIsCapturingPaypal] = useState(false)
  const [resumeJob, setResumeJob] = useState<JobDetail>(null)
  const [isLoadingResume, setIsLoadingResume] = useState(false)
  const [bookingData, setBookingData] = useState({
    date: "",
    time: "",
    quantity: 1,
    location: "",
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    notes: "",
  })

  useEffect(() => {
    if (isOffer && offerId) {
      getOfferForBooking(offerId).then(setService).finally(() => setIsLoading(false))
      return
    }
    if (!serviceId) {
      setIsLoading(false)
      return
    }
    getServiceForBooking(serviceId)
      .then(setService)
      .finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, offerId])

  // PayPal redirects back here with ?paypal=return&token=<orderId>&jobId=<id>
  // after the customer approves on PayPal's site — capture the order now.
  // Stripe/PayPal cancel redirects (?status=cancelled / ?paypal=cancel) bring
  // the customer back to a job that already exists in PENDING_PAYMENT — that
  // job's real details are re-fetched rather than relying on in-memory wizard
  // state, which is gone after the full-page redirect round trip.
  useEffect(() => {
    const paypalFlag = searchParams.get("paypal")
    const orderId = searchParams.get("token")
    const returningJobId = searchParams.get("jobId")
    const cancelled = searchParams.get("status") === "cancelled"
    const resumeParam = searchParams.get("resume")

    if (resumeParam) {
      loadResumeJob(resumeParam)
    } else if (paypalFlag === "return" && orderId && returningJobId) {
      setIsCapturingPaypal(true)
      capturePaypalOrder(orderId).then((result) => {
        if (result.success) {
          router.replace(`/customer/booking-confirmation?jobId=${returningJobId}`)
        } else {
          setError(result.message ?? t("customer.wallet.paypalTopupFailed"))
          setIsCapturingPaypal(false)
          loadResumeJob(returningJobId)
        }
      })
    } else if ((paypalFlag === "cancel" || cancelled) && returningJobId) {
      loadResumeJob(returningJobId)
    }

    function loadResumeJob(jobId: string) {
      setIsLoadingResume(true)
      getJobById(jobId).then((job) => {
        setResumeJob(job)
        setPendingJobId(jobId)
        setIsLoadingResume(false)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Whether the customer pays here or pays the provider.
   *
   * Null until it is known, and the payment step is not offered before then:
   * showing a card form for a moment and snatching it away reads as the app
   * changing its mind about taking their money, which is the exact feeling
   * this whole arrangement exists to avoid.
   */
  const [payMode, setPayMode] = useState<"IN_APP" | "DIRECT" | "BOTH" | null>(null)
  useEffect(() => {
    getEffectivePlatformPreferences()
      .then((p) => setPayMode((p.jobPaymentMode as "IN_APP" | "DIRECT" | "BOTH") ?? "DIRECT"))
      .catch(() => setPayMode("DIRECT"))
  }, [])

  const handleConfirm = async () => {
    if ((!serviceId && !offerId) || pendingJobId) return
    setIsSubmitting(true)
    setError("")
    const result = isOffer && offerId
      ? await createOfferBooking({
          offerId,
          date: bookingData.date,
          time: bookingData.time,
          quantity: bookingData.quantity,
          location: bookingData.location,
          latitude: bookingData.latitude,
          longitude: bookingData.longitude,
          notes: bookingData.notes,
        })
      : await createBooking({
          serviceId: serviceId!,
          date: bookingData.date,
          time: bookingData.time,
          quantity: bookingData.quantity,
          location: bookingData.location,
          latitude: bookingData.latitude,
          longitude: bookingData.longitude,
          notes: bookingData.notes,
        })
    setIsSubmitting(false)
    if (!result.success) {
      // A verification refusal opens the wizard rather than leaving the
      // customer with a message and nowhere to act on it.
      if (handleGateFailure(result)) return
      setError(result.error)
      return
    }
    // Paying the provider directly means there is nothing to pay here, so
    // the booking is done and the customer goes straight to the confirmation
    // rather than to a payment step that would never complete.
    if (payMode === "DIRECT") {
      router.push(`/customer/booking-confirmation?jobId=${result.jobId}`)
      return
    }
    setPendingJobId(result.jobId)
  }

  const handleAddToCart = async () => {
    if (!serviceId) return
    setIsAddingToCart(true)
    setError("")
    const result = await addServiceToCart({
      serviceId,
      date: bookingData.date,
      time: bookingData.time,
      quantity: bookingData.quantity,
      notes: bookingData.notes,
    })
    setIsAddingToCart(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    void revalidateCartCount()
    router.push("/customer/cart")
  }

  if (isLoading || isCapturingPaypal || isLoadingResume) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {isCapturingPaypal && <p className="text-xs text-muted-foreground">{t("customer.booking.confirmingPaypal")}</p>}
      </div>
    )
  }

  // Resumed after a Stripe/PayPal cancel redirect — the job already exists in
  // PENDING_PAYMENT, so just re-show the real job details + payment options
  // instead of restarting the whole multi-step wizard.
  if (resumeJob) {
    const scheduled = new Date(resumeJob.scheduledDate)
    return (
      <div className="min-h-screen bg-background pb-24 lg:pb-0">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center gap-4">
            <button onClick={() => router.push("/customer/jobs")} className="p-2 hover:bg-white/20 rounded-lg">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold">{t("customer.booking.completeYourPayment")}</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          <Card className="p-6 space-y-6">
            <div className="bg-muted p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">{t("customer.booking.serviceLabel")}</span>
                <span className="font-semibold text-foreground">{resumeJob.title}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">{t("customer.booking.providerLabel")}</span>
                <span className="font-semibold text-foreground">{resumeJob.providerName}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">{t("customer.booking.dateTimeLabel")}</span>
                <span className="font-semibold text-foreground">{scheduled.toLocaleDateString()} {t("customer.bookingConfirmation.at")} {scheduled.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">{t("customer.booking.locationLabel")}</span>
                <span className="font-semibold text-foreground">{resumeJob.location}</span>
              </div>
              <div className="flex justify-between items-center py-2 bg-primary/10 px-3 rounded-lg">
                <span className="font-semibold text-foreground">{t("customer.booking.totalCostLabel")}</span>
                <span className="text-base font-bold text-primary">{formatMoney(resumeJob.price)}</span>
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            {payMode === "DIRECT" ? (
              <DirectPaymentNote />
            ) : (
              <PaymentMethods
                amount={resumeJob.price}
                jobId={pendingJobId}
                onSuccess={() => router.push(`/customer/booking-confirmation?jobId=${pendingJobId}`)}
              />
            )}
          </Card>
        </div>
      </div>
    )
  }

  if (!service) {
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
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-white/20 rounded-lg">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{t("customer.booking.bookTitle", { title: service.title })}</h1>
            <p className="text-primary-foreground/80 text-xs">{t("customer.booking.stepOf", { step, total: 3 })}</p>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`flex-1 h-2 rounded-full transition-all ${i <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Step 1: Schedule */}
        {step === 1 && (
          <Card className="p-6 space-y-6">
            <h2 className="text-lg font-bold text-foreground">{t("customer.booking.scheduleYourService")}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {t("customer.booking.selectDate")}
                </label>
                <Input
                  type="date"
                  value={bookingData.date}
                  onChange={(e) => setBookingData({ ...bookingData, date: e.target.value })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {t("customer.booking.selectTime")}
                </label>
                <Input
                  type="time"
                  value={bookingData.time}
                  onChange={(e) => setBookingData({ ...bookingData, time: e.target.value })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-2">{t("customer.booking.durationHours")}</label>
                <Input
                  type="number"
                  min="1"
                  value={bookingData.quantity}
                  onChange={(e) => setBookingData({ ...bookingData, quantity: Number.parseInt(e.target.value) || 1 })}
                  className="w-full"
                />
              </div>
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={() => {
                if (bookingData.date && bookingData.time) {
                  setStep(2)
                } else {
                  alert(t("customer.booking.fillAllFields"))
                }
              }}
            >
              {t("customer.wallet.continue")}
            </Button>
          </Card>
        )}

        {/* Step 2: Location */}
        {step === 2 && (
          <Card className="p-6 space-y-6">
            <h2 className="text-lg font-bold text-foreground">{t("customer.booking.serviceLocation")}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {t("customer.booking.address")}
                </label>
                <AddressAutocompleteInput
                  placeholder={t("customer.savedAddresses.fullAddressPlaceholder")}
                  value={bookingData.location}
                  onChange={(location) => setBookingData({ ...bookingData, location, latitude: undefined, longitude: undefined })}
                  onPlaceSelected={(place: PlaceResult) => setBookingData({ ...bookingData, location: place.address, latitude: place.latitude, longitude: place.longitude })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-2">{t("customer.booking.additionalNotes")}</label>
                <textarea
                  placeholder={t("customer.booking.additionalNotesPlaceholder")}
                  value={bookingData.notes}
                  onChange={(e) => setBookingData({ ...bookingData, notes: e.target.value })}
                  className="w-full p-2 border border-border rounded-lg bg-background text-foreground"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setStep(1)}>
                {t("customer.booking.backButton")}
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={() => {
                  if (bookingData.location) {
                    setStep(3)
                  } else {
                    alert(t("customer.booking.enterLocation"))
                  }
                }}
              >
                {t("customer.wallet.continue")}
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <Card className="p-6 space-y-6">
            <h2 className="text-lg font-bold text-foreground">{t("customer.booking.confirmYourBooking")}</h2>

            <div className="bg-muted p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">{t("customer.booking.serviceLabel")}</span>
                <span className="font-semibold text-foreground">{service.title}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">{t("customer.booking.providerLabel")}</span>
                <span className="font-semibold text-foreground">{service.providerName}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">{t("customer.booking.dateTimeLabel")}</span>
                <span className="font-semibold text-foreground">
                  {bookingData.date} {t("customer.bookingConfirmation.at")} {bookingData.time}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">{t("customer.booking.locationLabel")}</span>
                <span className="font-semibold text-foreground">{bookingData.location}</span>
              </div>
              <div className="flex justify-between items-center py-2 bg-primary/10 px-3 rounded-lg">
                <span className="font-semibold text-foreground">{t("customer.booking.totalCostLabel")}</span>
                <span className="text-base font-bold text-primary">
                  {formatMoney(service.basePrice * bookingData.quantity)}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 border border-border p-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t("customer.booking.cancellationPolicy")}</p>
            </div>

            <SajiProtectionBanner />

            {error && <p className="text-xs text-red-600">{error}</p>}

            {payMode === "DIRECT" && <DirectPaymentNote />}

            {pendingJobId && payMode !== "DIRECT" ? (
              <PaymentMethods
                amount={service.basePrice * bookingData.quantity}
                jobId={pendingJobId}
                onSuccess={() => router.push(`/customer/booking-confirmation?jobId=${pendingJobId}`)}
              />
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setStep(2)} disabled={isSubmitting || isAddingToCart}>
                    {t("customer.booking.backButton")}
                  </Button>
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90"
                    onClick={handleConfirm}
                    disabled={isSubmitting || isAddingToCart}
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    {t("customer.booking.confirmBooking")}
                  </Button>
                </div>
                {!isOffer && (
                  <>
                    <Button
                      variant="outline"
                      className="w-full bg-transparent"
                      onClick={handleAddToCart}
                      disabled={isSubmitting || isAddingToCart}
                    >
                      {isAddingToCart && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {t("customer.booking.addToCartButton")}
                    </Button>
                    <p className="text-center text-[11px] text-muted-foreground">{t("customer.booking.addToCartInsteadNotice")}</p>
                  </>
                )}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

/**
 * What the customer is told instead of a payment form.
 *
 * Said in plain words and before they commit, because the question in their
 * head is "when do I pay and to whom". Answering it badly is how a booking
 * turns into a no-show.
 */
function DirectPaymentNote() {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4">
      <p className="text-sm font-semibold text-foreground">You pay the provider directly</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        Nothing is charged now and SAJI does not hold your money. Agree the final amount with
        the provider, and pay them on their phone once the work is done and you are happy with
        it.
      </p>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
        Paying inside the app is coming soon.
      </p>
    </div>
  )
}
