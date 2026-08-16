import { db } from "@/lib/db"
import { getEffectivePlatformPreferences } from "@/lib/actions/admin-settings"
import type { CommissionRole } from "@prisma/client"

/** Mirrors agent-commissions.ts's exact tier-selection algorithm: the
 * highest-minJobs active tier the qualifying count has reached. Falls back
 * to the flat platformFee when no tier qualifies (including when none are
 * configured for this role at all), so commission is always enforced. */
export async function getEffectiveCommissionRate(role: CommissionRole, qualifyingCount: number): Promise<number> {
  const tiers = await db.commissionTier.findMany({ where: { role, status: "ACTIVE" } })
  const eligible = tiers.filter((t) => qualifyingCount >= (t.minJobs ?? 0)).sort((a, b) => (b.minJobs ?? 0) - (a.minJobs ?? 0))
  const currentTier = eligible[0]
  if (currentTier) return Number(currentTier.rate)

  const { platformFee } = await getEffectivePlatformPreferences()
  return platformFee
}

export type CommissionSplit = { rate: number; commissionAmount: number; payoutAmount: number }

/** Cent-accurate split of a gross amount by a percentage rate (e.g. rate=5 -> 5%). */
export function splitByCommission(grossAmount: number, rate: number): CommissionSplit {
  const commissionAmount = Math.round(grossAmount * rate) / 100
  const payoutAmount = Math.round((grossAmount - commissionAmount) * 100) / 100
  return { rate, commissionAmount, payoutAmount }
}
