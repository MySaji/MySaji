"use client"

import { useEffect, useState } from "react"
import { MapPin, Clock, Phone, MessageSquare, Navigation, PlayCircle, CheckCircle2, Check, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getProviderJobs, acceptJob, declineJob, startJob, completeJob, type ProviderJobItem } from "@/lib/actions/provider-jobs"
import { ProviderOnlineToggle } from "@/components/provider-online-toggle"
import { useLocalization } from "@/lib/hooks/useLocalization"

const ACTIVE_STATUSES = ["PENDING", "ACCEPTED", "IN_PROGRESS"]

/**
 * The Field Technician home (Adaptive UI Workspaces) — deliberately
 * minimal: assigned jobs, a navigate button, and one status control per
 * job that steps PENDING -> ACCEPTED ("En Route") -> IN_PROGRESS ->
 * COMPLETED. No expense reporting, no dispute filing, no calendar tab —
 * those stay on the full /provider/jobs page (still reachable via
 * Profile > ... if a staff member needs them), this is just "what do I do
 * right now."
 */
export default function FieldTechnicianHomePage() {
  const { t, formatMoney } = useLocalization()
  const [jobs, setJobs] = useState<ProviderJobItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionInFlight, setActionInFlight] = useState<string | null>(null)

  const refresh = async () => {
    setJobs(await getProviderJobs())
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const activeJobs = jobs
    .filter((j) => ACTIVE_STATUSES.includes(j.status))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))

  const handleNavigate = (location: string) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, "_blank")
  }

  // Real phone numbers are never sent to the client — calling goes through
  // the in-app voice-call system (same deep link the messages page already
  // consumes to auto-start a CallButton call, see classic-chat.tsx).
  const handleCallClient = (job: ProviderJobItem) => {
    window.location.href = `/provider/messages?client=${job.customerId}&action=call`
  }

  const handleChatClient = (job: ProviderJobItem) => {
    window.location.href = `/provider/messages?client=${job.customerId}&action=message`
  }

  const runAction = async (jobId: string, action: (input: { jobId: string }) => Promise<{ success: boolean }>) => {
    setActionInFlight(jobId)
    await action({ jobId })
    setActionInFlight(null)
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
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-800 dark:to-blue-900 text-white p-6 lg:rounded-b-3xl">
        <div className="max-w-2xl mx-auto flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{t("provider.field.title")}</h1>
            <p className="text-blue-100 text-xs">{t("provider.field.subtitle")}</p>
          </div>
          <ProviderOnlineToggle />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-4 space-y-3">
        {activeJobs.length === 0 ? (
          <Card className="p-8 text-center mt-4">
            <p className="text-xs text-muted-foreground">{t("provider.field.noJobs")}</p>
          </Card>
        ) : (
          activeJobs.map((job) => (
            <Card key={job.id} className="p-4 shadow-lg border-0">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-gray-900 dark:text-white">{job.title}</h3>
                <span className="text-base font-bold text-gray-900 dark:text-white whitespace-nowrap">{formatMoney(job.price)}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{job.clientName}</p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mb-3">
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{job.location}</span>
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDate(job.scheduledDate)}</span>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <Button size="sm" variant="outline" className="h-8 bg-transparent" onClick={() => handleCallClient(job)}>
                  <Phone className="w-3.5 h-3.5 mr-1" />{t("provider.jobs.call")}
                </Button>
                <Button size="sm" variant="outline" className="h-8 bg-transparent" onClick={() => handleChatClient(job)}>
                  <MessageSquare className="w-3.5 h-3.5 mr-1" />{t("provider.jobs.chat")}
                </Button>
                <Button size="sm" variant="outline" className="h-8 bg-transparent" onClick={() => handleNavigate(job.location)}>
                  <Navigation className="w-3.5 h-3.5 mr-1" />{t("provider.field.navigate")}
                </Button>
              </div>

              {job.status === "PENDING" && (
                <div className="flex gap-2">
                  <Button className="flex-1 h-9 bg-transparent" variant="outline" onClick={() => runAction(job.id, declineJob)} disabled={actionInFlight === job.id}>
                    {t("provider.jobs.decline")}
                  </Button>
                  <Button className="flex-1 h-9 bg-green-600 hover:bg-green-700" onClick={() => runAction(job.id, acceptJob)} disabled={actionInFlight === job.id}>
                    {actionInFlight === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />{t("provider.jobs.acceptJob")}</>}
                  </Button>
                </div>
              )}
              {job.status === "ACCEPTED" && (
                <Button className="w-full h-9 bg-blue-600 hover:bg-blue-700" onClick={() => runAction(job.id, startJob)} disabled={actionInFlight === job.id}>
                  {actionInFlight === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><PlayCircle className="w-4 h-4 mr-1" />{t("provider.jobs.startJobEnRoute")}</>}
                </Button>
              )}
              {job.status === "IN_PROGRESS" && (
                <Button className="w-full h-9 bg-green-600 hover:bg-green-700" onClick={() => runAction(job.id, completeJob)} disabled={actionInFlight === job.id}>
                  {actionInFlight === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1" />{t("provider.jobs.complete")}</>}
                </Button>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
