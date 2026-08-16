"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"

export type AdminCommunityPost = {
  id: string
  type: "post" | "group_post"
  authorName: string
  authorId: string
  groupName: string | null
  content: string
  imageCount: number
  hasVideo: boolean
  likeCount: number
  commentCount: number
  isArchived: boolean
  createdAt: string
}

/** Proactive browse of the community feed (not just reported content —
 * see admin-moderation.ts for the reactive report queue). Posts and
 * GroupPosts are merged into one feed since a moderator doesn't care which
 * table a piece of content lives in, just that it exists and might need
 * action. GroupPost has no isArchived column in the schema, so archiving is
 * only offered for top-level Posts — group posts can only be deleted. */
export async function getCommunityPosts(): Promise<AdminCommunityPost[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const [posts, groupPosts] = await Promise.all([
    db.post.findMany({ orderBy: { createdAt: "desc" }, take: 60, include: { author: true } }),
    db.groupPost.findMany({ orderBy: { createdAt: "desc" }, take: 60, include: { author: true, group: true } }),
  ])

  const merged: AdminCommunityPost[] = [
    ...posts.map((p) => ({
      id: p.id,
      type: "post" as const,
      authorName: p.author.name,
      authorId: p.authorId,
      groupName: null,
      content: p.content,
      imageCount: p.images.length,
      hasVideo: !!p.video,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      isArchived: p.isArchived,
      createdAt: p.createdAt.toISOString(),
    })),
    ...groupPosts.map((p) => ({
      id: p.id,
      type: "group_post" as const,
      authorName: p.author.name,
      authorId: p.authorId,
      groupName: p.group.name,
      content: p.content,
      imageCount: p.images.length,
      hasVideo: false,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      isArchived: false,
      createdAt: p.createdAt.toISOString(),
    })),
  ]

  return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 100)
}

export type AdminCommunityActionResult = { success: true } | { success: false; error: string }

const postIdSchema = z.object({ postId: z.string().trim().min(1) })

export async function toggleArchiveCommunityPost(input: unknown): Promise<AdminCommunityActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = postIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const post = await db.post.findUnique({ where: { id: parsed.data.postId } })
  if (!post) return { success: false, error: "Post not found." }

  const nextArchived = !post.isArchived
  await db.post.update({ where: { id: post.id }, data: { isArchived: nextArchived } })

  await logAdminAction({
    userId: admin.userId,
    action: nextArchived ? "community_post.archive" : "community_post.unarchive",
    entityType: "Post",
    entityId: post.id,
    oldValues: { isArchived: post.isArchived },
    newValues: { isArchived: nextArchived },
  })

  return { success: true }
}

const deleteSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["post", "group_post"]),
})

export async function deleteCommunityPost(input: unknown): Promise<AdminCommunityActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = deleteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { id, type } = parsed.data

  if (type === "post") {
    const post = await db.post.findUnique({ where: { id } })
    if (!post) return { success: false, error: "Post not found." }
    await db.post.delete({ where: { id } })
  } else {
    const groupPost = await db.groupPost.findUnique({ where: { id } })
    if (!groupPost) return { success: false, error: "Post not found." }
    await db.groupPost.delete({ where: { id } })
  }

  await logAdminAction({
    userId: admin.userId,
    action: "community_post.delete",
    entityType: type === "post" ? "Post" : "GroupPost",
    entityId: id,
  })

  return { success: true }
}
