"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Users, MapPinned, History } from "lucide-react"
import {
  getBusinessDashboard, setAutoAssignEnabled, setAllowStaffRequestResponses, reassignJob, getCompanyCompletedJobs,
  type BusinessDashboardResult, type BusinessJobRequest, type BusinessTechnician, type CompanyCompletedJobItem,
} from "@/backend/actions/provider-business"
import { TechnicianRosterMap } from "@/frontend/components/maps/technician-roster-map"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import type { TranslationKey } from "@/backend/domain/i18n"

type TFunc = (key: TranslationKey, params?: Record<string, string | number>) => string

export default function BusinessDispatchPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<BusinessDashboardResult>({ isBusinessOwner: false })
  const [completedJobs, setCompletedJobs] = useState<CompanyCompletedJobItem[]>([])
  const [isTogglingAutoAssign, setIsTogglingAutoAssign] = useState(false)
  const [isTogglingAllowStaffRequests, setIsTogglingAllowStaffRequests] = useState(false)
  const [reassigningJobId, setReassigningJobId] = useState<string | null>(null)

  async function refresh() {
    const [dashboard, jobs] = await Promise.all([getBusinessDashboard(), getCompanyCompletedJobs()])
    setData(dashboard)
    setCompletedJobs(jobs)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  async function handleToggleAutoAssign() {
    if (!data.isBusinessOwner) return
    setIsTogglingAutoAssign(true)
    await setAutoAssignEnabled({ enabled: !data.autoAssignEnabled })
    await refresh()
    setIsTogglingAutoAssign(false)
  }

  async function handleToggleAllowStaffRequests() {
    if (!data.isBusinessOwner) return
    setIsTogglingAllowStaffRequests(true)
    await setAllowStaffRequestResponses({ enabled: !data.allowStaffRequestResponses })
    await refresh()
    setIsTogglingAllowStaffRequests(false)
  }

  async function handleReassign(jobId: string, toProviderId: string) {
    setReassigningJobId(jobId)
    await reassignJob({ jobId, toProviderId })
    await refresh()
    setReassigningJobId(null)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      <div className="bg-blue-600 dark:bg-blue-700 text-white p-4 rounded-b-2xl lg:rounded-none">
        <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/provider/business/dashboard" className="lg:hidden flex-shrink-0">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{t("provider.business.dispatch.title")}</h1>
              <p className="text-blue-100 text-xs truncate">{t("provider.business.dispatch.subtitle")}</p>
            </div>
          </div>
          {/* These three are shortcuts to nav items already reachable from
              the sidebar/bottom-nav on mobile — kept here only where there's
              room for them, rather than squeezing three underlined links
              next to the title on a narrow screen. */}
          <div className="hidden sm:flex items-center gap-3 text-xs flex-shrink-0">
            <Link href="/provider/business/staff" className="underline text-blue-100 hover:text-white whitespace-nowrap">
              {t("provider.business.staff.title")}
            </Link>
            <Link href="/provider/business/branches" className="underline text-blue-100 hover:text-white whitespace-nowrap">
              {t("provider.business.dashboard.branchesLink")}
            </Link>
            <Link href="/provider/business/revenue" className="underline text-blue-100 hover:text-white whitespace-nowrap">
              {t("provider.business.dashboard.revenueLink")}
            </Link>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-4 max-w-4xl mx-auto space-y-4 sm:space-y-6 overflow-x-hidden">
        {!data.isBusinessOwner ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700 text-center text-gray-500 dark:text-gray-400">
            {t("provider.business.staff.notBusinessAccount")}
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900 dark:text-white text-xs sm:text-sm">{t("provider.business.dashboard.autoAssignTitle")}</h2>
                <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">{t("provider.business.dashboard.autoAssignDesc")}</p>
              </div>
              <button
                onClick={handleToggleAutoAssign}
                disabled={isTogglingAutoAssign}
                className={`self-start sm:self-auto shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                  data.autoAssignEnabled ? "bg-emerald-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {isTogglingAutoAssign && <Loader2 className="w-4 h-4 animate-spin" />}
                {data.autoAssignEnabled ? t("provider.business.dashboard.autoAssignOn") : t("provider.business.dashboard.autoAssignOff")}
              </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900 dark:text-white text-xs sm:text-sm">{t("provider.business.dashboard.allowStaffRequestsTitle")}</h2>
                <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">{t("provider.business.dashboard.allowStaffRequestsDesc")}</p>
              </div>
              <button
                onClick={handleToggleAllowStaffRequests}
                disabled={isTogglingAllowStaffRequests}
                className={`self-start sm:self-auto shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                  data.allowStaffRequestResponses ? "bg-emerald-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {isTogglingAllowStaffRequests && <Loader2 className="w-4 h-4 animate-spin" />}
                {data.allowStaffRequestResponses ? t("provider.business.dashboard.autoAssignOn") : t("provider.business.dashboard.autoAssignOff")}
              </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border dark:border-gray-700 overflow-hidden">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 text-xs sm:text-sm">
                <MapPinned className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{t("provider.business.dashboard.technicianMapTitle")}</span>
              </h2>
              <TechnicianRosterMap
                technicians={data.technicians
                  .filter((tech) => tech.isOnline && tech.latitude != null && tech.longitude != null)
                  .map((tech) => ({ providerId: tech.providerId, name: tech.name, latitude: tech.latitude!, longitude: tech.longitude!, atCapacity: tech.atCapacity }))}
                className="h-56 sm:h-72 w-full rounded-lg overflow-hidden"
              />
              <div className="mt-3 space-y-2">
                {data.technicians.map((tech) => (
                  <TechnicianRow key={tech.providerId} tech={tech} t={t} />
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border dark:border-gray-700 overflow-hidden">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 text-xs sm:text-sm">
                <Users className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{t("provider.business.dashboard.requestsTitle")}</span>
              </h2>
              {data.requests.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{t("provider.business.dashboard.noRequests")}</p>}
              <div className="space-y-2">
                {data.requests.map((req) => (
                  <RequestRow
                    key={req.id}
                    request={req}
                    technicians={data.technicians}
                    isReassigning={reassigningJobId === req.id}
                    onReassign={(toProviderId) => handleReassign(req.id, toProviderId)}
                    t={t}
                    formatMoney={formatMoney}
                  />
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border dark:border-gray-700 overflow-hidden">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 text-xs sm:text-sm">
                <History className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{t("provider.business.dashboard.completedJobsTitle")}</span>
              </h2>
              {completedJobs.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("provider.business.dashboard.noCompletedJobs")}</p>
              ) : (
                <div className="space-y-2">
                  {completedJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{job.title}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          {job.customerName} · {t("provider.business.dashboard.assignedTo", { name: job.assignedName })} · {new Date(job.completedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-gray-900 dark:text-white shrink-0">{formatMoney(job.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TechnicianRow({ tech, t }: { tech: BusinessTechnician; t: TFunc }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${tech.isOnline ? "bg-emerald-500" : "bg-gray-400"}`} />
        <span className="text-gray-900 dark:text-white font-medium truncate">{tech.name}</span>
        {tech.isOwner && <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0">({t("provider.business.dashboard.ownerBadge")})</span>}
      </div>
      <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0 text-right">
        {tech.isOnline ? t("provider.business.dashboard.activeJobCount", { count: tech.activeJobCount }) : t("provider.business.dashboard.offlineBadge")}
        {tech.atCapacity && ` · ${t("provider.business.dashboard.atCapacityBadge")}`}
      </span>
    </div>
  )
}

function RequestRow({
  request, technicians, isReassigning, onReassign, t, formatMoney,
}: {
  request: BusinessJobRequest
  technicians: BusinessTechnician[]
  isReassigning: boolean
  onReassign: (toProviderId: string) => void
  t: TFunc
  formatMoney: (n: number) => string
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 dark:text-white truncate">{request.title}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
          {request.customerName} · {t("provider.business.dashboard.assignedTo", { name: request.assignedName })} · {formatMoney(request.price)}
        </p>
      </div>
      <select
        className="w-full sm:w-auto shrink-0 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1.5"
        value={request.assignedProviderId}
        disabled={isReassigning}
        onChange={(e) => onReassign(e.target.value)}
      >
        {technicians.map((tech) => (
          <option key={tech.providerId} value={tech.providerId} disabled={tech.atCapacity && tech.providerId !== request.assignedProviderId}>
            {tech.name}{tech.atCapacity ? ` (${t("provider.business.dashboard.atCapacityBadge")})` : ""}
          </option>
        ))}
      </select>
    </div>
  )
}
