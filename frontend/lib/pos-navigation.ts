import type { PosPermission } from "@/backend/domain/pos-permissions"
import { businessSupportsPage, type PosBusinessFeatures } from "@/backend/domain/pos-business-features"

// Navigation follows the effective permissions returned by the server.
// Server actions remain responsible for authorizing every operation.
const ACCESS: Record<string, PosPermission[]> = {
  sell: ["till.sell"], floor: ["till.sell"], kitchen: ["till.sell"], jobs: ["till.sell"],
  quotes: ["till.sell"], cards: ["till.sell"], credit: ["report.sales"],
  products: ["product.view"], stock: ["stock.view"], stocktake: ["stock.count"],
  purchasing: ["purchase.view"], transfers: ["stock.adjust"], pricing: ["product.price"],
  shifts: ["till.open_shift", "report.sales"], expenses: ["expense.view"],
  reports: ["report.sales", "report.stock"], orders: ["till.sell"],
  payments: ["till.sell", "report.sales", "payment.settings"],
  mpesa: ["payment.settings"], etims: ["payment.settings"],
  team: ["staff.view"], people: ["staff.manage"], stores: ["settings.store"],
  audit: ["settings.business"], pulse: ["settings.business"],
  salon: ["salon.view"],
  operations: ["purchase.view","stock.view","stock.adjust","salon.book","settings.business","till.sell","report.sales"],
  website: ["settings.business"],
  devices: ["device.manage"], settings: ["settings.store"],
  subscription: ["settings.business"], customers: ["till.sell"],
}

export function canOpenPosPage(href: string, permissions: readonly PosPermission[], features?: PosBusinessFeatures | null): boolean {
  const page = href.split("/")[2]
  if (page === "home") return true
  if (page === "operations") return permissions.includes("purchase.view") || permissions.includes("till.sell") || permissions.includes("settings.business") || (permissions.includes("report.sales") && permissions.includes("expense.view")) || (!!features?.services && permissions.includes("stock.adjust")) || (!!features?.batches && permissions.includes("stock.view")) || (!!features?.salon && permissions.includes("salon.book"))
  return businessSupportsPage(href, features) && (ACCESS[page] ?? []).some((permission) => permissions.includes(permission))
}
