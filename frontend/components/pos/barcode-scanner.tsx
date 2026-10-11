"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, X, Loader2, AlertTriangle, Keyboard } from "lucide-react"
import { Button } from "@/frontend/components/ui/button"

/**
 * Reading a barcode with the camera.
 *
 * WHY THIS EXISTS WHEN THE TILL ALREADY HANDLES SCANS
 *
 * A USB or Bluetooth scanner types the digits and presses Enter, so the till
 * search box has always worked with one and needs no code. This is for the
 * other half of the job: putting goods INTO the system. A shopkeeper
 * receiving a delivery is standing at a box with a phone, not sitting at a
 * counter with a scanner, and typing thirteen digits off a tin forty times
 * is how barcodes end up wrong.
 *
 * TWO ENGINES, AND WHY
 *
 * BarcodeDetector is built into Chrome and Android WebView and reads the
 * one-dimensional formats that actually matter in a shop: EAN-13 on
 * groceries, UPC on imports, Code 128 on shelf labels. Where it exists, it
 * is used, because it is hardware accelerated and reads a curved tin from an
 * angle.
 *
 * Where it does not exist, which today mostly means iOS Safari, there is
 * jsQR. It reads QR codes only. That is a real limitation and the component
 * says so out loud rather than failing to read a tin and leaving the
 * shopkeeper to conclude the camera is broken.
 *
 * Typing it in by hand is always offered. A scanner that cannot be bypassed
 * is a scanner that blocks work when the light is bad.
 */

type Props = {
  onDetected: (value: string) => void
  onClose: () => void
  /** What is being scanned, for the heading. */
  label?: string
}

type DetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue?: string }[]>
}

const ONE_D_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"]

export function BarcodeScanner({ onDetected, onClose, label = "barcode" }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const stopRef = useRef(false)

  const [status, setStatus] = useState<"starting" | "scanning" | "denied" | "unavailable">("starting")
  const [engine, setEngine] = useState<"native" | "qr-only" | null>(null)
  const [manual, setManual] = useState("")

  const finish = useCallback((value: string) => {
    stopRef.current = true
    streamRef.current?.getTracks().forEach((t) => t.stop())
    onDetected(value)
  }, [onDetected])

  useEffect(() => {
    stopRef.current = false
    let detector: DetectorLike | null = null
    let jsQR: ((d: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null

    const run = async () => {
      // Pick the engine before asking for the camera, so a device that can
      // read nothing never turns a light on in someone's shop.
      const Native = (window as unknown as { BarcodeDetector?: new (o: unknown) => DetectorLike }).BarcodeDetector
      if (Native) {
        try {
          detector = new Native({ formats: ONE_D_FORMATS })
          setEngine("native")
        } catch {
          detector = null
        }
      }
      if (!detector) {
        try {
          const mod = await import("jsqr")
          jsQR = (mod.default ?? mod) as typeof jsQR
          setEngine("qr-only")
        } catch {
          setStatus("unavailable")
          return
        }
      }

      try {
        // The back camera, and a resolution high enough to resolve the thin
        // bars on a small label without pushing frames too large to process.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        streamRef.current = stream
        if (stopRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
        const v = videoRef.current
        if (!v) return
        v.srcObject = stream
        await v.play()
        setStatus("scanning")
      } catch {
        // Refused, or no camera at all. Both end at the same place: type it.
        setStatus("denied")
        return
      }

      const tick = async () => {
        if (stopRef.current) return
        const v = videoRef.current
        const c = canvasRef.current
        if (!v || !c || v.readyState !== v.HAVE_ENOUGH_DATA) {
          requestAnimationFrame(tick)
          return
        }
        c.width = v.videoWidth
        c.height = v.videoHeight
        const ctx = c.getContext("2d", { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(v, 0, 0, c.width, c.height)

        try {
          if (detector) {
            const found = await detector.detect(c)
            const value = found?.[0]?.rawValue?.trim()
            if (value) { finish(value); return }
          } else if (jsQR) {
            const img = ctx.getImageData(0, 0, c.width, c.height)
            const found = jsQR(img.data, img.width, img.height)
            const value = found?.data?.trim()
            if (value) { finish(value); return }
          }
        } catch {
          // A frame that will not decode is the normal case, not an error.
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }

    void run()
    return () => {
      stopRef.current = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [finish])

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end lg:items-center lg:justify-center">
      <div className="w-full lg:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl lg:rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
          <p className="min-w-0 flex-1 text-xs font-bold text-gray-900 dark:text-white truncate">
            Scan the {label}
          </p>
          <button
            onClick={() => { stopRef.current = true; streamRef.current?.getTracks().forEach((t) => t.stop()); onClose() }}
            aria-label="Close"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative bg-black aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />

          {status === "scanning" && (
            // A window to aim through. Wide and short, because that is the
            // shape of the thing being read.
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[78%] h-[30%] rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {status === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-white/80" />
            </div>
          )}
        </div>

        <div className="p-3 space-y-2.5">
          {status === "scanning" && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug text-center">
              {engine === "qr-only"
                ? "This phone can only read QR codes, not the striped barcodes on tins. Type that one in below."
                : "Hold the code inside the box. It reads on its own."}
            </p>
          )}
          {status === "denied" && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              The camera is not available. Allow it in your browser settings, or type the number in.
            </p>
          )}
          {status === "unavailable" && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              This browser cannot read codes with the camera. Type the number in instead.
            </p>
          )}

          {/* Always there. A scanner you cannot get past is worse than none. */}
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              <Keyboard className="w-3.5 h-3.5" /> Or type it
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value.replace(/[^\w-]/g, "").slice(0, 40))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="5901234123457"
                className="h-11 flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 text-sm tabular-nums text-gray-900 dark:text-white"
              />
              <Button
                onClick={() => manual.trim() && finish(manual.trim())}
                disabled={manual.trim().length < 4}
                className="h-11 rounded-xl text-xs whitespace-nowrap"
              >
                Use it
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A small button that opens the scanner, for putting beside a barcode field. */
export function ScanButton({ onScanned, label }: { onScanned: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={"Scan the " + (label ?? "barcode")}
        className="h-11 w-11 flex-shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 active:scale-95"
      >
        <Camera className="w-4 h-4" />
      </button>
      {open && (
        <BarcodeScanner
          label={label}
          onClose={() => setOpen(false)}
          onDetected={(v) => { setOpen(false); onScanned(v) }}
        />
      )}
    </>
  )
}
