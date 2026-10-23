"use server"

import { z } from "zod"
import bcrypt from "bcryptjs"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { ensureSubscription } from "@/backend/services/pos-billing"
import { provisionPos } from "@/backend/services/pos-provision"
import { isSignupProofValid, consumeSignupProof } from "@/backend/services/signup-proof"
import { checkRateLimit } from "@/backend/services/rate-limit"
import { resolvePosProfile } from "@/backend/domain/pos-profiles"
import { recordPosAudit, resolvePosActor } from "@/backend/services/pos-access-core"
import { ONBOARDING_STEPS, type OnboardingStep } from "@/backend/domain/pos-onboarding-steps"
import { starterWebsite, websiteContentSchema } from "@/backend/domain/pos-website"
import { ensureBusinessWebsite } from "@/backend/services/pos-website-provision"

/**
 * Getting a shop from "I heard about this" to "I am trading".
 *
 * SIX STEPS, AND WHY IT SAVES AFTER EACH ONE
 *
 * A shopkeeper sets this up on a phone, in a shop, between customers. They
 * will be interrupted. A wizard that loses everything when they put the
 * phone down is a wizard they never finish, so each step writes what it
 * knows and the next load picks up where they stopped.
 *
 *   1  account        who they are
 *   2  business       what the shop is called, and where
 *   3  configuration  shown, not asked: Kenya, KES, Nairobi time, one shop
 *   4  products       import, scan, type, or start with samples
 *   5  payments       cash, M-Pesa, and how receipts come out
 *   6  go live        the checklist, then the dashboard
 *
 * STEP 3 IS DELIBERATELY NOT A FORM
 *
 * Every answer on it is one a Kenyan duka would give, so asking is a tax on
 * the ninety-nine shops that would have said yes. It is shown so nothing is
 * hidden, and changeable afterwards in settings, which is where a shop that
 * is the exception will go anyway.
 */

// Lives in a plain module: a "use server" file may export only async
// functions, and a const array here throws at request time.
export type { OnboardingStep } from "@/backend/domain/pos-onboarding-steps"

export type OnboardingProgress = {
  businessId: string
  businessName: string
  /** Where they stopped. The screen opens here. */
  step: OnboardingStep
  completed: boolean
  /** Which steps have been answered, so the stepper can show ticks. */
  done: OnboardingStep[]
  data: Record<string, unknown>
  /** Counts the wizard shows on the last step rather than claiming. */
  productCount: number
  hasPayment: boolean
  shopkeeperId: string | null
  profileKey: string
}

async function requireOwner() {
  const session = await auth()
  if (!session?.user?.id) return null
  const business = await db.posBusiness.findUnique({
    where: { ownerUserId: session.user.id },
    select: {
      id: true, name: true, onboardingStep: true, onboardingData: true,
      setupCompletedAt: true, profileKey: true,
      stores: { select: { id: true, shopkeeperId: true }, take: 1 },
    },
  })
  if (!business) return null
  return { userId: session.user.id, userName: session.user.name ?? "Owner", business }
}

// ------------------------------------------------------------ step 1: account

export type CreatePosAccountResult =
  | { success: true; businessId: string; nextStep: OnboardingStep }
  | { success: false; error: string }

const accountSchema = z.object({
  name: z.string().trim().min(2, "Your name is 2 to 100 characters").max(100),
  email: z.string().trim().email("That email does not look right").max(160),
  phone: z.string().trim().min(9).max(16),
  password: z.string().min(8, "A password is at least 8 characters").max(200),
  agreeTerms: z.literal(true, { message: "Please agree to the terms to continue" }),
  /** From the OTP step, proving they hold the email or phone. */
  verificationProof: z.string().trim().min(10).max(200),
  businessName: z.string().trim().min(2).max(100),
})

/**
 * Create the account and the business in one go.
 *
 * Together, in one transaction, because a User with no PosBusiness is an
 * account that can sign in and see nothing, and that is the single worst
 * state to leave somebody in at the end of a signup form.
 */
export async function createPosAccount(input: unknown): Promise<CreatePosAccountResult> {
  const parsed = accountSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the form." }
  const d = parsed.data
  const email = d.email.toLowerCase()

  try {
    const limit = await checkRateLimit(`pos-signup:${email}`, "signup", 5, 60 * 60 * 1000)
    if (!limit.allowed) {
      return { success: false, error: "Too many attempts. Try again in an hour." }
    }

    // They must have proved they hold the address or number they are
    // registering with. The proof is issued by the OTP step and is
    // short-lived, so a form posted directly cannot skip it.
    const proved = await isSignupProofValid(email, d.phone, d.verificationProof)
    if (!proved) {
      return { success: false, error: "Verify your email or phone before creating the account." }
    }

    const taken = await db.user.findFirst({
      where: { OR: [{ email }, { phone: d.phone }] },
      select: { id: true },
    })
    if (taken) return { success: false, error: "An account with that email or phone already exists." }

    const hashed = await bcrypt.hash(d.password, 12)

    const businessId = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: d.name, email, phone: d.phone, password: hashed,
          role: "PROVIDER", isActive: true,
          providerProfile: { create: {} },
        },
        select: { id: true },
      })

      // The shop that holds catalogue and stock. Not listed on the
      // marketplace: a POS account asked for a till, not a storefront.
      // userName names the shop where one does not exist yet, so the
      // BUSINESS name is what goes in: a till belongs to the shop, not to
      // the person who happened to register it.
      const shopkeeperId = await provisionPos(tx as never, {
        userId: user.id,
        userName: d.businessName,
        businessTypes: ["POS"],
        profileKey: "SUPERMARKET",
      })

      // provisionPos names a brand new shop after whoever owns it, which is
      // right for a provider and wrong here: the business name IS the shop
      // name. Set explicitly so a setup abandoned after this step does not
      // leave a shop called "Njeri Mini Mart's Shop".
      await tx.shopkeeperProfile.update({
        where: { id: shopkeeperId },
        data: { shopName: d.businessName },
      })

      const business = await tx.posBusiness.create({
        data: {
          ownerUserId: user.id,
          name: d.businessName,
          profileKey: "SUPERMARKET",
          onboardingStep: "business",
          onboardingData: { account: { name: d.name, email, phone: d.phone } },
        },
        select: { id: true },
      })

      await tx.posStore.create({
        data: { businessId: business.id, shopkeeperId, name: d.businessName },
      })
      await ensureBusinessWebsite(tx, { id: business.id, name: d.businessName })

      await tx.posStaff.create({
        data: {
          businessId: business.id, userId: user.id, name: d.name,
          role: "OWNER", email, phone: d.phone,
        },
      })

      return business.id
    }, { timeout: 30000 })

    // The subscription, outside the transaction that made the business: a
    // failure to start billing must never be the reason a signup rolls back
    // and the shopkeeper is told their account could not be created. An
    // admin opening the POS page picks up anything missed.
    await ensureSubscription(businessId).catch(() => {})

    await consumeSignupProof(email, d.phone, d.verificationProof)
    return { success: true, businessId, nextStep: "business" }
  } catch (e) {
    const why = e instanceof Error ? e.message : ""
    if (/Unique constraint/i.test(why)) {
      return { success: false, error: "An account with that email or phone already exists." }
    }
    return { success: false, error: "The account could not be created. Please try again." }
  }
}

// ----------------------------------------------------------------- progress

/**
 * Where this account belongs in the POS.
 *
 * One function, used by the sign-in screen and by the landing page's button,
 * so the two can never disagree about where somebody should end up. Sending
 * everybody to /pos/setup was the old behaviour and pushed a cashier into
 * their employer's setup wizard.
 */
export async function posDestination(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) return "/pos/login"

  const business = await db.posBusiness.findUnique({
    where: { ownerUserId: session.user.id },
    select: { setupCompletedAt: true },
  })
  // An owner mid-wizard resumes it; a finished one goes to work.
  if (business) return business.setupCompletedAt ? "/pos/home" : "/pos/setup"

  const actor = await resolvePosActor()
  if (actor?.can("salon.view") && !actor.can("till.sell")) return "/pos/salon"
  if (actor) return actor.can("till.sell") ? "/pos/sell" : actor.can("stock.view") ? "/pos/stock" : actor.can("product.view") ? "/pos/products" : actor.can("report.sales") ? "/pos/reports" : "/pos/home"

  // Signed in to SAJI with no till of any kind.
  return "/pos/signup"
}

export async function getOnboardingProgress(): Promise<OnboardingProgress | null> {
  const ctx = await requireOwner()
  if (!ctx) return null
  const b = ctx.business
  const shopkeeperId = b.stores[0]?.shopkeeperId ?? null

  const [productCount, shop] = await Promise.all([
    shopkeeperId ? db.product.count({ where: { shopkeeperId } }) : Promise.resolve(0),
    shopkeeperId
      ? db.shopkeeperProfile.findUnique({
          where: { id: shopkeeperId },
          select: { mpesaShortcode: true, mpesaPromptEnabled: true },
        })
      : Promise.resolve(null),
  ])

  const data = (b.onboardingData as Record<string, unknown>) ?? {}
  const done = ONBOARDING_STEPS.filter((s) => s === "account" || data[s] !== undefined)

  return {
    businessId: b.id,
    businessName: b.name,
    step: (b.onboardingStep as OnboardingStep) ?? (b.setupCompletedAt ? "golive" : "business"),
    completed: Boolean(b.setupCompletedAt),
    done,
    data,
    productCount,
    hasPayment: Boolean(shop?.mpesaShortcode),
    shopkeeperId,
    profileKey: b.profileKey,
  }
}

export type StepResult = { success: true; nextStep: OnboardingStep } | { success: false; error: string }

const businessSchema = z.object({
  name: z.string().trim().min(2).max(100),
  profileKey: z.string().trim().min(2).max(40),
  registrationNumber: z.string().trim().max(60).optional(),
  taxPin: z.string().trim().max(30).optional(),
  county: z.string().trim().max(60).optional(),
  town: z.string().trim().max(60).optional(),
  street: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(30).optional(),
})

/**
 * Step 2, and the one that decides how the till behaves.
 *
 * The shop type is not cosmetic: it picks the trait preset, which is what
 * makes a butchery weigh and a pharmacy keep a register. Changing it here
 * re-applies that preset, which is right during setup and would be wrong
 * afterwards, when a shop has configured things by hand.
 */
export async function saveBusinessStep(input: unknown): Promise<StepResult> {
  const ctx = await requireOwner()
  if (!ctx) return { success: false, error: "There is no POS business on this account." }
  const parsed = businessSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  const d = parsed.data

  const profile = resolvePosProfile(d.profileKey)
  const data = { ...((ctx.business.onboardingData as Record<string, unknown>) ?? {}), business: d }

  await db.posBusiness.update({
    where: { id: ctx.business.id },
    data: {
      name: d.name,
      profileKey: profile.key,
      registrationNumber: d.registrationNumber || null,
      taxPin: d.taxPin || null,
      county: d.county || null,
      town: d.town || null,
      street: d.street || null,
      postalCode: d.postalCode || null,
      onboardingStep: "configure",
      onboardingData: data as never,
    },
  })

  const shopkeeperId = ctx.business.stores[0]?.shopkeeperId
  if (shopkeeperId) {
    await db.shopkeeperProfile.update({
      where: { id: shopkeeperId },
      data: {
        shopName: d.name,
        posProfileKey: profile.key,
        posTraits: [...profile.traits],
        kraPin: d.taxPin || null,
      },
    })
    await db.posStore.updateMany({
      where: { shopkeeperId },
      data: { name: d.name, phone: d.phone || null, county: d.county || null, town: d.town || null, street: d.street || null },
    })
  }

  // Fill only the untouched private starter. Owner edits and published content are preserved.
  const websiteDraft = websiteContentSchema.parse({ ...starterWebsite(d.name, profile.label), phone: d.phone && /^\+?[0-9 ()-]{7,30}$/.test(d.phone) ? d.phone : "", address: [d.street, d.town, d.county].filter(Boolean).join(", ") })
  await db.posBusinessWebsite.updateMany({ where: { businessId: ctx.business.id, version: 1, publishedAt: null }, data: { draft: websiteDraft as never, version: { increment: 1 } } })

  return { success: true, nextStep: "configure" }
}

/** Step 3 is a confirmation, so accepting it is the whole action. */
export async function acceptConfiguration(): Promise<StepResult> {
  const ctx = await requireOwner()
  if (!ctx) return { success: false, error: "There is no POS business on this account." }
  const data = { ...((ctx.business.onboardingData as Record<string, unknown>) ?? {}), configure: { acceptedAt: new Date().toISOString() } }
  await db.posBusiness.update({
    where: { id: ctx.business.id },
    data: { onboardingStep: "products", onboardingData: data as never },
  })
  return { success: true, nextStep: "products" }
}

/**
 * Step 4 is skippable, and saying so matters.
 *
 * A shop with no products can still open the till and add things as it
 * sells them, which is how a small duka actually starts. Forcing a
 * catalogue up front is how a setup gets abandoned.
 */
export async function saveProductsStep(input: unknown): Promise<StepResult> {
  const ctx = await requireOwner()
  if (!ctx) return { success: false, error: "There is no POS business on this account." }
  const parsed = z.object({ method: z.enum(["import", "manual", "scan", "sample", "skip"]) }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const data = { ...((ctx.business.onboardingData as Record<string, unknown>) ?? {}), products: { method: parsed.data.method } }
  await db.posBusiness.update({
    where: { id: ctx.business.id },
    data: { onboardingStep: "payments", onboardingData: data as never },
  })
  return { success: true, nextStep: "payments" }
}

const paymentsSchema = z.object({
  acceptCash: z.boolean().default(true),
  mpesaShortcode: z.string().trim().max(12).optional(),
  mpesaShortcodeType: z.enum(["PAYBILL", "TILL"]).optional(),
  mpesaAccountRef: z.string().trim().max(40).optional(),
  acceptCard: z.boolean().optional(),
  receiptFooter: z.string().trim().max(160).optional(),
})

export async function savePaymentsStep(input: unknown): Promise<StepResult> {
  const ctx = await requireOwner()
  if (!ctx) return { success: false, error: "There is no POS business on this account." }
  const parsed = paymentsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  const d = parsed.data

  if (d.mpesaShortcode && !/^\d{5,9}$/.test(d.mpesaShortcode)) {
    return { success: false, error: "A paybill or till number is 5 to 9 digits." }
  }

  const shopkeeperId = ctx.business.stores[0]?.shopkeeperId
  if (shopkeeperId) {
    const shop = await db.shopkeeperProfile.findUnique({ where: { id: shopkeeperId }, select: { posConfig: true } })
    const config = { ...((shop?.posConfig as Record<string, unknown>) ?? {}) }
    if (d.receiptFooter) config.receiptFooter = d.receiptFooter
    await db.shopkeeperProfile.update({
      where: { id: shopkeeperId },
      data: {
        mpesaShortcode: d.mpesaShortcode || null,
        mpesaShortcodeType: d.mpesaShortcodeType ?? "PAYBILL",
        mpesaAccountRef: d.mpesaAccountRef || null,
        posConfig: config as never,
      },
    })
  }

  const data = { ...((ctx.business.onboardingData as Record<string, unknown>) ?? {}), payments: d }
  await db.posBusiness.update({
    where: { id: ctx.business.id },
    data: { onboardingStep: "golive", onboardingData: data as never },
  })
  return { success: true, nextStep: "golive" }
}

export type FinishResult = { success: true } | { success: false; error: string }

/**
 * Finish, and stop showing the wizard.
 *
 * Nothing is required to be true here. The checklist on the last step shows
 * what is and is not set up, and a shopkeeper who wants to start selling
 * with an empty catalogue and cash only is making a reasonable choice.
 */
export async function completePosSetup(): Promise<FinishResult> {
  const ctx = await requireOwner()
  if (!ctx) return { success: false, error: "There is no POS business on this account." }
  await db.posBusiness.update({
    where: { id: ctx.business.id },
    data: { onboardingStep: null, setupCompletedAt: new Date() },
  })
  await recordPosAudit({
    actor: {
      businessId: ctx.business.id,
      storeId: ctx.business.stores[0]?.id ?? null,
      userId: ctx.userId,
      staffId: null,
      name: ctx.userName,
    },
    action: "business.setup_complete",
    summary: `${ctx.userName} finished setting up ${ctx.business.name}`,
    entityType: "PosBusiness",
    entityId: ctx.business.id,
  })
  return { success: true }
}

/** Jump back to a step already answered, without losing what came after. */
export async function goToStep(input: unknown): Promise<StepResult> {
  const ctx = await requireOwner()
  if (!ctx) return { success: false, error: "There is no POS business on this account." }
  const parsed = z.object({ step: z.enum(ONBOARDING_STEPS) }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid step" }
  await db.posBusiness.update({
    where: { id: ctx.business.id },
    data: { onboardingStep: parsed.data.step },
  })
  return { success: true, nextStep: parsed.data.step }
}
