"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Siren, Phone, Loader2, ShieldAlert } from "lucide-react"
import { reportSafetyIncident, markEmergencyServicesContacted } from "@/lib/actions/safety"

/** Real SOS — captures a one-time location snapshot (if the browser grants
 * it), creates a real SafetyIncident that immediately alerts every active
 * admin, and offers a tap-to-dial shortcut to the local emergency number.
 * There's no dispatch API in this environment, so this app can't actually
 * call emergency services on the user's behalf — it alerts Saji's own
 * safety team for real and hands the user a fast way to dial themselves. */
export function SafetySosButton({ jobId }: { jobId: string }) {
  const [showDialog, setShowDialog] = useState(false)
  const [isReporting, setIsReporting] = useState(false)
  const [incidentId, setIncidentId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const handleReport = async () => {
    setIsReporting(true)
    setError("")

    const position = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) { resolve(null); return }
      navigator.geolocation.getCurrentPosition((pos) => resolve(pos), () => resolve(null), { timeout: 5000 })
    })

    const result = await reportSafetyIncident({
      jobId,
      latitude: position?.coords.latitude,
      longitude: position?.coords.longitude,
    })
    setIsReporting(false)
    if (!result.success) { setError(result.error); return }
    setIncidentId(result.incidentId)
  }

  const handleCallEmergency = async () => {
    if (incidentId) await markEmergencyServicesContacted({ incidentId })
    window.location.href = "tel:999"
  }

  return (
    <>
      <button
        onClick={() => { setShowDialog(true); setIncidentId(null); setError("") }}
        aria-label="Emergency SOS"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 lg:bottom-6"
      >
        <Siren className="h-6 w-6" />
      </button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-xs rounded-xl text-center" showCloseButton={false}>
          {!incidentId ? (
            <div className="space-y-4">
              <ShieldAlert className="mx-auto h-10 w-10 text-red-600" />
              <h2 className="text-lg font-bold text-foreground">Report a Safety Concern</h2>
              <p className="text-sm text-muted-foreground">This alerts Saji's safety team immediately. If you're in immediate danger, call emergency services first.</p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setShowDialog(false)} disabled={isReporting}>Cancel</Button>
                <Button className="flex-1 rounded-xl bg-red-600 hover:bg-red-700" onClick={handleReport} disabled={isReporting}>
                  {isReporting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Alert Safety Team"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <ShieldAlert className="mx-auto h-10 w-10 text-emerald-600" />
              <h2 className="text-lg font-bold text-foreground">Saji Safety Team Alerted</h2>
              <p className="text-sm text-muted-foreground">Our team has been notified with this job's details. If you need emergency services now, call them directly.</p>
              <Button className="w-full gap-2 rounded-xl bg-red-600 hover:bg-red-700" onClick={handleCallEmergency}>
                <Phone className="h-4 w-4" /> Call 999
              </Button>
              <Button variant="outline" className="w-full rounded-xl bg-transparent" onClick={() => setShowDialog(false)}>Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
