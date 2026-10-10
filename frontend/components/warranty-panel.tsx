"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent } from "@/frontend/components/ui/dialog"
import { ShieldCheck, Loader2, Plus, AlertTriangle, Wrench } from "lucide-react"
import {
  getJobWarranty, addWarrantyToJob, reportWarrantyIssue, resolveWarrantyClaim, bookWarrantyFollowUp,
  type WarrantyDetail,
} from "@/backend/actions/warranty"

const CLAIM_STATUS_STYLE: Record<string, { label: string; className: string }> = {
  OPEN: { label: "Open", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  IN_REVIEW: { label: "In Review", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  RESOLVED: { label: "Resolved", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  REJECTED: { label: "Rejected", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
}

export function WarrantyPanel({ jobId, viewerRole, jobCompleted }: { jobId: string; viewerRole: "customer" | "provider"; jobCompleted: boolean }) {
  const router = useRouter()
  const [warranty, setWarranty] = useState<WarrantyDetail>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addForm, setAddForm] = useState({ durationDays: "90", terms: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  const [showReportDialog, setShowReportDialog] = useState(false)
  const [issueDescription, setIssueDescription] = useState("")
  const [isReporting, setIsReporting] = useState(false)
  const [isBookingFollowUp, setIsBookingFollowUp] = useState(false)

  const refresh = () => getJobWarranty(jobId).then(setWarranty)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [jobId])

  if (isLoading || !jobCompleted) return null

  const handleAdd = async () => {
    setIsSaving(true)
    setError("")
    const result = await addWarrantyToJob({ jobId, durationDays: Number(addForm.durationDays), terms: addForm.terms || undefined })
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setShowAddDialog(false)
    await refresh()
  }

  const handleReport = async () => {
    setIsReporting(true)
    setError("")
    const result = await reportWarrantyIssue({ jobId, description: issueDescription })
    setIsReporting(false)
    if (!result.success) { setError(result.error); return }
    setShowReportDialog(false)
    setIssueDescription("")
    await refresh()
  }

  const handleBookFollowUp = async () => {
    setIsBookingFollowUp(true)
    const result = await bookWarrantyFollowUp(jobId)
    setIsBookingFollowUp(false)
    if (!result.success) { alert(result.error); return }
    router.push("/customer/jobs")
  }

  const handleResolveClaim = async (claimId: string, status: "IN_REVIEW" | "RESOLVED" | "REJECTED") => {
    await resolveWarrantyClaim({ claimId, status })
    await refresh()
  }

  if (!warranty) {
    if (viewerRole !== "provider") return null
    return (
      <Card className="p-4 mb-4 border-0 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><p className="text-sm font-medium text-foreground">No warranty added yet</p></div>
          <Button size="sm" variant="outline" className="gap-1.5 rounded-lg bg-transparent" onClick={() => { setAddForm({ durationDays: "90", terms: "" }); setError(""); setShowAddDialog(true) }}>
            <Plus className="h-3.5 w-3.5" />Add Warranty
          </Button>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-sm rounded-xl" showCloseButton={false}>
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-foreground">Add Warranty</h2>
              <div><label className="text-sm text-muted-foreground mb-1 block">Duration (days)</label><Input type="number" value={addForm.durationDays} onChange={(e) => setAddForm((p) => ({ ...p, durationDays: e.target.value }))} /></div>
              <div><label className="text-sm text-muted-foreground mb-1 block">Terms (optional)</label><Textarea value={addForm.terms} onChange={(e) => setAddForm((p) => ({ ...p, terms: e.target.value }))} className="min-h-[70px]" /></div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowAddDialog(false)} disabled={isSaving}>Cancel</Button>
                <Button className="flex-1 rounded-xl" onClick={handleAdd} disabled={isSaving || !addForm.durationDays}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    )
  }

  const isActive = warranty.status === "ACTIVE"

  return (
    <Card className="p-4 mb-4 border-0 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-4 w-4 ${isActive ? "text-emerald-600" : "text-muted-foreground"}`} />
          <div>
            <p className="text-sm font-semibold text-foreground">Warranty: {warranty.durationDays} days</p>
            <p className="text-xs text-muted-foreground">{isActive ? "Expires" : "Expired"} {new Date(warranty.expiresAt).toLocaleDateString()}</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{warranty.status}</span>
      </div>
      {warranty.terms && <p className="mt-2 text-xs text-muted-foreground">{warranty.terms}</p>}

      {viewerRole === "customer" && isActive && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 gap-1.5 rounded-lg bg-transparent" onClick={() => setShowReportDialog(true)}><AlertTriangle className="h-3.5 w-3.5" />Report Issue</Button>
          <Button size="sm" className="flex-1 gap-1.5 rounded-lg" onClick={handleBookFollowUp} disabled={isBookingFollowUp}>
            {isBookingFollowUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Wrench className="h-3.5 w-3.5" />Book Follow-up</>}
          </Button>
        </div>
      )}

      {warranty.claims.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
          {warranty.claims.map((c) => {
            const style = CLAIM_STATUS_STYLE[c.status]
            return (
              <div key={c.id} className="rounded-xl border border-border/70 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-foreground">{c.description}</p>
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.className}`}>{style.label}</span>
                </div>
                {c.resolutionNote && <p className="mt-1 text-xs text-muted-foreground">{c.resolutionNote}</p>}
                {viewerRole === "provider" && c.status === "OPEN" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" className="rounded-lg bg-transparent" onClick={() => handleResolveClaim(c.id, "IN_REVIEW")}>Start Review</Button>
                    <Button size="sm" variant="outline" className="rounded-lg bg-transparent" onClick={() => handleResolveClaim(c.id, "RESOLVED")}>Resolve</Button>
                    <Button size="sm" variant="outline" className="rounded-lg bg-transparent" onClick={() => handleResolveClaim(c.id, "REJECTED")}>Reject</Button>
                  </div>
                )}
                {viewerRole === "provider" && c.status === "IN_REVIEW" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" className="rounded-lg bg-transparent" onClick={() => handleResolveClaim(c.id, "RESOLVED")}>Resolve</Button>
                    <Button size="sm" variant="outline" className="rounded-lg bg-transparent" onClick={() => handleResolveClaim(c.id, "REJECTED")}>Reject</Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-sm rounded-xl" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">Report an Issue</h2>
            <Textarea value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} placeholder="What's wrong?" className="min-h-[90px]" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowReportDialog(false)} disabled={isReporting}>Cancel</Button>
              <Button className="flex-1 rounded-xl" onClick={handleReport} disabled={isReporting || !issueDescription.trim()}>{isReporting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
