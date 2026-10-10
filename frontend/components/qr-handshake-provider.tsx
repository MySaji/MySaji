"use client"

import { useEffect, useRef, useState } from "react"
import jsQR from "jsqr"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent } from "@/frontend/components/ui/dialog"
import { QrCode, CheckCircle2, Loader2, Camera, Keyboard, AlertCircle } from "lucide-react"
import { verifyJobQrHandshake, getJobHandshakeStatus } from "@/backend/actions/qr-handshake"

type Mode = "scan" | "manual"

/** Provider-side of the Dynamic QR Identity Handshake. Two ways to get the
 * customer's code in: point the phone's rear camera at their screen and
 * decode the QR frame-by-frame with jsQR (pure-JS, works on iOS Safari too,
 * unlike the native BarcodeDetector API), or type the same token in by hand
 * — same server-side verifyJobQrHandshake() call either way, so a scan is
 * just a faster way to fill the same field. */
export function QrHandshakeProvider({ jobId, canVerify }: { jobId: string; canVerify: boolean }) {
  const [isVerified, setIsVerified] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [mode, setMode] = useState<Mode>("scan")
  const [code, setCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [cameraError, setCameraError] = useState("")

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const scannedRef = useRef(false)

  const refresh = () => getJobHandshakeStatus(jobId).then((s) => setIsVerified(s.verified))

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [jobId])

  const stopCamera = () => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const submitToken = async (token: string) => {
    setIsSubmitting(true)
    setError("")
    const result = await verifyJobQrHandshake({ jobId, token: token.trim() })
    setIsSubmitting(false)
    if (!result.success) {
      setError(result.error)
      // A misread or stale QR shouldn't strand the provider on a dead
      // camera feed — re-arm scanning so pointing at the (correct) code
      // again just works, no extra tap needed.
      if (mode === "scan") {
        scannedRef.current = false
        startCamera()
      }
      return
    }
    setShowDialog(false)
    setCode("")
    await refresh()
  }

  const handleVerify = () => submitToken(code)

  const scanLoop = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanLoop)
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) { rafRef.current = requestAnimationFrame(scanLoop); return }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" })
    if (result?.data && !scannedRef.current) {
      scannedRef.current = true
      stopCamera()
      setCode(result.data)
      submitToken(result.data)
      return
    }
    rafRef.current = requestAnimationFrame(scanLoop)
  }

  const startCamera = async () => {
    setCameraError("")
    scannedRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      rafRef.current = requestAnimationFrame(scanLoop)
    } catch {
      setCameraError("Couldn't access the camera. You can still enter the code manually.")
      setMode("manual")
    }
  }

  useEffect(() => {
    if (showDialog && mode === "scan") {
      startCamera()
    } else {
      stopCamera()
    }
    return stopCamera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDialog, mode])

  const openDialog = () => {
    setError("")
    setCameraError("")
    setCode("")
    setMode("scan")
    setShowDialog(true)
  }

  const closeDialog = () => {
    stopCamera()
    setShowDialog(false)
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
          <Button size="sm" className="rounded-lg flex-shrink-0" onClick={openDialog}>Verify Identity</Button>
        </div>
      </Card>

      <Dialog open={showDialog} onOpenChange={(open) => (open ? setShowDialog(true) : closeDialog())}>
        <DialogContent className="max-w-xs rounded-xl" showCloseButton={false}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">{mode === "scan" ? "Scan Customer's Code" : "Enter Customer's Code"}</h2>
              <button
                onClick={() => setMode(mode === "scan" ? "manual" : "scan")}
                className="flex items-center gap-1 text-[11px] font-medium text-primary"
              >
                {mode === "scan" ? <><Keyboard className="h-3.5 w-3.5" />Type instead</> : <><Camera className="h-3.5 w-3.5" />Scan instead</>}
              </button>
            </div>

            {mode === "scan" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">Point your camera at the QR code on the customer's screen.</p>
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
                  <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/70" />
                </div>
                {cameraError && (
                  <p className="flex items-start gap-1.5 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />{cameraError}</p>
                )}
                {isSubmitting && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Verifying…</p>
                )}
              </div>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">Ask the customer to show you their code from the app.</p>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" className="text-center font-mono" autoFocus />
              </>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={closeDialog} disabled={isSubmitting}>Cancel</Button>
              {mode === "manual" && (
                <Button className="flex-1 rounded-xl" onClick={handleVerify} disabled={isSubmitting || !code.trim()}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
