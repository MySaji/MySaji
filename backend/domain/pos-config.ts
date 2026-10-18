/**
 * The shape of ShopkeeperProfile.posConfig, and the rules for reading it.
 *
 * Plain module, no server imports — the till settings page is a client
 * component and the server actions validate against the same schema, so
 * neither side can drift from the other.
 *
 * Everything here is a till preference that is not worth a database column
 * of its own: it is read whole, written whole, and never queried on. Anything
 * that a query must filter by (posEnabled, posProfileKey) is a real column.
 */

import { z } from "zod"
import { POS_UNITS } from "./pos-traits"

/**
 * What a till does when a sale would take stock below zero.
 *
 * This has to be an explicit choice rather than a default, because both
 * answers are correct for real shops and the wrong one is damaging either
 * way. A supermarket wants BLOCK: if the system says zero, something is
 * wrong and selling anyway buries the discrepancy. A butchery wants ALLOW:
 * the meat is visibly on the counter, the ledger is merely behind, and a
 * till that refuses to sell what the customer is holding is a till the
 * shopkeeper stops using.
 */
export const NEGATIVE_STOCK_POLICIES = ["BLOCK", "WARN", "ALLOW"] as const
export type NegativeStockPolicy = (typeof NEGATIVE_STOCK_POLICIES)[number]

/**
 * What a till does when the only stock left has expired.
 *
 * BLOCK by default, which is the opposite of the negative-stock default and
 * deliberately so. Selling past an expiry date is not an inconvenience for a
 * pharmacy or an agrovet, it is a licensing and safety matter, and the right
 * default is the one that refuses. A grocer who wants to sell day-old bread
 * can move it to WARN.
 */
export const EXPIRED_STOCK_POLICIES = ["BLOCK", "WARN", "ALLOW"] as const
export type ExpiredStockPolicy = (typeof EXPIRED_STOCK_POLICIES)[number]

export const EXPIRED_STOCK_POLICY_LABEL: Record<ExpiredStockPolicy, string> = {
  BLOCK: "Refuse to sell it",
  WARN: "Warn the cashier, but allow it",
  ALLOW: "Allow it silently",
}

export const posConfigSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour, such as #2563eb").default("#2563eb"),
  /** Printed at the top of the receipt. Defaults to the shop name. */
  receiptHeader: z.string().trim().max(200).optional(),
  receiptFooter: z.string().trim().max(300).optional(),
  /** Shown on the receipt where a tax number belongs. Not a tax calculation. */
  taxPin: z.string().trim().max(40).optional(),

  negativeStock: z.enum(NEGATIVE_STOCK_POLICIES).default("WARN"),

  expiredStock: z.enum(EXPIRED_STOCK_POLICIES).default("BLOCK"),
  /**
   * How many days ahead counts as "expiring soon" on the stock page.
   * Thirty by default: long enough to return goods to a supplier, short
   * enough that the list is not everything in the shop.
   */
  expiryWarningDays: z.number().int().min(0).max(365).default(30),

  /**
   * Round the payable total to the nearest this many shillings. Kenya has no
   * coin below 1/-, and many shops round to 5/-. Zero means no rounding.
   */
  cashRounding: z.number().min(0).max(100).default(0),

  /** Which unit a new product defaults to. Seeded from the shop profile. */
  defaultUnit: z.enum(POS_UNITS).default("piece"),

  /** Require a cashier PIN before each sale, not just at shift start. */
  requirePinPerSale: z.boolean().default(false),
  /** Only a manager PIN may void a completed sale. */
  managerPinToVoid: z.boolean().default(true),

  /**
   * Approval thresholds, in shillings.
   *
   * Null means never ask. A number means ask once the amount goes above it.
   *
   * WHY A THRESHOLD AND NOT A SWITCH
   *
   * Requiring a manager for every discount sounds like control and is the
   * opposite: a cashier knocking ten shillings off a dented tin cannot wait
   * for anybody, so the shop either turns the rule off entirely or starts
   * sharing the manager's PIN. Both leave it with less control than before.
   * A threshold asks only where the amount is worth asking about, which is
   * the only version a counter will actually keep using.
   */
  discountApprovalAbove: z.number().min(0).nullable().default(null),
  voidApprovalAbove: z.number().min(0).nullable().default(null),
  refundApprovalAbove: z.number().min(0).nullable().default(null),

  /**
   * Configured single VAT rate for the Till. These calculations and receipt
   * amounts are separate from eTIMS signing and verification.
   */
  taxRate: z.number().min(0).max(100).default(0),
  taxInclusive: z.boolean().default(true),

  /**
   * Points for shopping here, the way a Kenyan supermarket does it.
   *
   * Two rates, kept separate because they answer different questions and
   * shops set them independently:
   *
   *   loyaltyPointsPerHundred  how fast points are earned
   *   loyaltyShillingsPerPoint what a point is worth when spent
   *
   * The defaults give 1 point per KES 100 and 1 shilling per point, which
   * is a 1% reward. A shop wanting 2% raises the earn rate rather than the
   * redemption value, because customers compare "points per hundred" and
   * quietly notice when a point buys less than it used to.
   */
  loyaltyEnabled: z.boolean().default(false),
  loyaltyPointsPerHundred: z.number().min(0).max(100).default(1),
  loyaltyShillingsPerPoint: z.number().min(0).max(1000).default(1),
  /**
   * Fewest points that may be spent at once.
   *
   * Not meanness: redeeming three points for three shillings costs a
   * cashier more time than the discount is worth, and a queue forms.
   */
  loyaltyMinRedeem: z.number().int().min(0).max(100000).default(50),
})

export type PosConfig = z.infer<typeof posConfigSchema>

/**
 * Read a posConfig column safely.
 *
 * Json columns are the one place a schema cannot protect you: the row may
 * have been written by an older build, by a migration, or by hand. Parsing
 * with defaults means a malformed or partial object degrades to sensible
 * behaviour rather than throwing somewhere inside the till.
 */
export function parsePosConfig(raw: unknown, fallbackUnit?: string): PosConfig {
  const parsed = posConfigSchema.safeParse(raw ?? {})
  if (parsed.success) return parsed.data
  // Not an error worth surfacing to a cashier mid-sale; take the defaults.
  const defaults = posConfigSchema.parse({})
  if (fallbackUnit && (POS_UNITS as readonly string[]).includes(fallbackUnit)) {
    return { ...defaults, defaultUnit: fallbackUnit as PosConfig["defaultUnit"] }
  }
  return defaults
}

export const NEGATIVE_STOCK_POLICY_LABEL: Record<NegativeStockPolicy, string> = {
  BLOCK: "Refuse the sale",
  WARN: "Warn the cashier, but allow it",
  ALLOW: "Allow it silently",
}
