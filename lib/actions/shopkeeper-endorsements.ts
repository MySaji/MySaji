"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireShopkeeper } from "@/lib/actions/shopkeeper-dashboard"

export type ShopkeeperEndorsement = {
  id: string
  providerUserId: string
  name: string
  avatar: string | null
  specialty: string
  message: string
  createdAt: string
}

export type ShopkeeperEndorsementsData = {
  endorsements: ShopkeeperEndorsement[]
  totalGiven: number
  thisMonthCount: number
}

export async function getMyEndorsements(): Promise<ShopkeeperEndorsementsData> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { endorsements: [], totalGiven: 0, thisMonthCount: 0 }

  const endorsements = await db.endorsement.findMany({
    where: { fromUserId: shopkeeper.userId, toUserId: { not: null } },
    orderBy: { createdAt: "desc" },
    include: { toUser: { include: { providerProfile: { include: { category: true } } } } },
  })

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  return {
    endorsements: endorsements
      .filter((e) => e.toUser)
      .map((e) => ({
        id: e.id,
        providerUserId: e.toUserId!,
        name: e.toUser!.name,
        avatar: e.toUser!.image,
        specialty: e.toUser!.providerProfile?.category?.name ?? "Specialist",
        message: e.message,
        createdAt: e.createdAt.toISOString(),
      })),
    totalGiven: endorsements.length,
    thisMonthCount: endorsements.filter((e) => e.createdAt >= startOfThisMonth).length,
  }
}

export type ShopkeeperEndorsementActionResult = { success: true } | { success: false; error: string }

const writeSchema = z.object({
  providerUserId: z.string().trim().min(1),
  message: z.string().trim().min(50, "Endorsement must be at least 50 characters"),
})

export async function writeEndorsement(input: unknown): Promise<ShopkeeperEndorsementActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = writeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const provider = await db.providerProfile.findUnique({ where: { userId: parsed.data.providerUserId } })
  if (!provider) return { success: false, error: "Specialist not found." }

  const existing = await db.endorsement.findFirst({
    where: { fromUserId: shopkeeper.userId, toUserId: parsed.data.providerUserId },
  })
  if (existing) return { success: false, error: "You've already endorsed this specialist." }

  await db.endorsement.create({
    data: {
      fromUserId: shopkeeper.userId,
      toUserId: parsed.data.providerUserId,
      message: parsed.data.message,
    },
  })

  return { success: true }
}
