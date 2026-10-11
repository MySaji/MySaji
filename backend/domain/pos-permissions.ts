/**
 * Who may do what in a POS business.
 *
 * WHY A MATRIX AND NOT A RANK
 *
 * The tempting shape is a number per role, with higher numbers allowed more.
 * It is wrong here, and wrong in a way that matters: an accountant sees every
 * figure in the business and must never touch the till; a stock controller
 * handles goods all day and must never be near the drawer. Neither outranks
 * the other, and any single ordering puts one of them somewhere false.
 *
 * So each permission names the roles that hold it, and roles that need
 * everything say so.
 *
 * WHY THE SEPARATIONS ARE WHERE THEY ARE
 *
 * The two that look restrictive are the point of the whole file:
 *
 *   A cashier cannot see takings.  Otherwise the person handling cash can
 *   watch the figure they are being measured against, and quietly keep it
 *   where it should be.
 *
 *   An accountant cannot sell.  Approving your own figures is the oldest
 *   problem in bookkeeping, and it is cheap to prevent here.
 *
 * This module is pure. It is imported by the server to DECIDE and by the
 * screen to decide what to SHOW, and the screen deciding is never the
 * check that counts.
 */

export const POS_ROLES = ["OWNER", "MANAGER", "CASHIER", "STOCK_CONTROLLER", "ACCOUNTANT"] as const
export type PosRole = (typeof POS_ROLES)[number]

export const POS_ROLE_META: Record<PosRole, { label: string; description: string }> = {
  OWNER: {
    label: "Owner",
    description: "Everything, including business settings, staff and closing the business.",
  },
  MANAGER: {
    label: "Manager",
    description: "Runs the shop day to day: till, stock, buying, refunds and reports.",
  },
  CASHIER: {
    label: "Cashier",
    description: "The till, and looking up stock to answer a customer.",
  },
  STOCK_CONTROLLER: {
    label: "Stock controller",
    description: "Goods in, stock counts and suppliers. Not the till or the takings.",
  },
  ACCOUNTANT: {
    label: "Accountant",
    description: "The money and the reports. Cannot sell or change stock.",
  },
}

/**
 * Every distinct thing a person can be allowed to do.
 *
 * Named after the act, not the screen: screens get merged and split, and a
 * permission that follows them stops meaning anything.
 */
export const POS_PERMISSIONS = [
  // the counter
  "till.sell",
  "till.void",
  "till.refund",
  "till.discount",
  "till.open_shift",
  "till.close_shift",
  // goods
  "stock.view",
  "stock.adjust",
  "stock.count",
  "stock.receive",
  "stock.write_off",
  "product.view",
  "product.create",
  "product.edit",
  "product.price",
  // buying
  "supplier.view",
  "supplier.manage",
  "purchase.view",
  "purchase.create",
  "purchase.approve",
  // money
  "report.sales",
  "report.margin",
  "report.stock",
  "expense.view",
  "expense.manage",
  "payment.settings",
  // people and the business
  "staff.view",
  "staff.manage",
  "device.manage",
  "settings.store",
  "settings.business",
  "audit.view",
] as const

export type PosPermission = (typeof POS_PERMISSIONS)[number]

const ALL: PosPermission[] = [...POS_PERMISSIONS]

const MANAGER: PosPermission[] = [
  "till.sell", "till.void", "till.refund", "till.discount", "till.open_shift", "till.close_shift",
  "stock.view", "stock.adjust", "stock.count", "stock.receive", "stock.write_off",
  "product.view", "product.create", "product.edit", "product.price",
  "supplier.view", "supplier.manage",
  "purchase.view", "purchase.create", "purchase.approve",
  "report.sales", "report.margin", "report.stock",
  "expense.view", "expense.manage",
  "staff.view", "staff.manage", "device.manage",
  "settings.store", "audit.view",
]

const CASHIER: PosPermission[] = [
  "till.sell",
  "till.open_shift", "till.close_shift",
  // Looking up what is on the shelf is most of answering a customer.
  "stock.view", "product.view",
  // Deliberately absent: till.void, till.discount, till.refund, every report,
  // and anything that writes. A cashier who can void and cannot be seen
  // voiding is the commonest way a till leaks money.
]

const STOCK_CONTROLLER: PosPermission[] = [
  "stock.view", "stock.adjust", "stock.count", "stock.receive", "stock.write_off",
  "product.view", "product.create", "product.edit",
  "supplier.view", "supplier.manage",
  "purchase.view", "purchase.create",
  "report.stock",
  // Not product.price: what a thing costs the shop is theirs, what it sells
  // for is a decision about margin.
  // Not till.*: they handle goods, not the drawer.
]

const ACCOUNTANT: PosPermission[] = [
  "report.sales", "report.margin", "report.stock",
  "expense.view", "expense.manage",
  "purchase.view",
  "stock.view", "product.view",
  "payment.settings",
  "audit.view",
  // Not till.*: see the note at the top.
]

export const POS_ROLE_PERMISSIONS: Record<PosRole, readonly PosPermission[]> = {
  OWNER: ALL,
  MANAGER: MANAGER,
  CASHIER: CASHIER,
  STOCK_CONTROLLER: STOCK_CONTROLLER,
  ACCOUNTANT: ACCOUNTANT,
}

export function roleCan(role: PosRole, permission: PosPermission): boolean {
  return POS_ROLE_PERMISSIONS[role].includes(permission)
}

/** Every permission a role holds, for showing a person what their role means. */
export function permissionsFor(role: PosRole): readonly PosPermission[] {
  return POS_ROLE_PERMISSIONS[role]
}

/**
 * Which roles a given role may hand out.
 *
 * An owner may appoint anyone including another owner. A manager may appoint
 * the floor roles but NOT another manager and never an owner, because a role
 * that can promote its equals can be used to lock the owner out of their own
 * business in two moves.
 */
export function assignableRoles(by: PosRole): readonly PosRole[] {
  if (by === "OWNER") return POS_ROLES
  if (by === "MANAGER") return ["CASHIER", "STOCK_CONTROLLER", "ACCOUNTANT"]
  return []
}

/** Plain words for a refusal, so a screen never has to invent one. */
export function refusalFor(permission: PosPermission, role: PosRole): string {
  const who = POS_ROLE_META[role].label.toLowerCase()
  const WORDS: Partial<Record<PosPermission, string>> = {
    "till.void": "Voiding a sale is not something a " + who + " can do. Ask a manager.",
    "till.refund": "Refunds need a manager.",
    "till.discount": "Changing a price is not something a " + who + " can do.",
    "till.sell": "This account is not set up to use the till.",
    "report.sales": "Takings are not shown to a " + who + ".",
    "report.margin": "Margins are not shown to a " + who + ".",
    "staff.manage": "Only an owner or a manager can change who works here.",
    "settings.business": "Only the owner can change the business settings.",
    "payment.settings": "Only the owner or the accountant can change payment settings.",
    "stock.receive": "Receiving goods is not something a " + who + " can do.",
    "purchase.approve": "Approving an order needs a manager.",
  }
  return WORDS[permission] ?? "A " + who + " cannot do that."
}
