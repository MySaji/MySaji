"use client"

import { useEffect, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  Edit, Star, Award, TrendingUp, MapPin, Phone, Mail, Award as AwardIcon,
  FileText, CheckCircle2, Loader2
} from "lucide-react"
import Image from "next/image"
import { getMyShopAccount, updateMyShopAccount, type ShopkeeperAccountData } from "@/backend/actions/shopkeeper-account"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function ShopkeeperProfilePage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [profile, setProfile] = useState<ShopkeeperAccountData>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ shopName: "", phone: "", location: "", shopDescription: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const refresh = async () => {
    const data = await getMyShopAccount()
    setProfile(data)
    if (data) {
      setEditForm({ shopName: data.shopName, phone: data.phone ?? "", location: data.location, shopDescription: data.shopDescription })
    }
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setFormError("")
    const result = await updateMyShopAccount({
      shopName: editForm.shopName,
      phone: editForm.phone,
      location: editForm.location,
      shopDescription: editForm.shopDescription,
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setIsEditing(false)
    await refresh()
  }

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const stats = [
    { label: t("shopkeeper.profile.statRating"), value: profile.rating > 0 ? profile.rating.toFixed(1) : "—", icon: Star, color: "from-yellow-500 to-yellow-600" },
    { label: t("shopkeeper.profile.statReviews"), value: profile.reviewCount, icon: FileText, color: "from-blue-500 to-blue-600" },
    { label: t("shopkeeper.profile.statTotalSales"), value: formatMoney(profile.totalSales), icon: TrendingUp, color: "from-emerald-500 to-emerald-600" },
    { label: t("shopkeeper.profile.statProducts"), value: profile.activeProducts, icon: AwardIcon, color: "from-purple-500 to-purple-600" },
  ]

  const accountAgeDays = Math.floor((Date.now() - new Date(profile.joinDate).getTime()) / 86400000)
  const badges = [
    profile.rating >= 4.5 && { label: t("shopkeeper.profile.badgeTopRated"), sub: t("shopkeeper.profile.badgeTopRatedSub"), icon: Star, color: "yellow" },
    profile.isVerified && { label: t("shopkeeper.profile.badgeVerified"), sub: t("shopkeeper.profile.badgeVerifiedSub"), icon: Award, color: "emerald" },
    profile.reviewCount >= 50 && { label: t("shopkeeper.profile.badgeTrusted"), sub: t("shopkeeper.profile.badgeTrustedSub", { count: profile.reviewCount }), icon: AwardIcon, color: "purple" },
    accountAgeDays >= 180 && { label: t("shopkeeper.profile.badgeEstablished"), sub: t("shopkeeper.profile.badgeEstablishedSub"), icon: TrendingUp, color: "blue" },
  ].filter((b): b is { label: string; sub: string; icon: typeof Star; color: string } => Boolean(b))

  const badgeColors: Record<string, string> = {
    yellow: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600",
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600",
    purple: "bg-purple-50 dark:bg-purple-900/20 text-purple-600",
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-600",
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t("shopkeeper.profile.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t("shopkeeper.profile.subtitle")}</p>
        </div>

        <Card className="p-8 border-0 shadow-lg mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-8">
            <div className="relative">
              <Image
                src={profile.shopLogoUrl || "/placeholder.svg"}
                alt={profile.shopName}
                width={120}
                height={120}
                className="w-32 h-32 rounded-2xl object-cover border-4 border-amber-600"
              />
              {profile.isVerified && (
                <div className="absolute -bottom-2 -right-2 bg-emerald-500 rounded-full p-2 border-4 border-white dark:border-gray-900">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.shopName}</h2>
                {profile.isVerified && (
                  <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[11px] px-3 py-1 rounded-full font-semibold">
                    {t("shopkeeper.profile.verifiedSeller")}
                  </span>
                )}
              </div>
              {profile.reviewCount > 0 && (
                <div className="flex items-center gap-2 mb-3 text-base">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-5 h-5 ${i < Math.round(profile.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                    ))}
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-white">{profile.rating.toFixed(1)}/5</span>
                  <span className="text-gray-600 dark:text-gray-400">{t("shopkeeper.profile.reviewsCount", { count: profile.reviewCount })}</span>
                </div>
              )}
              {profile.shopDescription && <p className="text-gray-600 dark:text-gray-400 mb-4">{profile.shopDescription}</p>}
              <Button
                onClick={() => setIsEditing(!isEditing)}
                className="bg-amber-600 hover:bg-amber-700 gap-2"
              >
                <Edit className="w-4 h-4" />
                {isEditing ? t("shopkeeper.profile.cancelButton") : t("shopkeeper.profile.editProfile")}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8 border-t border-gray-200 dark:border-gray-700">
            {stats.map((stat, idx) => {
              const Icon = stat.icon
              return (
                <div key={idx} className={`p-4 rounded-lg bg-gradient-to-br ${stat.color} text-white`}>
                  <Icon className="w-6 h-6 mb-2 opacity-80" />
                  <p className="text-xs opacity-90">{stat.label}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </div>
              )
            })}
          </div>
        </Card>

        {isEditing && (
          <Card className="p-8 border-0 shadow-lg mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("shopkeeper.profile.editProfileInfoTitle")}</h3>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-medium text-gray-900 dark:text-white mb-2">{t("shopkeeper.profile.shopNameLabel")}</label>
                  <Input
                    value={editForm.shopName}
                    onChange={(e) => setEditForm({ ...editForm, shopName: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-900 dark:text-white mb-2">{t("shopkeeper.profile.phoneLabel")}</label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    type="tel"
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-900 dark:text-white mb-2">{t("shopkeeper.profile.locationLabel")}</label>
                <Input
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-900 dark:text-white mb-2">{t("shopkeeper.profile.bioLabel")}</label>
                <textarea
                  value={editForm.shopDescription}
                  onChange={(e) => setEditForm({ ...editForm, shopDescription: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                />
              </div>

              {formError && <p className="text-xs text-red-600">{formError}</p>}

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 bg-transparent"
                  disabled={isSaving}
                >
                  {t("shopkeeper.profile.cancelButton")}
                </Button>
                <Button
                  onClick={handleSave}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("shopkeeper.profile.saveChanges")}
                </Button>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card className="p-6 border-0 shadow-lg">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t("shopkeeper.profile.contactInfoTitle")}</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-amber-600 mt-1" />
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t("shopkeeper.profile.emailLabel")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{profile.email}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-amber-600 mt-1" />
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t("shopkeeper.profile.phoneLabel")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{profile.phone || t("shopkeeper.profile.notSet")}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-amber-600 mt-1" />
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t("shopkeeper.profile.locationLabel")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{profile.location || t("shopkeeper.profile.notSet")}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-0 shadow-lg">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t("shopkeeper.profile.accountStatusTitle")}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">{t("shopkeeper.profile.accountStatusLabel")}</span>
                <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold rounded-full">
                  {t("shopkeeper.profile.activeStatus")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">{t("shopkeeper.profile.verificationStatusLabel")}</span>
                {profile.isVerified ? (
                  <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    {t("shopkeeper.profile.verifiedStatus")}
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold rounded-full">
                    {t("shopkeeper.profile.pendingStatus")}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">{t("shopkeeper.profile.memberSinceLabel")}</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {new Date(profile.joinDate).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-6 border-0 shadow-lg">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t("shopkeeper.profile.badgesTitle")}</h3>
          {badges.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("shopkeeper.profile.noBadgesHint")}</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {badges.map((badge) => {
                const Icon = badge.icon
                return (
                  <div key={badge.label} className={`text-center p-4 rounded-lg ${badgeColors[badge.color]}`}>
                    <Icon className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">{badge.label}</p>
                    <p className="text-[11px] text-gray-600 dark:text-gray-400">{badge.sub}</p>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
