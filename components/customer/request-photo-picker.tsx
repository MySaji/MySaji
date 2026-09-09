"use client"

import Image from "next/image"
import { useRef, useState } from "react"
import { Camera, ImagePlus, Loader2, X } from "lucide-react"
import { compressImageToDataUrl } from "@/lib/compress-image"
import { useLocalization } from "@/lib/hooks/useLocalization"

/**
 * Attach photos to a request.
 *
 * Two inputs rather than one: `capture="environment"` opens the camera
 * directly on a phone, which is what the home screen's camera button promises,
 * but it gives no way to pick a picture already taken — so the gallery input
 * sits beside it. On desktop both fall back to the same file dialog.
 *
 * Everything is compressed before it leaves the browser: these end up as
 * base64 in Postgres, so an untouched phone photo would be several megabytes
 * on a row that the request board has to live with.
 */
export function RequestPhotoPicker({
  photos,
  onChange,
  max,
}: {
  photos: string[]
  onChange: (next: string[]) => void
  max: number
}) {
  const { t } = useLocalization()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState("")

  const remaining = max - photos.length

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setError("")
    setIsBusy(true)
    try {
      const accepted = [...files].slice(0, remaining)
      const encoded = await Promise.all(accepted.map((f) => compressImageToDataUrl(f)))
      onChange([...photos, ...encoded])
    } catch {
      setError(t("customer.requests.photoReadError"))
    } finally {
      setIsBusy(false)
      // Clearing the value is what lets the same file be picked twice in a row.
      if (cameraRef.current) cameraRef.current.value = ""
      if (galleryRef.current) galleryRef.current.value = ""
    }
  }

  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block">
        {t("customer.requests.photosLabel")}{" "}
        <span className="font-normal text-muted-foreground">{t("customer.requests.photosOptional")}</span>
      </label>

      {photos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {photos.map((src, i) => (
            <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border">
              <Image src={src} alt="" fill sizes="64px" className="object-cover" unoptimized />
              <button
                type="button"
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
                aria-label={t("customer.requests.removePhoto")}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            {t("customer.requests.takePhoto")}
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {t("customer.requests.choosePhoto")}
          </button>
        </div>
      )}

      <p className="mt-1.5 text-[11px] text-muted-foreground">{t("customer.requests.photosHint")}</p>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files)} />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
    </div>
  )
}
