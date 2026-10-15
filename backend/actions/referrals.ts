"use server"

import { auth } from "@/backend/auth"

import { db } from "@/backend/db"

function generateReferralCode(name: string): string {
  const base = name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4) || "USER"
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `SAJI-${base}${suffix}`
}

export async function getOrCreateReferralCode(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const user = await db.user.findUnique({ where: { id: session.user.id } })
  if (!user) return null
  if (user.referralCode) return user.referralCode

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode(user.name)
    try {
      const updated = await db.user.update({ where: { id: user.id }, data: { referralCode: code } })
      return updated.referralCode
    } catch {
      // unique collision on this attempt — try another code
    }
  }
  return null
}

export type ReferralHistoryItem = {
  id: string
  name: string
  avatar: string | null
  date: string
  status: string
  rewardAmount: number
}

export type ReferralSummary = {
  code: string
  invited: number
  completed: number
  totalEarned: number
  history: ReferralHistoryItem[]
} | null

export async function getReferralSummary(): Promise<ReferralSummary> {
  const session = await auth()
  if (!session?.user?.id) return null

  const code = await getOrCreateReferralCode()
  if (!code) return null

  const referrals = await db.referral.findMany({
    where: { referrerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { referredUser: true },
  })

  return {
    code,
    invited: referrals.length,
    completed: referrals.filter((r) => r.status === "REWARDED").length,
    totalEarned: referrals.reduce((sum, r) => sum + (r.status === "REWARDED" ? Number(r.rewardAmount ?? 0) : 0), 0),
    history: referrals.map((r) => ({
      id: r.id,
      name: r.referredUser.name,
      avatar: r.referredUser.image,
      date: r.createdAt.toISOString(),
      status: r.status,
      rewardAmount: Number(r.rewardAmount ?? 0),
    })),
  }
}
