"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useAuthContext } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { Edit, MapPin, Star, Shield, Award, Upload, X, FileText, Wallet, Camera, ChevronRight, Loader2, Bell, Lock, Settings, Calendar } from "lucide-react"
import { getCustomerProfile, updateCustomerProfile, updateProfileAvatar, type CustomerProfileData } from "@/lib/actions/profile"
import { submitKycDocument } from "@/lib/actions/kyc"
import { getAddresses, createAddress, deleteAddress, setDefaultAddress, type AddressItem } from "@/lib/actions/addresses"
import { useLocalization } from "@/lib/hooks/useLocalization"

export function CustomerProfilePage() {
  const { t, formatMoney } = useLocalization()
  const { logout, refreshSession } = useAuthContext()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const profileImageInputRef = useRef<HTMLInputElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [isSubmittingKyc, setIsSubmittingKyc] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState("")

  const [profile, setProfile] = useState<CustomerProfileData>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [formData, setFormData] = useState({ name: "", phone: "", bio: "" })
  const [addresses, setAddresses] = useState<AddressItem[]>([])
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [newAddress, setNewAddress] = useState({ label: "", address: "" })

  const refresh = async () => {
    const [profileData, addressList] = await Promise.all([getCustomerProfile(), getAddresses()])
    setProfile(profileData)
    setAddresses(addressList)
    if (profileData) setFormData({ name: profileData.name, phone: profileData.phone ?? "", bio: profileData.bio })
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { const reader = new FileReader(); reader.onload = (event) => { setUploadedFile(event.target?.result as string) }; reader.readAsDataURL(file) }
  }
  const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string
      const result = await updateProfileAvatar({ imageDataUrl: dataUrl })
      if (result.success) {
        await refreshSession()
        await refresh()
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSaveProfile = async () => {
    setIsSavingProfile(true)
    setProfileError("")
    const result = await updateCustomerProfile(formData)
    setIsSavingProfile(false)
    if (!result.success) { setProfileError(result.error); return }
    await refreshSession()
    await refresh()
    setIsEditing(false)
  }

  const handleSubmitKyc = async () => {
    if (!uploadedFile) { return }
    setIsSubmittingKyc(true)
    try {
      const result = await submitKycDocument({ fileName: "id-document", fileDataUrl: uploadedFile })
      if (result.success) {
        setUploadedFile(null)
        await refresh()
      }
    } finally {
      setIsSubmittingKyc(false)
    }
  }

  const handleAddAddress = async () => {
    if (!newAddress.label || !newAddress.address) return
    await createAddress({ label: newAddress.label, address: newAddress.address, type: "OTHER" })
    setNewAddress({ label: "", address: "" })
    setShowAddressForm(false)
    setAddresses(await getAddresses())
  }
  const handleDeleteAddress = async (id: string) => {
    setAddresses((prev) => prev.filter((a) => a.id !== id))
    await deleteAddress({ id })
  }
  const handleSetDefaultAddress = async (id: string) => {
    setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })))
    await setDefaultAddress({ id })
  }

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const stats = [
    { label: t("customer.profile.statServices"), value: String(profile.completedServices), icon: FileText },
    { label: t("customer.profile.statReviews"), value: String(profile.reviewsWritten), icon: Star },
    { label: t("customer.profile.statSpent"), value: formatMoney(profile.totalSpent), icon: Wallet },
  ]

  const verificationStep: "none" | "waiting" | "verified" | "rejected" =
    profile.kycStatus === "APPROVED" ? "verified" :
    profile.kycStatus === "REJECTED" ? "rejected" :
    profile.hasSubmittedKyc ? "waiting" : "none"

  const memberSinceLabel = new Date(profile.memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })

  const quickLinks = [
    { label: t("customer.profile.notificationPreferences"), href: "/customer/settings", icon: Bell },
    { label: t("customer.profile.privacySecurity"), href: "/customer/settings", icon: Lock },
    { label: t("customer.profile.appSettings"), href: "/customer/settings", icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8 space-y-5">
        {/* Profile Hero */}
        <Card className="overflow-hidden border-0 shadow-md rounded-3xl">
          <div className="bg-gradient-to-br from-primary via-primary to-primary/80 px-6 pt-6 pb-16 relative">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-primary-foreground">{t("customer.profile.title")}</h1>
              <button
                onClick={() => { setIsEditing(!isEditing); if (isEditing) setFormData({ name: profile.name, phone: profile.phone ?? "", bio: profile.bio }) }}
                aria-label={isEditing ? t("common.cancel") : t("common.edit")}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-primary-foreground"
              >
                <Edit className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="px-6 pb-6 -mt-14">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="relative flex-shrink-0">
                <div className="relative w-24 h-24 rounded-2xl bg-background shadow-lg flex items-center justify-center text-3xl font-bold text-primary overflow-hidden ring-4 ring-background">
                  {profile.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element -- base64 data URLs aren't supported by next/image
                    <img src={profile.avatar} alt="Profile" className="w-full h-full object-cover" />
                  ) : profile.name?.[0]}
                </div>
                <button onClick={() => profileImageInputRef.current?.click()} className="absolute -bottom-1 -right-1 p-1.5 bg-primary text-primary-foreground rounded-lg shadow-md hover:bg-primary/90 transition-all" title={t("customer.profile.changePhoto")}>
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <input ref={profileImageInputRef} type="file" accept="image/*" onChange={handleProfileImageUpload} className="hidden" />
              </div>
              <div className="flex-1 pt-2 sm:pt-8 min-w-0">
                <h2 className="text-2xl font-bold text-foreground truncate">{profile.name}</h2>
                <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                  <Calendar className="w-3 h-3" /> {t("customer.profile.memberSince", { date: memberSinceLabel })}
                </p>
                <div className="flex gap-2 flex-wrap mt-2.5">
                  {verificationStep === "verified" && (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-lg text-xs font-semibold">
                      <Shield className="w-3 h-3" /> {t("customer.profile.idVerified")}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-3 py-1 rounded-lg text-xs font-semibold">
                    <Award className="w-3 h-3" /> {t("customer.profile.trustedMember")}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mt-6">
              {stats.map((stat) => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className="p-3.5 rounded-2xl border border-border/60 bg-muted/30 text-center">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-lg font-bold text-foreground">{stat.value}</p>
                    <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>

        {/* Edit Profile */}
        {isEditing && (
          <Card className="p-5 border-0 shadow-sm rounded-2xl">
            <h3 className="font-semibold text-foreground mb-4">{t("customer.profile.editProfile")}</h3>
            <div className="space-y-3">
              <div><label className="text-sm font-medium text-muted-foreground mb-1.5 block">{t("customer.profile.fullName")}</label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="rounded-xl" /></div>
              <div><label className="text-sm font-medium text-muted-foreground mb-1.5 block">{t("auth.email")}</label><Input type="email" value={profile.email} disabled className="rounded-xl opacity-60" /><p className="text-xs text-muted-foreground mt-1">{t("customer.profile.contactSupportEmail")}</p></div>
              <div><label className="text-sm font-medium text-muted-foreground mb-1.5 block">{t("customer.profile.phone")}</label><Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="rounded-xl" /></div>
              <div><label className="text-sm font-medium text-muted-foreground mb-1.5 block">{t("customer.profile.bio")}</label><textarea value={formData.bio} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} className="w-full p-3 border border-border rounded-xl bg-background text-foreground text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all" rows={2} /></div>
              {profileError && <p className="text-xs text-red-600">{profileError}</p>}
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 rounded-xl" onClick={handleSaveProfile} disabled={isSavingProfile}>{isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.profile.saveChanges")}</Button>
                <Button variant="outline" onClick={() => { setFormData({ name: profile.name, phone: profile.phone ?? "", bio: profile.bio }); setIsEditing(false) }} className="flex-1 rounded-xl bg-transparent">{t("common.cancel")}</Button>
              </div>
            </div>
          </Card>
        )}

        {/* ID Verification */}
        <Card className="p-5 border-0 shadow-sm rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Shield className="w-3.5 h-3.5 text-primary" /></span>
              {t("customer.profile.idVerification")}
            </h3>
            {verificationStep === "verified" && <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold rounded-lg">{t("customer.favorites.verified")}</span>}
            {verificationStep === "waiting" && <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[11px] font-bold rounded-lg">{t("customer.referrals.pending")}</span>}
            {verificationStep === "rejected" && <span className="px-2.5 py-1 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-[11px] font-bold rounded-lg">{t("customer.profile.rejected")}</span>}
          </div>

          {(verificationStep === "none" || verificationStep === "rejected") && !uploadedFile && (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                {verificationStep === "rejected"
                  ? t("customer.profile.kycRejectedNotice")
                  : t("customer.profile.kycPromptNotice")}
              </p>
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary hover:bg-primary/5 transition-all cursor-pointer">
                <Upload className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">{t("customer.profile.uploadIdDocument")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("customer.profile.pngOrJpg")}</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </div>
          )}
          {(verificationStep === "none" || verificationStep === "rejected") && uploadedFile && (
            <div className="space-y-3">
              <div className="relative border border-border rounded-xl p-3">
                <div className="relative w-full h-40 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URLs aren't supported by next/image */}
                  <img src={uploadedFile} alt="ID" className="w-full h-full object-cover" />
                </div>
                <button onClick={() => { setUploadedFile(null); if (fileInputRef.current) fileInputRef.current.value = "" }} aria-label={t("common.delete")} className="absolute top-2 right-2 p-1.5 bg-destructive text-white rounded-lg shadow"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 rounded-xl" onClick={handleSubmitKyc} disabled={isSubmittingKyc}>{isSubmittingKyc ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.help.submit")}</Button>
                <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setUploadedFile(null)}>{t("common.cancel")}</Button>
              </div>
            </div>
          )}
          {verificationStep === "waiting" && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-xl p-3">
              <p className="text-sm text-amber-800 dark:text-amber-400">{t("customer.profile.kycUnderReview")}</p>
            </div>
          )}
        </Card>

        {/* Saved Addresses */}
        <Card className="p-5 border-0 shadow-sm rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><MapPin className="w-3.5 h-3.5 text-primary" /></span>
              {t("customer.savedAddresses.title")}
            </h3>
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-8" onClick={() => setShowAddressForm(!showAddressForm)}>{showAddressForm ? t("common.cancel") : t("customer.savedAddresses.addNew")}</Button>
          </div>

          {showAddressForm && (
            <div className="p-3 bg-muted/50 rounded-xl mb-3 space-y-2">
              <Input placeholder={t("customer.profile.labelPlaceholder")} value={newAddress.label} onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })} className="rounded-xl" />
              <Input placeholder={t("customer.savedAddresses.fullAddress")} value={newAddress.address} onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })} className="rounded-xl" />
              <Button className="w-full rounded-xl" onClick={handleAddAddress}>{t("customer.profile.saveAddress")}</Button>
            </div>
          )}

          <div className="space-y-2">
            {addresses.length === 0 && <p className="text-sm text-muted-foreground p-2">{t("customer.savedAddresses.empty")}</p>}
            {addresses.map((addr) => (
              <div key={addr.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors">
                <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">{addr.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{addr.address}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {addr.isDefault ? (
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-semibold rounded-md">{t("customer.savedAddresses.default")}</span>
                  ) : (
                    <button onClick={() => handleSetDefaultAddress(addr.id)} className="px-2 py-0.5 bg-muted text-[10px] font-semibold rounded-md hover:bg-primary/10 hover:text-primary transition-all">{t("customer.savedAddresses.setDefault")}</button>
                  )}
                  <button onClick={() => handleDeleteAddress(addr.id)} className="px-2 py-0.5 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-[10px] font-semibold rounded-md hover:bg-red-100 dark:hover:bg-red-900/20 transition-all">{t("common.delete")}</button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Quick Links */}
        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
          {quickLinks.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.label} href={item.href} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors border-b border-border/30 last:border-b-0">
                <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-primary" /></span>
                <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
            )
          })}
        </Card>

        {/* Logout */}
        <Button onClick={logout} variant="outline" className="w-full rounded-xl border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 bg-transparent">
          {t("auth.logout")}
        </Button>
      </div>
    </div>
  )
}
