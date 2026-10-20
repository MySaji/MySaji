"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Check, ImagePlus, Loader2, RotateCcw, Sparkles, Trash2, Upload, X } from "lucide-react"
import { editProductPhoto, getProductPhotoOptions } from "@/backend/actions/pos-product-photos"
import { prepareProductPhoto } from "@/frontend/lib/product-photo"

type Props = { value: string; editing: boolean; onChange: (image: string) => void; onBusyChange: (busy: boolean) => void }
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
const BUTTON = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"

export function ProductPhotoField({ value, editing, onChange, onBusyChange }: Props) {
  const [original, setOriginal] = useState(value)
  const [candidate, setCandidate] = useState("")
  const [available, setAvailable] = useState(false)
  const [work, setWork] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState("")
  const uploadRef = useRef<HTMLInputElement>(null)
  const captureRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraDialog = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const generation = useRef(0)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    getProductPhotoOptions(editing).then(result => { if (mounted.current) setAvailable(result.available) }).catch(() => {})
    return () => { mounted.current = false; streamRef.current?.getTracks().forEach(track => track.stop()); onBusyChange(false) }
  }, [editing, onBusyChange])

  const working = (mode: string | null) => { setWork(mode); onBusyChange(!!mode) }
  const acceptPhoto = async (file: File) => {
    const request = ++generation.current
    working("reading"); setError(""); setCandidate("")
    try {
      const image = await prepareProductPhoto(file)
      if (!mounted.current || request !== generation.current) return
      setOriginal(image)
      onChange(image)
    } catch (reason) {
      if (mounted.current && request === generation.current) setError(reason instanceof Error ? reason.message : "Could not prepare this photo.")
    } finally { if (mounted.current && request === generation.current) working(null) }
  }

  const closeCamera = useCallback(() => {
    generation.current++
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    setCameraOpen(false)
    setCameraReady(false)
  }, [])
  useEffect(() => {
    if (!cameraOpen) return
    const previous = document.activeElement as HTMLElement | null
    cameraDialog.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeCamera() }
      if (event.key !== "Tab") return
      const controls = cameraDialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")
      const first = controls?.[0], last = controls?.[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === cameraDialog.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener("keydown", handleKey, true)
    return () => { document.removeEventListener("keydown", handleKey, true); previous?.focus() }
  }, [cameraOpen, closeCamera])
  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { captureRef.current?.click(); return }
    const request = ++generation.current
    setCameraOpen(true); setCameraError(""); setCameraReady(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false })
      if (!mounted.current || request !== generation.current) { stream.getTracks().forEach(track => track.stop()); return }
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      if (mounted.current && request === generation.current) setCameraReady(true)
    } catch {
      if (mounted.current && request === generation.current) setCameraError("Camera access is unavailable. Allow camera access in your browser, or select a photo from your device.")
    }
  }
  const takePhoto = () => {
    const video = videoRef.current
    if (!video?.videoWidth || !video.videoHeight) return
    const canvas = document.createElement("canvas")
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const context = canvas.getContext("2d")
    if (!context) { setCameraError("Could not capture this frame. Select a photo instead."); return }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      if (!mounted.current) return
      if (!blob) { setCameraError("Could not capture this frame. Please try again."); return }
      closeCamera()
      void acceptPhoto(new File([blob], "product-camera.jpg", { type: "image/jpeg" }))
    }, "image/jpeg", 0.9)
  }

  const enhance = async (mode: "background" | "studio") => {
    if (!value.startsWith("data:image/")) return
    const request = ++generation.current
    working(mode); setError(""); setCandidate("")
    try {
      const result = await editProductPhoto({ image: value, mode, editing })
      if (!mounted.current || request !== generation.current) return
      if (!result.success) { setError(result.error); return }
      const response = await fetch(result.image)
      const blob = await response.blob()
      const image = await prepareProductPhoto(new File([blob], "product-studio", { type: blob.type }))
      if (mounted.current && request === generation.current) setCandidate(image)
    } catch {
      if (mounted.current && request === generation.current) setError("Could not prepare the edited photo. Your original has been kept.")
    } finally { if (mounted.current && request === generation.current) working(null) }
  }

  return <section aria-label="Product photo" className="rounded-2xl border border-border bg-muted/20 p-4">
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Product photo</h3><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Take a photo or choose one from your device. Photos are resized automatically.</p></div><ImagePlus className="h-5 w-5 shrink-0 text-blue-500" /></div>
    <input ref={uploadRef} type="file" accept={ACCEPT} aria-label="Select product photo" className="hidden" disabled={!!work} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void acceptPhoto(file) }} />
    <input ref={captureRef} type="file" accept="image/*" capture="environment" aria-label="Capture product photo" className="hidden" disabled={!!work} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void acceptPhoto(file) }} />
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-white">
      {value ? <img src={value} alt="Current product photo" className="h-52 w-full object-contain p-3" /> : <div className="flex h-36 flex-col items-center justify-center gap-2 text-slate-400"><Camera className="h-8 w-8" /><span className="text-xs">Add a clear photo of your product</span></div>}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={!!work} onClick={() => void openCamera()} className={BUTTON}><Camera className="h-4 w-4" />Take photo</button><button type="button" disabled={!!work} onClick={() => uploadRef.current?.click()} className={BUTTON}><Upload className="h-4 w-4" />Choose from device</button></div>
    {value && <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={!!work} onClick={() => { onChange(""); setOriginal(""); setCandidate(""); setError("") }} className="inline-flex items-center gap-1 rounded-lg p-2 text-[11px] text-rose-600 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Remove photo</button>{original && original !== value && <button type="button" disabled={!!work} onClick={() => { onChange(original); setCandidate(""); setError("") }} className="inline-flex items-center gap-1 rounded-lg p-2 text-[11px] text-muted-foreground disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />Restore original</button>}</div>}
    {value && <div className="mt-3 border-t border-border pt-3"><p className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="h-3.5 w-3.5 text-blue-500" />Clean catalogue photo</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Optional AI editing sends this photo to our image provider. Preview the result before replacing your photo.</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={!!work || !available || !value.startsWith("data:image/")} onClick={() => void enhance("background")} className={BUTTON}>White background</button><button type="button" disabled={!!work || !available || !value.startsWith("data:image/")} onClick={() => void enhance("studio")} className={BUTTON}>Studio finish</button></div>{!available && <p className="mt-2 text-[10px] text-muted-foreground">AI photo editing is not available with the current setup. You can save your photo as it is.</p>}{available && !value.startsWith("data:image/") && <p className="mt-2 text-[10px] text-muted-foreground">Take or select a new photo to use background editing.</p>}</div>}
    {work && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-blue-600"><Loader2 className="h-4 w-4 animate-spin" />{work === "reading" ? "Preparing your photo…" : "Preparing your catalogue photo. This can take a moment…"}</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
    {candidate && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/30 p-3 dark:border-blue-900 dark:bg-blue-950/20"><p className="text-xs font-semibold">Review the edited photo</p><div className="mt-3 grid grid-cols-2 gap-2"><div><img src={value} alt="Photo before editing" className="h-36 w-full rounded-lg bg-white object-contain p-2" /><p className="mt-1 text-center text-[10px] text-muted-foreground">Current photo</p></div><div><img src={candidate} alt="Edited product photo preview" className="h-36 w-full rounded-lg bg-white object-contain p-2" /><p className="mt-1 text-center text-[10px] text-muted-foreground">Edited preview</p></div></div><p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">Check that labels, colours and product details still match the actual item.</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => { onChange(candidate); setCandidate("") }} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white"><Check className="h-3.5 w-3.5" />Use edited photo</button><button type="button" onClick={() => setCandidate("")} className={BUTTON}>Keep current photo</button></div></div>}
    {cameraOpen && <div ref={cameraDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Take product photo" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"><div className="w-full max-w-xl overflow-hidden rounded-2xl bg-background shadow-xl"><div className="flex items-center justify-between border-b border-border p-4"><h3 className="text-sm font-semibold">Photograph your product</h3><button type="button" onClick={closeCamera} aria-label="Close camera" className="rounded-lg p-2"><X className="h-5 w-5" /></button></div><video ref={videoRef} autoPlay muted playsInline aria-label="Product camera preview" className="aspect-[4/3] w-full bg-black object-contain" /><div className="p-4">{cameraError ? <p role="alert" className="mb-3 text-xs text-rose-600">{cameraError}</p> : <p className="mb-3 text-xs text-muted-foreground">Place the product in good light and keep the whole item in the frame.</p>}<div className="flex gap-2"><button type="button" disabled={!cameraReady} onClick={takePhoto} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><Camera className="h-4 w-4" />Capture photo</button><button type="button" onClick={() => { closeCamera(); uploadRef.current?.click() }} className={BUTTON}>Choose file</button></div></div></div></div>}
  </section>
}
