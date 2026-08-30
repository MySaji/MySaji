"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { QrCode, CheckCircle2, Loader2 } from "lucide-react"
import { verifyJobQrHandshake, getJobHandshakeStatus } from "@/lib/actions/qr-handshake"

/** Provider-side of the Dynamic QR Identity Handshake. No camera-based
 * scanner here — the provider enters the code shown on the customer's
 * screen (same real, short-lived, single-use token either way), validated
 * server-side against this exact job. */
export function QrHandshakeProvider({ jobId, canVerify }: { jobId: string; canVerify: boolean }) {
  const [isVerified, setIsVerified] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [code, setCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const refresh = () => getJobHandshakeStatus(jobId).then((s) => setIsVerified(s.verified))

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [jobId])

  const handleVerify = async () => {
    setIsSubmitting(true)
    setError("")
    const result = await verifyJobQrHandshake({ jobId, token: code.trim() })
    setIsSubmitting(false)
    if (!result.success) { setError(result.error); return }
    setShowDialog(false)
    setCode("")
    await refresh()
  }

  if (isLoading || !canVerify) return null

  if (isVerified) {
    return (
      <Card className="p-4 mb-4 border-0 shadow-sm flex items-center gap-2 border-l-4 border-l-emerald-500">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <p className="text-xs font-medium text-foreground">Customer identity verified</p>
      </Card>
    )
  }

  return (
    <>
      <Card className="p-4 mb-4 border-0 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            <p className="text-xs font-medium text-foreground">Verify you're at the right job before starting</p>
          </div>
          <Button size="sm" className="rounded-lg flex-shrink-0" onClick={() => setShowDialog(true)}>Verify Identity</Button>
        </div>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-xs rounded-xl" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-base font-bold text-foreground">Enter Customer's Code</h2>
            <p className="text-[11px] text-muted-foreground">Ask the customer to show you their code from the app.</p>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" className="text-center font-mono" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setShowDialog(false)} disabled={isSubmitting}>Cancel</Button>
              <Button className="flex-1 rounded-xl" onClick={handleVerify} disabled={isSubmitting || !code.trim()}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
