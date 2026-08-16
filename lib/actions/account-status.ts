"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"

export type MyOpenDispute = {
  id: string
  disputeNumber: string
  reason: string
  status: string
  createdAt: string
}

export type MyAccountStatus = {
  isActive: boolean
  openDisputes: MyOpenDispute[]
}

// Customer/Provider only — Dispute has no Shopkeeper linkage in the schema
// today, so a shopkeeper's openDisputes is always []. isActive applies to
// every role the same way.
export async function getMyAccountStatus(): Promise<MyAccountStatus> {
  const session = await auth()
  if (!session?.user?.id) return { isActive: true, openDisputes: [] }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, providerProfile: { select: { id: true } } },
  })
  if (!user) return { isActive: true, openDisputes: [] }

  const disputes = await db.dispute.findMany({
    where: {
      status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] },
      OR: [
        { customerId: session.user.id },
        ...(user.providerProfile ? [{ providerId: user.providerProfile.id }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, disputeNumber: true, reason: true, status: true, createdAt: true },
  })

  return {
    isActive: user.isActive,
    openDisputes: disputes.map((d) => ({
      id: d.id,
      disputeNumber: d.disputeNumber,
      reason: d.reason,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
    })),
  }
}

const OPEN_DISPUTE_STATUSES = ["OPEN", "IN_REVIEW", "ESCALATED"] as const

/** Server-side gate for new-transaction actions (defense in depth — the
 * suspended full-screen block already keeps a suspended user from reaching
 * these flows through the UI, but the action itself shouldn't rely on
 * that being the only entry point). */
export async function customerHasOpenDispute(customerId: string): Promise<boolean> {
  const count = await db.dispute.count({ where: { customerId, status: { in: [...OPEN_DISPUTE_STATUSES] } } })
  return count > 0
}

export async function providerHasOpenDispute(providerProfileId: string): Promise<boolean> {
  const count = await db.dispute.count({ where: { providerId: providerProfileId, status: { in: [...OPEN_DISPUTE_STATUSES] } } })
  return count > 0
}
