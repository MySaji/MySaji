"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronDown, User, Briefcase, Store, Settings, LogOut, Check, Loader2 } from "lucide-react"
import { useAuthContext } from "@/lib/auth-context"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { getMyRoleProfiles, switchActiveRole, type SwitchableRole } from "@/lib/actions/account-switch"
import { ROLE_HOME_PATH } from "@/lib/role-map"

const SWITCHABLE_ROLES: SwitchableRole[] = ["customer", "provider", "shopkeeper"]

const ROLE_ICON: Record<SwitchableRole, typeof User> = { customer: User, provider: Briefcase, shopkeeper: Store }

const ROLE_COLOR: Record<SwitchableRole, string> = {
  customer: "text-blue-600 dark:text-blue-400",
  provider: "text-emerald-600 dark:text-emerald-400",
  shopkeeper: "text-purple-600 dark:text-purple-400",
}

const ROLE_BG: Record<SwitchableRole, string> = {
  customer: "bg-blue-50 dark:bg-blue-900/20",
  provider: "bg-emerald-50 dark:bg-emerald-900/20",
  shopkeeper: "bg-purple-50 dark:bg-purple-900/20",
}

const PROFILE_PATH: Record<SwitchableRole, string> = {
  customer: "/customer/profile",
  provider: "/provider/profile",
  shopkeeper: "/shopkeeper/profile",
}

const SETTINGS_PATH: Record<SwitchableRole, string> = {
  customer: "/customer/settings",
  provider: "/provider/profile/settings",
  shopkeeper: "/shopkeeper/settings",
}

function isSwitchableRole(role: string | undefined): role is SwitchableRole {
  return !!role && (SWITCHABLE_ROLES as string[]).includes(role)
}

/** Header dropdown letting a customer/provider/shopkeeper hop between any of
 * those three roles on the same account without logging in again — adding a
 * role for the first time creates the profile instantly (see
 * lib/actions/account-switch.ts), switching back to one already held just
 * flips the active role. Distributor and every staff role are out of scope
 * by design (not rendered for those sessions at all). */
export function AccountMenu({ alwaysShowLabel = false }: { alwaysShowLabel?: boolean }) {
  const { t } = useLocalization()
  const { user, logout, refreshSession } = useAuthContext()
  const [open, setOpen] = useState(false)
  const [switchingTo, setSwitchingTo] = useState<SwitchableRole | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentRole = isSwitchableRole(user?.role) ? user.role : undefined

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  if (!currentRole) return null

  const roleLabel: Record<SwitchableRole, string> = {
    customer: t("common.customer"),
    provider: t("common.provider"),
    shopkeeper: t("common.shopkeeper"),
  }

  // Navigates directly off this async flow's own await chain rather than a
  // separate effect watching user.role: on the pending-KYC screens (see
  // app/provider/layout.tsx), refreshSession() completing can itself flip
  // the parent layout's gating condition (isProviderPending) and swap to a
  // different branch in the very same render, unmounting this component
  // before an effect keyed on the new role would ever get a chance to fire —
  // silently stranding the user on the wrong portal with a stale-looking
  // page under a session that already updated. window.location.href, called
  // straight from this still-live async function, queues the navigation
  // immediately regardless of what React does to this component afterward.
  const handleSwitch = async (target: SwitchableRole) => {
    if (target === currentRole || switchingTo) return
    setSwitchingTo(target)
    try {
      const result = await switchActiveRole(target)
      if (!result.success) { setSwitchingTo(null); return }
      await refreshSession()
      window.location.href = ROLE_HOME_PATH[target]
    } catch {
      setSwitchingTo(null)
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
          {user?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- base64 data URLs (locally-uploaded avatars) aren't supported by next/image
            <img src={user.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-primary">{user?.name?.charAt(0).toUpperCase() || "U"}</span>
          )}
        </div>
        <div className={`${alwaysShowLabel ? "block" : "hidden md:block"} text-left`}>
          <p className="text-sm font-medium leading-tight truncate max-w-[120px]">{user?.name}</p>
          <p className={`text-xs leading-tight ${ROLE_COLOR[currentRole]}`}>{roleLabel[currentRole]}</p>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${alwaysShowLabel ? "" : "hidden md:block"} ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-64 bg-card rounded-xl shadow-2xl border border-border overflow-hidden z-50">
            <div className="px-3 pt-3 pb-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("accountMenu.switchRole")}</p>
            </div>
            <div className="pb-1.5">
              {SWITCHABLE_ROLES.map((role) => {
                const Icon = ROLE_ICON[role]
                const isCurrent = role === currentRole
                const isBusy = switchingTo === role
                return (
                  <button
                    key={role}
                    onClick={() => handleSwitch(role)}
                    disabled={isCurrent || switchingTo !== null}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors disabled:cursor-default ${
                      isCurrent ? `${ROLE_BG[role]} ${ROLE_COLOR[role]} font-medium` : "hover:bg-muted text-foreground"
                    }`}
                  >
                    {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className={`w-4 h-4 ${isCurrent ? "" : "text-muted-foreground"}`} />}
                    <span className="flex-1 text-left">{roleLabel[role]}</span>
                    {isCurrent && <Check className="w-4 h-4" />}
                  </button>
                )
              })}
            </div>
            <div className="border-t border-border py-1.5">
              <Link href={PROFILE_PATH[currentRole]} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-foreground">
                <User className="w-4 h-4 text-muted-foreground" />
                {t("accountMenu.myProfile")}
              </Link>
              <Link href={SETTINGS_PATH[currentRole]} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-foreground">
                <Settings className="w-4 h-4 text-muted-foreground" />
                {t("settings.title")}
              </Link>
            </div>
            <div className="border-t border-border py-1.5">
              <button
                onClick={() => { setOpen(false); logout() }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                {t("auth.logout")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
