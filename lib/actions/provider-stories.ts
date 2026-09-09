"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getOrCreateConversation } from "@/lib/actions/messages"
import { pushToUser } from "@/lib/actions/push"

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000

async function requireProviderUserId(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  return session.user.id
}

export type StoryActionResult = { success: true } | { success: false; error: string }

const createSchema = z.object({
  beforeImage: z.string().min(1, "Before photo is required"),
  afterImage: z.string().min(1, "After photo is required"),
  caption: z.string().trim().max(200).optional(),
})

export async function createProviderStory(input: unknown): Promise<StoryActionResult> {
  const providerId = await requireProviderUserId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  await db.providerStatus.create({
    data: {
      providerId,
      beforeImage: parsed.data.beforeImage,
      afterImage: parsed.data.afterImage,
      caption: parsed.data.caption || null,
    },
  })
  return { success: true }
}

export type StoryFeedItem = {
  id: string
  beforeImage: string
  afterImage: string
  caption: string | null
  likeCount: number
  likedByMe: boolean
  createdAt: string
  expiresAt: string
}

export type StoryFeedGroup = {
  providerId: string
  providerName: string
  providerAvatar: string | null
  stories: StoryFeedItem[]
}

/** Real-time-ish 24h expiry (STORY_LIFETIME_MS), enforced here at read time
 * rather than via a fine-grained cron (this project's cron infra is
 * once-daily at finest — see `app/api/cron/expire-provider-stories/route.ts`
 * for the daily hard-delete cleanup, which exists for storage hygiene, not to
 * enforce the actual expiry window customers see). */
export async function getActiveProviderStories(): Promise<StoryFeedGroup[]> {
  const session = await auth()
  const myId = session?.user?.id ?? "__none__"
  const cutoff = new Date(Date.now() - STORY_LIFETIME_MS)

  const stories = await db.providerStatus.findMany({
    where: { createdAt: { gt: cutoff } },
    orderBy: { createdAt: "desc" },
    include: {
      provider: { select: { id: true, name: true, image: true } },
      likes: { where: { userId: myId }, select: { id: true } },
    },
  })

  const groups = new Map<string, StoryFeedGroup>()
  for (const s of stories) {
    let group = groups.get(s.providerId)
    if (!group) {
      group = { providerId: s.providerId, providerName: s.provider.name, providerAvatar: s.provider.image, stories: [] }
      groups.set(s.providerId, group)
    }
    group.stories.push({
      id: s.id,
      beforeImage: s.beforeImage,
      afterImage: s.afterImage,
      caption: s.caption,
      likeCount: s.likeCount,
      likedByMe: s.likes.length > 0,
      createdAt: s.createdAt.toISOString(),
      expiresAt: new Date(s.createdAt.getTime() + STORY_LIFETIME_MS).toISOString(),
    })
  }
  return Array.from(groups.values())
}

export type ToggleStoryLikeResult = { success: true; likedByMe: boolean; likeCount: number } | { success: false; error: string }

const storyIdSchema = z.object({ storyId: z.string().trim().min(1) })

export async function toggleStoryLike(input: unknown): Promise<ToggleStoryLikeResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = storyIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { storyId } = parsed.data
  const userId = session.user.id

  const existing = await db.providerStatusLike.findUnique({ where: { statusId_userId: { statusId: storyId, userId } } })
  if (existing) {
    const [, story] = await db.$transaction([
      db.providerStatusLike.delete({ where: { id: existing.id } }),
      db.providerStatus.update({ where: { id: storyId }, data: { likeCount: { decrement: 1 } } }),
    ])
    return { success: true, likedByMe: false, likeCount: story.likeCount }
  }
  const [, story] = await db.$transaction([
    db.providerStatusLike.create({ data: { statusId: storyId, userId } }),
    db.providerStatus.update({ where: { id: storyId }, data: { likeCount: { increment: 1 } } }),
  ])
  return { success: true, likedByMe: true, likeCount: story.likeCount }
}

export type ReplyToStoryResult = { success: true; conversationId: string } | { success: false; error: string }

const replySchema = z.object({
  storyId: z.string().trim().min(1),
  message: z.string().trim().min(1, "Write a reply"),
})

export async function replyToStory(input: unknown): Promise<ReplyToStoryResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = replySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const story = await db.providerStatus.findUnique({ where: { id: parsed.data.storyId }, select: { providerId: true, caption: true } })
  if (!story) return { success: false, error: "This post is no longer available." }

  const convResult = await getOrCreateConversation({ otherUserId: story.providerId })
  if (!convResult.success) return convResult

  const referencePrefix = `Replying to your before/after post${story.caption ? `: "${story.caption}"` : ""}`
  const content = `${referencePrefix}\n${parsed.data.message}`

  await db.message.create({
    data: {
      conversationId: convResult.conversationId,
      senderId: session.user.id,
      type: "TEXT",
      content,
      relatedStatusId: parsed.data.storyId,
    },
  })
  await db.conversation.update({ where: { id: convResult.conversationId }, data: { lastMessageAt: new Date() } })

  // ProviderStatus.providerId always belongs to a "provider"-role user (the
  // only role that can create one), so the notification/messages link is
  // always the Provider portal, not derived dynamically.
  const messagesUrl = `/provider/messages?conversation=${convResult.conversationId}`
  await db.notification.create({
    data: {
      userId: story.providerId,
      title: "New reply to your post",
      message: `${session.user.name ?? "A customer"} replied to your before/after post`,
      type: "MESSAGE",
      actionUrl: messagesUrl,
    },
  })
  await pushToUser(story.providerId, { title: "New reply to your post", body: content.slice(0, 100), url: messagesUrl }, "message")

  return { success: true, conversationId: convResult.conversationId }
}

/** Called by the daily cron (`app/api/cron/expire-provider-stories/route.ts`).
 * The 24h expiry itself is already enforced at read time by
 * `getActiveProviderStories`'s `createdAt` filter — this is storage hygiene,
 * deleting rows that are already invisible to everyone, not what makes them
 * actually expire. */
export async function deleteExpiredProviderStories(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - STORY_LIFETIME_MS)
  const result = await db.providerStatus.deleteMany({ where: { createdAt: { lte: cutoff } } })
  return { deleted: result.count }
}
