"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, CheckCircle2 } from "lucide-react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import {
  getSubAdminAccount, updateSubAdminProfile,
  type SubAdminAccountData,
} from "@/lib/actions/sub-admin-account"

export default function SubAdminProfilePage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  const [account, setAccount] = useState<SubAdminAccountData>(null)
  const [profileForm, setProfileForm] = useState({ name: "", phone: "" })
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  useEffect(() => {
    getSubAdminAccount().then((acc) => {
      setAccount(acc)
      if (acc) setProfileForm({ name: acc.name, phone: acc.phone ?? "" })
    }).finally(() => setIsLoading(false))
  }, [])

  const handleSaveProfile = async () => {
    setIsSavingProfile(true)
    const result = await updateSubAdminProfile(profileForm)
    setIsSavingProfile(false)
    if (!result.success) { alert(result.error); return }
    setAccount((prev) => prev ? { ...prev, name: profileForm.name, phone: profileForm.phone } : prev)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (isLoading || !account) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t("subAdmin.profile.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t("subAdmin.profile.subtitle")}</p>
        </div>

        <Card className="p-6 bg-white dark:bg-gray-800 border-0 rounded-xl shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {account.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{account.name}</h2>
              <p className="text-gray-600 dark:text-gray-400">{account.email}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{t("subAdmin.profile.roleLabel")}</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("subAdmin.profile.fullNameLabel")}</label>
                <Input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("auth.email")}</label>
                <Input
                  type="email"
                  value={account.email}
                  className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 px-3 bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white cursor-not-allowed"
                  disabled
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("subAdmin.profile.phoneLabel")}</label>
                <Input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveProfile} disabled={isSavingProfile} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold h-10 rounded-lg">
                {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : t("subAdmin.profile.saveChanges")}
              </Button>
              {saved && <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle2 size={16} />{t("subAdmin.profile.saved")}</span>}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("subAdmin.profile.settingsPointer")}{" "}
              <Link href="/sub-admin/settings" className="text-blue-600 hover:underline font-medium">{t("nav.settings")}</Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
