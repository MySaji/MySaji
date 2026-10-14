"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/actions/pos-access"
import {
  POS_PERMISSIONS, POS_ROLES, POS_ROLE_META, POS_ROLE_PERMISSIONS,
  type PosPermission, type PosRole,
} from "@/backend/domain/pos-permissions"

/**
 * The people who work in the business, and exactly what each may open.
 *
 * NOT THE SAME THING AS /pos/people
 *
 * That page manages counter PINs: who is standing at the till right now, so a
 * sale has a name on it. This manages SEATS: people with their own sign-in,
 * their own portal, and their own set of features. A shop can have both, one,
 * or neither, and conflating them was why an owner could add a cashier PIN
 * but had no way to give anybody a login.
 *
 * WHY FEATURES REPLACE THE ROLE RATHER THAN ADDING TO IT
 *
 * An empty list means "whatever the role says", which is what almost every
 * seat wants: an owner adding a cashier should not tick twelve boxes to get
 * the obvious answer. The moment the owner changes anything, the list becomes
 * the whole truth. The alternative, a role plus extras minus exceptions, is
 * impossible to read off a screen and impossible to reason about six months
 * later when somebody asks why a stock controller can see takings.
 *
 * WHY THERE IS NO INVITE CODE
 *
 * The owner enters the email or phone the person already uses. The seat waits
 * unclaimed until somebody signs in to the POS with that address, and is
 * claimed then (see resolvePosActor). Nothing is granted to an address the
 * owner did not name, and there is no code to lose or forward to the wrong
 * person.
 */

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  return { ok: true as const, actor: g.actor }
}

export type TeamMemberRow = {
  id: string
  name: string
  role: PosRole
  roleLabel: string
  email: string | null
  phone: string | null
  storeId: string | null
  isActive: boolean
  /** Null until they have signed in and the seat was matched to them. */
  claimedAt: string | null
  /** True when the owner has set this seat's features by hand. */
  customised: boolean
  /** What this person can actually open, after any overrides. */
  features: PosPermission[]
  isOwnerSeat: boolean
}

export type TeamView = {
  members: TeamMemberRow[]
  /** Every feature that can be granted, grouped for a screen. */
  catalogue: { group: string; items: { key: PosPermission; label: string }[] }[]
  roles: { key: PosRole; label: string; description: string; features: PosPermission[] }[]
  stores: { id: string; name: string }[]
}

/**
 * Every permission, in words an owner recognises and grouped the way a shop
 * is actually run. The keys are the contract; these labels are not, and are
 * deliberately not derived from the key, because "till.cash_in_out" is not a
 * sentence anybody wants to read on a settings page.
 */
const FEATURE_LABEL: Record<PosPermission, { group: string; label: string }> = {
  "till.sell": { group: "The counter", label: "Ring up sales" },
  "till.void": { group: "The counter", label: "Void a sale" },
  "till.refund": { group: "The counter", label: "Give refunds" },
  "till.discount": { group: "The counter", label: "Give discounts" },
  "till.open_shift": { group: "The counter", label: "Open a shift" },
  "till.close_shift": { group: "The counter", label: "Close and count the drawer" },
  "till.cash_in_out": { group: "The counter", label: "Take money in or out of the drawer" },

  "stock.view": { group: "Stock", label: "See what is in stock" },
  "stock.adjust": { group: "Stock", label: "Adjust stock" },
  "stock.count": { group: "Stock", label: "Count the shelves" },
  "stock.count_approve": { group: "Stock", label: "Approve what a count found" },
  "stock.receive": { group: "Stock", label: "Receive deliveries" },
  "stock.write_off": { group: "Stock", label: "Write off damage and loss" },

  "product.view": { group: "Products", label: "See the catalogue" },
  "product.create": { group: "Products", label: "Add products" },
  "product.edit": { group: "Products", label: "Edit products" },
  "product.price": { group: "Products", label: "Set prices and offers" },

  "supplier.view": { group: "Buying", label: "See suppliers" },
  "supplier.manage": { group: "Buying", label: "Manage suppliers" },
  "purchase.view": { group: "Buying", label: "See purchase orders" },
  "purchase.create": { group: "Buying", label: "Raise purchase orders" },
  "purchase.approve": { group: "Buying", label: "Approve purchase orders" },

  "report.sales": { group: "Money", label: "See takings" },
  "report.margin": { group: "Money", label: "See profit and cost prices" },
  "report.stock": { group: "Money", label: "See stock reports" },
  "expense.view": { group: "Money", label: "See expenses" },
  "expense.manage": { group: "Money", label: "Record expenses" },
  "payment.settings": { group: "Money", label: "Change payment and credit settings" },

  "staff.view": { group: "The business", label: "See the team" },
  "staff.manage": { group: "The business", label: "Add and remove people" },
  "device.manage": { group: "The business", label: "Manage tills and devices" },
  "settings.store": { group: "The business", label: "Change shop settings" },
  "settings.business": { group: "The business", label: "Change business settings and billing" },
  "audit.view": { group: "The business", label: "See the audit history" },
}

const GROUP_ORDER = ["The counter", "Stock", "Products", "Buying", "Money", "The business"]

export async function getTeam(staffId?: string | null): Promise<TeamView | null> {
  const g = await gate("staff.view", staffId)
  if (!g.ok) return null

  const [members, stores] = await Promise.all([
    db.posStaff.findMany({
      where: { businessId: g.actor.businessId },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    }),
    db.posStore.findMany({
      where: { businessId: g.actor.businessId, isActive: true },
      select: { id: true, name: true },
    }),
  ])

  const business = await db.posBusiness.findUnique({
    where: { id: g.actor.businessId },
    select: { ownerUserId: true },
  })

  const catalogue = GROUP_ORDER.map((group) => ({
    group,
    items: POS_PERMISSIONS
      .filter((k) => FEATURE_LABEL[k].group === group)
      .map((k) => ({ key: k, label: FEATURE_LABEL[k].label })),
  })).filter((g2) => g2.items.length > 0)

  return {
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role as PosRole,
      roleLabel: POS_ROLE_META[m.role as PosRole].label,
      email: m.email,
      phone: m.phone,
      storeId: m.storeId,
      isActive: m.isActive,
      claimedAt: m.claimedAt?.toISOString() ?? null,
      customised: m.features.length > 0,
      features: (m.features.length > 0
        ? (m.features as PosPermission[])
        : [...POS_ROLE_PERMISSIONS[m.role as PosRole]]),
      isOwnerSeat: !!business && m.userId === business.ownerUserId,
    })),
    catalogue,
    roles: POS_ROLES.map((r) => ({
      key: r,
      label: POS_ROLE_META[r].label,
      description: POS_ROLE_META[r].description,
      features: [...POS_ROLE_PERMISSIONS[r]],
    })),
    stores,
  }
}

export type TeamResult = { success: true; id: string } | { success: false; error: string }

const memberSchema = z.object({
  id: z.string().trim().optional().nullable(),
  name: z.string().trim().min(2, "What is their name?"),
  role: z.enum(POS_ROLES),
  email: z.string().trim().email("That email does not look right.").optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  storeId: z.string().trim().optional().nullable(),
  /** Empty means "use the role". */
  features: z.array(z.enum(POS_PERMISSIONS)).optional(),
  staffId: z.string().optional().nullable(),
})

export async function saveTeamMember(input: unknown): Promise<TeamResult> {
  const parsed = memberSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const d = parsed.data

  const g = await gate("staff.manage", d.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const email = (d.email || "").trim().toLowerCase() || null
  const phone = (d.phone || "").trim() || null
  // One of the two, or the seat can never be claimed and the person can never
  // sign in. Refused here rather than created as something that looks right
  // on screen and does nothing.
  if (!email && !phone) {
    return { success: false, error: "Add an email or a phone number, or they will have no way to sign in." }
  }

  if (d.storeId) {
    const owned = await db.posStore.findFirst({
      where: { id: d.storeId, businessId: g.actor.businessId },
      select: { id: true },
    })
    if (!owned) return { success: false, error: "That branch is not part of this business." }
  }

  const clash = await db.posStaff.findFirst({
    where: {
      businessId: g.actor.businessId,
      id: d.id ? { not: d.id } : undefined,
      OR: [
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    },
    select: { name: true },
  })
  if (clash) {
    return { success: false, error: clash.name + " already has a seat with that email or phone." }
  }

  const data = {
    name: d.name,
    role: d.role,
    email,
    phone,
    storeId: d.storeId || null,
    features: d.features ?? [],
  }

  if (d.id) {
    const existing = await db.posStaff.findFirst({
      where: { id: d.id, businessId: g.actor.businessId },
      select: { id: true, userId: true },
    })
    if (!existing) return { success: false, error: "That person was not found." }

    const business = await db.posBusiness.findUnique({
      where: { id: g.actor.businessId },
      select: { ownerUserId: true },
    })
    // The owner cannot demote themselves out of their own business. There
    // would be nobody left who could put it back.
    if (business && existing.userId === business.ownerUserId && d.role !== "OWNER") {
      return { success: false, error: "You cannot change your own role. Ask another owner to do it." }
    }

    await db.posStaff.update({ where: { id: d.id }, data })
    await recordPosAudit({
      actor: g.actor,
      action: "team.update",
      entityType: "pos_staff",
      entityId: d.id,
      summary: "Updated " + d.name + " (" + POS_ROLE_META[d.role].label + ")" +
        (data.features.length > 0 ? " with " + data.features.length + " features set by hand" : ""),
    })
    return { success: true, id: d.id }
  }

  const created = await db.posStaff.create({
    data: { ...data, businessId: g.actor.businessId, invitedAt: new Date() },
    select: { id: true },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "team.invite",
    entityType: "pos_staff",
    entityId: created.id,
    summary: "Added " + d.name + " as " + POS_ROLE_META[d.role].label +
      " (" + (email ?? phone) + ")",
  })

  return { success: true, id: created.id }
}

export async function setTeamMemberActive(
  input: { id: string; isActive: boolean; staffId?: string | null },
): Promise<TeamResult> {
  const g = await gate("staff.manage", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const member = await db.posStaff.findFirst({
    where: { id: input.id, businessId: g.actor.businessId },
    select: { id: true, name: true, userId: true },
  })
  if (!member) return { success: false, error: "That person was not found." }

  const business = await db.posBusiness.findUnique({
    where: { id: g.actor.businessId },
    select: { ownerUserId: true },
  })
  // Locking yourself out of your own till is not a thing anybody means to do.
  if (business && member.userId === business.ownerUserId && !input.isActive) {
    return { success: false, error: "You cannot switch off your own access." }
  }

  await db.posStaff.update({ where: { id: input.id }, data: { isActive: input.isActive } })

  await recordPosAudit({
    actor: g.actor,
    action: input.isActive ? "team.enable" : "team.disable",
    entityType: "pos_staff",
    entityId: input.id,
    summary: (input.isActive ? "Restored access for " : "Removed access for ") + member.name,
  })

  return { success: true, id: input.id }
}
