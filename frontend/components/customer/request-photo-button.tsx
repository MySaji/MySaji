"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Loader2 } from "lucide-react"
import { compressImageToDataUrl } from "@/frontend/lib/compress-image"
import { stashPendingRequestPhoto } from "@/frontend/lib/request-photos"

/**
 * The camera button on the customer home screen — in the search bar and on
 * the "Solve a problem" card, which has always told customers they can
 * "speak or take a photo and we'll match you with the right help".
 *
 * It is not an image search: nothing here can match a picture to a catalogue.
 * What it does is the promise's other half — the photo goes onto a request,
 * where real providers see it and quote. So this captures, compresses, and
 * hands off to the composer, which is where a request is actually posted.
 */
export function RequestPhotoButton({
  className,
  iconClassName = "h-4 w-4",
  label,
}: {
  className: string
  iconClassName?: string
  label: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isBusy, setIsBusy] = useState(false)

  const handle = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setIsBusy(true)
    try {
      const dataUrl = await compressImageToDataUrl(file)
      // If the browser refuses to hold it (private mode, quota), still open
      // the composer — the customer can attach the photo there rather than
      // tapping a button that does nothing.
      stashPendingRequestPhoto(dataUrl)
      router.push("/customer/requests?photo=1")
    } finally {
      setIsBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={isBusy} aria-label={label} className={className}>
        {isBusy ? <Loader2 className={`${iconClassName} animate-spin`} /> : <Camera className={iconClassName} />}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files)} />
    </>
  )
}
