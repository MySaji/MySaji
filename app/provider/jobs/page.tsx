"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Search, Filter, Calendar, MapPin, Clock, CheckCircle2, AlertTriangle, ChevronRight, Star, Phone, MessageSquare, Navigation, MoreVertical, X, Check, Loader2, Radio, PlayCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog as DialogComponent, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getProviderJobs, getProviderJobStats, acceptJob, declineJob, startJob, completeJob, fileProviderDispute,
  updateJobProviderLocation, reportNoShow,
  type ProviderJobItem, type ProviderJobStats,
} from "@/lib/actions/provider-jobs"
import { getJobExpenses, addJobExpense, type JobExpenseItem } from "@/lib/actions/job-expenses"
import { Receipt, Upload } from "lucide-react"
import { StaticLocationMap } from "@/components/maps/static-location-map"
import { ProviderOnlineToggle } from "@/components/provider-online-toggle"
import { JobTimeline } from "@/components/job-timeline"
import { ChangeOrdersPanel } from "@/components/change-orders-panel"
import { QrHandshakeProvider } from "@/components/qr-handshake-provider"
import { WarrantyPanel } from "@/components/warranty-panel"
import { SafetySosButton } from "@/components/safety-sos-button"
import { IdentityVerificationPanel } from "@/components/identity-verification-panel"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { TranslationKey } from "@/lib/i18n"

const LOCATION_SHARE_MIN_INTERVAL_MS = 15000
const MAX_RECEIPT_PHOTO_BYTES = 1_500_000

type TabKey = "active" | "pending" | "completed" | "disputed" | "calendar"

function toTab(status: string): TabKey {
  switch (status) {
    case "PENDING": return "pending"
    case "ACCEPTED":
    case "IN_PROGRESS": return "active"
    case "COMPLETED": return "completed"
    case "DISPUTED": return "disputed"
    default: return "active"
  }
}

const STATUS_LABEL_KEY: Record<string, TranslationKey> = {
  PENDING: "provider.jobs.statusAwaitingApproval",
  ACCEPTED: "provider.jobs.statusScheduled",
  IN_PROGRESS: "provider.jobs.statusInProgress",
  COMPLETED: "provider.jobs.statusCompleted",
  DISPUTED: "provider.jobs.statusUnderReview",
  CANCELLED: "provider.jobs.statusCancelled",
}

const NO_JOBS_KEY: Record<TabKey, TranslationKey> = {
  active: "provider.jobs.noActiveJobsYet",
  pending: "provider.jobs.noPendingJobsYet",
  completed: "provider.jobs.noCompletedJobsYet",
  disputed: "provider.jobs.noDisputedJobsYet",
  calendar: "provider.jobs.noUpcomingJobs",
}

const CALENDAR_DAYS_AHEAD = 14

// Local calendar day, not UTC — a job scheduled late evening/early morning
// in the provider's own timezone (e.g. EAT, UTC+3) would otherwise land
// under the wrong day when compared via Date#toISOString(), which is
// always UTC.
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  ACCEPTED: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  DISPUTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CANCELLED: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
}

export default function ProviderJobsPage() {
  const { t, formatMoney } = useLocalization()
  const [activeTab, setActiveTab] = useState<TabKey>("active")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedJob, setSelectedJob] = useState<ProviderJobItem | null>(null)
  const [showJobDetails, setShowJobDetails] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [reportReason, setReportReason] = useState("")
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [reportError, setReportError] = useState("")
  const [actionInFlight, setActionInFlight] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [jobs, setJobs] = useState<ProviderJobItem[]>([])
  const [stats, setStats] = useState<ProviderJobStats>({ activeCount: 0, pendingCount: 0, completedCount: 0, disputedCount: 0, totalEarned: 0 })
  const [sharingJobId, setSharingJobId] = useState<string | null>(null)
  const [shareLocationError, setShareLocationError] = useState("")
  const watchIdRef = useRef<number | null>(null)
  const lastSentAtRef = useRef(0)

  const [showNoShowConfirm, setShowNoShowConfirm] = useState(false)
  const [isReportingNoShow, setIsReportingNoShow] = useState(false)
  const [noShowError, setNoShowError] = useState("")

  const [jobExpenses, setJobExpenses] = useState<JobExpenseItem[]>([])
  const [showAddExpenseDialog, setShowAddExpenseDialog] = useState(false)
  const [expenseDescription, setExpenseDescription] = useState("")
  const [expenseAmount, setExpenseAmount] = useState("")
  const [expensePhoto, setExpensePhoto] = useState("")
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false)
  const [expenseError, setExpenseError] = useState("")

  useEffect(() => {
    return () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current) }
  }, [])

  const refresh = async () => {
    const [jobList, statsData] = await Promise.all([getProviderJobs(), getProviderJobStats()])
    setJobs(jobList)
    setStats(statsData)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const tabs = [
    { key: "active" as const, label: t("provider.jobs.tabActive"), count: stats.activeCount },
    { key: "pending" as const, label: t("provider.jobs.tabPending"), count: stats.pendingCount },
    { key: "calendar" as const, label: t("provider.jobs.tabCalendar"), count: null },
    { key: "completed" as const, label: t("provider.jobs.tabCompleted"), count: stats.completedCount },
    { key: "disputed" as const, label: t("provider.jobs.tabDisputed"), count: stats.disputedCount },
  ]

  const currentJobs = jobs.filter((j) => toTab(j.status) === activeTab)
  const filteredJobs = currentJobs.filter(job =>
    job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.clientName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Solo Pro "daily calendar" — the provider's own upcoming active/pending
  // jobs, grouped by day, for the next two weeks.
  const calendarDays = Array.from({ length: CALENDAR_DAYS_AHEAD }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() + i)
    const dateKey = localDateKey(date)
    const dayJobs = jobs
      .filter((j) => (j.status === "ACCEPTED" || j.status === "IN_PROGRESS" || j.status === "PENDING") && localDateKey(new Date(j.scheduledDate)) === dateKey)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    return { date, dayJobs }
  }).filter((d) => d.dayJobs.length > 0)

  const handleAcceptJob = async (jobId: string) => {
    setActionInFlight(jobId)
    const result = await acceptJob({ jobId })
    setActionInFlight(null)
    if (result.success) { setShowJobDetails(false); await refresh() }
  }

  const handleDeclineJob = async (jobId: string) => {
    setActionInFlight(jobId)
    const result = await declineJob({ jobId })
    setActionInFlight(null)
    if (result.success) { setShowJobDetails(false); await refresh() }
  }

  const handleReportNoShow = async () => {
    if (!selectedJob) return
    setIsReportingNoShow(true)
    setNoShowError("")
    const result = await reportNoShow({ jobId: selectedJob.id })
    setIsReportingNoShow(false)
    if (!result.success) {
      setNoShowError(result.error)
      return
    }
    setShowNoShowConfirm(false)
    setShowJobDetails(false)
    await refresh()
  }

  const handleStartJob = async (jobId: string) => {
    setActionInFlight(jobId)
    const result = await startJob({ jobId })
    setActionInFlight(null)
    if (result.success) { setShowJobDetails(false); await refresh() }
  }

  const handleCompleteJob = async (jobId: string) => {
    setActionInFlight(jobId)
    const result = await completeJob({ jobId })
    setActionInFlight(null)
    if (result.success) { setShowJobDetails(false); await refresh() }
  }

  const handleCallClient = (phone: string | null) => {
    if (phone) window.location.href = `tel:${phone}`
  }

  const handleChatClient = (job: ProviderJobItem) => {
    window.location.href = `/provider/messages?client=${job.customerId}&action=message`
  }

  const handleNavigate = (location: string) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, "_blank")
  }

  // Real GPS sharing — throttled to at most one write every 15s regardless
  // of how often watchPosition fires, so the customer's tracking view gets
  // fresh-enough data without flooding the DB.
  const toggleShareLocation = (job: ProviderJobItem) => {
    if (sharingJobId === job.id) {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      setSharingJobId(null)
      return
    }
    if (!navigator.geolocation) { setShareLocationError(t("provider.jobs.geoNotSupported")); return }
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    setShareLocationError("")
    lastSentAtRef.current = 0
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now()
        if (now - lastSentAtRef.current < LOCATION_SHARE_MIN_INTERVAL_MS) return
        lastSentAtRef.current = now
        updateJobProviderLocation({ jobId: job.id, latitude: position.coords.latitude, longitude: position.coords.longitude })
      },
      () => setShareLocationError(t("provider.jobs.geoPermissionDenied")),
      { enableHighAccuracy: true, maximumAge: 10000 },
    )
    setSharingJobId(job.id)
  }

  const openJobDetails = (job: ProviderJobItem) => {
    setSelectedJob(job)
    setShowJobDetails(true)
    getJobExpenses(job.id).then(setJobExpenses)
  }

  const handleExpensePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExpenseError("")
    if (file.size > MAX_RECEIPT_PHOTO_BYTES) {
      setExpenseError(t("provider.jobs.receiptTooLarge"))
      return
    }
    const reader = new FileReader()
    reader.onload = () => setExpensePhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  const openAddExpenseDialog = () => {
    setExpenseDescription("")
    setExpenseAmount("")
    setExpensePhoto("")
    setExpenseError("")
    setShowAddExpenseDialog(true)
  }

  const handleSubmitExpense = async () => {
    if (!selectedJob) return
    const amount = Number(expenseAmount)
    if (!expenseDescription.trim() || !amount || amount <= 0 || !expensePhoto) {
      setExpenseError(t("provider.jobs.expenseIncompleteError"))
      return
    }
    setIsSubmittingExpense(true)
    setExpenseError("")
    const result = await addJobExpense({ jobId: selectedJob.id, description: expenseDescription.trim(), amount, receiptPhotoUrl: expensePhoto })
    setIsSubmittingExpense(false)
    if (!result.success) {
      setExpenseError(result.error)
      return
    }
    setShowAddExpenseDialog(false)
    setJobExpenses(await getJobExpenses(selectedJob.id))
  }

  const openReportDialog = (job: ProviderJobItem) => {
    setSelectedJob(job)
    setReportReason("")
    setReportError("")
    setShowReportDialog(true)
  }

  const handleSubmitReport = async () => {
    if (!selectedJob || !reportReason.trim()) return
    setIsSubmittingReport(true)
    setReportError("")
    const result = await fileProviderDispute({ jobId: selectedJob.id, reason: reportReason.trim() })
    setIsSubmittingReport(false)
    if (!result.success) { setReportError(result.error); return }
    setShowReportDialog(false)
    setShowJobDetails(false)
    await refresh()
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-800 dark:to-blue-900 text-white p-4 sm:p-6 lg:rounded-b-3xl overflow-hidden">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold truncate">{t("nav.myJobs")}</h1>
              <p className="text-blue-100 text-xs truncate">{t("provider.jobs.subtitle")}</p>
            </div>
            <div className="flex-shrink-0">
              <ProviderOnlineToggle />
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4 sm:mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 sm:p-3 text-center min-w-0">
              <p className="text-base sm:text-xl font-bold truncate">{stats.activeCount}</p>
              <p className="text-[11px] text-blue-100 truncate">{t("provider.jobs.statActive")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 sm:p-3 text-center min-w-0">
              <p className="text-base sm:text-xl font-bold truncate">{stats.pendingCount}</p>
              <p className="text-[11px] text-blue-100 truncate">{t("provider.jobs.statPending")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 sm:p-3 text-center min-w-0">
              <p className="text-base sm:text-xl font-bold truncate">{stats.completedCount}</p>
              <p className="text-[11px] text-blue-100 truncate">{t("provider.jobs.statDone")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 sm:p-3 text-center min-w-0">
              <p className="text-base sm:text-xl font-bold truncate">{formatMoney(stats.totalEarned)}</p>
              <p className="text-[11px] text-blue-100 truncate">{t("provider.jobs.statEarned")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-4">
        {/* Search & Filter */}
        <Card className="p-4 mb-4 shadow-lg border-0">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("provider.jobs.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" size="icon" aria-label={t("common.filter")}>
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-xs whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {tab.label}
              {tab.count != null && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                  activeTab === tab.key ? "bg-white/20" : "bg-gray-200 dark:bg-gray-700"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Calendar */}
        {activeTab === "calendar" ? (
          <div className="space-y-4">
            {calendarDays.length === 0 ? (
              <Card className="p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{t("provider.jobs.noJobsFoundTitle")}</h3>
                <p className="text-xs text-muted-foreground">{t(NO_JOBS_KEY.calendar)}</p>
              </Card>
            ) : (
              calendarDays.map(({ date, dayJobs }) => (
                <div key={localDateKey(date)}>
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                    {date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                  </h3>
                  <div className="space-y-2">
                    {dayJobs.map((job) => (
                      <Card key={job.id} className="p-3 flex items-center justify-between gap-3 border-0 shadow-sm">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[job.status]}`}>
                              {STATUS_LABEL_KEY[job.status] ? t(STATUS_LABEL_KEY[job.status]) : job.status}
                            </span>
                            <p className="font-medium text-gray-900 dark:text-white truncate">{job.title}</p>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-3">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(job.scheduledDate).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                            <span className="truncate">{job.clientName}</span>
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="h-8 shrink-0 bg-transparent" onClick={() => handleNavigate(job.location)}>
                          <Navigation className="w-3.5 h-3.5 mr-1" />
                          {t("provider.jobs.navigate")}
                        </Button>
                      </Card>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
        <div className="space-y-3">
          {filteredJobs.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{t("provider.jobs.noJobsFoundTitle")}</h3>
              <p className="text-xs text-muted-foreground">
                {searchQuery ? t("provider.jobs.tryDifferentSearch") : t(NO_JOBS_KEY[activeTab])}
              </p>
            </Card>
          ) : (
            filteredJobs.map((job) => (
              <Card
                key={job.id}
                className={`p-4 hover:shadow-lg transition-shadow border-0 shadow-sm ${
                  job.urgency === "URGENT" ? "ring-2 ring-red-500 ring-offset-2" : ""
                }`}
              >
                {job.urgency === "URGENT" && (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-medium mb-3">
                    <AlertTriangle className="w-4 h-4" />
                    {t("provider.jobs.urgentRequest")}
                  </div>
                )}

                <div className="flex gap-4">
                  <img
                    src={job.clientAvatar || "/placeholder.svg"}
                    alt={job.clientName}
                    className="w-14 h-14 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{job.title}</h3>
                      <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[job.status]}`}>
                        {STATUS_LABEL_KEY[job.status] ? t(STATUS_LABEL_KEY[job.status]) : job.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{job.clientName}</p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mb-3">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {job.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(job.scheduledDate)}
                      </span>
                    </div>

                    {job.rating != null && (
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${i < (job.rating || 0) ? "text-amber-400 fill-amber-400" : "text-gray-300"}`}
                            />
                          ))}
                        </div>
                        {job.reviewComment && <span className="text-[11px] text-muted-foreground">"{job.reviewComment}"</span>}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="text-base font-bold text-gray-900 dark:text-white flex-shrink-0">{formatMoney(job.price)}</p>
                      <div className="flex items-center flex-wrap gap-2">
                        {activeTab === "active" && (
                          <>
                            <Button size="sm" variant="outline" className="h-8 bg-transparent" onClick={() => handleCallClient(job.clientPhone)} disabled={!job.clientPhone}>
                              <Phone className="w-3.5 h-3.5 mr-1" />
                              {t("provider.jobs.call")}
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 bg-transparent" onClick={() => handleChatClient(job)}>
                              <MessageSquare className="w-3.5 h-3.5 mr-1" />
                              {t("provider.jobs.chat")}
                            </Button>
                            {job.status === "ACCEPTED" ? (
                              <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={() => handleStartJob(job.id)} disabled={actionInFlight === job.id}>
                                {actionInFlight === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><PlayCircle className="w-3.5 h-3.5 mr-1" />{t("provider.jobs.startJobEnRoute")}</>}
                              </Button>
                            ) : (
                              <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" onClick={() => handleCompleteJob(job.id)} disabled={actionInFlight === job.id}>
                                {actionInFlight === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("provider.jobs.complete")}
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="h-8 bg-transparent" onClick={() => openJobDetails(job)} aria-label={t("common.viewDetails")}>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        {activeTab === "pending" && (
                          <>
                            <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200 bg-transparent" onClick={() => handleDeclineJob(job.id)} disabled={actionInFlight === job.id}>
                              {t("provider.jobs.decline")}
                            </Button>
                            <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" onClick={() => handleAcceptJob(job.id)} disabled={actionInFlight === job.id}>
                              {actionInFlight === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("provider.jobs.accept")}
                            </Button>
                          </>
                        )}
                        {activeTab === "disputed" && (
                          <Button size="sm" className="h-8 bg-red-600 hover:bg-red-700" onClick={() => openJobDetails(job)}>
                            {t("provider.jobs.respond")}
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={t("common.moreOptions")}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openJobDetails(job)}>{t("common.viewDetails")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleNavigate(job.location)}>{t("provider.jobs.viewLocation")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openReportDialog(job)}>{t("provider.jobs.reportIssue")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
        )}
      </div>

      {/* Job Details Modal */}
      <DialogComponent open={showJobDetails} onOpenChange={setShowJobDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("provider.jobs.jobDetailsTitle")}</DialogTitle>
          </DialogHeader>

          {selectedJob && (
            <div className="space-y-6">
              {/* Job Header */}
              <div className="flex gap-4 pb-4 border-b">
                <img
                  src={selectedJob.clientAvatar || "/placeholder.svg"}
                  alt={selectedJob.clientName}
                  className="w-16 h-16 rounded-full object-cover"
                />
                <div className="flex-1">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">{selectedJob.title}</h2>
                  <p className="text-xs text-muted-foreground">{selectedJob.clientName}</p>
                  <p className="text-base font-bold text-blue-600 dark:text-blue-400 mt-1">{formatMoney(selectedJob.price)}</p>
                </div>
              </div>

              {/* Job Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("provider.jobs.locationLabel")}</p>
                  <p className="text-xs font-medium text-gray-900 dark:text-white flex items-center gap-2 mt-1">
                    <MapPin className="w-4 h-4" />
                    {selectedJob.location}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("provider.jobs.dateTimeLabel")}</p>
                  <p className="text-xs font-medium text-gray-900 dark:text-white flex items-center gap-2 mt-1">
                    <Clock className="w-4 h-4" />
                    {formatDate(selectedJob.scheduledDate)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[11px] text-muted-foreground mb-1">{t("provider.jobs.descriptionLabel")}</p>
                <p className="text-xs text-gray-700 dark:text-gray-300">{selectedJob.description}</p>
              </div>

              <IdentityVerificationPanel jobId={selectedJob.id} canVerify={selectedJob.status === "ACCEPTED"} />

              <QrHandshakeProvider jobId={selectedJob.id} canVerify={selectedJob.status === "ACCEPTED" || selectedJob.status === "IN_PROGRESS"} />

              <WarrantyPanel jobId={selectedJob.id} viewerRole="provider" jobCompleted={selectedJob.status === "COMPLETED"} />

              {(selectedJob.status === "ACCEPTED" || selectedJob.status === "IN_PROGRESS") && <SafetySosButton jobId={selectedJob.id} />}

              <ChangeOrdersPanel jobId={selectedJob.id} viewerRole="provider" canRequest={selectedJob.status === "ACCEPTED" || selectedJob.status === "IN_PROGRESS"} />

              <JobTimeline jobId={selectedJob.id} />

              {(selectedJob.latitude != null && selectedJob.longitude != null) && (
                <StaticLocationMap latitude={selectedJob.latitude} longitude={selectedJob.longitude} label={selectedJob.location} className="h-40 w-full rounded-xl" />
              )}

              {/* Actions */}
              <div className="flex gap-3 flex-wrap">
                <Button onClick={() => handleCallClient(selectedJob.clientPhone)} className="bg-green-600 hover:bg-green-700" disabled={!selectedJob.clientPhone}>
                  <Phone className="w-4 h-4 mr-2" />
                  {t("provider.jobs.callClient")}
                </Button>
                <Button onClick={() => handleChatClient(selectedJob)} variant="outline">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  {t("provider.jobs.chat")}
                </Button>
                {selectedJob.status === "PENDING" && (
                  <p className="w-full text-[11px] text-muted-foreground">Phone number and exact address unlock once you accept this job.</p>
                )}
                <Button onClick={() => handleNavigate(selectedJob.location)} variant="outline">
                  <Navigation className="w-4 h-4 mr-2" />
                  {t("provider.jobs.navigate")}
                </Button>
              </div>

              {/* Live location sharing — real-time position for the customer's tracking view */}
              {toTab(selectedJob.status) === "active" && (
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      {sharingJobId === selectedJob.id ? (
                        <span className="flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
                          <Radio className="w-3.5 h-3.5 animate-pulse" /> {t("provider.jobs.sharingLiveLocation")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("provider.jobs.shareLiveLocationPrompt")}</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={sharingJobId === selectedJob.id ? "outline" : "default"}
                      onClick={() => toggleShareLocation(selectedJob)}
                      className={sharingJobId === selectedJob.id ? "" : "bg-blue-600 hover:bg-blue-700"}
                    >
                      {sharingJobId === selectedJob.id ? t("provider.jobs.stopSharing") : t("provider.jobs.shareMyLocation")}
                    </Button>
                  </div>
                  {shareLocationError && <p className="text-[11px] text-red-600 mt-2">{shareLocationError}</p>}
                </div>
              )}

              {/* No-show reporting — Gap 6 */}
              {selectedJob.status === "ACCEPTED" && new Date(selectedJob.scheduledDate).getTime() <= Date.now() && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-amber-800 dark:text-amber-400">{t("provider.jobs.noShowPrompt")}</p>
                  <Button size="sm" variant="outline" className="shrink-0 border-amber-400 text-amber-800 dark:text-amber-400 bg-transparent" onClick={() => { setNoShowError(""); setShowNoShowConfirm(true) }}>
                    {t("provider.jobs.reportNoShowButton")}
                  </Button>
                </div>
              )}

              {/* In-job up-charge — Gap 1 */}
              {toTab(selectedJob.status) === "active" && (
                <div className="rounded-xl border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium flex items-center gap-1.5"><Receipt className="w-4 h-4" />{t("provider.jobs.expensesTitle")}</p>
                    <Button size="sm" variant="outline" onClick={openAddExpenseDialog}>{t("provider.jobs.addExpenseButton")}</Button>
                  </div>
                  {jobExpenses.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">{t("provider.jobs.noExpensesYet")}</p>
                  ) : (
                    <div className="space-y-2">
                      {jobExpenses.map((expense) => (
                        <div key={expense.id} className="flex items-center justify-between text-xs bg-muted/50 rounded-lg px-3 py-2">
                          <span className="truncate">{expense.description}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            {formatMoney(expense.amount)}
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                              expense.status === "APPROVED" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : expense.status === "REJECTED" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            }`}>
                              {expense.status === "APPROVED" ? t("provider.jobs.expenseApproved") : expense.status === "REJECTED" ? t("provider.jobs.expenseRejected") : t("provider.jobs.expensePending")}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Pending Job Actions */}
              {toTab(selectedJob.status) === "pending" && (
                <div className="flex gap-3">
                  <Button onClick={() => handleDeclineJob(selectedJob.id)} variant="outline" className="flex-1" disabled={actionInFlight === selectedJob.id}>
                    {t("provider.jobs.decline")}
                  </Button>
                  <Button onClick={() => handleAcceptJob(selectedJob.id)} className="flex-1 bg-green-600 hover:bg-green-700" disabled={actionInFlight === selectedJob.id}>
                    <Check className="w-4 h-4 mr-2" />
                    {t("provider.jobs.acceptJob")}
                  </Button>
                </div>
              )}

              {selectedJob.status === "ACCEPTED" && (
                <Button onClick={() => handleStartJob(selectedJob.id)} className="w-full bg-blue-600 hover:bg-blue-700" disabled={actionInFlight === selectedJob.id}>
                  <PlayCircle className="w-4 h-4 mr-2" />
                  {t("provider.jobs.startJobEnRoute")}
                </Button>
              )}
              {selectedJob.status === "IN_PROGRESS" && (
                <Button onClick={() => handleCompleteJob(selectedJob.id)} className="w-full bg-green-600 hover:bg-green-700" disabled={actionInFlight === selectedJob.id}>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {t("provider.jobs.markComplete")}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </DialogComponent>

      {/* Report Issue Dialog */}
      <DialogComponent open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("provider.jobs.reportAnIssueTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={t("provider.jobs.reportPlaceholder")}
              className="min-h-[100px]"
            />
            {reportError && <p className="text-xs text-red-600">{reportError}</p>}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowReportDialog(false)}>{t("common.cancel")}</Button>
              <Button className="flex-1" onClick={handleSubmitReport} disabled={!reportReason.trim() || isSubmittingReport}>
                {isSubmittingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.jobs.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogComponent>

      {/* Add Expense/Part Dialog — Gap 1 */}
      <DialogComponent open={showAddExpenseDialog} onOpenChange={setShowAddExpenseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("provider.jobs.addExpenseTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder={t("provider.jobs.expenseDescriptionPlaceholder")} value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} />
            <Input type="number" min="1" placeholder={t("provider.jobs.expenseAmountPlaceholder")} value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg py-6 cursor-pointer text-muted-foreground hover:border-primary text-xs">
              <Upload className="w-4 h-4" />
              {expensePhoto ? "✓" : t("provider.jobs.uploadReceiptLabel")}
              <input type="file" accept="image/*" className="hidden" onChange={handleExpensePhoto} />
            </label>
            {expenseError && <p className="text-xs text-red-600">{expenseError}</p>}
            <p className="text-[11px] text-muted-foreground">{t("provider.jobs.expenseApprovalNotice")}</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowAddExpenseDialog(false)}>{t("common.cancel")}</Button>
              <Button className="flex-1" onClick={handleSubmitExpense} disabled={isSubmittingExpense}>
                {isSubmittingExpense ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.jobs.sendForApprovalButton")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogComponent>

      {/* Report No-Show confirmation — Gap 6 */}
      <DialogComponent open={showNoShowConfirm} onOpenChange={setShowNoShowConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("provider.jobs.reportNoShowTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("provider.jobs.reportNoShowConfirmBody")}</p>
          {noShowError && <p className="text-xs text-red-600">{noShowError}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowNoShowConfirm(false)} disabled={isReportingNoShow}>
              {t("common.cancel")}
            </Button>
            <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={handleReportNoShow} disabled={isReportingNoShow}>
              {isReportingNoShow ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.jobs.reportNoShowButton")}
            </Button>
          </div>
        </DialogContent>
      </DialogComponent>
    </div>
  )
}
