"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Star, ShieldCheck, Loader2, Send, Crown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getOfferDetail, requestOfferQuote, requestOfferFormalQuote, type OfferDetail } from "@/lib/actions/offers"
import { OFFER_ACTION_LABEL } from "@/lib/offer-constants"
import { useLocalization } from "@/lib/hooks/useLocalization"

const PRICED_ACTIONS = ["BOOK", "HIRE", "BUY"]

export default function OfferDetailPage() {
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

  useEffect(() => {
    getOfferDetail(id).then((o) => {
      setOffer(o)
      if (o) setQuoteLocation(o.location)
    }).finally(() => setIsLoading(false))
  }, [id])

  const isFormalQuote = offer?.actionType === "QUOTE"

  const handleSendRequest = async () => {
    if (!message.trim() || (isFormalQuote && !quoteLocation.trim())) return
    setIsSending(true)
    setSendError("")
    const result = isFormalQuote
      ? await requestOfferFormalQuote({ offerId: id, description: message, location: quoteLocation })
      : await requestOfferQuote({ offerId: id, message })
    setIsSending(false)
    if (!result.success) { setSendError(result.error); return }
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
        <p className="text-lg font-semibold text-foreground">Offer not found</p>
        <p className="text-sm text-muted-foreground">This offer isn't available anymore.</p>
        <Button onClick={() => router.push("/customer/services/more")}>Browse Services &amp; Offers</Button>
      </div>
    )
  }

  const isPriced = PRICED_ACTIONS.includes(offer.actionType)

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-4 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-white/20">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4" />
            <h1 className="text-lg font-bold">Saji Pro Offer</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="aspect-[16/9] bg-muted">
            {offer.images[0] ? (
              <img src={offer.images[0]} alt={offer.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">No photo</div>
            )}
          </div>
          <div className="p-5">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold text-foreground">{offer.title}</h2>
              {offer.price != null && <span className="whitespace-nowrap text-xl font-bold text-primary">{formatMoney(offer.price)}</span>}
            </div>
            {offer.categoryName && <p className="mb-3 text-sm text-muted-foreground">{offer.categoryName}</p>}
            <p className="whitespace-pre-line text-sm text-foreground">{offer.description}</p>
          </div>
        </Card>

        <Card className="border-0 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-muted">
              {offer.providerAvatar ? <img src={offer.providerAvatar} alt={offer.providerName} className="h-full w-full object-cover" /> : <span className="text-sm font-semibold text-muted-foreground">{offer.providerName[0]}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-semibold text-foreground">{offer.providerName} <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /></p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {offer.providerRating.toFixed(1)} ({offer.providerReviewCount})
              </p>
            </div>
          </div>
        </Card>

        {isPriced ? (
          <Button size="lg" className="h-12 w-full rounded-xl" onClick={() => router.push(`/customer/booking?offer=${offer.offerId}`)}>
            {OFFER_ACTION_LABEL[offer.actionType]}
          </Button>
        ) : sent ? (
          <Card className="border-0 border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm dark:border-emerald-900/40 dark:bg-emerald-900/20">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">{isFormalQuote ? "Quote request sent" : `Sent to ${offer.providerName}`}</p>
            <p className="mt-1 text-xs text-muted-foreground">{isFormalQuote ? `${offer.providerName} will review and send back a real quote with price and scope.` : "Check Messages for their reply."}</p>
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
                <label className="mb-1 block text-xs text-muted-foreground">Location</label>
                <Input value={quoteLocation} onChange={(e) => setQuoteLocation(e.target.value)} placeholder="Where should this happen?" />
              </div>
            )}
            {sendError && <p className="text-sm text-red-600">{sendError}</p>}
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
