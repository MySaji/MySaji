import "server-only"

import { db } from "@/backend/db"

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000

export async function deleteExpiredProviderStories(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - STORY_LIFETIME_MS)
  const result = await db.providerStatus.deleteMany({ where: { createdAt: { lte: cutoff } } })
  return { deleted: result.count }
}
