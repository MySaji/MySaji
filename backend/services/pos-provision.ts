/**
 * Turning POS on for an account: creating the tenant row and seeding it.
 *
 * Lives here, and not inside a "use server" file, for two reasons. A
 * "use server" module may only export async functions, so the types and
 * constants below could not live beside the logic. And both callers need
 * this inside a transaction they already own — signup, and the staff
 * approval path — so it takes a transaction client rather than opening its
 * own.
 */

import { DEFAULT_POS_PROFILE_KEY, resolvePosProfile } from "@/backend/domain/pos-profiles"
import { posConfigSchema } from "@/backend/domain/pos-config"
import type { ProBusinessType } from "@/backend/domain/pro-modules"
import { shouldListOnMarketplace } from "@/backend/domain/pro-modules"

/**
 * The subset of Prisma's client this needs. Typed structurally so it accepts
 * both `db` and a `$transaction` client without importing PrismaClient here
 * (which would pull the engine into anything that imports this module).
 */
type PosTx = {
  shopkeeperProfile: {
    findFirst: (args: unknown) => Promise<{ id: string; posEnabled: boolean } | null>
    create: (args: unknown) => Promise<{ id: string }>
    update: (args: unknown) => Promise<unknown>
  }
}

export type ProvisionPosArgs = {
  userId: string
  /** Used only to name a shop that does not exist yet. */
  userName: string
  /** What the shopkeeper picked, e.g. "BUTCHERY". Falls back to GENERAL. */
  profileKey?: string | null
  /** The complete set of business types this account will hold. */
  businessTypes: readonly ProBusinessType[]
}

/**
 * Make an account able to run a till.
 *
 * The ShopkeeperProfile is the tenant, so POS needs one whether or not the
 * account sells on SAJI — this is exactly why `listedOnMarketplace` had to
 * be split out from "has a shop". A POS-only account gets a shop row that is
 * not listed; a POS + Sell Products account gets one that is.
 *
 * Idempotent: calling it twice on the same account updates rather than
 * duplicates, which matters because signup and the approval path can both
 * reach it for the same user.
 */
export async function provisionPos(tx: PosTx, args: ProvisionPosArgs): Promise<string> {
  const profile = resolvePosProfile(args.profileKey ?? DEFAULT_POS_PROFILE_KEY)
  const listed = shouldListOnMarketplace(args.businessTypes)

  const config = posConfigSchema.parse({ defaultUnit: profile.defaultUnit })

  // Their FIRST shop, since an account may now own a branch or three.
  // Provisioning is about turning the till on for the business, which means
  // the original shop; a branch is created deliberately, elsewhere.
  const existing = (await tx.shopkeeperProfile.findFirst({
    where: { userId: args.userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, posEnabled: true },
  })) as { id: string; posEnabled: boolean } | null

  const posFields = {
    posEnabled: true,
    posProfileKey: profile.key,
    // Written explicitly, from the preset, so that for a POS shop this
    // column is never ambiguous: an empty array afterwards means the
    // shopkeeper switched everything off, not that nothing was configured.
    posTraits: profile.traits,
    posConfig: config,
    posActivatedAt: new Date(),
  }

  if (existing) {
    await tx.shopkeeperProfile.update({
      where: { id: existing.id },
      data: {
        ...posFields,
        // Never un-list a shop that is already selling on SAJI. An existing
        // storefront adding a till keeps its storefront; only a shop being
        // created for a POS-only account starts unlisted.
        ...(listed ? { listedOnMarketplace: true } : {}),
        // Re-activating keeps the original activation date.
        ...(existing.posEnabled ? { posActivatedAt: undefined } : {}),
      },
    })
    return existing.id
  }

  const created = await tx.shopkeeperProfile.create({
    data: {
      userId: args.userId,
      shopName: `${args.userName}'s Shop`,
      listedOnMarketplace: listed,
      ...posFields,
    },
  })
  return created.id
}
