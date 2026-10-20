"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronDown, User, Settings, LogOut } from "lucide-react"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

/** The three roles a person can hold on an ordinary account. Kept as a local
 * union rather than imported from the account-switch action: this menu no
 * longer switches between them, it only needs to know which one is active so
 * it can point Profile and Settings at the right portal. */
type MenuRole = "customer" | "provider" | "shopkeeper"

const MENU_ROLES: MenuRole[] = ["customer", "provider", "shopkeeper"]

const ROLE_COLOR: Record<MenuRole, string> = {
  customer: "text-blue-600 dark:text-blue-400",
  provider: "text-emerald-600 dark:text-emerald-400",
  shopkeeper: "text-purple-600 dark:text-purple-400",
}

const PROFILE_PATH: Record<MenuRole, string> = {
  customer: "/customer/profile",
  provider: "/provider/profile",
  shopkeeper: "/shopkeeper/profile",
}

const SETTINGS_PATH: Record<MenuRole, string> = {
  customer: "/customer/settings",
  provider: "/provider/profile/settings",
  shopkeeper: "/shopkeeper/settings",
}

function isMenuRole(role: string | undefined): role is MenuRole {
  return !!role && (MENU_ROLES as string[]).includes(role)
}

/** Header dropdown showing who is signed in, with their profile, settings and
 * a way out.
 *
 * It used to also let one account hop between the customer, provider and
 * shopkeeper portals, creating whichever profile was missing on the spot. That
 * was removed on request. One account is now one role: becoming a provider or
 * opening a shop goes through registration, so each portal is entered by
 * somebody who actually signed up for it. The server side refuses the switch
 * too, since hiding a button leaves the action reachable (see
 * backend/actions/account-switch.ts).
 *
 * Distributor and every staff role are out of scope by design and render
 * nothing here, same as before. */
export function AccountMenu({ alwaysShowLabel = false }: { alwaysShowLabel?: boolean }) {
  const { t } = useLocalization()
  const { user, logout } = useAuthContext()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentRole = isMenuRole(user?.role) ? user.role : undefined

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  if (!currentRole) return null

  const roleLabel: Record<MenuRole, string> = {
    customer: t("common.customer"),
    provider: t("common.provider"),
    shopkeeper: t("common.shopkeeper"),
  }

  return (
    <div ref={menuRef} className="relative">
      {/* At phone width the name and role beside the avatar are hidden, which
          left this button with no accessible name at all: an avatar image with
          an empty alt and nothing else. Labelled and announced as a menu. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("accountMenu.openMenu")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
          {user?.avatar ? (
            // Images use the configured unoptimized rendering policy -- base64 data URLs (locally-uploaded avatars) aren't supported by next/image
            <img src={user.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-primary">{user?.name?.charAt(0).toUpperCase() || "U"}</span>
          )}
        </div>
        <div className={(alwaysShowLabel ? "block" : "hidden md:block") + " text-left"}>
          <p className="text-sm font-medium leading-tight truncate max-w-[120px]">{user?.name}</p>
          <p className={"text-xs leading-tight " + ROLE_COLOR[currentRole]}>{roleLabel[currentRole]}</p>
        </div>
        <ChevronDown
          className={
            "w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 " +
            (alwaysShowLabel ? "" : "hidden md:block ") +
            (open ? "rotate-180" : "")
          }
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-64 bg-card rounded-xl shadow-2xl border border-border overflow-hidden z-50">
            {/* Who you are. With the role switcher gone this is the only thing
                naming the active portal inside the dropdown, so it stays even
                though the trigger button shows it too: on a phone the trigger
                collapses to just the avatar. */}
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
              <p className={"text-xs mt-0.5 " + ROLE_COLOR[currentRole]}>{roleLabel[currentRole]}</p>
            </div>
            <div className="py-1.5">
              <Link
                href={PROFILE_PATH[currentRole]}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-foreground"
              >
                <User className="w-4 h-4 text-muted-foreground" />
                {t("accountMenu.myProfile")}
              </Link>
              <Link
                href={SETTINGS_PATH[currentRole]}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-foreground"
              >
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
