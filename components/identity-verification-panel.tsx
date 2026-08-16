"use client"

import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScanFace, CheckCircle2, Loader2, Camera } from "lucide-react"
import { getJobIdentityVerificationStatus, submitIdentityVerification } from "@/lib/actions/identity-verification"

/** Provider-side identity check for high-risk job categories. Uses a plain
 * file input with capture="user" (opens the phone's front camera on
 * mobile browsers) rather than a live camera preview — no face-match runs
 * server-side, see submitIdentityVerification's own doc comment. */
export function IdentityVerificationPanel({ jobId, canVerify }: { jobId: string; canVerify: boolean }) {
  const [status, setStatus] = useState<{ required: boolean; verified: boolean } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selfie, setSelfie] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = () => getJobIdentityVerificationStatus(jobId).then(setStatus)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [jobId])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setSelfie(String(reader.result))
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    if (!selfie) return
    setIsSubmitting(true)
    setError("")
    const result = await submitIdentityVerification({ jobId, selfieUrl: selfie })
    setIsSubmitting(false)
    if (!result.success) { setError(result.error); return }
    setSelfie(null)
    await refresh()
  }

  if (isLoading || !canVerify || !status?.required) return null

  if (status.verified) {
    return (
      <Card className="p-4 mb-4 border-0 shadow-sm flex items-center gap-2 border-l-4 border-l-emerald-500">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <p className="text-sm font-medium text-foreground">Identity verified for this job</p>
      </Card>
    )
  }

  return (
    <Card className="p-4 mb-4 border-0 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <ScanFace className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Identity check required before starting</p>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">This is a high-risk job category — take a quick selfie to verify it's really you before you start.</p>
      {selfie && <img src={selfie} alt="Selfie preview" className="mb-3 h-32 w-32 rounded-xl object-cover" />}
      <input ref={fileInputRef} type="file" accept="image/*" capture="user" onChange={handleFile} className="hidden" />
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="gap-1.5 rounded-lg bg-transparent" onClick={() => fileInputRef.current?.click()}>
          <Camera className="h-3.5 w-3.5" />{selfie ? "Retake" : "Take Selfie"}
        </Button>
        {selfie && (
          <Button size="sm" className="rounded-lg" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verify"}
          </Button>
        )}
      </div>
    </Card>
  )
}
