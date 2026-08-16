"use server"

import { z } from "zod"
import crypto from "crypto"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/password"
import { sendEmail } from "@/lib/email"
import { wrapEmailLayout, emailButton, siteOrigin } from "@/lib/email-templates"
import { distanceKm } from "@/lib/google-maps"
import { BUSINESS_STAFF_MAX_CONCURRENT_JOBS } from "@/lib/job-limits"

const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Thrown inside acceptStaffInvite's transaction (and caught right below
// it) when the guarded invite-status update affects zero rows — i.e.
// someone else already claimed this token.
const ALREADY_ACCEPTED = Symbol("staff-invite-already-accepted")

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

// ============================= BUSINESS ONBOARDING =============================

export type ProviderBusinessInfo = {
  isBusinessOwner: boolean
  registrationNumber: string | null
  hqAddress: string | null
  parentBusinessId: string | null
}

export async function getMyProviderBusinessInfo(): Promise<ProviderBusinessInfo | null> {
  const provider = await requireProvider()
  if (!provider) return null
  const profile = await db.providerProfile.findUnique({ where: { id: provider.providerId } })
  if (!profile) return null
  return {
    isBusinessOwner: profile.isBusinessOwner,
    registrationNumber: profile.registrationNumber,
    hqAddress: profile.hqAddress,
    parentBusinessId: profile.parentBusinessId,
  }
}

const businessOnboardingSchema = z.object({
  registrationNumber: z.string().trim().min(1, "Please enter your business registration number").max(60),
  hqAddress: z.string().trim().min(1, "Please enter your company HQ address").max(300),
})

export type ProviderBusinessActionResult = { success: true } | { success: false; error: string }

/**
 * Marks the signed-in provider as a Business (vs. Solo Pro) and records
 * the two fields the onboarding screen collects for that branch. Doesn't
 * touch KYC — that's submitBusinessPermitDocument, a separate step.
 *
 * Also the "Convert to Business Account" upgrade path (Step 5) — a solo
 * pro's dashboard-settings button calls this exact same action on an
 * already-live account. Zero data migration needed: existing Services,
 * Jobs, and reviews all stay tied to the same ProviderProfile.id, so
 * flipping isBusinessOwner is the entire "upgrade." A staff member
 * (parentBusinessId already set) can't also become a business owner of
 * their own account — keeps "which business does this profile belong to"
 * unambiguous.
 */
export async function completeBusinessOnboarding(input: unknown): Promise<ProviderBusinessActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = businessOnboardingSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existing = await db.providerProfile.findUnique({ where: { id: provider.providerId }, select: { parentBusinessId: true } })
  if (existing?.parentBusinessId) {
    return { success: false, error: "You're already staff on another business account, so this account can't also become a business." }
  }

  await db.providerProfile.update({
    where: { id: provider.providerId },
    data: {
      isBusinessOwner: true,
      registrationNumber: parsed.data.registrationNumber,
      hqAddress: parsed.data.hqAddress,
    },
  })
  return { success: true }
}

// ============================= STAFF INVITES =============================

export type StaffInviteListItem = {
  id: string
  email: string | null
  phone: string | null
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED"
  createdAt: string
  expiresAt: string
  inviteUrl: string
}

export type StaffMember = {
  id: string
  name: string
  email: string
  phone: string | null
  skills: string[]
  isActive: boolean
}

export type MyStaffResult = { staff: StaffMember[]; invites: StaffInviteListItem[] }

function inviteUrl(token: string): string {
  return `${siteOrigin()}/auth/staff-invite/${token}`
}

/** Business owner's own staff roster + any outstanding invites. Invites
 * past their expiry are surfaced as EXPIRED even though nothing has swept
 * the DB row yet (same lazy-expiry convention as VerificationToken checks
 * elsewhere — the status is computed at read time, not by a cron job). */
export async function getMyStaff(): Promise<MyStaffResult> {
  const provider = await requireProvider()
  if (!provider) return { staff: [], invites: [] }

  const [staffProfiles, invites] = await Promise.all([
    db.providerProfile.findMany({
      where: { parentBusinessId: provider.providerId },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    }),
    db.staffInvite.findMany({
      where: { businessId: provider.providerId },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const now = new Date()
  return {
    staff: staffProfiles.map((p) => ({
      id: p.id,
      name: p.user.name,
      email: p.user.email,
      phone: p.user.phone,
      skills: p.skills,
      isActive: p.user.isActive,
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      phone: i.phone,
      status: i.status === "PENDING" && i.expiresAt < now ? "EXPIRED" : i.status,
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
      inviteUrl: inviteUrl(i.token),
    })),
  }
}

const inviteStaffSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Please enter a valid email").optional().or(z.literal("")),
    phone: z
      .string()
      .trim()
      .regex(/^\+?\d{9,15}$/, "Please enter a valid phone number")
      .optional()
      .or(z.literal("")),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.phone), { message: "Enter an email or phone number to invite" })

export type InviteStaffResult =
  | { success: true; inviteUrl: string; emailed: boolean }
  | { success: false; error: string }

/**
 * Creates the invite row and, when an email was given, sends it right
 * away (real SMTP-gated, same as every other transactional email in this
 * app). Phone-only invites are NOT auto-texted — there's no general-
 * purpose SMS send in this codebase, only Infobip's PIN/2FA product used
 * for OTP — so the UI hands the owner a copyable link to share themselves
 * (WhatsApp, SMS, etc.) instead of pretending a text went out.
 */
export async function inviteStaffMember(input: unknown): Promise<InviteStaffResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const business = await db.providerProfile.findUnique({ where: { id: provider.providerId } })
  if (!business?.isBusinessOwner) {
    return { success: false, error: "Only a Business account can invite staff." }
  }

  const parsed = inviteStaffSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const email = parsed.data.email || null
  const phone = parsed.data.phone || null

  if (email) {
    const existingUser = await db.user.findUnique({ where: { email } })
    if (existingUser) return { success: false, error: "A SAJI account already exists with this email." }
  }
  if (phone) {
    const existingUser = await db.user.findUnique({ where: { phone } })
    if (existingUser) return { success: false, error: "A SAJI account already exists with this phone number." }
  }

  const token = crypto.randomBytes(24).toString("hex")
  const invite = await db.staffInvite.create({
    data: {
      businessId: provider.providerId,
      email,
      phone,
      token,
      expiresAt: new Date(Date.now() + STAFF_INVITE_TTL_MS),
    },
  })
  const url = inviteUrl(invite.token)

  let emailed = false
  if (email) {
    const html = wrapEmailLayout({
      title: "You're invited to join a business on SAJI",
      bodyHtml: `
        <p>${business.businessName || "A business"} has invited you to join their team on SAJI as a field provider.</p>
        <p>Click below to set up your account. This link expires in 7 days.</p>
        ${emailButton("Accept invite", url)}
      `,
    })
    const result = await sendEmail({ to: email, subject: "You've been invited to join a SAJI business team", html })
    emailed = result.sent
  }

  return { success: true, inviteUrl: url, emailed }
}

export async function revokeStaffInvite(input: unknown): Promise<ProviderBusinessActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = z.object({ id: z.string().trim().min(1) }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.staffInvite.updateMany({
    where: { id: parsed.data.id, businessId: provider.providerId, status: "PENDING" },
    data: { status: "REVOKED" },
  })
  return { success: true }
}

// ============================= ACCEPTING AN INVITE =============================

export type StaffInvitePreview =
  | { valid: true; businessName: string; email: string | null; phone: string | null }
  | { valid: false; error: string }

/** Public (unauthenticated) lookup for the accept-invite page — no session
 * required, since the whole point is this person doesn't have one yet. */
export async function getStaffInviteByToken(token: string): Promise<StaffInvitePreview> {
  const invite = await db.staffInvite.findUnique({ where: { token }, include: { business: true } })
  if (!invite) return { valid: false, error: "This invite link is invalid." }
  if (invite.status === "REVOKED") return { valid: false, error: "This invite has been revoked by the business." }
  if (invite.status === "ACCEPTED") return { valid: false, error: "This invite has already been used." }
  if (invite.expiresAt < new Date()) return { valid: false, error: "This invite link has expired." }

  return {
    valid: true,
    businessName: invite.business.businessName || "the business",
    email: invite.email,
    phone: invite.phone,
  }
}

const acceptInviteSchema = z.object({
  token: z.string().trim().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{9,15}$/, "Please enter a valid phone number"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
})

export type AcceptStaffInviteResult =
  | { success: true; userId: string }
  | { success: false; error: string }

/** Creates the staff member's own User + ProviderProfile (tagged via
 * parentBusinessId), mirroring registerUser's shape 1:1 so every other
 * provider-side feature (jobs, wallet, availability) works for staff
 * unchanged — the only difference is the business linkage and skipping
 * OTP proof, since owning this one-time invite link is the proof. */
export async function acceptStaffInvite(input: unknown): Promise<AcceptStaffInviteResult> {
  const parsed = acceptInviteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { token, name, email, phone, password } = parsed.data

  try {
    const invite = await db.staffInvite.findUnique({ where: { token } })
    if (!invite) return { success: false, error: "This invite link is invalid." }
    if (invite.status !== "PENDING") return { success: false, error: "This invite is no longer valid." }
    if (invite.expiresAt < new Date()) return { success: false, error: "This invite link has expired." }

    const existing = await db.user.findFirst({ where: { OR: [{ email }, { phone }] } })
    if (existing) return { success: false, error: "A user with this email or phone already exists." }

    const passwordHash = await hashPassword(password)

    const user = await db.$transaction(async (tx) => {
      // Guards the invite's status transition atomically — the plain check
      // above (invite.status !== "PENDING") happens before this
      // transaction starts, so without this a replayed or double-submitted
      // request on the same token could otherwise create two staff
      // accounts from one invite.
      const { count } = await tx.staffInvite.updateMany({
        where: { id: invite.id, status: "PENDING" },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      })
      if (count === 0) throw ALREADY_ACCEPTED

      const created = await tx.user.create({
        data: { name, email, phone, password: passwordHash, role: "PROVIDER", kycStatus: "PENDING" },
      })
      await tx.wallet.create({ data: { userId: created.id } })
      await tx.providerProfile.create({ data: { userId: created.id, parentBusinessId: invite.businessId } })
      await tx.staffInvite.update({ where: { id: invite.id }, data: { acceptedById: created.id } })
      return created
    }, { timeout: 60000, maxWait: 10000 })

    return { success: true, userId: user.id }
  } catch (err) {
    if (err === ALREADY_ACCEPTED) return { success: false, error: "This invite is no longer valid." }
    return { success: false, error: "Couldn't reach the server. Please check your connection and try again." }
  }
}

// ============================= BUSINESS DASHBOARD (DISPATCH) =============================

export type BusinessJobRequest = {
  id: string
  title: string
  customerName: string
  assignedProviderId: string
  assignedName: string
  scheduledDate: string
  location: string
  price: number
  urgency: string
}

export type BusinessTechnician = {
  providerId: string
  name: string
  isOwner: boolean
  isOnline: boolean
  latitude: number | null
  longitude: number | null
  activeJobCount: number
  atCapacity: boolean
}

export type BusinessDashboardResult =
  | { isBusinessOwner: true; autoAssignEnabled: boolean; allowStaffRequestResponses: boolean; requests: BusinessJobRequest[]; technicians: BusinessTechnician[] }
  | { isBusinessOwner: false }

/**
 * The Business Portal: incoming job requests across every staff member
 * (+ the owner's own bookings), a technician roster for the map, and — if
 * autoAssignEnabled — a lazy reconciliation pass that reassigns a PENDING
 * job away from a staffer who's offline or at the concurrent-job cap to
 * the nearest eligible teammate. Same "fix it up at read time" convention
 * StaffInvite's lazy expiry already uses, rather than a background job.
 */
export async function getBusinessDashboard(): Promise<BusinessDashboardResult> {
  const provider = await requireProvider()
  if (!provider) return { isBusinessOwner: false }

  const business = await db.providerProfile.findUnique({ where: { id: provider.providerId } })
  if (!business?.isBusinessOwner) return { isBusinessOwner: false }

  const staff = await db.providerProfile.findMany({
    where: { parentBusinessId: business.id },
    include: { user: true, availability: true },
  })
  const ownerAvailability = await db.providerAvailability.findUnique({ where: { providerId: business.id } })
  const ownerUser = await db.user.findUnique({ where: { id: provider.userId } })
  if (!ownerUser) return { isBusinessOwner: false }

  const allProviderIds = [business.id, ...staff.map((s) => s.id)]
  const nameByProviderId = new Map<string, string>([
    [business.id, business.businessName || ownerUser.name],
    ...staff.map((s): [string, string] => [s.id, s.user.name]),
  ])
  const availabilityByProviderId = new Map(staff.map((s): [string, typeof s.availability] => [s.id, s.availability]))
  availabilityByProviderId.set(business.id, ownerAvailability)

  const activeCountEntries = await Promise.all(
    allProviderIds.map(async (id) => [id, await db.job.count({ where: { providerId: id, status: { in: ["ACCEPTED", "IN_PROGRESS"] } } })] as const)
  )
  const activeCountByProvider = new Map(activeCountEntries)

  let pendingJobs = await db.job.findMany({
    where: { providerId: { in: allProviderIds }, status: "PENDING" },
    include: { customer: true },
    orderBy: { scheduledDate: "asc" },
  })

  if (business.autoAssignEnabled) {
    for (const job of pendingJobs) {
      if (!job.providerId || job.latitude == null || job.longitude == null) continue

      const currentAvailability = availabilityByProviderId.get(job.providerId)
      const currentActive = activeCountByProvider.get(job.providerId) ?? 0
      const currentOk = (currentAvailability?.isOnline ?? false) && currentActive < BUSINESS_STAFF_MAX_CONCURRENT_JOBS
      if (currentOk) continue

      let nearest: { providerId: string; distance: number } | null = null
      for (const candidateId of allProviderIds) {
        if (candidateId === job.providerId) continue
        const availability = availabilityByProviderId.get(candidateId)
        if (!availability?.isOnline || availability.lastKnownLatitude == null || availability.lastKnownLongitude == null) continue
        if ((activeCountByProvider.get(candidateId) ?? 0) >= BUSINESS_STAFF_MAX_CONCURRENT_JOBS) continue
        const distance = distanceKm(Number(job.latitude), Number(job.longitude), Number(availability.lastKnownLatitude), Number(availability.lastKnownLongitude))
        if (!nearest || distance < nearest.distance) nearest = { providerId: candidateId, distance }
      }

      if (nearest) {
        const previousProviderId = job.providerId
        await db.job.update({ where: { id: job.id }, data: { providerId: nearest.providerId } })
        job.providerId = nearest.providerId
        await db.notification.create({
          data: {
            userId: staff.find((s) => s.id === nearest!.providerId)?.userId ?? ownerUser.id,
            title: "Job assigned to you",
            message: `${job.title} was auto-assigned to you as the nearest available teammate.`,
            type: "JOB",
            relatedType: "JOB",
            relatedId: job.id,
            actionUrl: "/provider/jobs",
          },
        }).catch(() => {})
        const previousUserId = staff.find((s) => s.id === previousProviderId)?.userId ?? (previousProviderId === business.id ? ownerUser.id : null)
        if (previousUserId) {
          await db.notification.create({
            data: {
              userId: previousUserId,
              title: "Job reassigned",
              message: `${job.title} was reassigned to a nearer available teammate.`,
              type: "JOB",
              relatedType: "JOB",
              relatedId: job.id,
              actionUrl: "/provider/jobs",
            },
          }).catch(() => {})
        }
      }
    }
  }

  const requests: BusinessJobRequest[] = pendingJobs.map((job) => ({
    id: job.id,
    title: job.title,
    customerName: job.customer.name,
    assignedProviderId: job.providerId!,
    assignedName: nameByProviderId.get(job.providerId!) ?? "Unassigned",
    scheduledDate: job.scheduledDate.toISOString(),
    location: job.location,
    price: Number(job.price),
    urgency: job.urgency,
  }))

  const technicians: BusinessTechnician[] = [
    {
      providerId: business.id,
      name: business.businessName || ownerUser.name,
      isOwner: true,
      isOnline: ownerAvailability?.isOnline ?? false,
      latitude: ownerAvailability?.lastKnownLatitude != null ? Number(ownerAvailability.lastKnownLatitude) : null,
      longitude: ownerAvailability?.lastKnownLongitude != null ? Number(ownerAvailability.lastKnownLongitude) : null,
      activeJobCount: activeCountByProvider.get(business.id) ?? 0,
      atCapacity: false,
    },
    ...staff.map((s): BusinessTechnician => ({
      providerId: s.id,
      name: s.user.name,
      isOwner: false,
      isOnline: s.availability?.isOnline ?? false,
      latitude: s.availability?.lastKnownLatitude != null ? Number(s.availability.lastKnownLatitude) : null,
      longitude: s.availability?.lastKnownLongitude != null ? Number(s.availability.lastKnownLongitude) : null,
      activeJobCount: activeCountByProvider.get(s.id) ?? 0,
      atCapacity: (activeCountByProvider.get(s.id) ?? 0) >= BUSINESS_STAFF_MAX_CONCURRENT_JOBS,
    })),
  ]

  return {
    isBusinessOwner: true,
    autoAssignEnabled: business.autoAssignEnabled,
    allowStaffRequestResponses: business.allowStaffRequestResponses,
    requests,
    technicians,
  }
}

const setAutoAssignSchema = z.object({ enabled: z.boolean() })

export async function setAutoAssignEnabled(input: unknown): Promise<ProviderBusinessActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const business = await db.providerProfile.findUnique({ where: { id: provider.providerId } })
  if (!business?.isBusinessOwner) return { success: false, error: "Only a Business account can change this setting." }

  const parsed = setAutoAssignSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.providerProfile.update({ where: { id: provider.providerId }, data: { autoAssignEnabled: parsed.data.enabled } })
  return { success: true }
}

const setAllowStaffRequestsSchema = z.object({ enabled: z.boolean() })

/** Whether this business's staff may respond to open Request Board items
 * under their own account — see the ProviderProfile.allowStaffRequestResponses
 * doc comment for why this defaults off and is enforced in
 * lib/actions/requests.ts respondToRequest, not just hidden in the UI. */
export async function setAllowStaffRequestResponses(input: unknown): Promise<ProviderBusinessActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const business = await db.providerProfile.findUnique({ where: { id: provider.providerId } })
  if (!business?.isBusinessOwner) return { success: false, error: "Only a Business account can change this setting." }

  const parsed = setAllowStaffRequestsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.providerProfile.update({ where: { id: provider.providerId }, data: { allowStaffRequestResponses: parsed.data.enabled } })
  return { success: true }
}

const reassignJobSchema = z.object({ jobId: z.string().trim().min(1), toProviderId: z.string().trim().min(1) })

/** Gap 4's "Tech Re-Assignment Button" — manual version of the same move
 * the auto-assign pass above makes automatically. Both directions (from
 * and to) must belong to this business; the concurrent-job cap applies to
 * the receiving teammate the same way it applies to acceptJob(). */
export async function reassignJob(input: unknown): Promise<ProviderBusinessActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const business = await db.providerProfile.findUnique({ where: { id: provider.providerId } })
  if (!business?.isBusinessOwner) return { success: false, error: "Only a Business account can reassign jobs." }

  const parsed = reassignJobSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { jobId, toProviderId } = parsed.data

  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job) return { success: false, error: "Job not found." }
  if (job.status !== "PENDING" && job.status !== "ACCEPTED") {
    return { success: false, error: "This job can no longer be reassigned." }
  }

  const currentAssignee = job.providerId ? await db.providerProfile.findUnique({ where: { id: job.providerId } }) : null
  if (!currentAssignee || (currentAssignee.id !== business.id && currentAssignee.parentBusinessId !== business.id)) {
    return { success: false, error: "This job doesn't belong to your business." }
  }

  const target = await db.providerProfile.findUnique({ where: { id: toProviderId }, include: { user: true } })
  if (!target || (target.id !== business.id && target.parentBusinessId !== business.id)) {
    return { success: false, error: "That teammate isn't part of your business." }
  }

  const targetActiveCount = await db.job.count({ where: { providerId: target.id, status: { in: ["ACCEPTED", "IN_PROGRESS"] } } })
  if (targetActiveCount >= BUSINESS_STAFF_MAX_CONCURRENT_JOBS) {
    return { success: false, error: `${target.user.name} already has ${BUSINESS_STAFF_MAX_CONCURRENT_JOBS} active jobs.` }
  }

  await db.job.update({ where: { id: jobId }, data: { providerId: target.id } })
  await db.notification.create({
    data: {
      userId: target.userId,
      title: "Job assigned to you",
      message: `${job.title} has been assigned to you.`,
      type: "JOB",
      relatedType: "JOB",
      relatedId: job.id,
      actionUrl: "/provider/jobs",
    },
  })

  return { success: true }
}

// ============================= BRANCH OUTLETS =============================
// Adaptive UI Workspaces — Business Manager dashboard tile. See the
// BusinessBranch model doc comment: informational directory only, no
// effect on dispatch/auto-assign/staff assignment.

export type BusinessBranchItem = {
  id: string
  name: string
  address: string
  phone: string | null
  isActive: boolean
}

async function requireBusinessOwner(): Promise<{ userId: string; businessId: string } | null> {
  const provider = await requireProvider()
  if (!provider) return null
  const business = await db.providerProfile.findUnique({ where: { id: provider.providerId }, select: { isBusinessOwner: true } })
  if (!business?.isBusinessOwner) return null
  return { userId: provider.userId, businessId: provider.providerId }
}

export async function getMyBranches(): Promise<BusinessBranchItem[]> {
  const business = await requireBusinessOwner()
  if (!business) return []

  const branches = await db.businessBranch.findMany({ where: { businessId: business.businessId }, orderBy: { createdAt: "asc" } })
  return branches.map((b) => ({ id: b.id, name: b.name, address: b.address, phone: b.phone, isActive: b.isActive }))
}

const branchSchema = z.object({
  name: z.string().trim().min(1, "Branch name is required").max(100),
  address: z.string().trim().min(1, "Address is required").max(300),
  phone: z.string().trim().max(30).optional(),
})

export async function addBranch(input: unknown): Promise<ProviderBusinessActionResult> {
  const business = await requireBusinessOwner()
  if (!business) return { success: false, error: "Only a Business account can manage branches." }

  const parsed = branchSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  await db.businessBranch.create({
    data: { businessId: business.businessId, name: parsed.data.name, address: parsed.data.address, phone: parsed.data.phone || null },
  })
  return { success: true }
}

const updateBranchSchema = branchSchema.extend({ id: z.string().trim().min(1), isActive: z.boolean() })

export async function updateBranch(input: unknown): Promise<ProviderBusinessActionResult> {
  const business = await requireBusinessOwner()
  if (!business) return { success: false, error: "Only a Business account can manage branches." }

  const parsed = updateBranchSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const result = await db.businessBranch.updateMany({
    where: { id: parsed.data.id, businessId: business.businessId },
    data: { name: parsed.data.name, address: parsed.data.address, phone: parsed.data.phone || null, isActive: parsed.data.isActive },
  })
  if (result.count === 0) return { success: false, error: "Branch not found." }
  return { success: true }
}

const branchIdSchema = z.object({ id: z.string().trim().min(1) })

export async function removeBranch(input: unknown): Promise<ProviderBusinessActionResult> {
  const business = await requireBusinessOwner()
  if (!business) return { success: false, error: "Only a Business account can manage branches." }

  const parsed = branchIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.businessBranch.deleteMany({ where: { id: parsed.data.id, businessId: business.businessId } })
  return { success: true }
}

// ============================= COMPANY REVENUE =============================
// Read-only aggregate — sums each team member's own Wallet.totalEarned and
// this-month CREDIT transactions. No pooled account, no change to how
// completeJob()/resolveJobCancellation() pay out: every team member still
// gets paid into their own wallet exactly as today, this is a report.

export type CompanyRevenueMember = {
  providerId: string
  name: string
  isOwner: boolean
  totalEarned: number
  earnedThisMonth: number
}

export type CompanyRevenueResult =
  | { isBusinessOwner: true; totalAllTime: number; totalThisMonth: number; members: CompanyRevenueMember[] }
  | { isBusinessOwner: false }

export async function getCompanyRevenue(): Promise<CompanyRevenueResult> {
  const provider = await requireProvider()
  if (!provider) return { isBusinessOwner: false }

  const business = await db.providerProfile.findUnique({ where: { id: provider.providerId } })
  if (!business?.isBusinessOwner) return { isBusinessOwner: false }

  const staff = await db.providerProfile.findMany({
    where: { parentBusinessId: business.id },
    include: { user: true },
  })
  const ownerUser = await db.user.findUnique({ where: { id: provider.userId } })
  if (!ownerUser) return { isBusinessOwner: false }

  const members = [
    { providerId: business.id, name: business.businessName || ownerUser.name, isOwner: true, userId: ownerUser.id },
    ...staff.map((s) => ({ providerId: s.id, name: s.user.name, isOwner: false, userId: s.userId })),
  ]

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const memberResults: CompanyRevenueMember[] = await Promise.all(
    members.map(async (m) => {
      const wallet = await db.wallet.findUnique({ where: { userId: m.userId } })
      const thisMonth = wallet
        ? await db.transaction.aggregate({
            where: { walletId: wallet.id, type: "CREDIT", createdAt: { gte: startOfMonth } },
            _sum: { amount: true },
          })
        : null
      return {
        providerId: m.providerId,
        name: m.name,
        isOwner: m.isOwner,
        totalEarned: wallet ? Number(wallet.totalEarned) : 0,
        earnedThisMonth: Number(thisMonth?._sum.amount ?? 0),
      }
    })
  )

  const totalAllTime = memberResults.reduce((sum, m) => sum + m.totalEarned, 0)
  const totalThisMonth = memberResults.reduce((sum, m) => sum + m.earnedThisMonth, 0)

  return { isBusinessOwner: true, totalAllTime, totalThisMonth, members: memberResults }
}

// ============================= BUSINESS DASHBOARD OVERVIEW =============================
// Aggregates everything the card-based Business Hub dashboard needs into
// one call — business identity, team-wide revenue/growth, today's/this
// week's operational counts, review rating, and unpaid invoices — reusing
// the same "owner + all staff" member-list pattern getCompanyRevenue()
// already established, so every team member's activity rolls up here
// exactly like it does in the revenue report.

export type BusinessOverview =
  | {
      isBusinessOwner: true
      ownerName: string
      businessName: string
      logoUrl: string | null
      location: string | null
      verified: boolean
      memberCount: number
      revenueThisMonth: number
      revenueGrowthPct: number
      bookingsToday: number
      bookingsTotal: number
      activeJobs: number
      dueThisWeek: number
      rating: number
      reviewCount: number
      unpaidInvoices: number
    }
  | { isBusinessOwner: false }

export async function getBusinessOverview(): Promise<BusinessOverview> {
  const provider = await requireProvider()
  if (!provider) return { isBusinessOwner: false }

  const business = await db.providerProfile.findUnique({ where: { id: provider.providerId }, include: { user: true } })
  if (!business?.isBusinessOwner) return { isBusinessOwner: false }

  const staff = await db.providerProfile.findMany({ where: { parentBusinessId: business.id } })
  const memberIds = [business.id, ...staff.map((s) => s.id)]
  const memberUserIds = [business.userId, ...staff.map((s) => s.userId)]

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(startOfToday.getTime() + 86400000)
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 86400000)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [
    memberWallets, bookingsToday, bookingsTotal, activeJobs, dueThisWeek,
    reviewAgg, unpaidInvoices,
  ] = await Promise.all([
    db.wallet.findMany({ where: { userId: { in: memberUserIds } } }),
    db.job.count({ where: { providerId: { in: memberIds }, scheduledDate: { gte: startOfToday, lt: endOfToday } } }),
    db.job.count({ where: { providerId: { in: memberIds } } }),
    db.job.count({ where: { providerId: { in: memberIds }, status: { in: ["ACCEPTED", "IN_PROGRESS"] } } }),
    db.job.count({ where: { providerId: { in: memberIds }, status: { in: ["ACCEPTED", "IN_PROGRESS"] }, scheduledDate: { gte: now, lt: endOfWeek } } }),
    db.review.aggregate({ where: { providerId: { in: memberIds } }, _avg: { rating: true }, _count: true }),
    db.invoice.count({ where: { providerId: { in: memberIds }, status: "SENT" } }),
  ])

  const walletIds = memberWallets.map((w) => w.id)
  const [thisMonthAgg, lastMonthAgg] = await Promise.all([
    db.transaction.aggregate({ where: { walletId: { in: walletIds }, type: "CREDIT", createdAt: { gte: startOfMonth } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { walletId: { in: walletIds }, type: "CREDIT", createdAt: { gte: startOfLastMonth, lt: startOfMonth } }, _sum: { amount: true } }),
  ])

  const revenueThisMonth = Number(thisMonthAgg._sum.amount ?? 0)
  const revenueLastMonth = Number(lastMonthAgg._sum.amount ?? 0)
  const revenueGrowthPct = revenueLastMonth > 0
    ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 1000) / 10
    : revenueThisMonth > 0 ? 100 : 0

  return {
    isBusinessOwner: true,
    ownerName: business.user.name,
    businessName: business.businessName || business.user.name,
    logoUrl: business.user.image,
    location: business.location,
    verified: business.verified,
    memberCount: staff.length + 1,
    revenueThisMonth,
    revenueGrowthPct,
    bookingsToday,
    bookingsTotal,
    activeJobs,
    dueThisWeek,
    rating: Number(reviewAgg._avg.rating ?? 0),
    reviewCount: reviewAgg._count,
    unpaidInvoices,
  }
}

// ============================= DOCUMENTS HUB =============================
// Read-only aggregate of every compliance document across the whole team —
// KYC (keyed by userId) and certifications (keyed by providerId) — plus
// the business's own registration details. Nothing here is uploaded from
// this page; it's a single place to see status across everyone rather
// than clicking into each team member's own profile individually.

export type BusinessDocumentsResult =
  | {
      isBusinessOwner: true
      registrationNumber: string | null
      hqAddress: string | null
      kycDocuments: { id: string; memberName: string; documentType: string; status: string; submittedAt: string }[]
      certifications: { id: string; memberName: string; name: string; issuer: string; status: string; expiryDate: string | null }[]
    }
  | { isBusinessOwner: false }

export async function getBusinessDocuments(): Promise<BusinessDocumentsResult> {
  const provider = await requireProvider()
  if (!provider) return { isBusinessOwner: false }

  const business = await db.providerProfile.findUnique({ where: { id: provider.providerId } })
  if (!business?.isBusinessOwner) return { isBusinessOwner: false }

  const staff = await db.providerProfile.findMany({ where: { parentBusinessId: business.id }, include: { user: true } })
  const ownerUser = await db.user.findUnique({ where: { id: provider.userId } })
  if (!ownerUser) return { isBusinessOwner: false }

  const members = [
    { providerId: business.id, userId: ownerUser.id, name: business.businessName || ownerUser.name },
    ...staff.map((s) => ({ providerId: s.id, userId: s.userId, name: s.user.name })),
  ]
  const memberById = new Map(members.map((m) => [m.userId, m.name] as const))
  const memberByProviderId = new Map(members.map((m) => [m.providerId, m.name] as const))

  const [kycDocs, certs] = await Promise.all([
    db.kycDocument.findMany({ where: { userId: { in: members.map((m) => m.userId) } }, orderBy: { submittedAt: "desc" } }),
    db.certification.findMany({ where: { providerId: { in: members.map((m) => m.providerId) } }, orderBy: { dateIssued: "desc" } }),
  ])

  return {
    isBusinessOwner: true,
    registrationNumber: business.registrationNumber,
    hqAddress: business.hqAddress,
    kycDocuments: kycDocs.map((d) => ({
      id: d.id,
      memberName: memberById.get(d.userId) ?? "—",
      documentType: d.documentType,
      status: d.status,
      submittedAt: d.submittedAt.toISOString(),
    })),
    certifications: certs.map((c) => ({
      id: c.id,
      memberName: memberByProviderId.get(c.providerId) ?? "—",
      name: c.name,
      issuer: c.issuer,
      status: c.status,
      expiryDate: c.expiryDate?.toISOString() ?? null,
    })),
  }
}

// ============================= COMPLETED JOBS (HISTORY) =============================
// Business Manager dashboard gap-closer: a real job-by-job history, distinct
// from Company Revenue's financial-only summary above.

export type CompanyCompletedJobItem = {
  id: string
  title: string
  customerName: string
  assignedName: string
  completedAt: string
  price: number
}

const COMPLETED_JOBS_LIMIT = 20

export async function getCompanyCompletedJobs(): Promise<CompanyCompletedJobItem[]> {
  const business = await requireBusinessOwner()
  if (!business) return []

  const ownerProfile = await db.providerProfile.findUnique({ where: { id: business.businessId } })
  const ownerUser = await db.user.findUnique({ where: { id: business.userId } })
  if (!ownerProfile || !ownerUser) return []

  const staff = await db.providerProfile.findMany({ where: { parentBusinessId: business.businessId }, include: { user: true } })

  const nameByProviderId = new Map<string, string>([
    [ownerProfile.id, ownerProfile.businessName || ownerUser.name],
    ...staff.map((s): [string, string] => [s.id, s.user.name]),
  ])

  const jobs = await db.job.findMany({
    where: { providerId: { in: [...nameByProviderId.keys()] }, status: "COMPLETED" },
    include: { customer: true },
    orderBy: { completedAt: "desc" },
    take: COMPLETED_JOBS_LIMIT,
  })

  return jobs.map((job) => ({
    id: job.id,
    title: job.title,
    customerName: job.customer.name,
    assignedName: nameByProviderId.get(job.providerId!) ?? "—",
    completedAt: (job.completedAt ?? job.updatedAt).toISOString(),
    price: Number(job.price),
  }))
}

// ============================= BUSINESS SHOP (retail) =============================
// A Business owner can also run a shop — a real, linked ShopkeeperProfile
// on the same account, not a separate account/signup. role stays
// "provider" (their portal doesn't change); requireShopkeeper() (see
// lib/actions/shopkeeper-dashboard.ts) has been extended to recognize this
// link, so every existing shopkeeper page/action (products, orders,
// inventory, promotions) works unmodified once the shop exists — this
// only handles creating that link.

export type BusinessShopStatus =
  | {
      isBusinessOwner: true
      hasShop: true
      shopName: string
      productCount: number
      lowStockCount: number
      pendingOrderCount: number
      activePromotionCount: number
    }
  | { isBusinessOwner: true; hasShop: false }
  | { isBusinessOwner: false }

export async function getBusinessShopStatus(): Promise<BusinessShopStatus> {
  const business = await requireBusinessOwner()
  if (!business) return { isBusinessOwner: false }

  const shop = await db.shopkeeperProfile.findUnique({ where: { userId: business.userId } })
  if (!shop) return { isBusinessOwner: true, hasShop: false }

  const [productCount, lowStockRows, pendingOrderCount, activePromotionCount] = await Promise.all([
    db.product.count({ where: { shopkeeperId: shop.id } }),
    // currentStock <= lowStockThreshold can't be expressed as a plain
    // where-filter (comparing two columns on the same row), so pull the
    // pairs and count in memory — shop catalogs are small enough this
    // doesn't matter.
    db.inventory.findMany({ where: { product: { shopkeeperId: shop.id } }, select: { currentStock: true, lowStockThreshold: true } }),
    db.order.count({ where: { shopkeeperId: shop.id, status: { in: ["PENDING", "PROCESSING"] } } }),
    db.promotion.count({ where: { shopkeeperId: shop.id, status: "ACTIVE" } }),
  ])
  const lowStockCount = lowStockRows.filter((r) => r.currentStock <= r.lowStockThreshold).length

  return {
    isBusinessOwner: true,
    hasShop: true,
    shopName: shop.shopName,
    productCount,
    lowStockCount,
    pendingOrderCount,
    activePromotionCount,
  }
}

const setupShopSchema = z.object({
  shopName: z.string().trim().min(2, "Shop name must be at least 2 characters").max(80),
})

export async function setupBusinessShop(input: unknown): Promise<ProviderBusinessActionResult> {
  const business = await requireBusinessOwner()
  if (!business) return { success: false, error: "Only a Business account can set up a shop." }

  const parsed = setupShopSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existing = await db.shopkeeperProfile.findUnique({ where: { userId: business.userId } })
  if (existing) return { success: false, error: "A shop is already linked to this account." }

  await db.shopkeeperProfile.create({
    data: { userId: business.userId, shopName: parsed.data.shopName },
  })

  return { success: true }
}
