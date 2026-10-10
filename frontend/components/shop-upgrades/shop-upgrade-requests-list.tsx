"use client"

import { useEffect, useMemo, useState } from "react"
import { Store, Clock, CheckCircle2, XCircle, Loader2, Mail, Phone } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import {
  getShopUpgradeRequests, approveShopUpgradeRequest, rejectShopUpgradeRequest,
  type ShopUpgradeRequest,
} from "@/backend/actions/shop-upgrade-requests"

const STATUS_STYLE: Record<ShopUpgradeRequest["status"], { label: string; badge: string }> = {
  OPEN: { label: "Pending", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  IN_PROGRESS: { label: "Pending", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  RESOLVED: { label: "Approved", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  CLOSED: { label: "Rejected", badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
}

// Shared across Admin, Sub-Admin, and Agent — each portal's own layout
// already supplies the brand chrome, so this content area stays on
// neutral/semantic tokens, same convention as components/notifications/*.
export function ShopUpgradeRequestsList() {
  const [isLoading, setIsLoading] = useState(true)
  const [requests, setRequests] = useState<ShopUpgradeRequest[]>([])
  const [filter, setFilter] = useState<"all" | "pending" | "reviewed">("pending")
  const [selected, setSelected] = useState<ShopUpgradeRequest | null>(null)
  const [showRejectReason, setShowRejectReason] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState("")

  const refresh = () => getShopUpgradeRequests().then(setRequests)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const isPending = (r: ShopUpgradeRequest) => r.status === "OPEN" || r.status === "IN_PROGRESS"

  const filtered = useMemo(() => {
    if (filter === "pending") return requests.filter(isPending)
    if (filter === "reviewed") return requests.filter((r) => !isPending(r))
    return requests
  }, [requests, filter])

  const pendingCount = requests.filter(isPending).length

  const openDetail = (r: ShopUpgradeRequest) => {
    setSelected(r)
    setShowRejectReason(false)
    setRejectReason("")
    setActionError("")
  }

  const handleApprove = async (ticketId: string) => {
    setIsSubmitting(true)
    setActionError("")
    try {
      const result = await approveShopUpgradeRequest({ ticketId })
      if (!result.success) { setActionError(result.error); return }
      setSelected(null)
      await refresh()
    } catch {
      setActionError("Something went wrong approving this request. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async (ticketId: string) => {
    setIsSubmitting(true)
    setActionError("")
    try {
      const result = await rejectShopUpgradeRequest({ ticketId, reason: rejectReason || undefined })
      if (!result.success) { setActionError(result.error); return }
      setSelected(null)
      setShowRejectReason(false)
      setRejectReason("")
      await refresh()
    } catch {
      setActionError("Something went wrong rejecting this request. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Shop Upgrade Requests</h1>
        <p className="text-muted-foreground mt-1">Providers requesting to become shop owners. Approving lets them switch to a shopkeeper account whenever they're ready, from their own Shop page.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: "pending" as const, label: "Pending", count: pendingCount },
          { id: "reviewed" as const, label: "Reviewed", count: requests.length - pendingCount },
          { id: "all" as const, label: "All", count: requests.length },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 whitespace-nowrap rounded-lg font-medium transition-colors flex items-center gap-2 text-sm ${
              filter === f.id ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-black/10 dark:bg-white/10">{f.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm p-12 text-center">
          <Store className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold text-foreground mb-1">No requests here</p>
          <p className="text-sm text-muted-foreground">{filter === "pending" ? "No shop upgrade requests are waiting on review." : "Nothing to show for this filter."}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card
              key={r.id}
              onClick={() => openDetail(r)}
              className="p-4 border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{r.providerName}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                    <Mail className="w-3 h-3" /> {r.email}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">Requested {new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${STATUS_STYLE[r.status].badge}`}>
                  {STATUS_STYLE[r.status].label}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Shop Upgrade Request</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Provider:</span>
                  <span className="font-semibold text-foreground">{selected.providerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Email:</span>
                  <span className="font-semibold text-foreground">{selected.email}</span>
                </div>
                {selected.phone && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Phone:</span>
                    <span className="font-semibold text-foreground">{selected.phone}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[selected.status].badge}`}>{STATUS_STYLE[selected.status].label}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Shop details submitted</p>
                <pre className="whitespace-pre-wrap text-sm text-foreground bg-muted/30 rounded-lg p-3 font-sans">{selected.message}</pre>
              </div>

              {actionError && <p className="text-sm text-red-600">{actionError}</p>}

              {isPending(selected) && (
                <>
                  {showRejectReason && (
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-foreground">Rejection reason (optional)</label>
                      <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Let them know why, if you'd like..." className="min-h-[80px]" />
                    </div>
                  )}
                  <div className="flex gap-3">
                    {showRejectReason ? (
                      <>
                        <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowRejectReason(false)} disabled={isSubmitting}>Cancel</Button>
                        <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => handleReject(selected.id)} disabled={isSubmitting}>
                          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-1.5" /> Confirm Reject</>}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowRejectReason(true)} disabled={isSubmitting}>Reject</Button>
                        <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(selected.id)} disabled={isSubmitting}>
                          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve</>}
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}

              {!isPending(selected) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> This request has already been reviewed.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
