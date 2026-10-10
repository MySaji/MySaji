"use client"

import { useEffect, useState } from "react"
import { Loader2, ShieldCheck, Clock, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/frontend/components/ui/select"
import { KycPhotoUpload } from "@/frontend/components/kyc/kyc-photo-upload"
import { SelfieCapture } from "@/frontend/components/kyc/selfie-capture"
import { submitIdentityVerification, getMyRejectionReason } from "@/backend/actions/kyc"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { useVerificationGate } from "@/frontend/lib/hooks/useVerificationGate"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

/**
 * The one verification wizard, shown wherever progressive KYC blocks an
 * action — customer, provider, shopkeeper or distributor alike.
 *
 * Before this, verification existed only as a full page inside the provider
 * portal (app/provider/profile/verification/page.tsx). That page stays, since
 * a provider may want to reach it directly; this dialog is what the gated
 * actions themselves open, so a customer hitting checkout is not thrown out
 * of their flow and into someone else's portal to fix it.
 *
 * Which screen shows is decided by the account's live status, re-read on open
 * rather than taken from the session — a verdict reached since the JWT was
 * minted has to be reflected the moment the user opens this.
 */

type Step = "intro" | "documents" | "selfie" | "submitted"

const ID_TYPES = ["National ID", "Driver's License", "Passport"] as const

export function VerificationGateDialog({
  open,
  onOpenChange,
  onVerificationSubmitted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerificationSubmitted?: () => void
}) {
  const { t } = useLocalization()
  const { refreshSession } = useAuthContext()

  const { status, isUnderReview } = useVerificationGate()
  const { user } = useAuthContext()
  const wasRejected = status === "basic" && user?.kycStatus === "rejected"

  const [step, setStep] = useState<Step>("intro")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [form, setForm] = useState({
    idType: "National ID" as (typeof ID_TYPES)[number],
    idNumber: "",
    idFile: "",
    idFileBack: "",
    selfieFile: "",
  })

  // Status comes from the session rather than a fetch on open, so the dialog
  // has something to show immediately. Progressive KYC deliberately asks at
  // the moment someone is mid-task; making them watch a spinner first — over
  // this environment's slow pooler — is exactly the friction this phase set
  // out to remove. The server gate stays authoritative either way: this only
  // decides which words to show, never what the account may actually do.
  useEffect(() => {
    if (!open) return
    // A rejected account lands straight on the form — it has already read the
    // explanation once, and clicking through the intro again to re-shoot a
    // photo is friction with no purpose.
    setStep(wasRejected ? "documents" : "intro")
    setError("")
  }, [open, wasRejected])

  // The reason text is the one thing the session does not carry. Fetched
  // separately and allowed to arrive late: the form renders without it, and
  // the explanation slots in when it lands.
  useEffect(() => {
    if (!open || !wasRejected) return
    let cancelled = false
    getMyRejectionReason()
      .then((reason) => {
        if (!cancelled) setRejectionReason(reason)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, wasRejected])

  const handleSubmit = async () => {
    if (!form.idNumber.trim() || !form.idFile || !form.idFileBack || !form.selfieFile) {
      setError(t("verify.incomplete"))
      return
    }
    setIsSubmitting(true)
    setError("")
    try {
      const result = await submitIdentityVerification(form)
      if (!result.success) {
        setError(result.error)
        return
      }
      // The session carries verificationStatus, and it has just moved to
      // PENDING — without this refresh the banner behind the dialog would go
      // on saying "get verified" until the next full sign-in.
      await refreshSession()
      setStep("submitted")
      onVerificationSubmitted?.()
    } catch {
      setError(t("common.error"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The dialog primitive already handles small screens: full width minus
          a 2rem gutter, capped at 85vh with its own scroll, widening to
          sm:max-w-lg only from 640px up. */}
      <DialogContent className="sm:max-w-lg">
        {isUnderReview ? (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                <Clock className="h-6 w-6" />
              </div>
              <DialogTitle className="text-center">{t("verify.pending.title")}</DialogTitle>
              <DialogDescription className="text-center">{t("verify.pending.body")}</DialogDescription>
            </DialogHeader>
            <Button onClick={() => onOpenChange(false)} className="w-full rounded-xl">
              {t("verify.done.close")}
            </Button>
          </>
        ) : step === "submitted" ? (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <DialogTitle className="text-center">{t("verify.done.title")}</DialogTitle>
              <DialogDescription className="text-center">{t("verify.done.body")}</DialogDescription>
            </DialogHeader>
            <Button onClick={() => onOpenChange(false)} className="w-full rounded-xl">
              {t("verify.done.close")}
            </Button>
          </>
        ) : step === "intro" ? (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <DialogTitle className="text-center">{t("verify.required.title")}</DialogTitle>
              <DialogDescription className="text-center">{t("verify.required.body")}</DialogDescription>
            </DialogHeader>
            {/* Stacks on a phone, sits side by side from 640px — the primary
                action first in the DOM so it is also first for a screen
                reader, and reversed visually only where there is room. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
                {t("verify.required.later")}
              </Button>
              <Button onClick={() => setStep("documents")} className="rounded-xl">
                {t("verify.required.start")}
              </Button>
            </div>
          </>
        ) : step === "documents" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("verify.step.documents")}</DialogTitle>
              {wasRejected && (
                <DialogDescription className="text-left">{t("verify.rejected.body")}</DialogDescription>
              )}
            </DialogHeader>

            {wasRejected && rejectionReason && (
              <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs dark:border-red-900/40 dark:bg-red-950/30">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400" />
                <div className="min-w-0">
                  <p className="font-semibold text-red-700 dark:text-red-300">{t("verify.rejected.reasonLabel")}</p>
                  {/* break-words so a long unbroken reason cannot push the
                      dialog wider than a 320px screen. */}
                  <p className="break-words text-red-600 dark:text-red-400">{rejectionReason}</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">{t("verify.docType")}</p>
                <Select
                  value={form.idType}
                  onValueChange={(v) => setForm((p) => ({ ...p, idType: v as (typeof ID_TYPES)[number] }))}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">{t("verify.docNumber")}</p>
                <Input
                  value={form.idNumber}
                  onChange={(e) => setForm((p) => ({ ...p, idNumber: e.target.value }))}
                  placeholder={t("verify.docNumberPlaceholder")}
                  className="rounded-xl"
                />
              </div>

              {/* One column on a phone so each upload zone keeps a usable tap
                  target; two only once there is width for it. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <KycPhotoUpload
                  label={t("verify.docFront")}
                  value={form.idFile}
                  onChange={(v) => setForm((p) => ({ ...p, idFile: v }))}
                />
                <KycPhotoUpload
                  label={t("verify.docBack")}
                  value={form.idFileBack}
                  onChange={(v) => setForm((p) => ({ ...p, idFileBack: v }))}
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setStep("intro")} className="rounded-xl">
                {t("verify.back")}
              </Button>
              <Button
                onClick={() => {
                  if (!form.idNumber.trim() || !form.idFile || !form.idFileBack) {
                    setError(t("verify.incomplete"))
                    return
                  }
                  setError("")
                  setStep("selfie")
                }}
                className="rounded-xl"
              >
                {t("verify.next")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("verify.step.selfie")}</DialogTitle>
              <DialogDescription className="text-left">{t("verify.selfieHint")}</DialogDescription>
            </DialogHeader>

            <SelfieCapture value={form.selfieFile} onChange={(v) => setForm((p) => ({ ...p, selfieFile: v }))} />

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setStep("documents")}
                disabled={isSubmitting}
                className="rounded-xl"
              >
                {t("verify.back")}
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2 rounded-xl">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? t("verify.submitting") : t("verify.submit")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
