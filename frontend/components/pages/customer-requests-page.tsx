"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { Plus, Loader2, MapPin, Clock, MessageSquare, CheckCircle2, X, Search, Check } from "lucide-react"
import {
  getMyCustomerRequests, createCustomerRequest, getCustomerRequestById, cancelCustomerRequest, acceptRequestResponse,
  type MyRequestItem, type CustomerRequestDetail,
} from "@/backend/actions/requests"
import { discoverCustomerRequests } from "@/frontend/lib/request-discovery"
import { WorkflowGuide, WorkspaceRefresh } from "@/frontend/components/workspace-panels"
import { RequestPhotoPicker } from "@/frontend/components/customer/request-photo-picker"
import { MAX_PHOTOS, takePendingRequestPhoto } from "@/frontend/lib/request-photos"
import { getServiceCategories } from "@/backend/actions/home"
import { getProductCategories } from "@/backend/actions/products"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"

type CategoryOption = { id: string; name: string; type: "SERVICE" | "PRODUCT" }

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  ACCEPTED: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  CLOSED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
}

export function CustomerRequestsPage() {
  const { handleGateFailure } = useGatedAction()
  const { t, formatMoney } = useLocalization()
  const router = useRouter()
  const [requests, setRequests] = useState<MyRequestItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState("")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [sort, setSort] = useState("newest")
  const [responseSort, setResponseSort] = useState("newest")
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number>()
  const [notice, setNotice] = useState("")
  const [pendingCancel, setPendingCancel] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const detailGeneration = useRef(0)
  const visibleRequests = discoverCustomerRequests(requests, query, statusFilter, sort)
  const [categories, setCategories] = useState<CategoryOption[]>([])

  const [showPostModal, setShowPostModal] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [budgetMin, setBudgetMin] = useState("")
  const [budgetMax, setBudgetMax] = useState("")
  const [location, setLocation] = useState("")
  const [photos, setPhotos] = useState<string[]>([])
  const [categoryQuery, setCategoryQuery] = useState("")
  // The form is part of the page now, so opening it has to bring itself into
  // view — otherwise tapping "Post a Request" appears to do nothing when the
  // list above is long enough to push the form below the fold.
  const postFormRef = useRef<HTMLDivElement>(null)
  const [postError, setPostError] = useState("")
  const [isPosting, setIsPosting] = useState(false)

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CustomerRequestDetail>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [acceptingResponseId, setAcceptingResponseId] = useState<string | null>(null)

  // ?describe=... arrives from the home page's "Solve a problem" voice
  // button — open the composer with what the customer said already in the
  // description, so speaking the problem goes straight to posting it.
  const searchParams = useSearchParams()
  const describeParam = searchParams.get("describe")
  useEffect(() => {
    if (!describeParam) return
    setDescription(describeParam)
    setShowPostModal(true)
  }, [describeParam])

  // A photo taken from the home screen's camera buttons is parked in
  // sessionStorage rather than the URL — see lib/request-photos.ts —
  // and ?photo=1 is the signal that one is waiting.
  const hasPendingPhoto = searchParams.get("photo") === "1"
  useEffect(() => {
    if (!hasPendingPhoto) return
    const pending = takePendingRequestPhoto()
    if (!pending) return
    setPhotos((current) => (current.length ? current : [pending]))
    setShowPostModal(true)
  }, [hasPendingPhoto])
  const [acceptError, setAcceptError] = useState("")
  // Accepting now schedules the work and creates a real job, so it needs a
  // date and time — a request carries none of its own.
  const [schedulingResponse, setSchedulingResponse] = useState<{ id: string; price: number } | null>(null)
  const [acceptDate, setAcceptDate] = useState("")
  const [acceptTime, setAcceptTime] = useState("")

  const STATUS_LABEL: Record<string, string> = {
    OPEN: t("customer.requests.statusOpen"),
    ACCEPTED: t("customer.requests.statusAccepted"),
    CLOSED: t("customer.requests.statusClosed"),
    EXPIRED: t("customer.requests.statusExpired"),
    CANCELLED: t("customer.requests.statusCancelled"),
  }

  const refresh = async () => {
    setRefreshing(true); setPageError("")
    try { setRequests(await getMyCustomerRequests()); setUpdatedAt(Date.now()) }
    catch { setPageError("Your requests could not be loaded. Try refreshing.") }
    finally { setRefreshing(false) }
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
    Promise.all([getServiceCategories(), getProductCategories()]).then(([services, products]) => {
      setCategories([
        ...services.map((c) => ({ id: c.id, name: c.name, type: "SERVICE" as const })),
        ...products.map((c) => ({ id: c.id, name: c.name, type: "PRODUCT" as const })),
      ])
    }).catch(() => setPageError("Request categories could not be loaded. Refresh the page before posting."))
  }, [])

  const openPostModal = () => {
    setShowPostModal(true)
    setTitle("")
    setDescription("")
    setCategoryId(null)
    setBudgetMin("")
    setBudgetMax("")
    setLocation("")
    setPhotos([])
    setCategoryQuery("")
    setPostError("")
  }

  const visibleCategories = categoryQuery.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(categoryQuery.trim().toLowerCase()))
    : categories

  useEffect(() => {
    if (!showPostModal) return
    // Next frame, so the card has actually been laid out before scrolling.
    const id = requestAnimationFrame(() => {
      postFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
    return () => cancelAnimationFrame(id)
  }, [showPostModal])

  const handlePost = async () => {
    if (isPosting) return
    if (!categoryId) { setPostError(t("customer.requests.chooseCategoryError")); return }
    setIsPosting(true)
    setPostError("")
    try {
    const result = await createCustomerRequest({
      title,
      description,
      categoryId,
      budgetMin: budgetMin ? Number(budgetMin) : undefined,
      budgetMax: budgetMax ? Number(budgetMax) : undefined,
      location,
      photos,
    })
    if (!result.success) {
      // A verification refusal opens the wizard rather than leaving the
      // customer with a message and nowhere to act on it.
      if (handleGateFailure(result)) return
      setPostError(result.error)
      return
    }
    setShowPostModal(false)
    setNotice("Request posted. You can review proposals here as professionals respond.")
    await refresh()
    } catch { setPostError("We could not confirm your request was posted. Refresh your requests before trying again.") }
    finally { setIsPosting(false) }
  }

  const openDetail = async (id: string) => {
    const generation = ++detailGeneration.current
    setSelectedRequestId(id); setDetail(null); setIsLoadingDetail(true); setAcceptError("")
    try { const data = await getCustomerRequestById(id); if (generation === detailGeneration.current) setDetail(data) }
    catch { if (generation === detailGeneration.current) setAcceptError("This request could not be opened. Close and try again.") }
    finally { if (generation === detailGeneration.current) setIsLoadingDetail(false) }
  }

  const closeDetail = () => {
    detailGeneration.current += 1
    setSelectedRequestId(null); setDetail(null)
  }

  const handleCancel = async () => {
    if (!pendingCancel || cancelling) return
    setCancelling(true); setAcceptError("")
    try {
      const result = await cancelCustomerRequest({ requestId: pendingCancel })
      if (!result.success) { setAcceptError(result.error); return }
      setPendingCancel(null); closeDetail(); setNotice("Request cancelled."); await refresh()
    } catch { setAcceptError("We could not confirm the cancellation. Try refreshing before repeating this action.") }
    finally { setCancelling(false) }
  }

  // A product request settles into an order, which has nothing to schedule.
  const isProductRequest = detail?.categoryType === "PRODUCT"

  const handleAccept = async () => {
    if (!selectedRequestId || !schedulingResponse || acceptingResponseId) return
    // Only a service needs scheduling; a product offer has nothing to schedule.
    if (!isProductRequest && (!acceptDate || !acceptTime)) {
      setAcceptError(t("customer.requests.acceptNeedsSchedule"))
      return
    }
    setAcceptingResponseId(schedulingResponse.id)
    setAcceptError("")
    try {
    const result = await acceptRequestResponse({
      requestId: selectedRequestId,
      responseId: schedulingResponse.id,
      date: isProductRequest ? undefined : acceptDate,
      time: isProductRequest ? undefined : acceptTime,
    })
    if (!result.success) {
      if (handleGateFailure(result)) return
      setAcceptError(result.error)
      return
    }
    // Straight to what this just created. The conversation is open either
    // way, but leaving the customer in chat was the old bug: the agreed work
    // went unrecorded and unpaid.
    setSchedulingResponse(null)
    router.push(result.kind === "order" ? `/customer/orders/${result.orderId}` : `/customer/booking?resume=${result.jobId}`)
    } catch { setAcceptError("We could not confirm this booking. Check your orders or bookings before trying again.") }
    finally { setAcceptingResponseId(null) }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-foreground">{t("customer.requests.title")}</h1>
            <p className="text-xs text-muted-foreground mt-1">{t("customer.requests.subtitle")}</p>
          </div>
          <Button onClick={openPostModal} className="gap-1.5 rounded-xl flex-shrink-0">
            <Plus className="w-4 h-4" /> {t("customer.requests.postButton")}
          </Button>
        </div>

        <WorkflowGuide title="Your request journey" steps={[{ title: "Describe what you need", description: "Include a useful description, location, photos and an optional budget." }, { title: "Compare responses", description: "Read what each professional includes and compare proposed prices." }, { title: "Confirm your next step", description: "Agree a service time or continue to the order created by your acceptance." }]} />
        <WorkspaceRefresh refreshing={refreshing} updatedAt={updatedAt} refresh={() => void refresh()} />
        {pageError && <p role="alert" className="mb-4 rounded-xl border border-red-200 p-4 text-sm text-red-700">{pageError}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-950">{notice}</p>}
        <div className="mb-5 grid grid-cols-3 gap-3">{[{ label: "Open requests", filter: "OPEN", count: requests.filter(request => request.status === "OPEN").length }, { label: "Ready to review", filter: "REPLIES", count: requests.filter(request => request.status === "OPEN" && request.responseCount > 0).length }, { label: "Accepted", filter: "ACCEPTED", count: requests.filter(request => request.status === "ACCEPTED").length }].map(item => <button key={item.label} type="button" aria-pressed={statusFilter === item.filter} onClick={() => { setStatusFilter(item.filter); setQuery("") }} className="rounded-xl border bg-card p-4 text-left hover:border-blue-400 aria-pressed:border-blue-600"><strong className="text-2xl text-primary">{item.count}</strong><p className="mt-1 text-xs text-muted-foreground">{item.label}</p></button>)}</div>
        <div className="workspace-filterbar"><label>Search your requests<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, category or location" /></label><label>Request status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">All requests</option><option value="REPLIES">Ready to review</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Sort requests<select value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="responses">Most responses</option></select></label></div>
        <p role="status" className="mb-4 text-sm text-muted-foreground">{visibleRequests.length} of {requests.length} requests</p>
        {requests.length === 0 ? (
          <Card className="p-8 text-center border-0 shadow-sm">
            <p className="text-xs text-muted-foreground">{t("customer.requests.noRequests")}</p>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleRequests.length === 0 && <div className="rounded-xl border p-6"><p className="text-sm">No matching requests.</p><Button variant="outline" className="mt-3" onClick={() => { setQuery(""); setStatusFilter("ALL") }}>Clear filters</Button></div>}
            {visibleRequests.map((r) => (
              <Card key={r.id} className="p-5 border shadow-sm hover:shadow-md transition-shadow cursor-pointer" role="button" tabIndex={0} aria-label={`View request: ${r.title}`} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openDetail(r.id) } }} onClick={() => void openDetail(r.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-base text-foreground truncate">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{r.categoryName}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[r.status] ?? STATUS_STYLE.OPEN}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.location}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{t("customer.requests.responseCount", { count: r.responseCount })}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Post a request — part of the page, not a modal. Filling this in
          means choosing a category from a long list, adding photos and
          writing a description; a dialog on a phone gave all of that a
          cramped scrolling box floating over the list behind it. */}
      {showPostModal && (
        <Card ref={postFormRef} className="mt-4 border-0 p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-foreground">{t("customer.requests.postModalTitle")}</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t("customer.requests.postFormHint")}</p>
            </div>
            <button
              onClick={() => setShowPostModal(false)}
              aria-label={t("common.cancel")}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("customer.requests.titleLabel")}</label>
              <Input aria-label="Request title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("customer.requests.titlePlaceholder")} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("customer.requests.descriptionLabel")}</label>
              <Textarea aria-label="Request description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("customer.requests.descriptionPlaceholder")} className="min-h-[90px]" />
            </div>
            <RequestPhotoPicker photos={photos} onChange={setPhotos} max={MAX_PHOTOS} />
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("customer.requests.categoryLabel")}</label>
              {/* Searchable, because this list runs to dozens of categories —
                  scrolling a two-column grid to find "Air Conditioning" was
                  the slowest part of posting a request. */}
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={categoryQuery}
                  onChange={(e) => setCategoryQuery(e.target.value)}
                  placeholder={t("customer.requests.categorySearchPlaceholder")}
                  className="h-9 pl-9 text-xs"
                />
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
                {visibleCategories.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">{t("customer.requests.categoryNoMatch")}</p>
                ) : (
                  visibleCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        categoryId === cat.id ? "bg-primary/10 font-semibold text-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <span className="truncate text-xs text-foreground">{cat.name}</span>
                      <span className="flex flex-shrink-0 items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">
                          {cat.type === "SERVICE" ? t("customer.requests.typeService") : t("customer.requests.typeProduct")}
                        </span>
                        {categoryId === cat.id && <Check className="h-3.5 w-3.5 text-primary" />}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block">{t("customer.requests.budgetMinLabel")}</label>
                <Input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">{t("customer.requests.budgetMaxLabel")}</label>
                <Input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("customer.requests.locationLabel")}</label>
              <Input aria-label="Request location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("customer.requests.locationPlaceholder")} />
            </div>
            {postError && <p role="alert" className="text-[11px] text-red-600">{postError}</p>}
            <Button
              className="w-full rounded-xl"
              onClick={handlePost}
              disabled={isPosting || title.trim().length < 3 || description.trim().length < 10 || !location.trim()}
            >
              {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.requests.postSubmit")}
            </Button>
          </div>
        </Card>
      )}

      {/* Detail / Responses Modal */}
      <Dialog open={selectedRequestId !== null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogTitle className="sr-only">Request details</DialogTitle>
          {isLoadingDetail ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !detail ? <div role="alert" className="p-5 text-sm"><p>{acceptError || "This request is no longer available."}</p><Button variant="outline" className="mt-3" onClick={() => selectedRequestId && void openDetail(selectedRequestId)}>Try again</Button></div> : (
            <>
              <DialogHeader><DialogTitle>{detail.title}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-xs text-muted-foreground">{detail.description}</p>
                {detail.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {detail.photos.map((src, i) => (
                      <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                        <Image src={src} alt="" fill sizes="80px" className="object-cover" unoptimized />
                      </a>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{detail.location}</span>
                  {(detail.budgetMin != null || detail.budgetMax != null) && (
                    <span>
                      {detail.budgetMin != null ? formatMoney(detail.budgetMin) : "?"} – {detail.budgetMax != null ? formatMoney(detail.budgetMax) : "?"}
                    </span>
                  )}
                </div>

                {detail.status === "OPEN" && (
                  <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 bg-transparent" onClick={() => { setAcceptError(""); setPendingCancel(detail.id) }}>
                    <X className="w-3.5 h-3.5 mr-1.5" />{t("customer.requests.cancelRequest")}
                  </Button>
                )}

                <div>
                  <h4 className="text-xs font-semibold text-foreground mb-2">{t("customer.requests.responsesTitle")}</h4>
                  <label className="mb-3 block text-xs font-semibold">Compare proposals<select value={responseSort} onChange={event => setResponseSort(event.target.value)} className="ml-2 min-h-11 rounded-lg border bg-background px-3 text-sm"><option value="newest">Newest first</option><option value="price">Lowest price first</option></select></label>
                  {detail.responses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("customer.requests.noResponsesYet")}</p>
                  ) : (
                    <div className="space-y-2">
                      {[...detail.responses].sort((a, b) => responseSort === "price" ? a.price - b.price : Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((resp) => (
                        <Card key={resp.id} className="p-3 border border-border">
                          <div className="flex items-center gap-2.5">
                            <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-muted">
                              <Image src={resp.responderAvatar || "/placeholder.svg"} alt={resp.responderName} fill className="object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">{resp.responderName}</p>
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(resp.createdAt).toLocaleDateString()}</p>
                            </div>
                            <p className="text-xs font-bold text-primary flex-shrink-0">{formatMoney(resp.price)}</p>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2">{resp.message}</p>
                          {resp.status === "ACCEPTED" ? (
                            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />{t("customer.requests.accepted")}</span>
                          ) : resp.status === "DECLINED" ? (
                            <span className="mt-2 inline-block text-[11px] text-muted-foreground">{t("customer.requests.declined")}</span>
                          ) : detail.status === "OPEN" ? (
                            <Button size="sm" className="mt-2 rounded-lg h-7 text-[11px]" onClick={() => { setAcceptError(""); setSchedulingResponse({ id: resp.id, price: resp.price }) }} disabled={acceptingResponseId === resp.id}>
                              {acceptingResponseId === resp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("customer.requests.acceptButton")}
                            </Button>
                          ) : null}
                        </Card>
                      ))}
                    </div>
                  )}
                  {acceptError && <p role="alert" className="text-[11px] text-red-600 mt-2">{acceptError}</p>}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pendingCancel !== null} onOpenChange={open => { if (!open && !cancelling) setPendingCancel(null) }}><DialogContent aria-label="Cancel this request?" aria-labelledby={undefined}><DialogHeader><DialogTitle>Cancel this request?</DialogTitle></DialogHeader><p className="text-sm leading-7 text-muted-foreground">This closes the request to new responses. Any confirmed booking or order must be managed separately.</p>{acceptError && <p role="alert" className="text-sm text-red-600">{acceptError}</p>}<div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={cancelling} onClick={() => setPendingCancel(null)}>Keep request</Button><Button variant="destructive" disabled={cancelling} onClick={() => void handleCancel()}>{cancelling ? "Cancelling..." : "Cancel request"}</Button></div></DialogContent></Dialog>

      {/* Scheduling — accepting a response creates a real job, and a job needs
          a date. Shown before the accept goes through rather than after, so
          the customer is never committed to work with no agreed time. */}
      <Dialog open={schedulingResponse !== null} onOpenChange={(v) => { if (!v) setSchedulingResponse(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isProductRequest ? t("customer.requests.acceptOrderTitle") : t("customer.requests.scheduleTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {isProductRequest ? t("customer.requests.acceptOrderDesc") : t("customer.requests.scheduleDesc")}
          </p>

          {schedulingResponse && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
              <span className="text-[11px] text-muted-foreground">{t("customer.requests.scheduleAgreedPrice")}</span>
              <span className="text-sm font-bold text-foreground">{formatMoney(schedulingResponse.price)}</span>
            </div>
          )}

          {/* Scheduling is service-only; an order has no date to agree. */}
          {!isProductRequest && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">{t("customer.requests.scheduleDate")}</p>
              <Input
                aria-label="Service date"
                type="date"
                value={acceptDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setAcceptDate(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">{t("customer.requests.scheduleTime")}</p>
              <Input aria-label="Service time" type="time" value={acceptTime} onChange={(e) => setAcceptTime(e.target.value)} className="rounded-xl" />
            </div>
          </div>
          )}

          {acceptError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{acceptError}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setSchedulingResponse(null)} className="rounded-xl">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleAccept}
              disabled={acceptingResponseId !== null}
              className="gap-2 rounded-xl"
            >
              {acceptingResponseId !== null && <Loader2 className="h-4 w-4 animate-spin" />}
              {isProductRequest ? t("customer.requests.acceptOrderConfirm") : t("customer.requests.scheduleConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
