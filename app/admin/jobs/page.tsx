"use client"

import { useEffect, useState } from "react"
import {
  Search, Download, Eye, MoreVertical,
  DollarSign, Clock, CheckCircle, Briefcase, Loader2, XCircle
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLocalization } from "@/lib/hooks/useLocalization"
import {
  getAdminJobs, cancelJobAsAdmin,
  type AdminJob, type AdminJobStatus,
} from "@/lib/actions/admin-jobs"

const STATUS_COLOR: Record<AdminJobStatus, string> = {
  "Pending": "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  "Accepted": "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400",
  "In Progress": "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  "Completed": "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  "Cancelled": "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  "Disputed": "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  "Awaiting Payment": "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
}

export default function JobsPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState<"All" | AdminJobStatus>("All")
  const [selectedJob, setSelectedJob] = useState<AdminJob | null>(null)
  const [showJobModal, setShowJobModal] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const STATUS_LABEL: Record<AdminJobStatus, string> = {
    "Pending": t("admin.jobs.statusPending"),
    "Accepted": t("admin.jobs.statusAccepted"),
    "In Progress": t("admin.jobs.statusInProgress"),
    "Completed": t("admin.jobs.statusCompleted"),
    "Cancelled": t("admin.jobs.statusCancelled"),
    "Disputed": t("admin.jobs.statusDisputed"),
    "Awaiting Payment": t("admin.jobs.statusAwaitingPayment"),
  }

  const refresh = async () => {
    const data = await getAdminJobs()
    setJobs(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filters: { label: string; type: "All" | AdminJobStatus }[] = [
    { label: t("admin.jobs.statusAll"), type: "All" },
    { label: STATUS_LABEL.Pending, type: "Pending" },
    { label: STATUS_LABEL["In Progress"], type: "In Progress" },
    { label: STATUS_LABEL.Completed, type: "Completed" },
    { label: STATUS_LABEL.Disputed, type: "Disputed" },
    { label: STATUS_LABEL.Cancelled, type: "Cancelled" },
  ]

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.title.toLowerCase().includes(searchTerm.toLowerCase()) || job.client.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = activeFilter === "All" || job.status === activeFilter
    return matchesSearch && matchesFilter
  })

  const handleExportJobs = () => {
    const data = {
      exportDate: new Date().toISOString(),
      totalJobs: jobs.length,
      jobs: jobs.map(j => ({ id: j.id, title: j.title, client: j.client, provider: j.provider, budget: j.budget, status: j.status })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jobs-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleCancelJob = async (jobId: string) => {
    if (!confirm(t("admin.jobs.confirmCancelJob"))) return
    setBusyId(jobId)
    const result = await cancelJobAsAdmin({ jobId })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    setShowJobModal(false)
    await refresh()
  }

  const stats = [
    { label: t("admin.jobs.statTotalJobs"), value: jobs.length, icon: Briefcase, color: "from-blue-50 to-blue-100" },
    { label: t("admin.jobs.statInProgress"), value: jobs.filter(j => j.status === "In Progress" || j.status === "Accepted").length, icon: Clock, color: "from-yellow-50 to-yellow-100" },
    { label: t("admin.jobs.statCompleted"), value: jobs.filter(j => j.status === "Completed").length, icon: CheckCircle, color: "from-emerald-50 to-emerald-100" },
    { label: t("admin.jobs.statTotalValue"), value: formatMoney(jobs.reduce((sum, j) => sum + j.budget, 0)), icon: DollarSign, color: "from-purple-50 to-purple-100" },
  ]

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const canCancel = selectedJob && selectedJob.status !== "Completed" && selectedJob.status !== "Cancelled"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("admin.jobs.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{t("admin.jobs.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Card key={i} className={`p-4 border-0 shadow-lg bg-gradient-to-br ${stat.color} dark:from-gray-800 dark:to-gray-800`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{stat.label}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
                </div>
                <Icon className="w-5 h-5 text-gray-400" />
              </div>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="w-full sm:flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder={t("admin.jobs.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
          />
        </div>
        <Button onClick={handleExportJobs} className="bg-green-600 hover:bg-green-700 gap-2">
          <Download size={18} />
          <span className="hidden sm:inline">{t("admin.jobs.export")}</span>
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {filters.map((filter) => (
          <button
            key={filter.type}
            onClick={() => setActiveFilter(filter.type)}
            className={`px-4 py-2 whitespace-nowrap rounded-lg font-medium transition-colors flex items-center gap-2 text-xs ${
              activeFilter === filter.type
                ? "bg-blue-600 text-white shadow-lg"
                : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredJobs.length > 0 ? filteredJobs.map((job) => (
          <Card key={job.id} className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">{job.title}</h3>
                  <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${STATUS_COLOR[job.status]}`}>
                    {STATUS_LABEL[job.status] ?? job.status}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">{job.client} • {job.category}</p>
              </div>
              <button onClick={() => { setSelectedJob(job); setShowJobModal(true) }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <MoreVertical size={18} className="text-gray-600 dark:text-gray-400" />
              </button>
            </div>

            <div className="space-y-3 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">{t("admin.jobs.budget")}</span>
                <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(job.budget)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">{t("admin.jobs.scheduled")}</span>
                <span className="font-semibold text-gray-900 dark:text-white">{new Date(job.deadline).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">{t("common.provider")}</span>
                <span className={`font-semibold ${!job.provider ? "text-orange-600" : "text-emerald-600"}`}>
                  {job.provider ?? t("admin.jobs.unassigned")}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button onClick={() => { setSelectedJob(job); setShowJobModal(true) }} className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors text-blue-600">
                <Eye size={18} />
              </button>
            </div>
          </Card>
        )) : (
          <div className="lg:col-span-2 text-center py-12 text-gray-600 dark:text-gray-400">{t("admin.jobs.noJobsFound")}</div>
        )}
      </div>

      <Dialog open={showJobModal} onOpenChange={setShowJobModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedJob?.title}</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-[11px] text-muted-foreground">{t("common.status")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white mt-1">{STATUS_LABEL[selectedJob.status] ?? selectedJob.status}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-[11px] text-muted-foreground">{t("admin.jobs.category")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white mt-1">{selectedJob.category}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-[11px] text-muted-foreground">{t("admin.jobs.budget")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white mt-1">{formatMoney(selectedJob.budget)}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-[11px] text-muted-foreground">{t("common.provider")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white mt-1">{selectedJob.provider ?? t("admin.jobs.unassigned")}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-[11px] text-muted-foreground">{t("admin.jobs.client")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white mt-1">{selectedJob.client}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-[11px] text-muted-foreground">{t("admin.jobs.scheduled")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white mt-1">{new Date(selectedJob.deadline).toLocaleDateString()}</p>
                </div>
              </div>
              {canCancel && (
                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    variant="outline"
                    className="flex-1 bg-transparent text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => handleCancelJob(selectedJob.id)}
                    disabled={busyId === selectedJob.id}
                  >
                    {busyId === selectedJob.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-2" />{t("admin.jobs.cancelJob")}</>}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
