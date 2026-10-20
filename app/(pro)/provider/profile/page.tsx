"use client"

import { useEffect, useState } from "react"
import {
  Home,
  Briefcase,
  MessageCircle,
  Wallet,
  User,
  Star,
  Shield,
  Award,
  FileText,
  Settings,
  LogOut,
  ChevronRight,
  Edit,
  Bell,
  Building2,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { getMyProviderBusinessInfo, type ProviderBusinessInfo } from "@/backend/actions/provider-business"

export default function ProviderProfilePage() {
  const { t } = useLocalization()
  const { logout } = useAuthContext()
  // This header used to be a hardcoded "Mike R. / 4.7 / 200 reviews / 12 jobs"
  // placeholder shown to every provider, and real details only appeared once
  // they opened My Account. It now comes from the same call the page already
  // made for isBusinessOwner, so there is no second round trip.
  const [info, setInfo] = useState<ProviderBusinessInfo | null>(null)

  useEffect(() => {
    getMyProviderBusinessInfo().then(setInfo).catch(() => {})
  }, [])

  const isBusinessOwner = Boolean(info?.isBusinessOwner)

  const handleLogout = () => {
    // logout() (see lib/auth-context.tsx) already navigates to "/" itself
    // once signOut() actually finishes clearing the session cookie. Pushing
    // here too raced ahead of that and could land on "/" while the cookie
    // was still valid — the server-side "/" route redirects an
    // already-authenticated user straight back into their portal, which
    // looked like a login/logout loop.
    logout()
  }

  // `badge` is typed in rather than inferred: no row carries one today (the
  // Proof of Work row used to show a hardcoded "2 New" to every provider,
  // including the ones with an empty portfolio), and the renderer below still
  // supports one for whenever a real count is wired up.
  const menuItems: { icon: LucideIcon; title: string; href: string; badge?: string }[] = [
    { icon: User, title: t("provider.profile.menuMyAccount"), href: "/provider/profile/account" },
    { icon: Award, title: t("provider.profile.menuWorkAreaSkills"), href: "/provider/profile/skills" },
    { icon: Shield, title: t("provider.profile.menuVerification"), href: "/provider/profile/verification" },
    { icon: FileText, title: t("provider.profile.menuProofOfWork"), href: "/provider/portfolio" },
    { icon: Wallet, title: t("provider.profile.menuPaymentMethods"), href: "/provider/profile/payments" },
    { icon: Star, title: t("provider.profile.menuStarRating"), href: "/provider/profile/ratings" },
    ...(isBusinessOwner ? [
      { icon: LayoutDashboard, title: t("provider.business.dashboard.title"), href: "/provider/business/dashboard" },
      { icon: Building2, title: t("provider.business.staff.title"), href: "/provider/business/staff" },
    ] : []),
    { icon: MessageCircle, title: t("provider.profile.menuHelpSupport"), href: "/provider/profile/help" },
    { icon: Settings, title: t("settings.title"), href: "/provider/profile/settings" },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      {/* Header */}
      <div className="bg-blue-600 dark:bg-blue-700 text-white p-4 rounded-b-2xl">
        <div className="flex items-center justify-between">
          <div className="w-10 h-10 bg-blue-500 rounded-full"></div>
          <span className="text-xs font-medium">{t("provider.profile.headerLabel")}</span>
          <Bell className="w-5 h-5" />
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-w-2xl">
        {/* Profile Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 text-center border dark:border-gray-700">
          {/* Was an empty gradient disc for everyone; shows the provider's
              own photo when they have one, and their initial when they don't. */}
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-400 to-blue-600">
            {info?.avatarUrl ? (
              // Images use the configured unoptimized rendering policy
              <img src={info.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-white">{info?.displayName?.trim().charAt(0).toUpperCase() ?? ""}</span>
            )}
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {info ? info.displayName : <span className="inline-block h-6 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />}
          </h2>
          {/* A provider with no reviews yet gets the honest version of this row
              rather than a hollow five-star rail reading 0. */}
          {info && info.reviewCount > 0 && (
            <div className="flex justify-center gap-1 my-2">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${i < Math.round(info.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300 dark:text-gray-600"}`}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {info
              ? [
                  info.reviewCount > 0
                    ? `${info.rating.toFixed(1)} (${info.reviewCount})`
                    : t("provider.profile.noRatingsYet"),
                  t("provider.profile.providerSince", {
                    date: new Date(info.memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
                  }),
                ].join(" • ")
              : " "}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            {info ? t("provider.profile.completedJobsLabel", { count: info.completedJobs }) : " "}
          </p>
          {/* Edit Profile Button — /provider/profile/edit never existed, so
              this was a dead link on every provider's profile. The account
              page is what edits the details shown just above it: name,
              contact and location. */}
          <Link
            href="/provider/profile/account"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Edit className="w-4 h-4" />
            {t("provider.profile.editProfile")}
          </Link>
        </div>

        {/* Menu Items */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 divide-y dark:divide-gray-700">
          {menuItems.map((item, idx) => {
            const IconComponent = item.icon
            return (
              <Link
                key={idx}
                href={item.href}
                className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <IconComponent className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">{item.title}</span>
                    {item.badge && (
                      <span className="ml-2 bg-orange-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                </div>
              </Link>
            )
          })}
          <button
            onClick={handleLogout}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left text-red-600 dark:text-red-400"
          >
            <div className="flex items-center gap-3">
              <LogOut className="w-5 h-5" />
              <span className="font-medium">{t("auth.logout")}</span>
            </div>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t dark:border-gray-700 flex justify-around py-3 max-w-2xl mx-auto lg:hidden">
        <Link
          href="/provider"
          className="flex flex-col items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-blue-600"
        >
          <Home className="w-6 h-6" />
          <span className="text-[11px]">{t("provider.profile.navHome")}</span>
        </Link>
        <Link
          href="/provider/jobs"
          className="flex flex-col items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-blue-600"
        >
          <Briefcase className="w-6 h-6" />
          <span className="text-[11px]">{t("provider.profile.navJobs")}</span>
        </Link>
        <Link
          href="/provider/messages"
          className="flex flex-col items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-blue-600"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="text-[11px]">{t("nav.messages")}</span>
        </Link>
        <Link
          href="/provider/wallet"
          className="flex flex-col items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-blue-600"
        >
          <Wallet className="w-6 h-6" />
          <span className="text-[11px]">{t("nav.wallet")}</span>
        </Link>
        <Link href="/provider/profile" className="flex flex-col items-center gap-1 text-blue-600">
          <User className="w-6 h-6" />
          <span className="text-[11px]">{t("provider.profile.navProfile")}</span>
        </Link>
      </div>
    </div>
  )
}
