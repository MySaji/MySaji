"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, Upload, X, RotateCcw, Loader2, AlertCircle } from "lucide-react"
import { compressImageToDataUrl } from "@/frontend/lib/compress-image"

type Mode = "choice" | "camera" | "preview"

/** Selfie step for KYC submission: either upload a photo, or take one live
 * via the device camera with a head-position guide overlay (a face-shaped
 * cutout over a dimmed background, the standard "position your face here"
 * pattern from ID-verification flows) so the photo actually frames a face
 * usably instead of an arbitrary phone snapshot. */
export function SelfieCapture({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const [mode, setMode] = useState<Mode>(value ? "preview" : "choice")
  const [cameraError, setCameraError] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => stopStream(), [])

  const startCamera = async () => {
    setCameraError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      setMode("camera")
    } catch {
      setCameraError("Couldn't access your camera. You can upload a selfie instead.")
    }
  }

  useEffect(() => {
    if (mode === "camera" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [mode])

  const capture = () => {
    const video = videoRef.current
    if (!video) return
    const size = Math.min(video.videoWidth, video.videoHeight)
    const canvas = document.createElement("canvas")
    canvas.width = 720
    canvas.height = 720
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const sx = (video.videoWidth - size) / 2
    const sy = (video.videoHeight - size) / 2
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 720, 720)
    stopStream()
    onChange(canvas.toDataURL("image/jpeg", 0.85))
    setMode("preview")
  }

  const handleUpload = async (file: File) => {
    setIsProcessing(true)
    setCameraError("")
    try {
      const dataUrl = await compressImageToDataUrl(file, 1024, 0.85)
      onChange(dataUrl)
      setMode("preview")
    } catch {
      setCameraError("Couldn't read that file. Please choose an image.")
    } finally {
      setIsProcessing(false)
    }
  }

  const retake = () => {
    onChange("")
    setCameraError("")
    setMode("choice")
  }

  if (mode === "preview" && value) {
    return (
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Selfie</p>
        <div className="relative aspect-square w-full max-w-[240px] mx-auto rounded-2xl overflow-hidden border border-border bg-muted/40">
          {/* Images use the configured unoptimized rendering policy -- base64 data URLs aren't supported by next/image */}
          <img src={value} alt="Selfie" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={retake}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <button type="button" onClick={retake} className="mt-2 mx-auto flex items-center gap-1.5 text-xs text-primary hover:underline">
          <RotateCcw className="w-3.5 h-3.5" /> Retake selfie
        </button>
      </div>
    )
  }

  if (mode === "camera") {
    return (
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Selfie</p>
        <div className="relative aspect-square w-full max-w-[320px] mx-auto rounded-2xl overflow-hidden bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {/* Head-position guide: an oval cutout over a dimmed scrim */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[58%] aspect-[3/4] rounded-[50%] border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
          </div>
          <p className="absolute bottom-3 inset-x-0 text-center text-white text-xs px-4">
            Position your face within the oval
          </p>
        </div>
        <div className="flex gap-2 mt-3 justify-center">
          <button
            type="button"
            onClick={() => { stopStream(); setMode("choice") }}
            className="px-4 py-2 rounded-full text-xs font-medium border border-border text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={capture}
            className="px-5 py-2 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" /> Capture
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">Selfie</p>
      <div className="border-2 border-dashed border-muted-foreground/30 rounded-2xl bg-muted/20 p-5 flex flex-col items-center gap-3">
        {cameraError && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {cameraError}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={startCamera}
            className="px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5"
          >
            <Camera className="w-4 h-4" /> Use Camera
          </button>
          <label className="px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted cursor-pointer flex items-center gap-1.5">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload Selfie
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={isProcessing}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
                e.target.value = ""
              }}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
