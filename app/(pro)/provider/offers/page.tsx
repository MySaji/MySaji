"use client"

import { useEffect, useState } from "react"
import { Plus, Search, Edit2, Trash2, Eye, EyeOff, Tag, Rocket, Loader2, Crown, BarChart3, FileEdit } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import Link from "next/link"
import {
  getMyOffers, publishOffer, unpublishOffer, deleteOffer, getMyOfferDrafts,
  type ProviderOfferItem, type OfferDraftSummary,
} from "@/backend/actions/offers"
import { OFFER_ACTION_LABEL } from "@/backend/domain/offer-constants"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"

const STATUS_STYLE: Record<ProviderOfferItem["status"], { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  UNDER_REVIEW: { label: "Under Review", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  LIVE: { label: "Live", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
}

export default function OffersPage() {
  const { formatMoney } = useLocalization()
  const { handleGateFailure } = useGatedAction()
  const [isLoading, setIsLoading] = useState(true)
  const [offers, setOffers] = useState<ProviderOfferItem[]>([])
  const [drafts, setDrafts] = useState<OfferDraftSummary[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [publishingId, setPublishingId] = useState<string | null>(null)

  const refresh = async () => {
    const [offerList, draftList] = await Promise.all([getMyOffers(), getMyOfferDrafts()])
    setOffers(offerList)
    setDrafts(draftList)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filtered = offers.filter((o) => o.title.toLowerCase().includes(searchQuery.toLowerCase()))
  const liveCount = offers.filter((o) => o.status === "LIVE").length
  const totalBookings = offers.reduce((a, o) => a + o.bookingCount, 0)
  const totalRequests = offers.reduce((a, o) => a + o.requestCount, 0)

  const handlePublish = async (id: string) => {
    setPublishingId(id)
    const result = await publishOffer({ id })
    setPublishingId(null)
    if (!result.success && !handleGateFailure(result)) { alert(result.error) }
    await refresh()
  }

  const handleUnpublish = async (id: string) => {
    await unpublishOffer({ id })
    await refresh()
  }

  const handleDelete = async (id: string) => {
    const result = await deleteOffer({ id })
    if (result.success) setOffers((prev) => prev.filter((o) => o.id !== id))
    else alert(result.error)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><Rocket className="h-6 w-6 text-amber-500" /> My Offers</h1>
          <p className="text-xs text-muted-foreground mt-1">Provider-controlled listings. Saji structures discovery and applies trust &amp; safety rules before they go live.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild className="rounded-xl gap-2"><Link href="/provider/pro"><Crown className="w-4 h-4" />Saji Pro</Link></Button>
          <Button asChild className="rounded-xl"><Link href="/provider/offers/new"><Plus className="w-4 h-4 mr-2" />New Offer</Link></Button>
        </div>
      </div>

      {drafts.length > 0 && (
        <Card className="border-dashed p-4">
          <p className="mb-2 text-xs font-semibold text-foreground">Continue creating your offer</p>
          <div className="space-y-2">
            {drafts.map((d) => (
              <Link key={d.id} href={`/provider/offers/new?id=${d.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 hover:border-primary/40 transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileEdit className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs font-medium text-foreground">{d.title}</span>
                </div>
                <span className="flex-shrink-0 text-[11px] text-muted-foreground">Step {d.wizardStep}/10</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 border border-border rounded-xl text-center">
          <p className="text-xl font-bold text-foreground">{liveCount}</p>
          <p className="text-[10px] text-muted-foreground">Live</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center">
          <p className="text-xl font-bold text-foreground">{totalBookings}</p>
          <p className="text-[10px] text-muted-foreground">Bookings</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center">
          <p className="text-xl font-bold text-foreground">{totalRequests}</p>
          <p className="text-[10px] text-muted-foreground">Quotes &amp; Requests</p>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search your offers" className="pl-9 rounded-xl bg-card border-border" />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-10 text-center border-dashed">
            <p className="text-xs text-muted-foreground">No offers yet. Create your first one to start appearing in discovery with a Book/Hire/Buy/Quote/Request action.</p>
          </Card>
        )}
        {filtered.map((offer) => (
          <Card key={offer.id} className="p-4 border border-border rounded-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-20 h-14 flex-shrink-0 bg-muted rounded-md overflow-hidden">
                  {offer.image ? <img src={offer.image} alt={offer.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[11px] text-muted-foreground">No Image</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-foreground truncate">{offer.title}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[offer.status].className}`}>{STATUS_STYLE[offer.status].label}</span>
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">{OFFER_ACTION_LABEL[offer.actionType]}</span>
                  </div>
                  {offer.reviewNote && <p className="text-[11px] text-red-600 dark:text-red-400 mb-1">{offer.reviewNote}</p>}
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mb-2">{offer.description}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    {offer.categoryName && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{offer.categoryName}</span>}
                    <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" />{offer.viewCount} views</span>
                    <span>{offer.bookingCount} bookings</span>
                    <span>{offer.requestCount} quotes/requests</span>
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="mb-2">
                  {offer.price != null ? <span className="text-base font-bold text-foreground">{formatMoney(offer.price)}</span> : <span className="text-[11px] text-muted-foreground">No fixed price</span>}
                </div>
                <div className="flex items-center gap-1 justify-end">
                  {offer.status === "LIVE" ? (
                    <button onClick={() => handleUnpublish(offer.id)} aria-label="Unpublish" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  ) : (
                    <button onClick={() => handlePublish(offer.id)} disabled={publishingId === offer.id} aria-label="Publish" className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors">
                      {publishingId === offer.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Eye className="w-3.5 h-3.5 text-primary" />}
                    </button>
                  )}
                  <Link href={`/provider/offers/new?id=${offer.id}`} aria-label="Edit" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Link>
                  <button onClick={() => handleDelete(offer.id)} aria-label="Delete" className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
