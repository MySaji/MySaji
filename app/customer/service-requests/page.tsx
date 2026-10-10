"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2, FileText, CheckCircle2, XCircle, MapPin, Star } from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Textarea } from "@/frontend/components/ui/textarea"
import {
  getMyServiceRequestsAsCustomer, getContractDetail, respondToContractQuote, approveMilestone,
  type ContractListItem, type ContractDetail,
} from "@/backend/actions/service-contracts"
import { getContractTimeline, getJobTimeline, type JobTimelineEvent } from "@/backend/actions/job-events"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  REQUESTED: { label: "Awaiting Quote", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  QUOTED: { label: "Quote Received", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  AGREED: { label: "Agreed", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  DECLINED: { label: "Declined", className: "bg-muted text-muted-foreground" },
  IN_PROGRESS: { label: "In Progress", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  COMPLETED: { label: "Completed", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
}

export default function CustomerServiceRequestsPage() {
  const { handleGateFailure } = useGatedAction()
  const { formatMoney } = useLocalization()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [requests, setRequests] = useState<ContractListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"))
  const [detail, setDetail] = useState<ContractDetail>(null)
  const [timeline, setTimeline] = useState<JobTimelineEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [declineReason, setDeclineReason] = useState("")
  const [showDecline, setShowDecline] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [error, setError] = useState("")

  const refreshList = () => getMyServiceRequestsAsCustomer().then(setRequests)

  useEffect(() => {
    refreshList().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    getContractDetail(selectedId).then(setDetail)
  }, [selectedId])

  useEffect(() => {
    if (!detail) { setTimeline([]); return }
    const load = detail.jobId ? getJobTimeline(detail.jobId) : getContractTimeline(detail.id)
    load.then(setTimeline)
  }, [detail])

  const handleAccept = async () => {
    if (!selectedId) return
    setIsResponding(true)
    setError("")
    const result = await respondToContractQuote({ contractId: selectedId, accept: true })
    setIsResponding(false)
    if (!result.success) {
      // Accepting a quote is the gated direction; declining below is not.
      if (handleGateFailure(result)) return
      setError(result.error)
      return
    }
    if (result.jobId) { router.push(`/customer/booking?resume=${result.jobId}`); return }
    await refreshList()
    getContractDetail(selectedId).then(setDetail)
  }

  const handleDecline = async () => {
    if (!selectedId) return
    setIsResponding(true)
    setError("")
    const result = await respondToContractQuote({ contractId: selectedId, accept: false, declineReason })
    setIsResponding(false)
    if (!result.success) { setError(result.error); return }
    setShowDecline(false)
    await refreshList()
    getContractDetail(selectedId).then(setDetail)
  }

  const handleApproveMilestone = async (milestoneId: string) => {
    await approveMilestone({ milestoneId })
    if (selectedId) getContractDetail(selectedId).then(setDetail)
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  if (selectedId && detail) {
    const status = STATUS_STYLE[detail.status]
    return (
      <div className="min-h-screen bg-background pb-10">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-primary to-primary/90 px-4 py-4 text-primary-foreground">
          <div className="mx-auto flex max-w-2xl items-center gap-4">
            <button onClick={() => setSelectedId(null)} className="rounded-lg p-2 hover:bg-white/20"><ArrowLeft className="h-6 w-6" /></button>
            <h1 className="text-base font-bold truncate">{detail.title}</h1>
          </div>
        </div>

        <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
          <Card className="border-0 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
              {detail.jobId && <Link href="/customer/jobs" className="text-xs font-medium text-primary">View Job</Link>}
            </div>
            <p className="text-xs text-muted-foreground">{detail.requestDescription}</p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {detail.location}</p>
            <p className="text-xs text-foreground">Provider: <span className="font-semibold">{detail.providerName}</span></p>
          </Card>

          {(detail.status === "QUOTED" || detail.quotedPrice != null) && (
            <Card className="border-0 p-5 shadow-sm space-y-2">
              <h3 className="font-semibold text-foreground">Quote</h3>
              <p className="text-xl font-bold text-primary">{detail.quotedPrice != null ? formatMoney(detail.quotedPrice) : "—"}</p>
              {detail.scopeOfWork && <div><p className="text-[11px] font-medium text-muted-foreground">Scope of work</p><p className="text-xs text-foreground">{detail.scopeOfWork}</p></div>}
              {detail.estimatedDuration && <div><p className="text-[11px] font-medium text-muted-foreground">Estimated timeline</p><p className="text-xs text-foreground">{detail.estimatedDuration}</p></div>}
              {detail.materials && <div><p className="text-[11px] font-medium text-muted-foreground">Materials</p><p className="text-xs text-foreground">{detail.materials}</p></div>}
              {detail.labourNotes && <div><p className="text-[11px] font-medium text-muted-foreground">Labour</p><p className="text-xs text-foreground">{detail.labourNotes}</p></div>}
              {detail.terms && <div><p className="text-[11px] font-medium text-muted-foreground">Terms</p><p className="text-xs text-foreground">{detail.terms}</p></div>}
              {detail.declineReason && <p className="text-[11px] text-red-600">Declined: {detail.declineReason}</p>}

              {detail.status === "QUOTED" && (
                <div className="pt-2 space-y-2">
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  {showDecline ? (
                    <div className="space-y-2">
                      <Textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Optional reason" className="min-h-[70px]" />
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setShowDecline(false)} disabled={isResponding}>Cancel</Button>
                        <Button variant="destructive" className="flex-1 rounded-xl" onClick={handleDecline} disabled={isResponding}>{isResponding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Decline"}</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 rounded-xl gap-1.5 bg-transparent" onClick={() => setShowDecline(true)}><XCircle className="h-4 w-4" />Decline</Button>
                      <Button className="flex-1 rounded-xl gap-1.5" onClick={handleAccept} disabled={isResponding}>{isResponding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" />Accept & Pay</>}</Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {detail.milestones.length > 0 && (
            <Card className="border-0 p-5 shadow-sm space-y-3">
              <h3 className="font-semibold text-foreground">Milestones</h3>
              {detail.milestones.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{m.title}</p>
                    {m.amount != null && <p className="text-[11px] text-muted-foreground">{formatMoney(m.amount)}</p>}
                  </div>
                  {m.status === "APPROVED" ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</span>
                  ) : m.status === "COMPLETED" ? (
                    <Button size="sm" className="rounded-lg" onClick={() => handleApproveMilestone(m.id)}>Approve</Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">In progress</span>
                  )}
                </div>
              ))}
            </Card>
          )}

          {timeline.length > 0 && (
            <Card className="border-0 p-5 shadow-sm">
              <h3 className="mb-3 font-semibold text-foreground">Timeline</h3>
              <div className="space-y-3">
                {timeline.map((e) => (
                  <div key={e.id} className="text-xs">
                    <p className="font-medium text-foreground">{e.description}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full"><Link href="/customer/home"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div><h1 className="text-lg font-bold text-foreground">My Service Requests</h1><p className="text-xs text-muted-foreground">Quotes you've requested from providers</p></div>
        </div>

        {requests.length === 0 ? (
          <Card className="border-dashed p-10 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No requests yet. Find a provider and tap "Get Quote" to start one.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => {
              const status = STATUS_STYLE[r.status]
              return (
                <Card key={r.id} className="cursor-pointer border-0 p-4 shadow-sm transition-shadow hover:shadow-md" onClick={() => setSelectedId(r.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{r.title}</p>
                      <p className="text-[11px] text-muted-foreground">{r.otherPartyName}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {r.quotedPrice != null && <p className="text-xs font-bold text-foreground">{formatMoney(r.quotedPrice)}</p>}
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
