"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus, Loader2, MapPin, Clock, MessageSquare, CheckCircle2, X } from "lucide-react"
import {
  getMyCustomerRequests, createCustomerRequest, getCustomerRequestById, cancelCustomerRequest, acceptRequestResponse,
  type MyRequestItem, type CustomerRequestDetail,
} from "@/lib/actions/requests"
import { getServiceCategories } from "@/lib/actions/home"
import { getProductCategories } from "@/lib/actions/products"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { useGatedAction } from "@/lib/hooks/useGatedAction"

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
  const [categories, setCategories] = useState<CategoryOption[]>([])

  const [showPostModal, setShowPostModal] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [budgetMin, setBudgetMin] = useState("")
  const [budgetMax, setBudgetMax] = useState("")
  const [location, setLocation] = useState("")
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

  const refresh = () => getMyCustomerRequests().then(setRequests)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
    Promise.all([getServiceCategories(), getProductCategories()]).then(([services, products]) => {
      setCategories([
        ...services.map((c) => ({ id: c.id, name: c.name, type: "SERVICE" as const })),
        ...products.map((c) => ({ id: c.id, name: c.name, type: "PRODUCT" as const })),
      ])
    })
  }, [])

  const openPostModal = () => {
    setShowPostModal(true)
    setTitle("")
    setDescription("")
    setCategoryId(null)
    setBudgetMin("")
    setBudgetMax("")
    setLocation("")
    setPostError("")
  }

  const handlePost = async () => {
    if (!categoryId) { setPostError(t("customer.requests.chooseCategoryError")); return }
    setIsPosting(true)
    setPostError("")
    const result = await createCustomerRequest({
      title,
      description,
      categoryId,
      budgetMin: budgetMin ? Number(budgetMin) : undefined,
      budgetMax: budgetMax ? Number(budgetMax) : undefined,
      location,
    })
    setIsPosting(false)
    if (!result.success) {
      // A verification refusal opens the wizard rather than leaving the
      // customer with a message and nowhere to act on it.
      if (handleGateFailure(result)) return
      setPostError(result.error)
      return
    }
    setShowPostModal(false)
    await refresh()
  }

  const openDetail = async (id: string) => {
    setSelectedRequestId(id)
    setIsLoadingDetail(true)
    setAcceptError("")
    const data = await getCustomerRequestById(id)
    setDetail(data)
    setIsLoadingDetail(false)
  }

  const closeDetail = () => {
    setSelectedRequestId(null)
    setDetail(null)
  }

  const handleCancel = async (id: string) => {
    await cancelCustomerRequest({ requestId: id })
    await refresh()
    closeDetail()
  }

  const handleAccept = async () => {
    if (!selectedRequestId || !schedulingResponse) return
    if (!acceptDate || !acceptTime) { setAcceptError(t("customer.requests.acceptNeedsSchedule")); return }
    setAcceptingResponseId(schedulingResponse.id)
    setAcceptError("")
    const result = await acceptRequestResponse({
      requestId: selectedRequestId,
      responseId: schedulingResponse.id,
      date: acceptDate,
      time: acceptTime,
    })
    setAcceptingResponseId(null)
    if (!result.success) {
      if (handleGateFailure(result)) return
      setAcceptError(result.error)
      return
    }
    // Straight to payment for the job this just created. The conversation is
    // open either way, but leaving the customer in chat was the old bug: the
    // agreed work went unrecorded and unpaid.
    setSchedulingResponse(null)
    router.push(`/customer/booking?resume=${result.jobId}`)
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
      <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-foreground">{t("customer.requests.title")}</h1>
            <p className="text-xs text-muted-foreground mt-1">{t("customer.requests.subtitle")}</p>
          </div>
          <Button onClick={openPostModal} className="gap-1.5 rounded-xl flex-shrink-0">
            <Plus className="w-4 h-4" /> {t("customer.requests.postButton")}
          </Button>
        </div>

        {requests.length === 0 ? (
          <Card className="p-8 text-center border-0 shadow-sm">
            <p className="text-xs text-muted-foreground">{t("customer.requests.noRequests")}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <Card key={r.id} className="p-4 border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(r.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-xs text-foreground truncate">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{r.categoryName}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[r.status] ?? STATUS_STYLE.OPEN}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.location}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{t("customer.requests.responseCount", { count: r.responseCount })}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Post Request Modal */}
      <Dialog open={showPostModal} onOpenChange={setShowPostModal}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("customer.requests.postModalTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("customer.requests.titleLabel")}</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("customer.requests.titlePlaceholder")} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("customer.requests.descriptionLabel")}</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("customer.requests.descriptionPlaceholder")} className="min-h-[90px]" />
            </div>
            <div>
              <label className="text-xs font-medium mb-2 block">{t("customer.requests.categoryLabel")}</label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`p-2.5 rounded-xl border-2 text-left transition-all ${categoryId === cat.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <p className="text-[11px] font-semibold text-foreground truncate">{cat.name}</p>
                    <p className="text-[10px] text-muted-foreground">{cat.type === "SERVICE" ? t("customer.requests.typeService") : t("customer.requests.typeProduct")}</p>
                  </button>
                ))}
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
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("customer.requests.locationPlaceholder")} />
            </div>
            {postError && <p className="text-[11px] text-red-600">{postError}</p>}
            <Button
              className="w-full rounded-xl"
              onClick={handlePost}
              disabled={isPosting || title.trim().length < 3 || description.trim().length < 10 || !location.trim()}
            >
              {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.requests.postSubmit")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail / Responses Modal */}
      <Dialog open={selectedRequestId !== null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[85vh] overflow-y-auto">
          {isLoadingDetail || !detail ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <DialogHeader><DialogTitle>{detail.title}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-xs text-muted-foreground">{detail.description}</p>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{detail.location}</span>
                  {(detail.budgetMin != null || detail.budgetMax != null) && (
                    <span>
                      {detail.budgetMin != null ? formatMoney(detail.budgetMin) : "?"} – {detail.budgetMax != null ? formatMoney(detail.budgetMax) : "?"}
                    </span>
                  )}
                </div>

                {detail.status === "OPEN" && (
                  <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 bg-transparent" onClick={() => handleCancel(detail.id)}>
                    <X className="w-3.5 h-3.5 mr-1.5" />{t("customer.requests.cancelRequest")}
                  </Button>
                )}

                <div>
                  <h4 className="text-xs font-semibold text-foreground mb-2">{t("customer.requests.responsesTitle")}</h4>
                  {detail.responses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("customer.requests.noResponsesYet")}</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.responses.map((resp) => (
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
                  {acceptError && <p className="text-[11px] text-red-600 mt-2">{acceptError}</p>}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Scheduling — accepting a response creates a real job, and a job needs
          a date. Shown before the accept goes through rather than after, so
          the customer is never committed to work with no agreed time. */}
      <Dialog open={schedulingResponse !== null} onOpenChange={(v) => { if (!v) setSchedulingResponse(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("customer.requests.scheduleTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("customer.requests.scheduleDesc")}</p>

          {schedulingResponse && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
              <span className="text-[11px] text-muted-foreground">{t("customer.requests.scheduleAgreedPrice")}</span>
              <span className="text-sm font-bold text-foreground">{formatMoney(schedulingResponse.price)}</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">{t("customer.requests.scheduleDate")}</p>
              <Input
                type="date"
                value={acceptDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setAcceptDate(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">{t("customer.requests.scheduleTime")}</p>
              <Input type="time" value={acceptTime} onChange={(e) => setAcceptTime(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          {acceptError && <p className="text-xs text-red-600 dark:text-red-400">{acceptError}</p>}

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
              {t("customer.requests.scheduleConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
