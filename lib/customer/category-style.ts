import type { ComponentType } from "react"
import { Zap, Droplets, Wind, Hammer, Flame, Truck, Paintbrush, Wrench, Grid3X3 } from "lucide-react"

// Single source of truth for category icon/color — previously duplicated
// separately in customer-home.tsx and customer-services-page.tsx, and the
// two copies had drifted apart (same category slug rendering a different
// icon depending on which page you were on: electricians was Plug vs Zap,
// cleaners was Wind vs ShoppingBag, carpenters was Hammer vs Wrench,
// ac-repair was Wind vs Flame, movers was Truck vs CloudRain,
// freelance-designers was Paintbrush vs PanelTop). Colors already matched
// between the two copies; only icons had drifted, so this keeps every
// existing color value as-is and picks one deliberate icon per slug.
export const CATEGORY_STYLE: Record<string, { icon: ComponentType<{ className?: string }>; color: string; dot: string }> = {
  electricians: { icon: Zap, color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400", dot: "bg-amber-500 dark:bg-amber-400" },
  plumbers: { icon: Droplets, color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400", dot: "bg-blue-500 dark:bg-blue-400" },
  cleaners: { icon: Wind, color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500 dark:bg-emerald-400" },
  carpenters: { icon: Hammer, color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400", dot: "bg-yellow-500 dark:bg-yellow-400" },
  "ac-repair": { icon: Flame, color: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400", dot: "bg-cyan-500 dark:bg-cyan-400" },
  movers: { icon: Truck, color: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400", dot: "bg-indigo-500 dark:bg-indigo-400" },
  "freelance-designers": { icon: Paintbrush, color: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400", dot: "bg-sky-500 dark:bg-sky-400" },
  handymen: { icon: Wrench, color: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400", dot: "bg-orange-500 dark:bg-orange-400" },
}

export const DEFAULT_CATEGORY_STYLE = { icon: Grid3X3, color: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300", dot: "bg-slate-400 dark:bg-slate-500" }

export const CATEGORY_ICONS: Record<string, ComponentType<{ className?: string }>> = Object.fromEntries(
  Object.entries(CATEGORY_STYLE).map(([slug, style]) => [slug, style.icon]),
)
