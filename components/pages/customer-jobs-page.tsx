"use client"

import { useState, useEffect } from "react"
import { getCustomerJobs, getJobById, submitJobReview, cancelMyJob, type CustomerJob } from "@/lib/actions/jobs"
import { getJobExpenses, respondToJobExpense, type JobExpenseItem } from "@/lib/actions/job-expenses"
import { isWithinLateCancellationWindow } from "@/lib/cancellation-policy"
import { LiveTrackingMap } from "@/components/maps/live-tracking-map"
import { SajiProtectionBanner } from "@/components/saji-protection-banner"
import { JobTimeline } from "@/components/job-timeline"
import { ChangeOrdersPanel } from "@/components/change-orders-panel"
import { QrHandshakeCustomer } from "@/components/qr-handshake-customer"
import { WarrantyPanel } from "@/components/warranty-panel"
import { SafetySosButton } from "@/components/safety-sos-button"
import { createRecurringMaintenance } from "@/lib/actions/recurring-maintenance"
import { RefreshCw } from "lucide-react"
import { estimateTravelMinutes } from "@/lib/google-maps"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  ChevronLeft, Clock, MapPin, Star, AlertCircle, Phone, MessageCircle,
  CalendarIcon, Flag, CheckCircle, XCircle, RotateCcw, Briefcase,
  Navigation, Radio, Shield, ThumbsUp, Loader2
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { TranslationKey } from "@/lib/i18n"

type UiStatus = "active" | "completed" | "cancelled" | "scheduled"
type Translate = (key: TranslationKey) => string

interface Job {
  id: string; providerId: string | null; title: string; provider: string; providerPhone: string | null; providerAvatar: string
  status: UiStatus; rawStatus: string; date: string; time: string; scheduledDate: string; location: string; price: number
  rating?: number; image: string; description?: string
  reviewed?: boolean
  isAwaitingPayment?: boolean
  latitude: number | null; longitude: number | null
  providerLatitude: number | null; providerLongitude: number | null
  providerLocationUpdatedAt: string | null
  distanceKm: number | null
}

function mapJobStatus(status: string): UiStatus {
  switch (status) {
    case "IN_PROGRESS":
      return "active"
    case "COMPLETED":
      return "completed"
    case "CANCELLED":
    case "DISPUTED":
      return "cancelled"
    default:
      return "scheduled" // PENDING, ACCEPTED — booked but not yet underway
  }
}

function formatDateLabel(iso: string, t: Translate): string {
  const date = new Date(iso)
  const today = new Date()
  const diffDays = Math.round((date.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86400000)
  if (diffDays === 0) return t("customer.jobs.today")
  if (diffDays === 1) return t("customer.jobs.tomorrow")
  if (diffDays === -1) return t("customer.jobs.yesterday")
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function mapJob(job: CustomerJob, t: Translate): Job {
  return {
    id: job.id,
    providerId: job.providerId,
    title: job.title,
    provider: job.providerName,
    providerPhone: job.providerPhone,
    providerAvatar: job.providerAvatar || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
    status: mapJobStatus(job.status),
    rawStatus: job.status,
    date: formatDateLabel(job.scheduledDate, t),
    time: new Date(job.scheduledDate).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    scheduledDate: job.scheduledDate,
    location: job.location,
    price: job.price,
    rating: job.providerRating > 0 ? job.providerRating : undefined,
    image: job.image || "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&h=300&fit=crop",
    description: job.description,
    isAwaitingPayment: job.status === "PENDING_PAYMENT",
    reviewed: job.reviewed,
    latitude: job.latitude,
    longitude: job.longitude,
    providerLatitude: job.providerLatitude,
    providerLongitude: job.providerLongitude,
    providerLocationUpdatedAt: job.providerLocationUpdatedAt,
    distanceKm: job.distanceKm,
  }
}

export function CustomerJobsPage() {
  const { t, formatMoney } = useLocalization()
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"active" | "scheduled" | "completed" | "cancelled">("active")
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showTrackingPanel, setShowTrackingPanel] = useState(false)
  const [reportReason, setReportReason] = useState("")
  const [reportDetails, setReportDetails] = useState("")
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined)
  const [rescheduleTime, setRescheduleTime] = useState("")
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewHover, setReviewHover] = useState(0)
  const [reviewComment, setReviewComment] = useState("")
  const [reviewTags, setReviewTags] = useState<string[]>([])
  const [reviewSubmitted, setReviewSubmitted] = useState(false)
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)
  const [reviewError, setReviewError] = useState("")
  const [showRecurringDialog, setShowRecurringDialog] = useState(false)
  const [recurringFrequency, setRecurringFrequency] = useState("180")
  const [isSavingRecurring, setIsSavingRecurring] = useState(false)
  const [recurringSaved, setRecurringSaved] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState("")
  const [jobExpenses, setJobExpenses] = useState<JobExpenseItem[]>([])
  const [respondingExpenseId, setRespondingExpenseId] = useState<string | null>(null)
  const [expenseResponseError, setExpenseResponseError] = useState("")

  useEffect(() => {
    getCustomerJobs()
      .then((data) => setJobs(data.map((job) => mapJob(job, t))))
      .finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Real polling for the provider's live position while a job is selected —
  // replaces the old fake setInterval countdown. Runs regardless of whether
  // the tracking modal itself is open, so the banner's distance stays fresh
  // too; getJobById itself is cheap and the interval no-ops once the job
  // isn't ACCEPTED/IN_PROGRESS anymore.
  useEffect(() => {
    if (!selectedJobId) return
    const interval = setInterval(async () => {
      const fresh = await getJobById(selectedJobId)
      if (!fresh || (fresh.status !== "ACCEPTED" && fresh.status !== "IN_PROGRESS")) return
      setJobs((prev) => prev.map((j) => (
        j.id === selectedJobId
          ? { ...j, providerLatitude: fresh.providerLatitude, providerLongitude: fresh.providerLongitude, providerLocationUpdatedAt: fresh.providerLocationUpdatedAt, distanceKm: fresh.distanceKm }
          : j
      )))
    }, 10000)
    return () => clearInterval(interval)
  }, [selectedJobId])

  useEffect(() => {
    if (!selectedJobId) { setJobExpenses([]); return }
    getJobExpenses(selectedJobId).then(setJobExpenses)
  }, [selectedJobId])

  const handleRespondExpense = async (expenseId: string, approve: boolean) => {
    setRespondingExpenseId(expenseId)
    setExpenseResponseError("")
    const result = await respondToJobExpense({ expenseId, approve })
    setRespondingExpenseId(null)
    if (!result.success) { setExpenseResponseError(result.error); return }
    if (selectedJobId) setJobExpenses(await getJobExpenses(selectedJobId))
  }

  const reviewQuickTags = [
    t("customer.jobs.tagPunctual"), t("customer.jobs.tagProfessional"), t("customer.jobs.tagFriendly"), t("customer.jobs.tagQualityWork"),
    t("customer.jobs.tagClean"), t("customer.jobs.tagFast"), t("customer.jobs.tagGreatCommunication"), t("customer.jobs.tagAffordable"),
  ]

  const timeSlots = ["09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"]
  const filteredJobs = jobs.filter((job) => job.status === activeTab)
  const selectedJob = jobs.find((j) => j.id === selectedJobId)

  const statusConfig: Record<string, { bg: string; text: string; icon: typeof Clock; label: string }> = {
    active: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", icon: Clock, label: t("customer.jobs.statusActive") },
    scheduled: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", icon: CalendarIcon, label: t("customer.jobs.statusScheduled") },
    completed: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", icon: CheckCircle, label: t("customer.jobs.statusCompleted") },
    cancelled: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", icon: XCircle, label: t("customer.orders.statusCancelled") },
  }

  const handleReport = () => { alert(t("customer.jobs.reportSubmittedAlert", { reason: reportReason })); setShowReportModal(false); setReportReason(""); setReportDetails("") }
  const handleReschedule = () => { if (rescheduleDate && rescheduleTime) { alert(t("customer.jobs.rescheduledAlert", { date: format(rescheduleDate, "PPP"), time: rescheduleTime })); setShowRescheduleModal(false) } }

  const handleMakeRecurring = async () => {
    if (!selectedJobId) return
    setIsSavingRecurring(true)
    const result = await createRecurringMaintenance({ jobId: selectedJobId, title: selectedJob?.title ?? "Recurring service", frequencyDays: Number(recurringFrequency) })
    setIsSavingRecurring(false)
    if (!result.success) { alert(result.error); return }
    setRecurringSaved(true)
  }

  const handleCancelBooking = async () => {
    if (!selectedJobId) return
    setIsCancelling(true)
    setCancelError("")
    const result = await cancelMyJob({ jobId: selectedJobId })
    setIsCancelling(false)
    if (!result.success) { setCancelError(result.error); return }
    setShowCancelConfirm(false)
    setSelectedJobId(null)
    getCustomerJobs().then((data) => setJobs(data.map((job) => mapJob(job, t))))
  }
  const handleReviewSubmit = async () => {
    if (!selectedJob || reviewRating === 0) return
    setIsSubmittingReview(true)
    setReviewError("")
    const taggedComment = reviewTags.length > 0 ? `${reviewComment}\n\nHighlights: ${reviewTags.join(", ")}` : reviewComment
    const result = await submitJobReview({ jobId: selectedJob.id, rating: reviewRating, comment: taggedComment })
    setIsSubmittingReview(false)
    if (!result.success) {
      setReviewError(result.error)
      return
    }
    setJobs((prev) => prev.map((j) => (j.id === selectedJob.id ? { ...j, reviewed: true } : j)))
    setReviewSubmitted(true)
    setTimeout(() => { setShowReviewModal(false); setReviewSubmitted(false); setReviewRating(0); setReviewComment(""); setReviewTags([]) }, 2000)
  }
  const toggleTag = (tag: string) => setReviewTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // ---- Job Details View ----
  if (selectedJobId && selectedJob) {
    const config = statusConfig[selectedJob.status]
    const StatusIcon = config.icon
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
          <button onClick={() => setSelectedJobId(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> {t("customer.jobs.backToJobs")}
          </button>

          {/* Hero Image */}
          <div className="relative h-48 lg:h-64 rounded-2xl overflow-hidden mb-6">
            <Image src={selectedJob.image || "/placeholder.svg"} alt={selectedJob.title} fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
              <div>
                <h1 className="text-xl lg:text-2xl font-bold text-white mb-0.5">{selectedJob.title}</h1>
                <p className="text-white/80 text-sm">{selectedJob.description}</p>
              </div>
              <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm ${config.bg} ${config.text}`}>
                <StatusIcon className="w-3.5 h-3.5" />{config.label}
              </span>
            </div>
          </div>

          {/* Live Tracking Banner for Active Jobs — real, only shows once the
              provider has actually shared at least one real GPS position */}
          {(selectedJob.rawStatus === "ACCEPTED" || selectedJob.rawStatus === "IN_PROGRESS") && selectedJob.providerLatitude != null && (
            <Card className="p-4 mb-4 border-0 shadow-sm bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-l-4 border-l-blue-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                    <Navigation className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground flex items-center gap-2">
                      {t("customer.jobs.providerEnRoute")}
                      <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400"><Radio className="w-3 h-3 animate-pulse" />{t("customer.live.liveBadge")}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedJob.distanceKm != null
                        ? <>~<strong className="text-foreground">{t("customer.jobs.minAway", { min: estimateTravelMinutes(selectedJob.distanceKm) })}</strong> ({selectedJob.distanceKm.toFixed(1)} km)</>
                        : t("customer.jobs.distanceUnavailableLong")}
                    </p>
                  </div>
                </div>
                <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowTrackingPanel(true)}>
                  <MapPin className="w-3.5 h-3.5" />{t("customer.jobs.track")}
                </Button>
              </div>
            </Card>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card className="p-4 border-0 shadow-sm">
              <CalendarIcon className="w-4 h-4 text-muted-foreground mb-2" />
              <p className="font-semibold text-sm text-foreground">{selectedJob.date}</p>
              <p className="text-xs text-muted-foreground">{selectedJob.time}</p>
            </Card>
            <Card className="p-4 border-0 shadow-sm">
              <MapPin className="w-4 h-4 text-muted-foreground mb-2" />
              <p className="font-semibold text-sm text-foreground">{selectedJob.location}</p>
              <p className="text-xs text-muted-foreground">{t("customer.jobs.serviceLocation")}</p>
            </Card>
          </div>

          {/* Provider */}
          <Card className="p-4 mb-4 border-0 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">{t("customer.jobs.serviceProvider")}</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-background">
                <Image src={selectedJob.providerAvatar || "/placeholder.svg"} alt={selectedJob.provider} width={48} height={48} className="object-cover" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">{selectedJob.provider}</p>
                {selectedJob.rating && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-sm font-medium">{selectedJob.rating}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" className="flex-1 gap-2 rounded-xl bg-transparent h-9 text-sm" disabled={!selectedJob.providerPhone} onClick={() => selectedJob.providerPhone && (window.location.href = `tel:${selectedJob.providerPhone}`)}>
                <Phone className="w-3.5 h-3.5" />{t("customer.serviceDetail.call")}
              </Button>
              <Link href="/customer/messages" className="flex-1">
                <Button variant="outline" className="w-full gap-2 rounded-xl bg-transparent h-9 text-sm">
                  <MessageCircle className="w-3.5 h-3.5" />{t("customer.serviceDetail.message")}
                </Button>
              </Link>
            </div>
          </Card>

          {/* Price */}
          <Card className="p-4 mb-4 border-0 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t("customer.jobs.serviceCost")}</p>
                <p className="text-2xl font-bold text-foreground">{formatMoney(selectedJob.price)}</p>
              </div>
              {selectedJob.status === "completed" && !selectedJob.reviewed && (
                <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowReviewModal(true)}>
                  <Star className="w-3.5 h-3.5" />{t("customer.jobs.rateService")}
                </Button>
              )}
              {selectedJob.status === "completed" && (
                <Button size="sm" variant="outline" className="gap-1.5 rounded-xl bg-transparent" onClick={() => { setShowRecurringDialog(true); setRecurringSaved(false); setRecurringFrequency("180") }}>
                  <RefreshCw className="w-3.5 h-3.5" />Make Recurring
                </Button>
              )}
              {selectedJob.status === "completed" && selectedJob.reviewed && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1.5 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />{t("customer.jobs.reviewed")}
                </span>
              )}
            </div>
          </Card>

          {(selectedJob.status === "scheduled" || selectedJob.status === "active") && (
            <SajiProtectionBanner className="mb-4" />
          )}

          <QrHandshakeCustomer jobId={selectedJob.id} canVerify={selectedJob.rawStatus === "ACCEPTED" || selectedJob.rawStatus === "IN_PROGRESS"} />

          <WarrantyPanel jobId={selectedJob.id} viewerRole="customer" jobCompleted={selectedJob.rawStatus === "COMPLETED"} />

          {(selectedJob.rawStatus === "ACCEPTED" || selectedJob.rawStatus === "IN_PROGRESS") && <SafetySosButton jobId={selectedJob.id} />}

          <ChangeOrdersPanel jobId={selectedJob.id} viewerRole="customer" canRequest={false} />

          <JobTimeline jobId={selectedJob.id} />

          {/* Extra cost approvals — Gap 1 */}
          {jobExpenses.some((e) => e.status === "PENDING") && (
            <Card className="p-4 mb-4 border-0 shadow-sm border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-400 mb-3 uppercase tracking-wider">{t("customer.jobs.expenseApprovalTitle")}</p>
              {expenseResponseError && <p className="text-sm text-red-600 mb-2">{expenseResponseError}</p>}
              <div className="space-y-3">
                {jobExpenses.filter((e) => e.status === "PENDING").map((expense) => (
                  <div key={expense.id} className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm text-foreground">{expense.description}</p>
                        <p className="text-lg font-bold text-foreground">{formatMoney(expense.amount)}</p>
                      </div>
                      {expense.receiptPhotoUrl && (
                        <Image src={expense.receiptPhotoUrl} alt={expense.description} width={56} height={56} className="rounded-lg object-cover" />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 rounded-xl bg-transparent"
                        disabled={respondingExpenseId === expense.id}
                        onClick={() => handleRespondExpense(expense.id, false)}
                      >
                        {t("customer.jobs.expenseDecline")}
                      </Button>
                      <Button
                        className="flex-1 rounded-xl"
                        disabled={respondingExpenseId === expense.id}
                        onClick={() => handleRespondExpense(expense.id, true)}
                      >
                        {respondingExpenseId === expense.id ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.jobs.expenseApprove")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            {selectedJob.status === "scheduled" && (
              <Button variant="outline" className="flex-1 gap-2 rounded-xl bg-transparent" onClick={() => setShowRescheduleModal(true)}>
                <RotateCcw className="w-4 h-4" />{t("customer.jobs.reschedule")}
              </Button>
            )}
            {selectedJob.status === "scheduled" && (
              <Button
                variant="outline"
                className="flex-1 gap-2 rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10 bg-transparent"
                onClick={() => { setCancelError(""); setShowCancelConfirm(true) }}
              >
                <XCircle className="w-4 h-4" />{t("customer.jobs.cancelBooking")}
              </Button>
            )}
            <Button variant="outline" className="flex-1 gap-2 rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10 bg-transparent" onClick={() => setShowReportModal(true)}>
              <Flag className="w-4 h-4" />{t("customer.jobs.reportIssue")}
            </Button>
          </div>
        </div>

        {/* Cancel Booking confirmation */}
        <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader><DialogTitle>{t("customer.jobs.cancelConfirmTitle")}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{t("customer.jobs.cancelConfirmBody")}</p>
            {selectedJob && selectedJob.rawStatus === "ACCEPTED" && isWithinLateCancellationWindow(selectedJob.scheduledDate) && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2">
                {t("customer.jobs.lateCancelFeeWarning")}
              </p>
            )}
            {cancelError && <p className="text-xs text-red-600">{cancelError}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setShowCancelConfirm(false)} disabled={isCancelling}>
                {t("customer.jobs.keepBooking")}
              </Button>
              <Button className="flex-1 rounded-xl bg-red-600 hover:bg-red-700" onClick={handleCancelBooking} disabled={isCancelling}>
                {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.jobs.confirmCancel")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Live Tracking Modal — real map, real distance, no fabricated ETA/progress */}
        <Dialog open={showTrackingPanel} onOpenChange={setShowTrackingPanel}>
          <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl" aria-describedby={undefined}>
            <LiveTrackingMap
              providerLat={selectedJob?.providerLatitude ?? null}
              providerLng={selectedJob?.providerLongitude ?? null}
              destinationLat={selectedJob?.latitude ?? null}
              destinationLng={selectedJob?.longitude ?? null}
              className="h-64 w-full"
            />
            <div className="p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-background">
                  <Image src={selectedJob?.providerAvatar || "/placeholder.svg"} alt="" width={48} height={48} className="object-cover" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{selectedJob?.provider}</p>
                  <p className="text-sm text-muted-foreground">{selectedJob?.title}</p>
                </div>
                <div className="text-right">
                  {selectedJob?.distanceKm != null ? (
                    <>
                      <p className="text-2xl font-bold text-primary">~{estimateTravelMinutes(selectedJob.distanceKm)}</p>
                      <p className="text-xs text-muted-foreground">{t("customer.jobs.minAwayShort", { km: selectedJob.distanceKm.toFixed(1) })}</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("customer.jobs.distanceUnavailable")}</p>
                  )}
                </div>
              </div>
              {selectedJob?.providerLocationUpdatedAt && (
                <p className="text-[11px] text-muted-foreground mb-4">
                  {t("customer.help.lastUpdated", { time: new Date(selectedJob.providerLocationUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
                </p>
              )}
              <div className="flex gap-4 mb-4">
                {[
                  { label: t("customer.jobs.stepAccepted"), done: true },
                  { label: t("customer.jobs.stepEnRoute"), done: (selectedJob?.providerLatitude ?? null) != null },
                  { label: t("customer.jobs.stepArriving"), done: (selectedJob?.distanceKm ?? Infinity) < 1 },
                  { label: t("customer.jobs.stepStarted"), done: selectedJob?.rawStatus === "IN_PROGRESS" },
                ].map((step, i) => (
                  <div key={i} className="flex-1 text-center">
                    <div className={`w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center ${step.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {step.done ? <CheckCircle className="w-4 h-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                    </div>
                    <p className={`text-[11px] font-medium ${step.done ? "text-primary" : "text-muted-foreground"}`}>{step.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl bg-transparent gap-1.5" onClick={() => window.location.href = `tel:${selectedJob?.providerPhone}`}>
                  <Phone className="w-4 h-4" />{t("customer.serviceDetail.call")}
                </Button>
                <Link href="/customer/messages" className="flex-1">
                  <Button className="w-full rounded-xl gap-1.5"><MessageCircle className="w-4 h-4" />{t("customer.serviceDetail.message")}</Button>
                </Link>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Review Modal */}
        <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
          <DialogContent className="max-w-md rounded-2xl" aria-describedby={undefined}>
            {!reviewSubmitted ? (
              <>
                <DialogHeader><DialogTitle>{t("customer.jobs.rateYourService")}</DialogTitle></DialogHeader>
                <div className="space-y-5 py-2">
                  {/* Provider Info */}
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                    <div className="w-10 h-10 rounded-full overflow-hidden">
                      <Image src={selectedJob?.providerAvatar || "/placeholder.svg"} alt="" width={40} height={40} className="object-cover" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{selectedJob?.provider}</p>
                      <p className="text-xs text-muted-foreground">{selectedJob?.title}</p>
                    </div>
                  </div>

                  {/* Star Rating */}
                  <div className="text-center">
                    <p className="text-sm font-medium text-muted-foreground mb-3">{t("customer.jobs.howWasService")}</p>
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          onClick={() => setReviewRating(star)}
                          onMouseEnter={() => setReviewHover(star)}
                          onMouseLeave={() => setReviewHover(0)}
                          aria-label={t("common.rateStars", { count: star })}
                          className="transition-transform hover:scale-110"
                        >
                          <Star className={`w-10 h-10 transition-colors ${star <= (reviewHover || reviewRating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                        </button>
                      ))}
                    </div>
                    {reviewRating > 0 && (
                      <p className="text-sm font-medium mt-2 text-foreground">
                        {reviewRating === 5 ? t("customer.jobs.ratingExcellent") : reviewRating === 4 ? t("customer.jobs.ratingGreat") : reviewRating === 3 ? t("customer.jobs.ratingGood") : reviewRating === 2 ? t("customer.jobs.ratingFair") : t("customer.jobs.ratingPoor")}
                      </p>
                    )}
                  </div>

                  {/* Quick Tags */}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">{t("customer.jobs.whatStoodOut")}</p>
                    <div className="flex flex-wrap gap-2">
                      {reviewQuickTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            reviewTags.includes(tag)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Comment */}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">{t("customer.jobs.additionalComments")}</p>
                    <Textarea
                      value={reviewComment}
                      onChange={e => setReviewComment(e.target.value)}
                      placeholder={t("customer.productDetail.reviewPlaceholder")}
                      className="min-h-[80px] rounded-xl resize-none"
                    />
                  </div>
                </div>
                {reviewError && <p className="text-xs text-red-600">{reviewError}</p>}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setShowReviewModal(false)} disabled={isSubmittingReview}>{t("customer.jobs.skip")}</Button>
                  <Button className="flex-1 rounded-xl" onClick={handleReviewSubmit} disabled={reviewRating === 0 || isSubmittingReview}>
                    {isSubmittingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.productDetail.submitReview")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ThumbsUp className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-1">{t("customer.jobs.thankYou")}</h3>
                <p className="text-sm text-muted-foreground">{t("customer.jobs.reviewHelpsCommunity")}</p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Report Modal */}
        <Dialog open={showReportModal} onOpenChange={setShowReportModal}>
          <DialogContent className="max-w-md rounded-2xl" aria-describedby={undefined}>
            <DialogHeader><DialogTitle>{t("customer.jobs.reportAnIssue")}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div><label className="text-sm font-medium mb-2 block">{t("customer.jobs.issueType")}</label><Select value={reportReason} onValueChange={setReportReason}><SelectTrigger className="rounded-xl"><SelectValue placeholder={t("customer.jobs.selectIssueType")} /></SelectTrigger><SelectContent><SelectItem value="quality">{t("customer.jobs.issuePoorQuality")}</SelectItem><SelectItem value="late">{t("customer.jobs.issueProviderLate")}</SelectItem><SelectItem value="incomplete">{t("customer.jobs.issueIncompleteWork")}</SelectItem><SelectItem value="damage">{t("customer.jobs.issuePropertyDamage")}</SelectItem><SelectItem value="behavior">{t("customer.jobs.issueUnprofessional")}</SelectItem><SelectItem value="other">{t("customer.savedAddresses.typeOther")}</SelectItem></SelectContent></Select></div>
              <div><label className="text-sm font-medium mb-2 block">{t("customer.help.details")}</label><Textarea value={reportDetails} onChange={e => setReportDetails(e.target.value)} placeholder={t("customer.jobs.describeIssue")} className="min-h-[100px] rounded-xl" /></div>
            </div>
            <div className="flex gap-3"><Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setShowReportModal(false)}>{t("common.cancel")}</Button><Button className="flex-1 rounded-xl bg-red-600 hover:bg-red-700" onClick={handleReport} disabled={!reportReason}>{t("customer.help.submit")}</Button></div>
          </DialogContent>
        </Dialog>

        {/* Reschedule Modal */}
        <Dialog open={showRescheduleModal} onOpenChange={setShowRescheduleModal}>
          <DialogContent className="max-w-md rounded-2xl" aria-describedby={undefined}>
            <DialogHeader><DialogTitle>{t("customer.jobs.rescheduleService")}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div><label className="text-sm font-medium mb-2 block">{t("customer.jobs.newDate")}</label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent rounded-xl"><CalendarIcon className="mr-2 h-4 w-4" />{rescheduleDate ? format(rescheduleDate, "PPP") : t("customer.jobs.pickADate")}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={rescheduleDate} onSelect={setRescheduleDate} disabled={(date) => date < new Date()} /></PopoverContent></Popover></div>
              <div><label className="text-sm font-medium mb-2 block">{t("customer.jobs.newTime")}</label><div className="grid grid-cols-4 gap-2">{timeSlots.map(time => (<button key={time} onClick={() => setRescheduleTime(time)} className={`p-2 text-xs font-medium rounded-lg border transition-all ${rescheduleTime === time ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>{time}</button>))}</div></div>
            </div>
            <div className="flex gap-3"><Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setShowRescheduleModal(false)}>{t("common.cancel")}</Button><Button className="flex-1 rounded-xl" onClick={handleReschedule} disabled={!rescheduleDate || !rescheduleTime}>{t("customer.jobs.confirmButton")}</Button></div>
          </DialogContent>
        </Dialog>

        {/* Make Recurring Modal */}
        <Dialog open={showRecurringDialog} onOpenChange={setShowRecurringDialog}>
          <DialogContent className="max-w-sm rounded-2xl" aria-describedby={undefined}>
            <DialogHeader><DialogTitle>Make this a recurring service</DialogTitle></DialogHeader>
            {recurringSaved ? (
              <div className="space-y-3 py-2 text-center">
                <CheckCircle className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="text-sm text-foreground">Set up. Find it under Recurring Maintenance.</p>
                <Button className="w-full rounded-xl" onClick={() => setShowRecurringDialog(false)}>Done</Button>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">How often?</label>
                  <select value={recurringFrequency} onChange={(e) => setRecurringFrequency(e.target.value)} className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm">
                    <option value="30">Every month</option>
                    <option value="90">Every 3 months</option>
                    <option value="180">Every 6 months</option>
                    <option value="365">Every year</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setShowRecurringDialog(false)} disabled={isSavingRecurring}>{t("common.cancel")}</Button>
                  <Button className="flex-1 rounded-xl" onClick={handleMakeRecurring} disabled={isSavingRecurring}>
                    {isSavingRecurring ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ---- Jobs List View ----
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="w-5 h-5 text-primary" />
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">{t("nav.myJobs")}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{t("customer.jobs.subtitle")}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {(["active", "scheduled", "completed", "cancelled"] as const).map(tab => {
            const count = jobs.filter(j => j.status === tab).length
            const config = statusConfig[tab]
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`p-3 rounded-xl text-center transition-all ${activeTab === tab ? `${config.bg} ${config.text} shadow-sm` : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
              >
                <p className="text-xl font-bold">{count}</p>
                <p className="text-[11px] font-medium">{config.label}</p>
              </button>
            )
          })}
        </div>

        {/* Jobs */}
        <div className="space-y-3">
          {filteredJobs.length > 0 ? (
            filteredJobs.map(job => {
              const config = statusConfig[job.status]
              const StatusIcon = job.isAwaitingPayment ? AlertCircle : config.icon
              return (
                <Card
                  key={job.id}
                  onClick={() => job.isAwaitingPayment ? router.push(`/customer/booking?resume=${job.id}`) : setSelectedJobId(job.id)}
                  className="overflow-hidden border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex gap-3 p-3">
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden flex-shrink-0">
                      <Image src={job.image || "/placeholder.svg"} alt={job.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-foreground text-sm">{job.title}</h3>
                          {job.isAwaitingPayment ? (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-1 flex-shrink-0 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                              <StatusIcon className="w-3 h-3" /><span className="hidden sm:inline">{t("customer.jobs.awaitingPayment")}</span>
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-1 flex-shrink-0 ${config.bg} ${config.text}`}>
                              <StatusIcon className="w-3 h-3" /><span className="hidden sm:inline">{config.label}</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-1.5">{job.provider}</p>
                        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1 bg-muted/60 px-1.5 py-0.5 rounded"><Clock className="w-2.5 h-2.5" />{job.date}</span>
                          <span className="flex items-center gap-1 bg-muted/60 px-1.5 py-0.5 rounded"><MapPin className="w-2.5 h-2.5" />{job.location}</span>
                          {job.providerLatitude != null && (job.rawStatus === "ACCEPTED" || job.rawStatus === "IN_PROGRESS") && (
                            <span className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                              <Radio className="w-2.5 h-2.5 animate-pulse" />{t("customer.jobs.liveShort")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="font-bold text-sm text-foreground">{formatMoney(job.price)}</p>
                        {job.isAwaitingPayment ? (
                          <span className="text-[11px] font-medium text-primary">{t("customer.jobs.completePayment")}</span>
                        ) : (
                          <>
                            {job.rating && <div className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /><span className="text-xs font-semibold">{job.rating}</span></div>}
                            {job.status === "completed" && !job.reviewed && !job.rating && (
                              <span className="text-[11px] font-medium text-primary">{t("customer.jobs.needsReview")}</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })
          ) : (
            <Card className="p-12 text-center border-0 shadow-sm">
              <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-6 h-6 text-muted-foreground" /></div>
              <p className="text-base font-semibold text-foreground mb-1">{t("customer.jobs.noJobsOfStatus", { status: statusConfig[activeTab].label })}</p>
              <p className="text-sm text-muted-foreground mb-4">{t("customer.jobs.noJobsOfStatusHint", { status: statusConfig[activeTab].label.toLowerCase() })}</p>
              <Link href="/customer/services"><Button className="rounded-xl">{t("home.browseServices")}</Button></Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
