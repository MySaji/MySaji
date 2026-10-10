"use server"

import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

export type RecentlyViewedTargetType = "SERVICE" | "PRODUCT"

export type RecentlyViewedItem = {
  id: string
  targetType: RecentlyViewedTargetType
  targetId: string
  title: string
  subtitle: string | null
  image: string | null
  href: string
  viewedAt: string
}

type RecordViewInput = {
  targetType: RecentlyViewedTargetType
  targetId: string
  title: string
  subtitle?: string | null
  image?: string | null
  href: string
}

/** Fire-and-forget from a detail page's own mount — a customer looking at a
 * page they're already allowed to see shouldn't be blocked by this failing,
 * so callers intentionally don't await a meaningful return value here. */
export async function recordView(input: RecordViewInput): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return

  const data = {
    title: input.title,
    subtitle: input.subtitle ?? null,
    image: input.image ?? null,
    href: input.href,
    viewedAt: new Date(),
  }

  await db.recentlyViewed.upsert({
    where: {
      userId_targetType_targetId: {
        userId: session.user.id,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    },
    update: data,
    create: {
      userId: session.user.id,
      targetType: input.targetType,
      targetId: input.targetId,
      ...data,
    },
  })
}

export async function getRecentlyViewed(limit = 6): Promise<RecentlyViewedItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const rows = await db.recentlyViewed.findMany({
    where: { userId: session.user.id },
    orderBy: { viewedAt: "desc" },
    take: limit,
  })

  return rows.map((r) => ({
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    title: r.title,
    subtitle: r.subtitle,
    image: r.image,
    href: r.href,
    viewedAt: r.viewedAt.toISOString(),
  }))
}
