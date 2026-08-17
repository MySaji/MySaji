"use server"

import crypto from "crypto"
import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { sendEmail } from "@/lib/email"
import { wrapEmailLayout, emailButton, siteOrigin } from "@/lib/email-templates"
import { notifyUser } from "@/lib/actions/notify"

export type HouseholdRole = "OWNER" | "MEMBER" | "PROPERTY_MANAGER" | "PAYMENT_APPROVER"
export type HouseholdActionResult = { success: true } | { success: false; error: string }

const HOUSEHOLD_ROLE_LABEL: Record<HouseholdRole, string> = {
  OWNER: "Owner",
  MEMBER: "Member",
  PROPERTY_MANAGER: "Property Manager",
  PAYMENT_APPROVER: "Payment Approver",
}

function householdInviteUrl(token: string): string {
  return `${siteOrigin()}/customer/household/invite/${token}`
}

async function findMyHousehold(userId: string) {
  const owned = await db.household.findUnique({ where: { ownerUserId: userId } })
  if (owned) return { household: owned, role: "OWNER" as HouseholdRole }

  const membership = await db.householdMember.findUnique({ where: { userId } })
  if (membership) {
    const household = await db.household.findUnique({ where: { id: membership.householdId } })
    if (household) return { household, role: membership.role }
  }
  return null
}

const createSchema = z.object({ name: z.string().trim().min(1, "Give your household a name") })

export async function createHousehold(input: unknown): Promise<HouseholdActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existing = await findMyHousehold(session.user.id)
  if (existing) return { success: false, error: "You're already part of a household." }

  await db.household.create({ data: { ownerUserId: session.user.id, name: parsed.data.name } })
  return { success: true }
}

export type HouseholdMemberItem = { id: string; userId: string; name: string; email: string | null; role: HouseholdRole; joinedAt: string }
export type HouseholdInviteItem = { id: string; email: string | null; phone: string | null; role: HouseholdRole; expiresAt: string }

export type MyHousehold = {
  id: string
  name: string
  myRole: HouseholdRole
  isOwner: boolean
  members: HouseholdMemberItem[]
  invites: HouseholdInviteItem[]
} | null

export async function getMyHousehold(): Promise<MyHousehold> {
  const session = await auth()
  if (!session?.user?.id) return null

  const found = await findMyHousehold(session.user.id)
  if (!found) return null

  const memberRows = await db.householdMember.findMany({ where: { householdId: found.household.id }, orderBy: { joinedAt: "asc" } })
  const userIds = memberRows.map((m) => m.userId)
  const users = userIds.length > 0 ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : []
  const userById = new Map(users.map((u) => [u.id, u]))

  const isOwner = found.role === "OWNER"
  const invites = isOwner
    ? await db.householdInvite.findMany({ where: { householdId: found.household.id, status: "PENDING" }, orderBy: { createdAt: "desc" } })
    : []

  const ownerUser = await db.user.findUnique({ where: { id: found.household.ownerUserId }, select: { id: true, name: true, email: true } })

  return {
    id: found.household.id,
    name: found.household.name,
    myRole: found.role,
    isOwner,
    members: [
      ...(ownerUser ? [{ id: `owner-${ownerUser.id}`, userId: ownerUser.id, name: ownerUser.name, email: ownerUser.email, role: "OWNER" as HouseholdRole, joinedAt: "" }] : []),
      ...memberRows.map((m) => {
        const u = userById.get(m.userId)
        return { id: m.id, userId: m.userId, name: u?.name ?? "Member", email: u?.email ?? null, role: m.role, joinedAt: m.joinedAt.toISOString() }
      }),
    ],
    invites: invites.map((i) => ({ id: i.id, email: i.email, phone: i.phone, role: i.role, expiresAt: i.expiresAt.toISOString() })),
  }
}

const inviteSchema = z.object({
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  role: z.enum(["MEMBER", "PROPERTY_MANAGER", "PAYMENT_APPROVER"]),
}).refine((v) => v.email || v.phone, { message: "Enter an email or phone number" })

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000

export type InviteHouseholdResult =
  | { success: true; emailed: boolean; inviteUrl: string }
  | { success: false; error: string }

/**
 * Creates the invite row and, when an email was given, sends it right away
 * (real SMTP-gated, same as every other transactional email in this app —
 * see inviteStaffMember for the identical pattern). Previously this only
 * wrote the HouseholdInvite row and, for an email that already matched an
 * existing SAJI account, an in-app Notification — nothing was ever actually
 * emailed to the invitee, so anyone without the app already open (or
 * without an account at all yet) had no way to know they'd been invited.
 */
export async function inviteHouseholdMember(input: unknown): Promise<InviteHouseholdResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const household = await db.household.findUnique({ where: { ownerUserId: session.user.id } })
  if (!household) return { success: false, error: "Only the household owner can invite members." }

  const token = crypto.randomBytes(16).toString("hex")
  await db.householdInvite.create({
    data: { householdId: household.id, email: parsed.data.email || null, phone: parsed.data.phone || null, role: parsed.data.role, token, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  })
  const url = householdInviteUrl(token)

  let emailed = false
  if (parsed.data.email) {
    const inviter = await db.user.findUnique({ where: { id: session.user.id }, select: { name: true } })
    const existingUser = await db.user.findUnique({ where: { email: parsed.data.email } })
    if (existingUser) {
      await notifyUser({ userId: existingUser.id, title: "Household invite", message: `${inviter?.name ?? "Someone"} invited you to join their household on Saji.`, type: "SYSTEM", actionUrl: "/customer/household" })
    }

    const html = wrapEmailLayout({
      title: "You're invited to a household on SAJI",
      bodyHtml: `
        <p>${inviter?.name ?? "A SAJI customer"} has invited you to join <strong>${household.name}</strong> on SAJI as a <strong>${HOUSEHOLD_ROLE_LABEL[parsed.data.role]}</strong> — sharing service bookings and history.</p>
        <p>Click below to accept. This link expires in 7 days.</p>
        ${emailButton("Accept invite", url)}
        ${existingUser ? "" : "<p>Don't have a SAJI account yet? Sign up first, then open this link again to join.</p>"}
      `,
    })
    const result = await sendEmail({ to: parsed.data.email, subject: "You've been invited to a household on SAJI", html })
    emailed = result.sent
  }

  return { success: true, emailed, inviteUrl: url }
}

const tokenSchema = z.object({ token: z.string().trim().min(1) })

export type HouseholdInvitePreview =
  | { valid: true; householdName: string; inviterName: string; role: HouseholdRole; email: string | null; phone: string | null }
  | { valid: false; error: string }

/** Public (unauthenticated) lookup for the accept-invite page — the
 * invitee may not have a session yet, same reasoning as
 * getStaffInviteByToken. */
export async function getHouseholdInviteByToken(token: string): Promise<HouseholdInvitePreview> {
  const invite = await db.householdInvite.findUnique({ where: { token }, include: { household: true } })
  if (!invite) return { valid: false, error: "This invite link is invalid." }
  if (invite.status === "REVOKED") return { valid: false, error: "This invite has been revoked." }
  if (invite.status === "ACCEPTED") return { valid: false, error: "This invite has already been used." }
  if (invite.status === "EXPIRED" || invite.expiresAt < new Date()) return { valid: false, error: "This invite link has expired." }

  const owner = await db.user.findUnique({ where: { id: invite.household.ownerUserId }, select: { name: true } })
  return {
    valid: true,
    householdName: invite.household.name,
    inviterName: owner?.name ?? "A SAJI user",
    role: invite.role,
    email: invite.email,
    phone: invite.phone,
  }
}

export async function acceptHouseholdInvite(input: unknown): Promise<HouseholdActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = tokenSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const invite = await db.householdInvite.findUnique({ where: { token: parsed.data.token } })
  if (!invite || invite.status !== "PENDING") return { success: false, error: "This invite is no longer valid." }
  if (invite.expiresAt < new Date()) {
    await db.householdInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } })
    return { success: false, error: "This invite has expired." }
  }

  const alreadyIn = await findMyHousehold(session.user.id)
  if (alreadyIn) return { success: false, error: "You're already part of a household." }

  await db.$transaction([
    db.householdMember.create({ data: { householdId: invite.householdId, userId: session.user.id, role: invite.role } }),
    db.householdInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" } }),
  ])

  return { success: true }
}

const memberIdSchema = z.object({ memberId: z.string().trim().min(1) })

export async function removeHouseholdMember(input: unknown): Promise<HouseholdActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = memberIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const household = await db.household.findUnique({ where: { ownerUserId: session.user.id } })
  if (!household) return { success: false, error: "Only the household owner can remove members." }

  await db.householdMember.deleteMany({ where: { id: parsed.data.memberId, householdId: household.id } })
  return { success: true }
}

const updateRoleSchema = z.object({ memberId: z.string().trim().min(1), role: z.enum(["MEMBER", "PROPERTY_MANAGER", "PAYMENT_APPROVER"]) })

export async function updateHouseholdMemberRole(input: unknown): Promise<HouseholdActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = updateRoleSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const household = await db.household.findUnique({ where: { ownerUserId: session.user.id } })
  if (!household) return { success: false, error: "Only the household owner can change roles." }

  await db.householdMember.updateMany({ where: { id: parsed.data.memberId, householdId: household.id }, data: { role: parsed.data.role } })
  return { success: true }
}

export type HouseholdJobItem = { id: string; title: string; status: string; bookedByName: string; price: number; scheduledDate: string }

/** Shared booking/service history — any household member can view every
 * job booked by any other member, a real query expansion (not a synced
 * copy) over the same Job rows getCustomerJobs already reads. */
export async function getHouseholdJobs(): Promise<HouseholdJobItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const found = await findMyHousehold(session.user.id)
  if (!found) return []

  const memberRows = await db.householdMember.findMany({ where: { householdId: found.household.id }, select: { userId: true } })
  const customerIds = [found.household.ownerUserId, ...memberRows.map((m) => m.userId)]

  const jobs = await db.job.findMany({
    where: { customerId: { in: customerIds } },
    orderBy: { scheduledDate: "desc" },
    take: 50,
    include: { customer: { select: { name: true } } },
  })

  return jobs.map((j) => ({ id: j.id, title: j.title, status: j.status, bookedByName: j.customer.name, price: Number(j.price), scheduledDate: j.scheduledDate.toISOString() }))
}

/** Real permission check other code can call before letting a household
 * member approve a shared payment — not currently wired into the core
 * /api/payments/initiate route (that route is shared by every payment flow
 * in this app; retrofitting a household gate into it is a larger, separate
 * change), so today this is enforced only where explicitly checked, not
 * automatically on every payment a household member makes. */
export async function householdMemberCanApprovePayments(userId: string): Promise<boolean> {
  const found = await findMyHousehold(userId)
  if (!found) return false
  return found.role === "OWNER" || found.role === "PAYMENT_APPROVER"
}
