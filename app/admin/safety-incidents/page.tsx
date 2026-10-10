"use client"

import { useEffect, useState } from "react"
import { Siren, MapPin, Loader2, CheckCircle2 } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { getActiveSafetyIncidentsForAdmin, resolveSafetyIncident, type SafetyIncidentItem } from "@/backend/actions/safety"

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  ESCALATED: { label: "Escalated", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  EMERGENCY_SERVICES_CONTACTED: { label: "Emergency Services Contacted", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  SAFETY_TEAM_ALERTED: { label: "Safety Team Alerted", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
}

export default function AdminSafetyIncidentsPage() {
  const [items, setItems] = useState<SafetyIncidentItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = () => getActiveSafetyIncidentsForAdmin().then(setItems)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleResolve = async (id: string) => {
    setBusyId(id)
    const result = await resolveSafetyIncident({ incidentId: id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  if (isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900 dark:text-white"><Siren className="h-8 w-8 text-red-600" /> Safety Incidents</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">Real-time SOS reports from active jobs. Refreshes automatically.</p>
      </div>

      {items.length === 0 ? (
        <Card className="border-0 p-10 text-center shadow-lg">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
          <p className="text-xs text-gray-600 dark:text-gray-400">No active safety incidents.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((incident) => {
            const status = STATUS_STYLE[incident.status]
            return (
              <Card key={incident.id} className="border-0 border-l-4 border-l-red-500 p-5 shadow-lg">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-white">{incident.jobTitle}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Reported by {incident.reportedByName} · {new Date(incident.createdAt).toLocaleString()}</p>
                    {incident.description && <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">{incident.description}</p>}
                    {incident.latitude != null && incident.longitude != null && (
                      <a
                        href={`https://www.google.com/maps?q=${incident.latitude},${incident.longitude}`}
                        target="_blank" rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline"
                      >
                        <MapPin className="h-3.5 w-3.5" /> View reported location
                      </a>
                    )}
                  </div>
                  <Button size="sm" className="flex-shrink-0 gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={busyId === incident.id} onClick={() => handleResolve(incident.id)}>
                    {busyId === incident.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" />Resolve</>}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
