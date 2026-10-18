"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowUpRight, BarChart3, Boxes, ChevronRight, LayoutDashboard, Package, Settings, ShoppingCart, Smartphone, Users, Wrench } from "lucide-react"
import type { PosWhoAmI } from "@/backend/actions/pos-access"
import type { PosTrait } from "@/backend/domain/pos-traits"
import { POS_TRAIT_META } from "@/backend/domain/pos-traits"
import { resolvePosProfile } from "@/backend/domain/pos-profiles"
import { workspaceTools } from "@/backend/domain/pos-workspace"
import { canOpenPosPage } from "@/frontend/lib/pos-navigation"
import { PosLogoutButton } from "./logout-button"

export function RegisterNavigation({ actor }: { actor: PosWhoAmI | null }) {
  const pathname = usePathname()
  const items = [
    { href: "/pos/home", label: "Overview", icon: LayoutDashboard },
    { href: "/pos/sell", label: "Register", icon: ShoppingCart },
    { href: "/pos/products", label: "Catalogue", icon: Package },
    { href: "/pos/stock", label: "Inventory", icon: Boxes },
    { href: "/pos/customers", label: "Customers", icon: Users },
    { href: "/pos/payments", label: "Payments", icon: Smartphone },
    { href: "/pos/reports", label: "Reports", icon: BarChart3 },
    { href: "/pos/settings", label: "Settings", icon: Settings },
  ].filter(item => canOpenPosPage(item.href, actor?.permissions ?? []))
  return <nav aria-label="Register navigation" className="flex gap-1 overflow-x-auto border-b border-border bg-background px-2 py-2 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-20 lg:flex-col lg:items-center lg:gap-3 lg:h-dvh lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-contain [scrollbar-width:thin] lg:border-b-0 lg:border-r lg:px-2 lg:py-5">
    <Link href="/pos/home" aria-label="Saji Till home" className="mb-3 hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white lg:flex"><ShoppingCart className="h-6 w-6" /></Link>
    {items.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={`flex shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-3 text-[10px] font-medium lg:w-16 lg:flex-col lg:gap-1.5 lg:px-1 ${pathname === item.href ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><item.icon className="h-4 w-4 lg:h-5 lg:w-5" />{item.label}</Link>)}
    <div className="shrink-0 lg:mt-auto"><PosLogoutButton navigation /></div>
    <span className="hidden shrink-0 text-[9px] font-semibold tracking-widest text-muted-foreground lg:block">SAJI TILL</span>
  </nav>
}

export function BusinessWorkspace({ traits, profileKey, actor }: { traits: PosTrait[]; profileKey?: string; actor: PosWhoAmI | null }) {
  const tools = workspaceTools(traits, profileKey, actor?.permissions ?? [])
  const profile = resolvePosProfile(profileKey)
  return <details className="group mt-5 rounded-2xl border border-border bg-background">
    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950"><Wrench className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{profileKey ? profile.label : "Business"} workspace</span><span className="mt-0.5 block text-[11px] text-muted-foreground">Specialist tools and selling controls for your counter</span></span><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" /></summary>
    <div className="border-t border-border p-4">
      {tools.length > 0 && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{tools.map(tool => <Link key={tool.href + tool.label} href={tool.href} className="rounded-xl border border-border p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:hover:bg-blue-950/30"><span className="flex items-center justify-between gap-2 text-xs font-semibold">{tool.label}<ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></span><span className="mt-1.5 block text-[11px] leading-relaxed text-muted-foreground">{tool.description}</span></Link>)}</div>}
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Active selling features">{traits.map(trait => <span key={trait} title={POS_TRAIT_META[trait].effect} className="rounded-lg bg-muted px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground">{POS_TRAIT_META[trait].label}</span>)}</div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">These tools follow your shop configuration and access permissions. The owner can adjust selling features in POS Settings.</p>
    </div>
  </details>
}
