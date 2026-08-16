// Gap 4 (job stacking): business staff — not solo pros, who already
// self-manage via ProviderAvailability.maxJobsPerDay/autoAccept — get a
// hard cap on how many jobs they can have simultaneously
// ACCEPTED/IN_PROGRESS. Enforced by acceptJob() (provider-jobs.ts) on the
// accepting end, reassignJob()/getBusinessDashboard() (provider-business.ts)
// on the assigning end, and every path that can set a Job straight to
// ACCEPTED without a human tapping "Accept" (checkout()'s and
// confirmJobPayment()'s autoAccept branches) via canAcceptAnotherJob below.
//
// Not a "use server" file — same reasoning as lib/order-cancellation.ts:
// db-touching helpers imported by multiple "use server" action files can't
// themselves be one (and a "use server" module may only export async
// functions, so the constant alone couldn't live inside provider-jobs.ts
// once provider-business.ts needed to import it either).
import { db } from "@/lib/db"

export const BUSINESS_STAFF_MAX_CONCURRENT_JOBS = 2

// Structural subset so this accepts either the plain db client or a
// Prisma $transaction callback's `tx` client — same pattern as
// lib/promo-code.ts's QueryClient.
type QueryClient = Pick<typeof db, "providerProfile" | "job">

/** Whether providerId can take on one more ACCEPTED/IN_PROGRESS job right
 * now. Solo pros (no parentBusinessId) are always eligible — only business
 * staff have the concurrent-job cap. */
export async function canAcceptAnotherJob(client: QueryClient, providerId: string): Promise<boolean> {
  const profile = await client.providerProfile.findUnique({ where: { id: providerId }, select: { parentBusinessId: true } })
  if (!profile?.parentBusinessId) return true

  const concurrentCount = await client.job.count({ where: { providerId, status: { in: ["ACCEPTED", "IN_PROGRESS"] } } })
  return concurrentCount < BUSINESS_STAFF_MAX_CONCURRENT_JOBS
}
