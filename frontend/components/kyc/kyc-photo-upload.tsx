"use client"

import { useState } from "react"
import { FileText, Upload, X, Loader2 } from "lucide-react"
import { compressUploadToDataUrl } from "@/frontend/lib/compress-image"

/** A single labeled ID-photo upload zone (front or back), accepting an
 * image or a PDF, with a live preview and client-side compression before
 * the file ever reaches a server action — the same reasoning as
 * compress-image.ts: multiple full-res phone photos in one submission can
 * otherwise exceed the server action body-size limit. */
export function KycPhotoUpload({
  label, value, onChange,
}: { label: string; value: string; onChange: (dataUrl: string) => void }) {
  const [isProcessing, setIsProcessing] = useState(false)
  const isPdf = value.startsWith("data:application/pdf")

  const handleFile = async (file: File) => {
    setIsProcessing(true)
    try {
      const dataUrl = await compressUploadToDataUrl(file)
      onChange(dataUrl)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      {value ? (
        <div className="relative aspect-[3/2] rounded-lg overflow-hidden border border-border bg-muted/40">
          {isPdf ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <FileText className="w-8 h-8" />
              <span className="text-xs font-medium">PDF uploaded</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- base64 data URLs aren't supported by next/image
            <img src={value} alt={label} className="w-full h-full object-cover" />
          )}
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center aspect-[3/2] border-2 border-dashed border-muted-foreground/30 rounded-lg cursor-pointer hover:border-primary transition-colors bg-muted/20">
          {isProcessing ? (
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          ) : (
            <>
              <Upload className="w-6 h-6 text-muted-foreground mb-1" />
              <span className="text-xs text-muted-foreground">Tap to upload</span>
            </>
          )}
          <input
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            disabled={isProcessing}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
              e.target.value = ""
            }}
          />
        </label>
      )}
    </div>
  )
}
