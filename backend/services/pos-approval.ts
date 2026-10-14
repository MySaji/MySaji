import bcrypt from "bcryptjs"
import { db } from "@/backend/db"

/**
 * Asking a second person before something expensive happens.
 *
 * WHY THRESHOLDS RATHER THAN SWITCHES
 *
 * Requiring a manager for every discount sounds like control and is the
 * opposite. A cashier knocking ten shillings off a dented tin cannot wait for
 * anybody, so a shop with that rule either turns it off entirely or starts
 * sharing the manager's PIN around the counter. Both leave it with less
 * control than it had before. A threshold asks only where the amount is worth
 * asking about, which is the only version a counter keeps using.
 *
 * WHY IT IS SKIPPED WHEN THERE ARE NO MANAGERS
 *
 * A one-person duka is its own manager. A rule that is on by default must not
 * lock somebody out of correcting their own mistake, so the check only binds
 * where there is actually a second person to ask. This mirrors what the void
 * path has always done.
 */

export type ApprovalOutcome =
  | { ok: true; approvedBy: string | null; wasRequired: boolean }
  | { ok: false; error: string }

/**
 * Two readings of an unset threshold, deliberately named apart.
 *
 * They are opposite because what they are attached to is opposite, and a
 * single shared helper would have to pick one and silently weaken the other.
 *
 * Voids already had an all-or-nothing switch that defaulted to ON. If an
 * unset threshold meant "never ask", adding this field would have quietly
 * turned that control off for every existing shop. So beside a switch, unset
 * means "always", and the switch decides whether to ask at all.
 *
 * Discounts had no control of any kind. If an unset threshold meant "always
 * ask", adding this field would have started demanding a manager for every
 * ten-shilling knock-off in every shop in the country. So on its own, unset
 * means "off".
 */

/** Beside an on/off switch. Unset means always, once the switch is on. */
export function aboveThresholdOrAlways(threshold: number | null | undefined, amount: number): boolean {
  if (threshold === null || threshold === undefined) return true
  return amount > threshold
}

/** On its own. Unset means the control is off. */
export function aboveThresholdOrNever(threshold: number | null | undefined, amount: number): boolean {
  if (threshold === null || threshold === undefined) return false
  return amount > threshold
}

/**
 * Check a manager's PIN, where one is needed.
 *
 * `required` is the caller's decision (it knows the amount and the setting);
 * this resolves who, if anyone, can approve and whether the PIN given is one
 * of theirs.
 */
export async function approveWithManagerPin(input: {
  shopkeeperId: string
  required: boolean
  pin?: string | null
  /** What is being approved, for the message the cashier reads. */
  what: string
}): Promise<ApprovalOutcome> {
  if (!input.required) return { ok: true, approvedBy: null, wasRequired: false }

  const managers = await db.posCashier.findMany({
    where: { shopkeeperId: input.shopkeeperId, isActive: true, role: "manager" },
    select: { name: true, pinHash: true },
  })
  // Nobody to ask. See the note at the top: this is a one-person shop, and
  // refusing here would simply stop it working.
  if (managers.length === 0) return { ok: true, approvedBy: null, wasRequired: false }

  if (!input.pin) {
    return { ok: false, error: "A manager has to approve " + input.what + ". Ask one to enter their PIN." }
  }

  for (const m of managers) {
    if (await bcrypt.compare(input.pin, m.pinHash)) {
      return { ok: true, approvedBy: m.name, wasRequired: true }
    }
  }
  return { ok: false, error: "That is not a manager PIN for this till." }
}
