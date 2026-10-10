"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

async function requireProvider(): Promise<{ userId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  return { userId: session.user.id }
}

export type ProviderPost = {
  id: string
  type: "image" | "video" | "carousel"
  thumbnail: string
  caption: string
  createdAt: string
  likeCount: number
  commentCount: number
  shareCount: number
  isPinned: boolean
  isArchived: boolean
  media: string[]
}

function toProviderPost(p: { id: string; content: string; images: string[]; video: string | null; likeCount: number; commentCount: number; shareCount: number; isPinned: boolean; isArchived: boolean; createdAt: Date }): ProviderPost {
  const type: ProviderPost["type"] = p.video ? "video" : p.images.length > 1 ? "carousel" : "image"
  return {
    id: p.id,
    type,
    thumbnail: p.images[0] ?? p.video ?? "",
    caption: p.content,
    createdAt: p.createdAt.toISOString(),
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    shareCount: p.shareCount,
    isPinned: p.isPinned,
    isArchived: p.isArchived,
    media: p.video ? [p.video] : p.images,
  }
}

export async function getMyPosts(): Promise<ProviderPost[]> {
  const provider = await requireProvider()
  if (!provider) return []

  const posts = await db.post.findMany({
    where: { authorId: provider.userId },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  })
  return posts.map(toProviderPost)
}

export type ProviderContentActionResult = { success: true } | { success: false; error: string }

const postIdSchema = z.object({ postId: z.string().trim().min(1) })

export async function togglePinPost(input: unknown): Promise<ProviderContentActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = postIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const post = await db.post.findUnique({ where: { id: parsed.data.postId } })
  if (!post || post.authorId !== provider.userId) return { success: false, error: "Post not found." }

  await db.post.update({ where: { id: post.id }, data: { isPinned: !post.isPinned } })
  return { success: true }
}

export async function toggleArchivePost(input: unknown): Promise<ProviderContentActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = postIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const post = await db.post.findUnique({ where: { id: parsed.data.postId } })
  if (!post || post.authorId !== provider.userId) return { success: false, error: "Post not found." }

  await db.post.update({ where: { id: post.id }, data: { isArchived: !post.isArchived } })
  return { success: true }
}
