/**
 * Saji Pro business types and the portal modules each one unlocks.
 *
 * Plain module, no server imports — the sidebar, the signup picker, the
 * "add another business type" page and the admin matrix all read the same
 * table, and a client component must be able to import it without dragging
 * Prisma or `auth` into the browser bundle (the same reason
 * lib/verification-capabilities.ts exists next to lib/verification-gate.ts).
 *
 * Nothing here grants access. Every route guard, verification gate and role
 * check is untouched — these decide which modules the portal *shows* a
 * particular Saji Pro account, so a plumber isn't handed a Shop Orders page
 * and a tutor isn't handed Dispatch. Rows in ProModuleSetting are the admin's
 * override of the defaults below.
 */

export type ProBusinessType = "SERVICES" | "PRODUCTS" | "RENTALS" | "FREELANCE" | "TUTORING" | "CONSULTING"

export type ProCapabilityStatus = "ACTIVE" | "PENDING" | "REJECTED"

/** Display order everywhere: signup picker, manage page, admin matrix. */
export const PRO_BUSINESS_TYPES: ProBusinessType[] = [
  "SERVICES",
  "PRODUCTS",
  "RENTALS",
  "FREELANCE",
  "TUTORING",
  "CONSULTING",
]

export type ProBusinessTypeMeta = {
  label: string
  /** One line, written for the person choosing it, not for the database. */
  description: string
  /** lucide-react icon name; resolved by the component that renders it. */
  icon: string
  /** What this account's day-to-day work is called in the nav. */
  workLabel: string
  /** Where the "Work" nav slot points for an account of this type. */
  workHref: string
  /** Which offer action types this business type naturally creates. */
  offerActionTypes: string[]
  accent: string
}

export const PRO_BUSINESS_TYPE_META: Record<ProBusinessType, ProBusinessTypeMeta> = {
  SERVICES: {
    label: "Offer Services",
    description: "Get hired for jobs — repairs, cleaning, beauty, construction and more",
    icon: "Wrench",
    workLabel: "Jobs",
    workHref: "/provider/jobs",
    offerActionTypes: ["BOOK", "HIRE", "QUOTE", "REQUEST"],
    accent: "blue",
  },
  PRODUCTS: {
    label: "Sell Products",
    description: "List items for sale and take orders through your shop",
    icon: "Store",
    // Points at Sales, not Shop Orders. Shop Orders holds orders for real
    // Product rows in a registered shop; a Pro who simply ticked "Sell
    // Products" sells through BUY offers, and their sales land as Jobs. The
    // work slot has to be the page that is never empty by construction.
    workLabel: "Sales",
    workHref: "/provider/sales",
    offerActionTypes: ["BUY"],
    accent: "amber",
  },
  RENTALS: {
    label: "Rent Out Items",
    description: "Hire out equipment, vehicles or space by the day",
    icon: "Package",
    workLabel: "Rentals",
    workHref: "/provider/rentals",
    offerActionTypes: ["RENT"],
    accent: "purple",
  },
  FREELANCE: {
    label: "Freelance Online",
    description: "Take remote work — design, writing, development, virtual assistance",
    icon: "Laptop",
    workLabel: "Projects",
    workHref: "/provider/jobs",
    offerActionTypes: ["HIRE", "QUOTE", "REQUEST"],
    accent: "emerald",
  },
  TUTORING: {
    label: "Teach & Tutor",
    description: "Run classes, lessons or training sessions",
    icon: "GraduationCap",
    workLabel: "Sessions",
    workHref: "/provider/jobs",
    offerActionTypes: ["BOOK", "REQUEST"],
    accent: "rose",
  },
  CONSULTING: {
    label: "Consulting",
    description: "Sell your expertise by the hour or by the engagement",
    icon: "Briefcase",
    workLabel: "Engagements",
    workHref: "/provider/jobs",
    offerActionTypes: ["BOOK", "QUOTE"],
    accent: "sky",
  },
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export type ProModule = {
  key: string
  label: string
  href: string
  /** lucide-react icon name. */
  icon: string
  /** Sidebar grouping, matching the existing GROUP_LABEL map. */
  group: "shop" | "business" | "insights" | null
  /** Shown to the admin in the matrix so a toggle isn't a guess. */
  description: string
  /** Never hidden by the matrix — the portal is unusable without these. */
  core?: boolean
  exact?: boolean
}

/**
 * Every module the Saji Pro portal can show. Each one points at a page that
 * already exists — this pass changes which of them a given account sees, it
 * does not invent new destinations.
 */
export const PRO_MODULES: ProModule[] = [
  // Declaration order IS nav order — resolveModuleKeys returns keys in this
  // sequence and the sidebar renders them as-is. Ungrouped items come first,
  // then the three labelled groups, then Profile last, which is exactly the
  // shape the sidebar had before it became module-driven.

  // --- Ungrouped: the day-to-day ---
  { key: "home", label: "Home", href: "/provider", icon: "Home", group: null, exact: true, core: true, description: "The Saji Pro home screen" },
  { key: "jobs", label: "Today's Jobs", href: "/provider/jobs", icon: "Briefcase", group: null, exact: true, description: "Active and scheduled work" },
  { key: "calendar", label: "My Calendar", href: "/provider/jobs?tab=calendar", icon: "Calendar", group: null, description: "Month view of scheduled work" },
  { key: "services", label: "Service Menu", href: "/provider/services", icon: "Wrench", group: null, description: "The catalogue of services offered" },
  { key: "rentals", label: "Rentals", href: "/provider/rentals", icon: "Package", group: null, description: "Rental items, bookings and returns" },
  { key: "offers", label: "Offers", href: "/provider/offers", icon: "Rocket", group: null, core: true, description: "Create and manage listings of every action type" },
  { key: "availability", label: "Availability", href: "/provider/availability", icon: "Clock", group: null, description: "Working hours and travel radius" },
  { key: "requests", label: "Requests", href: "/provider/requests", icon: "Megaphone", group: null, description: "Open customer requests to bid on" },
  { key: "quotes", label: "Quotes", href: "/provider/quotes", icon: "ClipboardList", group: null, description: "Quotes sent to customers" },
  { key: "serviceRequests", label: "Service Requests", href: "/provider/service-requests", icon: "Handshake", group: null, description: "Direct requests sent to this account" },
  { key: "opportunities", label: "Opportunities", href: "/provider/opportunities", icon: "Radar", group: null, description: "Matched leads and tenders" },
  { key: "messages", label: "Messages", href: "/provider/messages", icon: "MessageCircle", group: null, core: true, description: "Conversations with customers" },
  { key: "wallet", label: "Earnings", href: "/provider/wallet", icon: "Wallet", group: null, core: true, description: "Balance, payouts and withdrawals" },

  // --- My Shop: the full merchant set ---
  //
  // Everything the standalone merchant portal had. The first pass mapped only
  // five of these, which left an account that chose "Sell Products" without
  // inventory reviews, suppliers, wholesale ordering, shop analytics or the
  // product request board — i.e. not actually a merchant portal.
  { key: "shopDashboard", label: "Shop Dashboard", href: "/shopkeeper", icon: "LayoutDashboard", group: "shop", exact: true, description: "Revenue, orders today, top products" },
  { key: "sales", label: "Sales", href: "/provider/sales", icon: "Receipt", group: "shop", description: "Sales of this account's Buy offers, and fulfilling them" },
  { key: "shopOrders", label: "Shop Orders", href: "/shopkeeper/orders", icon: "ClipboardList", group: "shop", description: "Incoming product orders, fulfilment and returns" },
  { key: "shopProducts", label: "Products & Stock", href: "/shopkeeper/products", icon: "Package", group: "shop", description: "Catalogue, pricing, stock levels and low-stock alerts" },
  { key: "shopCustomers", label: "Shop Customers", href: "/shopkeeper/customers", icon: "Users", group: "shop", description: "Buyers and their order history" },
  { key: "shopRequests", label: "Product Requests", href: "/shopkeeper/requests", icon: "Megaphone", group: "shop", description: "Open customer requests for products, and bidding on them" },
  { key: "shopPromotions", label: "Promotions", href: "/shopkeeper/promotions", icon: "Megaphone", group: "shop", description: "Discounts and promo codes" },
  { key: "shopEarnings", label: "Shop Earnings", href: "/shopkeeper/earnings", icon: "Wallet", group: "shop", description: "Product-sale revenue and settlements" },
  { key: "shopAnalytics", label: "Shop Analytics", href: "/shopkeeper/analytics", icon: "BarChart3", group: "shop", description: "Sales trends, best sellers and conversion" },
  { key: "shopSuppliers", label: "Suppliers", href: "/shopkeeper/distributors", icon: "Truck", group: "shop", description: "Distributors to source stock from" },
  { key: "wholesaleOrders", label: "Wholesale Orders", href: "/shopkeeper/wholesale-orders", icon: "ShoppingCart", group: "shop", description: "Stock this shop has ordered from distributors" },
  { key: "shopReviews", label: "Shop Reviews", href: "/shopkeeper/reviews", icon: "Star", group: "shop", description: "Customer reviews of the shop, and replies" },
  { key: "shopEndorsements", label: "Endorsements", href: "/shopkeeper/endorsements", icon: "Award", group: "shop", description: "Endorsements between this shop and specialists" },
  { key: "shopShowcase", label: "Shop Showcase", href: "/shopkeeper/showcase", icon: "ImageIcon", group: "shop", description: "Photos and videos shown to customers browsing the shop" },
  { key: "shop", label: "My Shop", href: "/provider/shop", icon: "Store", group: "shop", description: "Shop profile, hours and storefront" },
  { key: "shopSettings", label: "Shop Settings", href: "/shopkeeper/settings", icon: "Settings", group: "shop", description: "Delivery fees, payouts and shop preferences" },

  // --- Business ---
  { key: "portfolio", label: "My Work", href: "/provider/portfolio", icon: "Camera", group: "business", description: "Photo and video portfolio on the public profile" },
  { key: "content", label: "Showcase", href: "/provider/content", icon: "ImageIcon", group: "business", description: "Posts and before/after stories" },
  { key: "invoices", label: "Invoices", href: "/provider/invoices", icon: "FileText", group: "business", description: "Issued invoices and payment status" },

  // --- Insights ---
  { key: "clients", label: "Clients", href: "/provider/clients", icon: "Users", group: "insights", description: "Repeat customer directory" },
  { key: "analytics", label: "Analytics", href: "/provider/analytics", icon: "BarChart3", group: "insights", description: "Views, conversion and revenue trends" },
  { key: "referrals", label: "Referrals", href: "/provider/referrals", icon: "Gift", group: "insights", description: "Referral link and rewards" },
  { key: "proDashboard", label: "Pro Dashboard", href: "/provider/pro/dashboard", icon: "LayoutDashboard", group: "insights", description: "Saji Pro performance overview" },
  { key: "proPlan", label: "Saji Pro", href: "/provider/pro", icon: "Crown", group: "insights", description: "Subscription plan and benefits" },

  // --- Always last, ungrouped, same as before ---
  { key: "businessTypes", label: "My Business", href: "/provider/business-types", icon: "Layers", group: null, core: true, description: "What this account offers, and requests to add more" },
  { key: "profile", label: "Profile", href: "/provider/profile", icon: "User", group: null, core: true, description: "Account, verification and settings" },
]

export const PRO_MODULE_BY_KEY: Record<string, ProModule> = Object.fromEntries(
  PRO_MODULES.map((m) => [m.key, m]),
)

/** Shown to every Saji Pro account no matter what they picked. */
export const CORE_MODULE_KEYS: string[] = PRO_MODULES.filter((m) => m.core).map((m) => m.key)

/**
 * The default matrix. An admin can turn any of these off, or switch on a
 * module a type doesn't get by default, from /admin/pro-modules — a
 * ProModuleSetting row overrides whatever this table says.
 */
export const DEFAULT_MODULES_BY_TYPE: Record<ProBusinessType, string[]> = {
  // A service business: winning work, scheduling it, billing for it.
  SERVICES: [
    "jobs", "calendar", "services", "availability", "requests", "quotes",
    "serviceRequests", "opportunities", "invoices", "portfolio", "content",
    "clients", "analytics", "referrals", "proDashboard", "proPlan",
  ],
  // A merchant: the whole shop, including sourcing stock and selling it.
  PRODUCTS: [
    "shopDashboard", "sales", "shopOrders", "shopProducts", "shopCustomers",
    "shopRequests", "shopPromotions", "shopEarnings", "shopAnalytics",
    "shopSuppliers", "wholesaleOrders", "shopReviews", "shopEndorsements",
    "shopShowcase", "shop", "shopSettings", "invoices", "content", "clients",
    "referrals", "proDashboard", "proPlan",
  ],
  // A rental business: the items, the dates they are out, and the paperwork.
  RENTALS: [
    "rentals", "calendar", "availability", "requests", "quotes", "invoices",
    "portfolio", "content", "clients", "analytics", "referrals",
    "proDashboard", "proPlan",
  ],
  // Remote work: a menu of what you do, briefs coming in, and invoicing.
  FREELANCE: [
    "jobs", "calendar", "services", "availability", "quotes", "serviceRequests",
    "opportunities", "requests", "invoices", "portfolio", "content", "clients",
    "analytics", "referrals", "proDashboard", "proPlan",
  ],
  // Teaching: a class list, a timetable, enrolments and fees.
  TUTORING: [
    "jobs", "calendar", "services", "availability", "requests", "quotes",
    "invoices", "portfolio", "content", "clients", "analytics", "referrals",
    "proDashboard", "proPlan",
  ],
  // Consulting: proposals, a diary, engagements and invoices.
  CONSULTING: [
    "jobs", "calendar", "services", "availability", "quotes", "serviceRequests",
    "opportunities", "invoices", "portfolio", "content", "clients", "analytics",
    "referrals", "proDashboard", "proPlan",
  ],
}

/**
 * Which modules an account with these business types should see, given the
 * admin's overrides. Core modules are always included and can never be
 * switched off — losing Messages or Profile would strand the account.
 *
 * `overrides` is keyed "TYPE:moduleKey" so one flat map covers the whole
 * matrix without the caller having to nest anything.
 */
export function resolveModuleKeys(
  types: ProBusinessType[],
  overrides: Record<string, boolean> = {},
): string[] {
  const enabled = new Set<string>(CORE_MODULE_KEYS)
  for (const type of types) {
    for (const mod of PRO_MODULES) {
      if (mod.core) continue
      const override = overrides[`${type}:${mod.key}`]
      const on = override ?? DEFAULT_MODULES_BY_TYPE[type]?.includes(mod.key) ?? false
      if (on) enabled.add(mod.key)
    }
  }
  return PRO_MODULES.filter((m) => enabled.has(m.key)).map((m) => m.key)
}

/** Is this module on for this single business type, defaults + overrides? */
export function isModuleEnabledForType(
  type: ProBusinessType,
  moduleKey: string,
  overrides: Record<string, boolean> = {},
): boolean {
  if (PRO_MODULE_BY_KEY[moduleKey]?.core) return true
  return overrides[`${type}:${moduleKey}`] ?? DEFAULT_MODULES_BY_TYPE[type]?.includes(moduleKey) ?? false
}

/**
 * What the "Work" slot in the bottom nav should say and point at. An account
 * with several business types gets the first one it actually holds, in
 * PRO_BUSINESS_TYPES order, so the label is stable rather than depending on
 * which row came back first. A Pro with no business type recorded at all
 * (every account that predates this feature) falls back to Jobs — exactly
 * what the nav said before.
 */
export function resolveWorkSlot(types: ProBusinessType[]): { label: string; href: string } {
  const primary = PRO_BUSINESS_TYPES.find((t) => types.includes(t))
  if (!primary) return { label: "Work", href: "/provider/jobs" }
  const meta = PRO_BUSINESS_TYPE_META[primary]
  return { label: meta.workLabel, href: meta.workHref }
}

/** Offer action types worth surfacing first in Create Offer, given the types. */
export function suggestedOfferActionTypes(types: ProBusinessType[]): string[] {
  const seen = new Set<string>()
  for (const t of PRO_BUSINESS_TYPES) {
    if (!types.includes(t)) continue
    for (const a of PRO_BUSINESS_TYPE_META[t].offerActionTypes) seen.add(a)
  }
  return Array.from(seen)
}
