import type { PosPermission } from "@/backend/domain/pos-permissions"

// Navigation follows the effective permissions returned by the server.
// Server actions remain responsible for authorizing every operation.
const ACCESS: Record<string, PosPermission[]> = {
  sell: ["till.sell"], floor: ["till.sell"], jobs: ["till.sell"],
  quotes: ["till.sell"], cards: ["till.sell"], credit: ["report.sales"],
  products: ["product.view"], stock: ["stock.view"], stocktake: ["stock.count"],
  purchasing: ["purchase.view"], transfers: ["stock.adjust"], pricing: ["product.price"],
  shifts: ["till.open_shift", "report.sales"], expenses: ["expense.view"],
  reports: ["report.sales", "report.stock"], orders: ["till.sell"],
  payments: ["till.sell", "report.sales", "payment.settings"],
  mpesa: ["payment.settings"], etims: ["payment.settings"],
  team: ["staff.view"], people: ["staff.manage"], stores: ["settings.store"],
  audit: ["settings.business"],
  salon: ["salon.view"],
  website: ["settings.business"],
  devices: ["device.manage"], settings: ["settings.store"],
  subscription: ["settings.business"], customers: ["till.sell"],
}

export function canOpenPosPage(href: string, permissions: readonly PosPermission[]): boolean {
  const page = href.split("/")[2]
  if (page === "home") return true
  return (ACCESS[page] ?? []).some((permission) => permissions.includes(permission))
}
