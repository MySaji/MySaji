"use client"

import { useEffect, useState, useRef } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import Image from "next/image"
import { MapPin, MessageSquare, Loader2, CheckCircle2, ClipboardList, ImageIcon } from "lucide-react"
import { getOpenRequestsBoard, respondToRequest, getRequestPhotos, type BoardRequestItem } from "@/backend/actions/requests"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { discoverBoardRequests } from "@/frontend/lib/request-discovery"
import { WorkflowGuide, WorkspaceRefresh } from "@/frontend/components/workspace-panels"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"

export default function ProviderRequestsPage() {
  const { handleGateFailure } = useGatedAction()
  const { t, formatMoney } = useLocalization()
  const [requests, setRequests] = useState<BoardRequestItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState("")
  const [query, setQuery] = useState("")
  const [responseFilter, setResponseFilter] = useState("UNANSWERED")
  const [category, setCategory] = useState("ALL")
  const [sort, setSort] = useState("nearest")
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number>()
  const [notice, setNotice] = useState("")
  const photoRequest = useRef(0)
  const visibleRequests = discoverBoardRequests(requests, query, responseFilter, category, sort)

  const [activeRequest, setActiveRequest] = useState<BoardRequestItem | null>(null)
  const [message, setMessage] = useState("")
  const [price, setPrice] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  const refresh = async () => {
    setRefreshing(true); setPageError("")
    try { setRequests(await getOpenRequestsBoard()); setUpdatedAt(Date.now()) }
    catch { setPageError("We could not load requests. Try refreshing.") }
    finally { setRefreshing(false) }
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  // Photos are fetched per request rather than carried on the board, which
  // only knows how many there are — see getRequestPhotos.
  const [photos, setPhotos] = useState<string[]>([])
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false)

  const openRespond = (req: BoardRequestItem) => {
    const generation = ++photoRequest.current
    setActiveRequest(req)
    setMessage("")
    setPrice("")
    setFormError("")
    setPhotos([])
    setIsLoadingPhotos(false)
    if (req.photoCount > 0) {
      setIsLoadingPhotos(true)
      getRequestPhotos(req.id)
        .then(result => { if (generation === photoRequest.current) setPhotos(result) })
        .catch(() => { if (generation === photoRequest.current) setFormError("Photos could not be loaded. Reopen this request to try again.") })
        .finally(() => { if (generation === photoRequest.current) setIsLoadingPhotos(false) })
    }
  }

  const handleSubmit = async () => {
    if (!activeRequest || isSubmitting) return
    setIsSubmitting(true)
    setFormError("")
    try {
    const result = await respondToRequest({ requestId: activeRequest.id, message, price: Number(price) })
    if (!result.success) {
      // A verification refusal opens the wizard rather than leaving the user
      // with a message and nowhere to act on it.
      if (handleGateFailure(result)) return
      setFormError(result.error)
      return
    }
    setActiveRequest(null)
    setResponseFilter("ANSWERED")
    setNotice("Your response was sent. The customer can review your proposal before accepting.")
    await refresh()
    } catch { setFormError("We could not confirm your response. Refresh the board before trying again.") }
    finally { setIsSubmitting(false) }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("provider.requests.title")}</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t("provider.requests.subtitle")}</p>
        </div>

        <WorkflowGuide title="From enquiry to agreed work" steps={[{ title: "Review the request", description: "Check the location, scope, photos and customer budget." }, { title: "Send a clear proposal", description: "Explain what is included and submit your proposed price." }, { title: "Wait for acceptance", description: "The customer reviews responses and confirms their next step." }]} />
        <WorkspaceRefresh refreshing={refreshing} updatedAt={updatedAt} refresh={() => void refresh()} />
        {pageError && <p role="alert" className="mb-4 rounded-xl border border-red-200 p-4 text-sm text-red-700">{pageError}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-950">{notice}</p>}
        <div className="workspace-filterbar">
          <label>Search requests<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Work, location or category" /></label>
          <label>Response status<select value={responseFilter} onChange={event => setResponseFilter(event.target.value)}><option value="UNANSWERED">Not yet answered</option><option value="ANSWERED">Already answered</option><option value="ALL">All requests</option></select></label>
          <label>Sort requests<select value={sort} onChange={event => setSort(event.target.value)}><option value="nearest">Nearest first</option><option value="newest">Newest first</option><option value="budget">Highest upper budget</option></select></label>
          <label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="ALL">All categories</option>{[...new Set(requests.map(request => request.categoryName))].sort().map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        </div>
        <p role="status" className="mb-4 text-sm text-muted-foreground">{visibleRequests.length} of {requests.length} requests</p>
        {visibleRequests.length === 0 ? (
          <Card className="p-10 text-center border-0 shadow-sm">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{requests.length ? "No requests match these filters." : t("provider.requests.noOpenRequests")}</p>
            {requests.length > 0 && <Button variant="outline" className="mt-4" onClick={() => { setQuery(""); setResponseFilter("ALL"); setCategory("ALL") }}>Clear filters</Button>}
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleRequests.map((req) => (
              <Card key={req.id} className="p-4 border-0 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-base text-gray-900 dark:text-white">{req.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{req.categoryName}</p>
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{req.description}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{req.location}</span>
                      {/* The board is ordered by this, so showing it is what
                          makes the ordering legible rather than arbitrary. */}
                      {req.distanceKm != null && (
                        <span className="font-medium text-primary whitespace-nowrap">{t("nearby.distanceAway", { km: req.distanceKm })}</span>
                      )}
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{t("provider.requests.responseCount", { count: req.responseCount })}</span>
                      {req.photoCount > 0 && (
                        <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" />{t("provider.requests.photoCount", { count: req.photoCount })}</span>
                      )}
                      {(req.budgetMin != null || req.budgetMax != null) && (
                        <span>{req.budgetMin != null ? formatMoney(req.budgetMin) : "?"} – {req.budgetMax != null ? formatMoney(req.budgetMax) : "?"}</span>
                      )}
                    </div>
                  </div>
                  {req.myResponse ? (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-primary">{formatMoney(req.myResponse.price)}</p>
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 mt-1"><CheckCircle2 className="w-3 h-3" />{t("provider.requests.responded")}</span>
                    </div>
                  ) : (
                    <Button size="sm" className="rounded-lg flex-shrink-0" onClick={() => openRespond(req)}>
                      {t("provider.requests.respondButton")}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={activeRequest !== null} onOpenChange={(open) => { if (!open && !isSubmitting) setActiveRequest(null) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl rounded-2xl">
          <DialogHeader><DialogTitle>{t("provider.requests.respondModalTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {(isLoadingPhotos || photos.length > 0) && (
              <div>
                <label className="text-xs font-medium mb-1.5 block">{t("provider.requests.customerPhotos")}</label>
                {isLoadingPhotos ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {photos.map((src, i) => (
                      <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                        <Image src={src} alt="" fill sizes="80px" className="object-cover" unoptimized />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("provider.requests.messageLabel")}</label>
              <Textarea aria-label="Your proposal" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("provider.requests.messagePlaceholder")} className="min-h-[80px]" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("provider.requests.priceLabel")}</label>
              <Input aria-label="Proposed price" type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
            </div>
            {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
            <Button className="w-full rounded-xl" onClick={handleSubmit} disabled={isSubmitting || message.trim().length < 5 || !(Number(price) > 0)}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.requests.submitResponse")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
