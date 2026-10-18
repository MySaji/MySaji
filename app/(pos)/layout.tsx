"use client"

import { useEffect, useState } from "react"
import { getPosWhoAmI, type PosWhoAmI } from "@/backend/actions/pos-access"
import { canOpenPosPage } from "@/frontend/lib/pos-navigation"
import { RegisterNavigation } from "@/frontend/components/pos/register-workspace"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { ShoppingCart } from "lucide-react"
import { PosThemeProvider } from "@/frontend/components/pos/theme-provider"

/**
 * The POS, as its own application.
 *
 * WHY THIS EXISTS AT ALL
 *
 * The till used to live inside the Saji Pro portal, at /provider/till, and so
 * inherited its shell: a sidebar of Home, Offers, Create, Messages, Jobs and
 * the rest, a topbar, a floating chat button, a bottom nav. None of that
 * belongs on a counter. A shopkeeper who bought a till did not buy a
 * marketplace portal, a cashier mid-queue has no use for Offers, and every
 * one of those controls was a way to leave the register by accident.
 *
 * So the POS now has its own tree, its own address, its own sign-up, and this
 * shell. Nothing here reaches back into Saji Pro.
 *
 * WHY THE PUBLIC PAGES RENDER BARE
 *
 * The landing page, the login and the sign-up are read by somebody who does
 * not have a till yet. Wrapping them in the app's navigation would show them
 * a Stock tab they cannot use and cannot explain. They get no shell at all.
 *
 * The sell screen also gets no shell: it is the register, it is full screen on
 * a counter monitor, and it carries its own controls. See the kiosk note in
 * globals.css.
 */

/** Paths that are not the application: read before anybody has a till. */
const PUBLIC = ["/pos", "/pos/login", "/pos/signup", "/pos/employee", "/pos/setup", "/pos/contact"]

/** The register, and the kitchen screen, own their whole window. */
const FULL_BLEED = ["/pos/sell", "/pos/kitchen"]



export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <PosThemeProvider><PosShell>{children}</PosShell></PosThemeProvider>
}

function PosShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""

  const [actor, setActor] = useState<PosWhoAmI | null>(null)
  useEffect(() => {
    if (PUBLIC.includes(pathname) || FULL_BLEED.includes(pathname)) return
    let cancelled = false
    getPosWhoAmI().then((value) => { if (!cancelled) setActor(value) }).catch(() => { if (!cancelled) setActor(null) })
    return () => { cancelled = true }
  }, [pathname])

  if (PUBLIC.includes(pathname) || FULL_BLEED.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 lg:pl-20">
      <RegisterNavigation actor={actor} />
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex min-h-16 w-full items-center justify-between gap-3 px-4 md:px-6">
          <div className="min-w-0"><Link href="/pos/home" className="block truncate text-sm font-semibold">{actor?.businessName ?? "Saji Till"}</Link><p className="mt-0.5 text-[11px] text-muted-foreground">{actor ? `${actor.name} · ${actor.roleLabel}` : "Point of sale workspace"}</p></div>
          {actor?.permissions.includes("till.sell") && <Link href="/pos/sell" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700"><ShoppingCart className="h-4 w-4" />New sale</Link>}
        </div>
      </header>
      <main className="w-full min-w-0">{actor && !canOpenPosPage(pathname, actor.permissions) ? <div className="m-6 rounded-2xl border border-border bg-background p-8"><h1 className="text-xl font-semibold">Access restricted</h1><p className="mt-3 text-sm text-muted-foreground">Your owner has not enabled this feature for your account.</p><Link href="/pos/home" className="mt-4 inline-block text-sm font-semibold text-primary">Return to your workspace</Link></div> : children}</main>
    </div>
  )
}
