"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { QrCode, CheckCircle2, Loader2, RefreshCw } from "lucide-react"
import { generateJobQrHandshake, getJobHandshakeStatus } from "@/lib/actions/qr-handshake"

/** Customer-side of the Dynamic QR Identity Handshake — shows a real,
 * short-lived scannable QR (generated entirely client-side from the opaque
 * token the server minted; no job/customer/provider id is ever encoded in
 * it) plus the same code as plain text as a manual-entry fallback, since
 * this app doesn't have a camera-based scanner on the provider side yet. */
export function QrHandshakeCustomer({ jobId, canVerify }: { jobId: string; canVerify: boolean }) {
  const [isVerified, setIsVerified] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getJobHandshakeStatus(jobId).then((s) => setIsVerified(s.verified)).finally(() => setIsLoading(false))
  }, [jobId])

  useEffect(() => {
    if (!expiresAt) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000))
      setSecondsLeft(remaining)
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const generate = async () => {
    setIsGenerating(true)
    setError("")
    const result = await generateJobQrHandshake(jobId)
    setIsGenerating(false)
    if (!result.success) { setError(result.error); return }
    setToken(result.token)
    setExpiresAt(new Date(result.expiresAt))
    const dataUrl = await QRCode.toDataURL(result.token, { margin: 1, width: 220, color: { dark: "#111827", light: "#ffffff" } })
    setQrImage(dataUrl)
  }

  const open = async () => {
    setShowDialog(true)
    await generate()
  }

  if (isLoading || !canVerify) return null

  if (isVerified) {
    return (
      <Card className="p-4 mb-4 border-0 shadow-sm flex items-center gap-2 border-l-4 border-l-emerald-500">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <p className="text-sm font-medium text-foreground">Identity verified with your provider</p>
      </Card>
    )
  }

  return (
    <>
      <Card className="p-4 mb-4 border-0 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Verify your provider's identity when they arrive</p>
          </div>
          <Button size="sm" className="rounded-lg flex-shrink-0" onClick={open}>Show Code</Button>
        </div>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-xs rounded-xl text-center" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">Identity Handshake</h2>
            <p className="text-xs text-muted-foreground">Show this to your provider, or read them the code below.</p>

            {isGenerating || !qrImage ? (
              <div className="flex h-56 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : (
              <>
                <img src={qrImage} alt="Identity verification QR code" className="mx-auto rounded-lg" />
                <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm text-foreground">{token}</p>
                <p className="text-xs text-muted-foreground">
                  {secondsLeft > 0 ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : "Code expired"}
                </p>
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setShowDialog(false)}>Close</Button>
              <Button className="flex-1 rounded-xl gap-1.5" onClick={generate} disabled={isGenerating}><RefreshCw className="h-3.5 w-3.5" />New Code</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
