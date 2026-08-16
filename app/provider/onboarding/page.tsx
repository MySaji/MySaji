"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { HardHat, Building2, ArrowRight, Loader2, Upload } from "lucide-react"
import { completeBusinessOnboarding } from "@/lib/actions/provider-business"
import { submitBusinessPermitDocument } from "@/lib/actions/kyc"
import { inviteStaffMember } from "@/lib/actions/provider-business"
import { useLocalization } from "@/lib/hooks/useLocalization"

type OnboardingStep = "choice" | "business-details" | "business-permit" | "invite-staff"

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ProviderOnboardingPage() {
  const router = useRouter()
  const { t } = useLocalization()
  const [step, setStep] = useState<OnboardingStep>("choice")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const [registrationNumber, setRegistrationNumber] = useState("")
  const [hqAddress, setHqAddress] = useState("")

  const [permitNumber, setPermitNumber] = useState("")
  const [permitFile, setPermitFile] = useState("")

  const [inviteEmail, setInviteEmail] = useState("")
  const [invitePhone, setInvitePhone] = useState("")
  const [inviteMessage, setInviteMessage] = useState("")

  function chooseSolo() {
    router.push("/provider/profile/verification")
  }

  async function submitBusinessDetails() {
    if (!registrationNumber.trim() || !hqAddress.trim()) return
    setIsLoading(true)
    setError("")
    const result = await completeBusinessOnboarding({ registrationNumber, hqAddress })
    setIsLoading(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setStep("business-permit")
  }

  async function handlePermitFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPermitFile(await fileToDataUrl(file))
  }

  async function submitPermit() {
    if (!permitNumber.trim() || !permitFile) return
    setIsLoading(true)
    setError("")
    const result = await submitBusinessPermitDocument({ documentNumber: permitNumber, fileDataUrl: permitFile })
    setIsLoading(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setStep("invite-staff")
  }

  async function sendInvite() {
    if (!inviteEmail.trim() && !invitePhone.trim()) return
    setIsLoading(true)
    setError("")
    const result = await inviteStaffMember({ email: inviteEmail, phone: invitePhone })
    setIsLoading(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setInviteMessage(result.emailed ? t("provider.business.staff.inviteSentEmail") : result.inviteUrl)
    setInviteEmail("")
    setInvitePhone("")
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700 p-6 sm:p-8">
        {step === "choice" && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">{t("provider.onboarding.title")}</h1>
            <p className="text-gray-500 dark:text-gray-400 text-center mb-8">{t("provider.onboarding.subtitle")}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <button
                onClick={chooseSolo}
                className="flex flex-col items-center text-center gap-3 p-6 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-600 dark:hover:border-blue-500 transition-colors"
              >
                <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <HardHat className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="font-bold text-gray-900 dark:text-white">{t("provider.onboarding.soloTitle")}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{t("provider.onboarding.soloDesc")}</div>
              </button>
              <button
                onClick={() => setStep("business-details")}
                className="flex flex-col items-center text-center gap-3 p-6 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-600 dark:hover:border-blue-500 transition-colors"
              >
                <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Building2 className="w-7 h-7 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="font-bold text-gray-900 dark:text-white">{t("provider.onboarding.businessTitle")}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{t("provider.onboarding.businessDesc")}</div>
              </button>
            </div>
          </>
        )}

        {step === "business-details" && (
          <>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("provider.onboarding.businessDetailsTitle")}</h1>
            {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("provider.onboarding.registrationNumberLabel")}</label>
                <input
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  placeholder={t("provider.onboarding.registrationNumberPlaceholder")}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("provider.onboarding.hqAddressLabel")}</label>
                <input
                  value={hqAddress}
                  onChange={(e) => setHqAddress(e.target.value)}
                  placeholder={t("provider.onboarding.hqAddressPlaceholder")}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <button
                onClick={submitBusinessDetails}
                disabled={isLoading || !registrationNumber.trim() || !hqAddress.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {t("provider.onboarding.saveAndContinue")}
              </button>
            </div>
          </>
        )}

        {step === "business-permit" && (
          <>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("provider.onboarding.permitStepTitle")}</h1>
            {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("provider.onboarding.permitNumberLabel")}</label>
                <input
                  value={permitNumber}
                  onChange={(e) => setPermitNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("provider.onboarding.permitFileLabel")}</label>
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg py-6 cursor-pointer text-gray-500 dark:text-gray-400 hover:border-blue-500">
                  <Upload className="w-5 h-5" />
                  {permitFile ? "✓" : t("provider.onboarding.permitFileLabel")}
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={handlePermitFile} />
                </label>
              </div>
              <button
                onClick={submitPermit}
                disabled={isLoading || !permitNumber.trim() || !permitFile}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {t("provider.onboarding.submitPermit")}
              </button>
            </div>
          </>
        )}

        {step === "invite-staff" && (
          <>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{t("provider.onboarding.inviteStepTitle")}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("provider.onboarding.inviteStepSubtitle")}</p>
            {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>}
            {inviteMessage && <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-4 break-all">{inviteMessage}</p>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("provider.business.staff.emailLabel")}</label>
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("provider.business.staff.phoneLabel")}</label>
                <input
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <button
                onClick={sendInvite}
                disabled={isLoading || (!inviteEmail.trim() && !invitePhone.trim())}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {t("provider.business.staff.inviteButton")}
              </button>
              <div className="flex gap-3 pt-2">
                <button onClick={() => router.push("/provider/business/staff")} className="flex-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                  {t("provider.onboarding.skipForNow")}
                </button>
                <button
                  onClick={() => router.push("/provider/business/staff")}
                  className="flex-1 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 text-white py-2 rounded-lg text-sm font-medium"
                >
                  {t("provider.onboarding.finishSetup")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
