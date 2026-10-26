"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Star, ShieldCheck, Loader2, CheckCircle2, XCircle, CalendarDays, MapPin, Package, MessageSquare, Send } from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import { requestOfferQuote } from "@/backend/actions/offers"
import {
  getRentalOfferDetail, getRentalBookedRanges, createRentalBooking, getRentalBookingForPayment,
  checkRentalBookingPaymentStatus, type RentalOfferDetail, type RentalBookingForPayment,
} from "@/backend/actions/rentals"
import { getEffectivePlatformPreferences } from "@/backend/actions/admin-settings"
import { DirectPaymentNote } from "@/frontend/components/booking/direct-payment-note"
import { capturePaypalOrder } from "@/backend/actions/payments"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"

type View = "form" | "awaiting-provider" | "success" | "failed"

export default function RentalDetailPage() {
  const { handleGateFailure } = useGatedAction()
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const searchParams = useSearchParams()
  const { formatMoney } = useLocalization()

  const [appPayments, setAppPayments] = useState(false)
  const [listing, setListing] = useState<RentalOfferDetail>(null)
  const [bookedRanges, setBookedRanges] = useState<{ startDate: string; endDate: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCapturing, setIsCapturing] = useState(false)

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [location, setLocation] = useState("")
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [bookingId, setBookingId] = useState<string | null>(null)
  const [booking, setBooking] = useState<RentalBookingForPayment>(null)
  const [phone, setPhone] = useState("")
  const [view, setView] = useState<View>("form")
  const [message, setMessage] = useState<string | null>(null)
  const [showAsk, setShowAsk] = useState(false)
  const [askMessage, setAskMessage] = useState("")
  const [askError, setAskError] = useState("")
  const [isAsking, setIsAsking] = useState(false)
  const [askSent, setAskSent] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    Promise.all([getRentalOfferDetail(id), getRentalBookedRanges(id), getEffectivePlatformPreferences()])
      .then(([l, ranges, policy]) => { setListing(l); setBookedRanges(ranges); setAppPayments(policy.customerAppPaymentsEnabled) })
      .finally(() => setIsLoading(false))
  }, [id])

  useEffect(() => {
    const resumeBookingId = searchParams.get("bookingId")
    const paypalFlag = searchParams.get("paypal")
    const orderId = searchParams.get("token")
    if (!resumeBookingId) return

    setBookingId(resumeBookingId)

    async function resume() {
      if (paypalFlag === "return" && orderId) {
        setIsCapturing(true)
        await capturePaypalOrder(orderId)
        setIsCapturing(false)
      }
      const details = await getRentalBookingForPayment(resumeBookingId!)
      setBooking(details)
      const status = await checkRentalBookingPaymentStatus(resumeBookingId!)
      if (status?.status === "CONFIRMED") setView("success")
      else if (status?.paymentStatus === "FAILED") { setView("failed"); setMessage(status.failureReason ?? "Payment failed or was cancelled.") }
      else startPolling(resumeBookingId!)
    }
    resume()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const startPolling = (id: string) => {
    setView("awaiting-provider")
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const status = await checkRentalBookingPaymentStatus(id)
      if (!status) return
      if (status.status === "CONFIRMED") {
        if (pollRef.current) clearInterval(pollRef.current)
        setView("success")
      } else if (status.paymentStatus === "FAILED") {
        if (pollRef.current) clearInterval(pollRef.current)
        setView("failed")
        setMessage(status.failureReason || "Payment failed or was cancelled.")
      }
    }, 3000)
  }

  const days = startDate && endDate ? Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)) : 0
  const estimatedTotal = listing && days > 0 ? listing.pricePerDay * days + listing.depositAmount : 0

  const handleAsk = async () => {
    if (!askMessage.trim()) return
    setIsAsking(true)
    setAskError("")
    const result = await requestOfferQuote({ offerId: id, message: askMessage })
    setIsAsking(false)
    if (!result.success) {
      // A verification refusal opens the wizard rather than leaving the user
      // with a message and nowhere to act on it.
      if (handleGateFailure(result)) return
      setAskError(result.error)
      return
    }
    setAskSent(true)
  }

  const handleReserve = async () => {
    if (!startDate || !endDate || !location.trim()) { setFormError("Fill in dates and a pickup/delivery location."); return }
    setFormError("")
    setIsSubmitting(true)
    const result = await createRentalBooking({ offerId: id, startDate, endDate, location })
    setIsSubmitting(false)
    if (!result.success) {
      // A verification refusal opens the wizard rather than leaving the user
      // with a message and nowhere to act on it.
      if (handleGateFailure(result)) return
      setFormError(result.error)
      return
    }
    setBookingId(result.bookingId)
    const details = await getRentalBookingForPayment(result.bookingId)
    setBooking(details)
    if (result.directPayment) setView("success")
  }

  const initiatePayment = async (provider: "mpesa" | "paypal" | "card") => {
    if (!bookingId) return
    setMessage(null)
    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = { context: "rental-booking", provider, bookingId }
      if (provider === "mpesa") body.phone = phone

      const res = await fetch("/api/payments/initiate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json()

      if (!data?.success) { setMessage(data?.message ?? "Payment could not be started."); setIsSubmitting(false); return }
      if (data.checkoutUrl) { window.location.href = data.checkoutUrl; return }
      if (data.simulated) { setView("success"); setIsSubmitting(false); return }
      if (data.paymentId) { startPolling(bookingId); setIsSubmitting(false); return }
      setMessage(data.message ?? "Unexpected response. Please try again.")
      setIsSubmitting(false)
    } catch (err: any) {
      setMessage(err?.message ?? "Error initiating payment")
      setIsSubmitting(false)
    }
  }

  if (isLoading || isCapturing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!listing && view === "form") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-base font-semibold text-foreground">Rental not found</p>
        <Button onClick={() => router.push("/customer/services/more")}>Browse Services &amp; Offers</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-4 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-white/20">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <h1 className="text-base font-bold">Rental</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {view === "success" && (
          <Card className="border-0 border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm dark:border-emerald-900/40 dark:bg-emerald-900/20">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="mt-2 font-semibold text-emerald-700 dark:text-emerald-400">Booking confirmed</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Your dates are reserved. Agree pickup and payment directly with the owner in Messages. A reservation does not confirm that money was received.</p>
            <Button variant="outline" size="sm" className="mt-3 bg-transparent" onClick={() => router.push("/customer/jobs")}>My Bookings</Button>
            {booking?.directPayment && <div className="mt-4 text-left"><DirectPaymentNote /></div>}
          </Card>
        )}

        {view === "awaiting-provider" && (
          <Card className="border-0 p-6 text-center space-y-3 shadow-sm">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-600" />
            <p className="font-semibold text-foreground">Waiting for payment confirmation…</p>
            <p className="text-[11px] text-muted-foreground">{message ?? "Check your phone and approve the payment prompt."}</p>
          </Card>
        )}

        {view === "failed" && (
          <Card className="border-0 p-6 text-center space-y-2 shadow-sm">
            <XCircle className="mx-auto h-8 w-8 text-destructive" />
            <p className="font-semibold text-foreground">Payment failed</p>
            <p className="text-[11px] text-muted-foreground">{message}</p>
            <Button size="sm" onClick={() => setView("form")}>Try again</Button>
          </Card>
        )}

        {view === "form" && listing && (
          <>
            <Card className="overflow-hidden border-0 shadow-sm">
              <div className="aspect-[16/9] bg-muted">
                {listing.images[0] ? <img src={listing.images[0]} alt={listing.title} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No photo</div>}
              </div>
              <div className="p-5">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold text-foreground">{listing.title}</h2>
                  <span className="whitespace-nowrap text-lg font-bold text-primary">{formatMoney(listing.pricePerDay)}<span className="text-[11px] font-normal text-muted-foreground">/day</span></span>
                </div>
                {listing.categoryName && <p className="mb-3 text-xs text-muted-foreground">{listing.categoryName}</p>}
                <p className="whitespace-pre-line text-xs text-foreground">{listing.description}</p>
                {listing.depositAmount > 0 && <p className="mt-3 text-[11px] text-muted-foreground">Plus a refundable {formatMoney(listing.depositAmount)} security deposit, returned to your Wallet when the item comes back.</p>}
              </div>
            </Card>

            <Card className="border-0 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-muted">
                  {listing.providerAvatar ? <img src={listing.providerAvatar} alt={listing.providerName} className="h-full w-full object-cover" /> : <span className="text-xs font-semibold text-muted-foreground">{listing.providerName[0]}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-semibold text-foreground">{listing.providerName} <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /></p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {listing.providerRating.toFixed(1)} ({listing.providerReviewCount})</p>
                </div>
              </div>

              {/* Reserving a rental is a real commitment — dates, a deposit,
                  a pickup arrangement — and this screen had no way to ask
                  about any of it first. Same conversation the offer page
                  opens, so the provider gets it in Messages either way. */}
              {!bookingId && (
                askSent ? (
                  <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-center dark:bg-emerald-900/20">
                    <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Sent to {listing.providerName}</p>
                    <Button variant="outline" size="sm" className="mt-2 bg-transparent" onClick={() => router.push("/customer/messages")}>
                      Go to Messages
                    </Button>
                  </div>
                ) : showAsk ? (
                  <div className="mt-4 space-y-2">
                    <Textarea
                      value={askMessage}
                      onChange={(e) => setAskMessage(e.target.value)}
                      placeholder="Ask about availability, condition, delivery…"
                      className="min-h-[80px]"
                    />
                    {askError && <p className="text-[11px] text-red-600">{askError}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" className="gap-1.5" disabled={!askMessage.trim() || isAsking} onClick={handleAsk}>
                        {isAsking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Send
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowAsk(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="mt-4 w-full gap-1.5 bg-transparent" onClick={() => setShowAsk(true)}>
                    <MessageSquare className="h-3.5 w-3.5" /> Ask {listing.providerName} a question
                  </Button>
                )
              )}
            </Card>

            {!bookingId ? (
              <Card className="border-0 p-5 shadow-sm space-y-4">
                <h3 className="flex items-center gap-2 font-semibold text-foreground"><CalendarDays className="h-4 w-4" /> Pick your rental dates</h3>
                {bookedRanges.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Already booked: {bookedRanges.map((r) => `${new Date(r.startDate).toLocaleDateString()}–${new Date(r.endDate).toLocaleDateString()}`).join(", ")}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Start date</label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">End date</label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> Pickup / delivery location</label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where should this be picked up or delivered?" />
                </div>
                {days > 0 && (
                  <div className="rounded-xl bg-muted p-3 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">{days} day{days > 1 ? "s" : ""} × {formatMoney(listing.pricePerDay)}</span><span>{formatMoney(listing.pricePerDay * days)}</span></div>
                    {listing.depositAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Security deposit (arranged with owner)</span><span>{formatMoney(listing.depositAmount)}</span></div>}
                    <div className="mt-1 flex justify-between border-t border-border/50 pt-1 font-semibold"><span>Estimated amount to agree with owner</span><span>{formatMoney(estimatedTotal)}</span></div>
                  </div>
                )}
                {formError && <p className="text-xs text-red-600">{formError}</p>}
                <Button className="h-11 w-full rounded-xl" disabled={isSubmitting || days <= 0} onClick={handleReserve}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : appPayments ? "Reserve & review payment" : "Reserve - pay owner directly"}
                </Button>
              </Card>
            ) : booking?.directPayment ? <DirectPaymentNote /> : booking && appPayments ? (
              <Card className="border-0 p-5 shadow-sm space-y-4">
                <h3 className="font-semibold text-foreground">Pay {formatMoney(booking.totalAmount)}</h3>
                <p className="text-[11px] text-muted-foreground">{new Date(booking.startDate).toLocaleDateString()} – {new Date(booking.endDate).toLocaleDateString()} ({booking.days} day{booking.days > 1 ? "s" : ""})</p>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Mobile number (for M-Pesa)</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX or 2547XXXXXXXX" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Button onClick={() => initiatePayment("mpesa")} disabled={isSubmitting || phone.trim().length < 9} className="bg-yellow-400 text-black hover:bg-yellow-500">M-Pesa</Button>
                  <Button onClick={() => initiatePayment("paypal")} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">PayPal</Button>
                  <Button onClick={() => initiatePayment("card")} disabled={isSubmitting}>Card</Button>
                </div>
                {message && <p className="text-[11px] break-words rounded bg-muted p-3">{message}</p>}
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
