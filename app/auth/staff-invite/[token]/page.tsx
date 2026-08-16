"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, ShieldAlert } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { useAuthContext } from "@/lib/auth-context"
import { getStaffInviteByToken, acceptStaffInvite } from "@/lib/actions/provider-business"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function StaffInviteAcceptPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const { login } = useAuthContext()
  const { t } = useLocalization()

  const [isChecking, setIsChecking] = useState(true)
  const [invalidReason, setInvalidReason] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState("")

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getStaffInviteByToken(params.token).then((result) => {
      setIsChecking(false)
      if (!result.valid) {
        setInvalidReason(result.error)
        return
      }
      setBusinessName(result.businessName)
      if (result.email) setEmail(result.email)
      if (result.phone) setPhone(result.phone)
    })
  }, [params.token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError("")
    const result = await acceptStaffInvite({ token: params.token, name, email, phone, password })
    if (!result.success) {
      setIsSubmitting(false)
      setError(result.error)
      return
    }
    const loginResult = await login(email, password)
    setIsSubmitting(false)
    if (!loginResult.success) {
      router.push("/auth/login")
      return
    }
    router.push("/provider/profile/skills")
  }

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p>{t("authPage.staffInvite.loading")}</p>
        </div>
      </div>
    )
  }

  if (invalidReason) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700 p-8 text-center">
          <ShieldAlert className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{t("authPage.staffInvite.invalidTitle")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{invalidReason}</p>
          <a href="/auth/login" className="text-blue-600 dark:text-blue-400 font-medium text-sm">{t("authPage.staffInvite.backToLogin")}</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700 p-8">
        <div className="flex justify-center mb-6">
          <BrandLogo />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-1">
          {t("authPage.staffInvite.title", { business: businessName })}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">{t("authPage.staffInvite.subtitle")}</p>

        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("authPage.staffInvite.nameLabel")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("authPage.staffInvite.emailLabel")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("authPage.staffInvite.phoneLabel")}</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("authPage.staffInvite.passwordLabel")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("authPage.staffInvite.createAccountButton")}
          </button>
        </form>
      </div>
    </div>
  )
}
