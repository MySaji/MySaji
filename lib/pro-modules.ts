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

export type ProBusinessType = "SERVICES" | "PRODUCTS" | "RENTALS" | "FREELANCE" | "TUTORING" | "CONSULTING" | "POS"

export type ProCapabilityStatus = "ACTIVE" | "PENDING" | "REJECTED"

/** Display order everywhere: signup picker, manage page, admin matrix. */
export const PRO_BUSINESS_TYPES: ProBusinessType[] = [
  "SERVICES",
  "PRODUCTS",
  // Sits next to PRODUCTS deliberately: "Run a till" and "Sell Products" are
  // the only pair that may be held together, so the picker should read them
  // adjacently rather than making the customer hunt for the compatible one.
  "POS",
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
  POS: {
    label: "Run a Till (POS)",
    description: "Serve customers at your counter — scan, weigh, take cash or M-Pesa, print a receipt",
    icon: "Calculator",
    workLabel: "Till",
    workHref: "/provider/till",
    // A counter sale creates nothing a customer browses. POS is the one
    // business type that does not publish offers, which is exactly why it
    // can stand alone without a marketplace listing.
    offerActionTypes: [],
    accent: "slate",
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
  group: "shop" | "business" | "insights" | "till" | null
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

  // --- The Till: a counter, not a storefront ---
  //
  // Deliberately a separate group from "My Shop". A POS-only account has no
  // storefront, no marketplace orders and no delivery; putting the till in
  // with Shop Orders would imply all three. The two groups coexist for an
  // account holding POS + PRODUCTS, which is the point: one stock figure,
  // two places it can be sold from.
  { key: "till", label: "Till", href: "/provider/till", icon: "Calculator", group: "till", exact: true, description: "The register screen — ring up a sale at the counter" },
  { key: "posSettings", label: "POS Settings", href: "/provider/till/settings", icon: "SlidersHorizontal", group: "till", description: "Shop type, selling behaviours and stock policy" },
  // Declared so the admin matrix knows they exist and so the build order is
  // visible here rather than only in POS2.md — but their pages are NOT built
  // yet, which is why they are absent from DEFAULT_MODULES_BY_TYPE.POS below.
  // Nothing links to a page that does not exist; switching one of these on
  // from the admin matrix today would produce a dead nav item, hence the
  // warning in each description.
  { key: "posStock", label: "Stock", href: "/provider/till/stock", icon: "Boxes", group: "till", description: "Stock on hand, receipts, counts and losses — NOT BUILT YET" },
  { key: "posShifts", label: "Cash Shifts", href: "/provider/till/shifts", icon: "Clock", group: "till", description: "Open and close the drawer, and reconcile the cash — NOT BUILT YET" },
  { key: "posReports", label: "Till Reports", href: "/provider/till/reports", icon: "BarChart3", group: "till", description: "Takings by day, by cashier and by product — NOT BUILT YET" },
  { key: "posDevices", label: "Devices & Download", href: "/provider/till/devices", icon: "MonitorDown", group: "till", description: "Install the till on a counter machine, revoke a lost device — NOT BUILT YET" },

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
  // A counter. Note what is ABSENT: no shopOrders, no shopSuppliers, no
  // shopShowcase, no offers-driven Sales page, no delivery. A POS-only shop
  // is not listed on SAJI, so a module that only makes sense to a listed
  // shop would be a dead page. It does get Products & Stock, because the
  // till needs a catalogue, and the full till group.
  POS: [
    // Only pages that exist. posStock, posShifts, posReports and posDevices
    // join this list as they are built; until then a POS account's nav
    // contains no link that 404s.
    "till", "posSettings",
    "shopProducts", "shopCustomers", "shopEarnings", "invoices", "clients",
    "proDashboard", "proPlan",
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

// ---------------------------------------------------------------------------
// Which business types may be held together
// ---------------------------------------------------------------------------

/**
 * POS is the first business type in SAJI that is EXCLUSIVE rather than
 * additive.
 *
 * Every other type composes freely — a plumber who also tutors is a normal
 * account, and the portal simply shows both module sets. POS does not
 * compose, for a reason that is commercial rather than technical:
 *
 *   A till is a tool the shopkeeper runs on their own counter. "Sell
 *   Products" is a listing customers browse. Those two can share one stock
 *   figure, and that is the upgrade path worth selling. But a plumber with a
 *   till is not a shop with a side trade — it is two unrelated businesses
 *   wearing one login, and every report, every stock figure and every day's
 *   takings becomes ambiguous.
 *
 * So: POS alone, or POS with PRODUCTS. Nothing else alongside it.
 *
 * This is enforced in three places and must agree in all of them: the
 * picker dims what it cannot offer (and says why), the signup action
 * validates the whole set rather than each value, and requestProCapability
 * validates the set the account WOULD hold afterwards. A picker that only
 * dims is a suggestion, not a rule.
 */
export const POS_COMPATIBLE_TYPES: ProBusinessType[] = ["PRODUCTS"]

export type CombinationVerdict =
  | { ok: true }
  | { ok: false; reason: string; conflicting: ProBusinessType[] }

/**
 * Is this the complete, final set of business types for one account?
 *
 * Takes the WHOLE set, not a single value — the rule is about combinations,
 * so it cannot be expressed as a per-value check. Order and duplicates are
 * irrelevant.
 */
export function isAllowedCombination(types: readonly ProBusinessType[]): CombinationVerdict {
  const set = new Set(types)
  if (set.size === 0) {
    return { ok: false, reason: "Choose at least one thing you do.", conflicting: [] }
  }
  if (!set.has("POS")) return { ok: true }

  const conflicting = PRO_BUSINESS_TYPES.filter(
    (t) => t !== "POS" && set.has(t) && !POS_COMPATIBLE_TYPES.includes(t),
  )
  if (conflicting.length === 0) return { ok: true }

  const names = conflicting.map((t) => PRO_BUSINESS_TYPE_META[t].label)
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  return {
    ok: false,
    reason:
      `A till can be run on its own, or alongside ${PRO_BUSINESS_TYPE_META.PRODUCTS.label} ` +
      `so the same stock also sells on SAJI. It cannot be combined with ${list}.`,
    conflicting,
  }
}

/**
 * For the picker: may this type be added to what is already ticked, and if
 * not, what should the tooltip say?
 *
 * Deliberately returns a reason for every refusal. A control that is dimmed
 * with no explanation reads as a bug, and in this case the explanation is
 * also the sales pitch for the one combination that IS allowed.
 */
export function isTypeSelectable(
  type: ProBusinessType,
  selected: readonly ProBusinessType[],
): { selectable: boolean; reason: string | null } {
  // Already ticked: always un-tickable, or nothing could be undone.
  if (selected.includes(type)) return { selectable: true, reason: null }

  const verdict = isAllowedCombination([...selected, type])
  if (verdict.ok) return { selectable: true, reason: null }

  // Phrase it from the perspective of the control being dimmed, which is not
  // necessarily the one that caused the conflict.
  if (type === "POS") {
    return {
      selectable: false,
      reason:
        `A till cannot be combined with ${verdict.conflicting.map((t) => PRO_BUSINESS_TYPE_META[t].label).join(", ")}. ` +
        `Untick those to run a till, or add the till later from My Business.`,
    }
  }
  return {
    selectable: false,
    reason: `${PRO_BUSINESS_TYPE_META[type].label} cannot be combined with ${PRO_BUSINESS_TYPE_META.POS.label}.`,
  }
}

/** Does this set of types mean "run a till"? */
export function hasPos(types: readonly ProBusinessType[]): boolean {
  return types.includes("POS")
}

/**
 * A POS account that did NOT also tick Sell Products has no storefront.
 * Used to default ShopkeeperProfile.listedOnMarketplace at signup, and to
 * decide whether marketplace-only modules are worth showing at all.
 */
export function shouldListOnMarketplace(types: readonly ProBusinessType[]): boolean {
  if (!types.includes("POS")) return true
  return types.includes("PRODUCTS")
}
