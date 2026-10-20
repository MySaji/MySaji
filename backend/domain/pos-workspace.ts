import type { PosTrait } from "./pos-traits"
import type { PosPermission } from "./pos-permissions"

export type WorkspaceTool = { label: string; description: string; href: string; permission: PosPermission; traits?: PosTrait[]; profiles?: string[] }

// Shared by every business profile; saved traits remain authoritative.
export const WORKSPACE_TOOLS: WorkspaceTool[] = [
  { label: "Tables & orders", description: "Seat guests, manage open tables and send orders to the kitchen.", href: "/pos/floor", permission: "till.sell", profiles: ["RESTAURANT", "CAFE", "BAR"] },
  { label: "Kitchen display", description: "Keep preparation tickets moving from ordered to ready.", href: "/pos/kitchen", permission: "till.sell", profiles: ["RESTAURANT", "CAFE", "BAR"] },
  { label: "Jobs & service tickets", description: "Track work received, progress and collection.", href: "/pos/jobs", permission: "till.sell", traits: ["JOB_CARD"] },
  { label: "Deposits & orders", description: "Take a deposit and follow the balance through to handover.", href: "/pos/orders", permission: "till.sell", traits: ["MADE_TO_ORDER"] },
  { label: "Serials & compatibility", description: "Manage tracked units, IMEIs and product fitment.", href: "/pos/products", permission: "product.view", traits: ["SERIALISED", "FITMENT"] },
  { label: "Batches & expiry", description: "Review batch stock and expiry dates before replenishing.", href: "/pos/stock", permission: "stock.view", traits: ["BATCH_EXPIRY", "CONTROLLED"] },
  { label: "Sizes, colours & packs", description: "Keep each sellable option and its stock organized.", href: "/pos/products", permission: "product.view", traits: ["VARIANTS"] },
  { label: "Bulk stock & wastage", description: "Record pack breakdowns, damaged goods and stock adjustments.", href: "/pos/stock", permission: "stock.view", traits: ["BULK_BREAK", "WASTAGE"] },
  { label: "Service catalogue", description: "Organize labour and services alongside physical goods.", href: "/pos/products", permission: "product.view", traits: ["SERVICE"] },
  { label: "Prices & promotions", description: "Manage price lists and scheduled offers.", href: "/pos/pricing", permission: "product.price" },
  { label: "Quotes", description: "Prepare a priced quotation before the customer commits.", href: "/pos/quotes", permission: "till.sell" },
  { label: "Stock counts", description: "Compare the shelf count with the stock ledger.", href: "/pos/stocktake", permission: "stock.count" },
]

export function workspaceTools(traits: readonly PosTrait[], profileKey: string | undefined, permissions: readonly PosPermission[]): WorkspaceTool[] {
  return WORKSPACE_TOOLS.filter(tool => permissions.includes(tool.permission)
    && (!tool.traits || tool.traits.some(trait => traits.includes(trait)))
    && (!tool.profiles || tool.profiles.includes(profileKey ?? "")))
}

export type CatalogueItem = {
  id: string; name: string; categoryName: string | null; price: number; stock: number; isService: boolean
}
export type CatalogueFilter = "all" | "favourites" | "available" | "unavailable" | "services"
export type CatalogueSort = "default" | "name" | "price-low" | "price-high" | "stock"

export function filterCatalogue<T extends CatalogueItem>(items: readonly T[], category: string | null, filter: CatalogueFilter, sort: CatalogueSort, favourites: readonly string[]): T[] {
  const filtered = items.filter(item => (category === null || (item.categoryName || "Uncategorized") === category)
    && (filter !== "favourites" || favourites.includes(item.id))
    && (filter !== "available" || item.isService || item.stock > 0)
    && (filter !== "unavailable" || (!item.isService && item.stock <= 0))
    && (filter !== "services" || item.isService))
  if (sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name))
  if (sort === "price-low") filtered.sort((a, b) => a.price - b.price)
  if (sort === "price-high") filtered.sort((a, b) => b.price - a.price)
  if (sort === "stock") filtered.sort((a, b) => a.stock - b.stock)
  return filtered
}
