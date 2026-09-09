"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Star, ShieldCheck, Loader2, Send, Crown, ShoppingCart, Minus, Plus, CalendarClock, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getOfferDetail, requestOfferQuote, requestOfferFormalQuote, type OfferDetail } from "@/lib/actions/offers"
import { OFFER_ACTION_LABEL } from "@/lib/offer-constants"
import { addOfferToCart } from "@/lib/actions/cart"
import { revalidateCartCount } from "@/lib/hooks/useCartCount"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { useGatedAction } from "@/lib/hooks/useGatedAction"

// BOOK and HIRE reserve the provider's time, so both go through the booking
// screen for a date, a slot and a place. BUY does not reserve anything — it
// goes to the cart. RENT is a date-range booking with a deposit and has its
// own screen. QUOTE and REQUEST open a conversation instead of committing to
// anything. One list per behaviour, so the page never has to guess.
const SCHEDULED_ACTIONS = ["BOOK", "HIRE"]

export default function OfferDetailPage() {
  const { handleGateFailure } = useGatedAction()
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const { formatMoney } = useLocalization()

  const [offer, setOffer] = useState<OfferDetail>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [quoteLocation, setQuoteLocation] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState("")
  const [sent, setSent] = useState(false)
  const [contractId, setContractId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [addedToCart, setAddedToCart] = useState(false)

  useEffect(() => {
    getOfferDetail(id).then((o) => {
      // A rental needs dates, a deposit and an availability check, none of
      // which this page has. Offer lists now link rentals straight to that
      // screen (see offerHref); this catches older links and shared URLs.
      if (o?.actionType === "RENT") {
        router.replace(`/customer/rentals/${id}`)
        return
      }
      setOffer(o)
      if (o) setQuoteLocation(o.location)
    }).finally(() => setIsLoading(false))
  }, [id, router])

  const isFormalQuote = offer?.actionType === "QUOTE"

  const handleAddToCart = async () => {
    setIsSending(true)
    setSendError("")
    const result = await addOfferToCart({ offerId: id, quantity })
    setIsSending(false)
    if (!result.success) {
      if (handleGateFailure(result)) return
      setSendError(result.error)
      return
    }
    void revalidateCartCount()
    setAddedToCart(true)
  }

  const handleSendRequest = async () => {
    if (!message.trim() || (isFormalQuote && !quoteLocation.trim())) return
    setIsSending(true)
    setSendError("")
    const result = isFormalQuote
      ? await requestOfferFormalQuote({ offerId: id, description: message, location: quoteLocation })
      : await requestOfferQuote({ offerId: id, message })
    setIsSending(false)
    if (!result.success) {
      // A verification refusal opens the wizard rather than leaving the user
      // with a message and nowhere to act on it.
      if (handleGateFailure(result)) return
      setSendError(result.error)
      return
    }
    if ("contractId" in result) setContractId(result.contractId)
    setSent(true)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!offer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-base font-semibold text-foreground">Offer not found</p>
        <p className="text-xs text-muted-foreground">This offer isn't available anymore.</p>
        <Button onClick={() => router.push("/customer/services/more")}>Browse Services &amp; Offers</Button>
      </div>
    )
  }

  const isScheduled = SCHEDULED_ACTIONS.includes(offer.actionType)
  const isBuy = offer.actionType === "BUY"
  const outOfStock = isBuy && offer.stockQuantity != null && offer.stockQuantity <= 0
  const maxQuantity = offer.stockQuantity ?? 99

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-4 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-white/20">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4" />
            <h1 className="text-base font-bold">Saji Pro Offer</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="aspect-[16/9] bg-muted">
            {offer.images[0] ? (
              <img src={offer.images[0]} alt={offer.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No photo</div>
            )}
          </div>
          <div className="p-5">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-foreground">{offer.title}</h2>
              {offer.price != null && <span className="whitespace-nowrap text-lg font-bold text-primary">{formatMoney(offer.price)}</span>}
            </div>
            {offer.categoryName && <p className="mb-3 text-xs text-muted-foreground">{offer.categoryName}</p>}
            <p className="whitespace-pre-line text-xs text-foreground">{offer.description}</p>
          </div>
        </Card>

        <Card className="border-0 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-muted">
              {offer.providerAvatar ? <img src={offer.providerAvatar} alt={offer.providerName} className="h-full w-full object-cover" /> : <span className="text-xs font-semibold text-muted-foreground">{offer.providerName[0]}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-semibold text-foreground">{offer.providerName} <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /></p>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {offer.providerRating.toFixed(1)} ({offer.providerReviewCount})
              </p>
            </div>
          </div>
        </Card>

        {offer.providerOnVacation ? (
          <Card className="border-0 bg-muted p-5 text-center shadow-sm">
            <p className="text-xs font-semibold text-foreground">{offer.providerName} is away right now</p>
            <p className="mt-1 text-[11px] text-muted-foreground">This offer will be available again when they are back.</p>
          </Card>
        ) : isBuy ? (
          // Buying reserves nothing, so it behaves like any other product:
          // pick a quantity, add it to the cart, pay for everything at once.
          addedToCart ? (
            <Card className="border-0 border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm dark:border-emerald-900/40 dark:bg-emerald-900/20">
              <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">Added to your cart</p>
              <div className="mt-3 flex justify-center gap-2">
                <Button size="sm" onClick={() => router.push("/customer/cart")}>Go to Cart</Button>
                <Button variant="outline" size="sm" className="bg-transparent" onClick={() => { setAddedToCart(false); setQuantity(1) }}>
                  Add More
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="border-0 p-5 shadow-sm">
              {outOfStock ? (
                <p className="text-center text-xs font-semibold text-muted-foreground">Out of stock</p>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-foreground">Quantity</p>
                      {offer.stockQuantity != null && (
                        <p className="text-[11px] text-muted-foreground">{offer.stockQuantity} available</p>
                      )}
                    </div>
                    <div className="inline-flex items-center rounded-full border border-border bg-muted/60 p-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="min-w-10 text-center text-xs font-medium">{quantity}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={quantity >= maxQuantity} onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} aria-label="Increase quantity">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {offer.price != null && (
                    <p className="mb-3 text-right text-xs text-muted-foreground">
                      Total <span className="font-semibold text-foreground">{formatMoney(offer.price * quantity)}</span>
                    </p>
                  )}
                  {sendError && <p className="mb-2 text-xs text-red-600">{sendError}</p>}
                  <Button size="lg" className="h-12 w-full gap-2 rounded-xl" disabled={isSending} onClick={handleAddToCart}>
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                    Add to Cart
                  </Button>
                </>
              )}
            </Card>
          )
        ) : isScheduled ? (
          // BOOK and HIRE both reserve the provider's time, so both need a
          // date, a slot and a place — that is the booking screen's job.
          <Card className="border-0 p-5 shadow-sm">
            <p className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {offer.actionType === "HIRE"
                ? "Choose when you need them and where the work happens."
                : "Choose a date and time that suits you."}
            </p>
            <Button size="lg" className="h-12 w-full rounded-xl" onClick={() => router.push(`/customer/booking?offer=${offer.offerId}`)}>
              {OFFER_ACTION_LABEL[offer.actionType]}
            </Button>
          </Card>
        ) : sent ? (
          <Card className="border-0 border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm dark:border-emerald-900/40 dark:bg-emerald-900/20">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">{isFormalQuote ? "Quote request sent" : `Sent to ${offer.providerName}`}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{isFormalQuote ? `${offer.providerName} will review and send back a real quote with price and scope.` : "Check Messages for their reply."}</p>
            <Button variant="outline" size="sm" className="mt-3 bg-transparent" onClick={() => router.push(isFormalQuote ? `/customer/service-requests?id=${contractId}` : "/customer/messages")}>
              {isFormalQuote ? "View Request" : "Go to Messages"}
            </Button>
          </Card>
        ) : (
          <Card className="border-0 p-5 shadow-sm space-y-3">
            <h3 className="font-semibold text-foreground">{OFFER_ACTION_LABEL[offer.actionType]}</h3>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={isFormalQuote ? "Describe what you need a quote for…" : "What would you like to ask or request?"} className="min-h-[100px]" />
            {isFormalQuote && (
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">Location</label>
                <Input value={quoteLocation} onChange={(e) => setQuoteLocation(e.target.value)} placeholder="Where should this happen?" />
              </div>
            )}
            {sendError && <p className="text-xs text-red-600">{sendError}</p>}
            <Button className="w-full gap-2" disabled={!message.trim() || (isFormalQuote && !quoteLocation.trim()) || isSending} onClick={handleSendRequest}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isFormalQuote ? "Request Quote" : `Send to ${offer.providerName}`}
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
