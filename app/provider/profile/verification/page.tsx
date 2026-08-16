"use client"

import { ArrowLeft, Check, Clock, ShieldCheck, BadgeCheck, CreditCard } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { KycPhotoUpload } from "@/components/kyc/kyc-photo-upload"
import { SelfieCapture } from "@/components/kyc/selfie-capture"
import { submitProviderKycDocument, getLatestKycDocument } from "@/lib/actions/kyc"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function VerificationPage() {
  const router = useRouter()
  const { t } = useLocalization()
  const { user, refreshSession } = useAuthContext()
  const [status, setStatus] = useState<string>(user?.kycStatus || "pending")
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // kycStatus defaults to "pending" for every new provider at signup, before
  // they've submitted anything — so "pending" alone can't mean "submitted,
  // awaiting review". This tracks whether a real KycDocument exists, so a
  // brand-new provider still sees the form instead of a false "thank you
  // for submitting" message.
  const [hasSubmittedDocument, setHasSubmittedDocument] = useState(false)
  const [formState, setFormState] = useState({
    idType: "National ID",
    idNumber: "",
    idFile: "",
    idFileBack: "",
    selfieFile: "",
  })

  useEffect(() => {
    if (!user) return
    setStatus(user.kycStatus || "pending")
    let cancelled = false
    getLatestKycDocument().then((doc) => {
      if (!doc || cancelled) return
      setHasSubmittedDocument(true)
      setFormState((prev) => ({
        ...prev,
        idType: doc.idType || prev.idType,
        idNumber: doc.idNumber,
        idFile: doc.idFile,
        idFileBack: doc.idFileBack,
        selfieFile: doc.selfieFile,
      }))
    })
    return () => {
      cancelled = true
    }
  }, [user])

  const handleChange = (field: string, value: string) => setFormState((prev) => ({ ...prev, [field]: value }))

  const handleSubmitVerification = async () => {
    if (!user) {
      setMessage(t("provider.verification.mustBeSignedInError"))
      return
    }
    if (!formState.idNumber.trim() || !formState.idFile || !formState.idFileBack || !formState.selfieFile) {
      setMessage(t("provider.verification.incompleteFieldsError"))
      return
    }
    setIsSubmitting(true)
    setMessage(null)
    try {
      const result = await submitProviderKycDocument(formState)
      if (!result.success) {
        setMessage(result.error)
        return
      }
      await refreshSession()
      setStatus("pending")
      setHasSubmittedDocument(true)
      setMessage(t("provider.verification.submittedSuccessMessage"))
    } catch {
      setMessage(t("provider.verification.serverErrorMessage"))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-2xl dark:border-gray-800 dark:bg-slate-950">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t("provider.verification.signInTitle")}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("provider.verification.signInDesc")}</p>
          <Button onClick={() => router.push("/auth/login")} className="mt-6">{t("provider.verification.goToLogin")}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl rounded-b-[32px]">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" />
                <Link href="/provider/profile">{t("provider.verification.backToProfile")}</Link>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">{t("provider.verification.title")}</h1>
              <p className="mt-2 text-sm text-slate-300 max-w-2xl">
                {t("provider.verification.subtitle")}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur sm:max-w-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-300">{t("provider.verification.statusLabel")}</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-slate-300">{t("provider.verification.currentStatusLabel")}</p>
                  <p className="text-xl font-semibold text-white">{status === "approved" ? t("provider.verification.statusApproved") : status === "rejected" ? t("provider.verification.statusRejected") : t("provider.verification.statusPendingReview")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* -mt-4 (not -mt-12) — the header's own title+subtitle text runs
          right up against its bottom padding, so a larger pull-up here
          landed the card's top edge on top of that subtitle text instead
          of the header's empty padding/rounded-corner area it was meant to
          overlap. */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <Card className="p-6 shadow-lg border-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{t("provider.verification.kycEyebrow")}</p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{t("provider.verification.completeIdentityTitle")}</h2>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <BadgeCheck className="w-4 h-4 text-emerald-600" />
                {status === "approved" ? t("provider.verification.badgeVerified") : status === "rejected" ? t("provider.verification.badgeResubmit") : t("provider.verification.badgePending")}
              </div>
            </div>

            {status === "pending" && hasSubmittedDocument ? (
              // Once submitted (this session or a prior one), show a clean
              // confirmation instead of leaving the ID number/document
              // photos/selfie on screen — those stay in the review queue
              // for admin, not re-displayed back to the provider.
              <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
                  <Check className="w-7 h-7" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">{t("provider.verification.thankYouTitle")}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">{t("provider.verification.thankYouBody")}</p>
              </div>
            ) : (
              <>
                <div className="mt-6 space-y-4">
                  {[
                    { title: t("provider.verification.step1Title"), detail: t("provider.verification.step1Desc") },
                    { title: t("provider.verification.step2Title"), detail: t("provider.verification.step2Desc") },
                    { title: t("provider.verification.step3Title"), detail: t("provider.verification.step3Desc") },
                  ].map((item) => (
                    <div key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{item.detail}</p>
                    </div>
                  ))}
                </div>

                {message && <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}

                <div className="mt-6 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-900 dark:text-white mb-2 block">{t("provider.verification.documentTypeLabel")}</label>
                    <Select value={formState.idType} onValueChange={(v) => handleChange("idType", v)}>
                      <SelectTrigger className="w-full rounded-2xl border-slate-200 bg-white py-3 h-auto text-sm text-slate-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="National ID">{t("provider.verification.idTypeNational")}</SelectItem>
                        <SelectItem value="Driver's License">{t("provider.verification.idTypeDriversLicense")}</SelectItem>
                        <SelectItem value="Passport">{t("provider.verification.idTypePassport")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-900 dark:text-white mb-2 block">{t("provider.verification.documentNumberLabel")}</label>
                    <div className="relative">
                      <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        value={formState.idNumber}
                        onChange={(e) => handleChange("idNumber", e.target.value)}
                        placeholder={t("provider.verification.documentNumberPlaceholder")}
                        className="w-full rounded-2xl border-slate-200 bg-white pl-11 py-3 h-auto text-sm text-slate-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-900 dark:text-white mb-2 block">{t("provider.verification.idPhotosLabel")}</label>
                    <div className="grid grid-cols-2 gap-3">
                      <KycPhotoUpload label={t("provider.verification.frontSideLabel")} value={formState.idFile} onChange={(v) => handleChange("idFile", v)} />
                      <KycPhotoUpload label={t("provider.verification.backSideLabel")} value={formState.idFileBack} onChange={(v) => handleChange("idFileBack", v)} />
                    </div>
                  </div>
                  <SelfieCapture value={formState.selfieFile} onChange={(v) => handleChange("selfieFile", v)} />
                  <Button className="w-full rounded-2xl py-3" onClick={handleSubmitVerification} disabled={isSubmitting}>
                    {isSubmitting ? t("provider.verification.submitting") : t("provider.verification.submitVerification")}
                  </Button>
                </div>
              </>
            )}
          </Card>

          <Card className="p-6 shadow-lg border-0 bg-white/95 dark:bg-slate-900/95">
            <div className="flex items-center gap-3 rounded-3xl bg-slate-50 p-4 dark:bg-slate-800">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{t("provider.verification.whyMattersTitle")}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("provider.verification.whyMattersDesc")}</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                <p className="font-semibold text-slate-900 dark:text-white">{t("provider.verification.benefit1Title")}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("provider.verification.benefit1Desc")}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                <p className="font-semibold text-slate-900 dark:text-white">{t("provider.verification.benefit2Title")}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("provider.verification.benefit2Desc")}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                <p className="font-semibold text-slate-900 dark:text-white">{t("provider.verification.benefit3Title")}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("provider.verification.benefit3Desc")}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
