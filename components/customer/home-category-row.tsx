"use client"

import Link from "next/link"
import { Store, Wrench, Cpu, Hammer, Car, Package, Lamp, MoreHorizontal, type LucideIcon } from "lucide-react"
import type { ProductCategoryOption } from "@/lib/actions/products"

type CategoryTile = { label: string; icon: LucideIcon; href: string }

// Best-effort keyword match against real Category.name strings (no fixed
// slug list to hardcode against, since seeded category names vary by
// deployment) — falls back to a generic Package icon rather than guessing.
function iconForProductCategory(name: string): LucideIcon {
  const n = name.toLowerCase()
  if (n.includes("electronic") || n.includes("phone") || n.includes("computer")) return Cpu
  if (n.includes("hardware") || n.includes("building") || n.includes("construction")) return Hammer
  if (n.includes("vehicle") || n.includes("car") || n.includes("auto")) return Car
  if (n.includes("home") || n.includes("living") || n.includes("furniture")) return Lamp
  return Package
}

// A fixed rotating palette (not tied to any one category's real identity,
// unlike CATEGORY_STYLE for services) — these tiles are a mix of
// site-sections (Shops, Services, Rentals) and dynamic product categories,
// so there's no single stable slug to key real colors off. Distinct color
// per position reads as a proper marketplace category strip instead of the
// flat gray-circle row this used to be.
const TILE_COLORS = [
  "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400",
  "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
  "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400",
]

export function HomeCategoryRow({ productCategories }: { productCategories: ProductCategoryOption[] }) {
  const tiles: CategoryTile[] = [
    { label: "Shops", icon: Store, href: "/customer/shops" },
    { label: "Services", icon: Wrench, href: "/customer/services" },
    ...productCategories.slice(0, 4).map((c) => ({ label: c.name, icon: iconForProductCategory(c.name), href: `/customer/products?category=${c.slug}` })),
    { label: "Rentals", icon: Package, href: "/customer/services/more?type=rental" },
  ]

  return (
    <div className="flex gap-4 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide sm:mx-0 sm:px-0">
      {tiles.map((tile, i) => (
        <Link key={tile.label} href={tile.href} className="group flex w-16 flex-shrink-0 flex-col items-center gap-2 text-center">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full shadow-sm transition-transform group-hover:scale-105 ${TILE_COLORS[i % TILE_COLORS.length]}`}>
            <tile.icon className="h-6 w-6" />
          </div>
          <p className="w-full truncate text-[10px] font-medium leading-tight text-foreground">{tile.label}</p>
        </Link>
      ))}
      <Link href="/customer/services" className="group flex w-16 flex-shrink-0 flex-col items-center gap-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted shadow-sm transition-transform group-hover:scale-105">
          <MoreHorizontal className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-[10px] font-medium leading-tight text-foreground">More</p>
      </Link>
    </div>
  )
}
