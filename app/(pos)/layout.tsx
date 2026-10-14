"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  ShoppingCart, LayoutDashboard, Package, Boxes, Users, BarChart3, Settings,
} from "lucide-react"

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
const PUBLIC = ["/pos", "/pos/login", "/pos/signup", "/pos/setup", "/pos/contact"]

/** The register, and the kitchen screen, own their whole window. */
const FULL_BLEED = ["/pos/sell", "/pos/kitchen"]

const NAV = [
  { href: "/pos/home", label: "Home", icon: LayoutDashboard },
  { href: "/pos/sell", label: "Sell", icon: ShoppingCart },
  { href: "/pos/products", label: "Products", icon: Package },
  { href: "/pos/stock", label: "Stock", icon: Boxes },
  { href: "/pos/customers", label: "Customers", icon: Users },
  { href: "/pos/reports", label: "Reports", icon: BarChart3 },
  { href: "/pos/settings", label: "Settings", icon: Settings },
]

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""

  if (PUBLIC.includes(pathname) || FULL_BLEED.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-background">
      {/* One bar, naming the product and nothing else. No notifications, no
          messages, no create button: a counter has one job. */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 h-12 max-w-[1600px] mx-auto">
          <Link href="/pos/home" className="font-bold text-sm text-foreground shrink-0">
            SAJI <span className="text-primary">Till</span>
          </Link>

          {/* Desktop navigation. On a phone this is the bottom bar instead,
              because a cashier holds the phone one-handed. */}
          <nav className="hidden md:flex items-center gap-0.5 ml-4 overflow-x-auto">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={"h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors " +
                    (active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <Link
            href="/pos/sell"
            className="ml-auto h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 active:scale-95 shrink-0"
          >
            <ShoppingCart className="w-3.5 h-3.5" /> Sell
          </Link>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto pb-20 md:pb-0">{children}</main>

      {/* Phone navigation. Five, not seven: the two that do not fit are
          reachable from Home, and a bottom bar people mis-tap is worse than a
          shorter one. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => n.label !== "Customers" && n.label !== "Stock").map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                className={"flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-medium " +
                  (active ? "text-primary" : "text-muted-foreground")}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
